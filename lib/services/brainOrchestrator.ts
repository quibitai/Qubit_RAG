/**
 * BrainOrchestrator
 *
 * Unified orchestration service that intelligently routes queries between
 * LangChain (complex tool orchestration) and Vercel AI SDK (simple responses).
 * Powers both Quibit (global chat pane) and Chat Bit specialists.
 * Provides fallback mechanisms, response standardization, and comprehensive
 * error handling for the hybrid RAG system.
 *
 * Terminology:
 * - Quibit/Quibit Chat: Global chat pane orchestrator
 * - Chat Bit: Sidebar specialist chat interface
 * - Specialists: Individual AI assistants (Echo Tango, General Chat, etc.)
 * Target: ~180 lines as per roadmap specifications.
 */

import { NextRequest } from 'next/server';
import type { RequestLogger } from './observabilityService';
import {
  QueryClassifier,
  type QueryClassificationResult,
} from './queryClassifier';
import { VercelAIService, type VercelAIResult } from './vercelAIService';
import { MessageService } from './messageService';
import { ContextService, type ProcessedContext } from './contextService';
import {
  createLangChainAgent,
  streamLangChainAgent,
  cleanupLangChainAgent,
  type LangChainBridgeConfig,
  type LangChainAgent,
} from './langchainBridge';
import type { ClientConfig } from '@/lib/db/queries';
import type { BrainRequest } from '@/lib/validation/brainValidation';

// Import database utilities for chat storage
import { saveChat, saveMessages } from '@/lib/db/queries';
import { auth } from '@/app/(auth)/auth';
import { randomUUID } from 'node:crypto';
import type { DBMessage } from '@/lib/db/schema';

// Import date/time and prompt loading utilities
import { DateTime } from 'luxon';
import { loadPrompt } from '@/lib/ai/prompts/loader';

// Import timezone service for proper timezone detection
import { createTimezoneService, type TimezoneInfo } from './timezoneService';

// Import document handlers for image generation support
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';

/**
 * Configuration for brain orchestration
 */
export interface BrainOrchestratorConfig {
  enableHybridRouting?: boolean;
  fallbackToLangChain?: boolean;
  enableFallbackOnError?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  enableClassification?: boolean;
  clientConfig?: ClientConfig | null;
  contextId?: string | null;
}

/**
 * Unified response format for both execution paths
 */
export interface BrainResponse {
  success: boolean;
  content: any;
  executionPath: 'langchain' | 'vercel-ai' | 'fallback';
  classification?: QueryClassificationResult;
  performance: {
    totalTime: number;
    classificationTime?: number;
    executionTime: number;
  };
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata: {
    model: string;
    toolsUsed: string[];
    confidence?: number;
    reasoning?: string;
  };
}

/**
 * BrainOrchestrator class
 *
 * Main orchestration service for the hybrid RAG system
 */
export class BrainOrchestrator {
  private logger: RequestLogger;
  private config: BrainOrchestratorConfig;
  private queryClassifier: QueryClassifier;
  private vercelAIService: VercelAIService;
  private messageService: MessageService;
  private contextService: ContextService;

  constructor(logger: RequestLogger, config: BrainOrchestratorConfig = {}) {
    this.logger = logger;
    this.config = {
      enableHybridRouting: true,
      fallbackToLangChain: true,
      enableFallbackOnError: true,
      maxRetries: 2,
      timeoutMs: 30000,
      enableClassification: true,
      ...config,
    };

    // Initialize services
    this.queryClassifier = new QueryClassifier(logger, {
      clientConfig: config.clientConfig,
      contextId: config.contextId,
    });

    this.vercelAIService = new VercelAIService(logger, {
      clientConfig: config.clientConfig,
      contextId: config.contextId,
    });

    this.messageService = new MessageService(logger);
    this.contextService = new ContextService(logger, config.clientConfig);

    this.logger.info('Initializing BrainOrchestrator', {
      enableHybridRouting: this.config.enableHybridRouting,
      enableClassification: this.config.enableClassification,
      contextId: this.config.contextId,
    });
  }

  /**
   * Process a brain request with automatic orchestration
   */
  public async processRequest(brainRequest: BrainRequest): Promise<Response> {
    const startTime = performance.now();

    try {
      // Process context and format messages
      const context = await this.contextService.processContext(brainRequest);
      const userInput = this.messageService.extractUserInput(brainRequest);
      const conversationHistory = this.messageService.convertToLangChainFormat(
        brainRequest.messages,
      );

      this.logger.info('Processing brain request', {
        userInput: userInput.substring(0, 100),
        historyCount: conversationHistory.length,
        selectedModel: context.selectedChatModel,
        contextId: context.activeBitContextId,
      });

      // Store chat and user message in database
      await this.storeChatAndUserMessage(brainRequest, userInput);

      // Determine execution path via classification
      let classification: QueryClassificationResult | undefined;
      let classificationTime = 0;

      if (this.config.enableClassification) {
        const classificationStart = performance.now();
        classification = await this.queryClassifier.classifyQuery(userInput);
        classificationTime = performance.now() - classificationStart;

        this.logger.info('Query classification completed', {
          shouldUseLangChain: classification?.shouldUseLangChain,
          confidence: classification?.confidence,
          reasoning: classification?.reasoning,
          patterns: classification?.detectedPatterns,
          classificationTime: `${classificationTime.toFixed(2)}ms`,
        });
      }

      const executionStart = performance.now();
      let response: Response;

      // Execute based on classification or config
      const shouldUseLangChain =
        classification?.shouldUseLangChain ||
        (!this.config.enableClassification && this.config.enableHybridRouting);

      if (shouldUseLangChain) {
        this.logger.info('Routing to LangChain path');
        response = await this.executeLangChainPath(
          brainRequest,
          context,
          userInput,
          conversationHistory,
        );
      } else {
        this.logger.info('Routing to Vercel AI path');
        const result = await this.executeVercelAIPath(
          userInput,
          conversationHistory,
          brainRequest,
          context,
        );
        response = this.formatVercelAIResponse(result, {
          totalTime: performance.now() - startTime,
          classificationTime,
          executionTime: performance.now() - executionStart,
          classification,
          executionPath: 'vercel-ai',
        });
      }

      const totalTime = performance.now() - startTime;

      this.logger.info('Brain request processing completed', {
        totalTime: `${totalTime.toFixed(2)}ms`,
        executionPath: shouldUseLangChain ? 'langchain' : 'vercel-ai',
        classification: classification?.reasoning,
      });

      return response;
    } catch (error) {
      const totalTime = performance.now() - startTime;
      this.logger.error('Brain request processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        totalTime: `${totalTime.toFixed(2)}ms`,
      });

      return this.formatErrorResponse(error, {
        totalTime,
        classificationTime: 0,
        executionTime: 0,
        executionPath: 'error',
      });
    }
  }

  /**
   * Store chat and user message in database
   */
  private async storeChatAndUserMessage(
    brainRequest: BrainRequest,
    userInput: string,
  ): Promise<void> {
    try {
      // Get authentication details
      const session = await auth();
      if (!session?.user?.id) {
        this.logger.warn('No authenticated user for chat storage');
        return;
      }

      const userId = session.user.id;
      const chatId = brainRequest.chatId || randomUUID();

      // Check if chat already exists by trying to get the last message from it
      const messages = brainRequest.messages || [];
      const isNewChat = messages.length <= 1; // Only user message means new chat

      if (isNewChat) {
        // Generate chat title from user input
        const title =
          userInput.substring(0, 100) + (userInput.length > 100 ? '...' : '');

        // Get context information from the request
        const bitContextId =
          brainRequest.activeBitContextId ||
          brainRequest.currentActiveSpecialistId ||
          null;
        const clientId = this.config.clientConfig?.id || 'default';

        this.logger.info('Creating new chat in database', {
          chatId,
          userId,
          title: title.substring(0, 50),
          bitContextId,
          clientId,
        });

        // Save chat metadata with proper context
        try {
          await saveChat({
            id: chatId,
            userId,
            title,
            bitContextId,
            clientId,
          });
          this.logger.info('Chat created successfully', {
            chatId,
            bitContextId,
            clientId,
          });
        } catch (chatError) {
          this.logger.error('Failed to create chat', {
            chatId,
            error:
              chatError instanceof Error ? chatError.message : 'Unknown error',
          });
          // Continue even if chat creation fails
        }
      }

      // Save user message
      const userMessage = messages[messages.length - 1]; // Last message is user input
      if (userMessage) {
        const dbMessage: DBMessage = {
          id: userMessage.id || randomUUID(),
          chatId: chatId,
          role: 'user',
          parts: [{ type: 'text', text: userInput }],
          attachments: [],
          createdAt: new Date(),
          clientId: 'default',
        };

        try {
          await saveMessages({ messages: [dbMessage] });
          this.logger.info('User message saved successfully', {
            messageId: dbMessage.id,
            chatId: dbMessage.chatId,
          });
        } catch (messageError) {
          this.logger.error('Failed to save user message', {
            messageId: dbMessage.id,
            chatId: dbMessage.chatId,
            error:
              messageError instanceof Error
                ? messageError.message
                : 'Unknown error',
          });
          // Continue even if message save fails
        }
      }
    } catch (error) {
      this.logger.error('Chat storage operation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        chatId: brainRequest.chatId || 'unknown',
      });
      // Don't throw - storage failure shouldn't break the request
    }
  }

  /**
   * Save assistant message to database
   */
  private async saveAssistantMessage(
    brainRequest: BrainRequest,
    assistantResponse: string,
    toolsUsed: string[] = [],
  ): Promise<void> {
    try {
      // Get authentication details
      const session = await auth();
      if (!session?.user?.id) {
        this.logger.warn('No authenticated user for assistant message storage');
        return;
      }

      const chatId = brainRequest.chatId || randomUUID();

      const assistantMessage: DBMessage = {
        id: randomUUID(),
        chatId: chatId,
        role: 'assistant',
        parts: [{ type: 'text', text: assistantResponse }],
        attachments: [],
        createdAt: new Date(),
        clientId: 'default',
      };

      try {
        await saveMessages({ messages: [assistantMessage] });
        this.logger.info('Assistant message saved successfully', {
          messageId: assistantMessage.id,
          chatId: assistantMessage.chatId,
          toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
          responseLength: assistantResponse.length,
        });
      } catch (messageError) {
        this.logger.error('Failed to save assistant message', {
          messageId: assistantMessage.id,
          chatId: assistantMessage.chatId,
          error:
            messageError instanceof Error
              ? messageError.message
              : 'Unknown error',
        });
      }
    } catch (error) {
      this.logger.error('Assistant message storage operation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        chatId: brainRequest.chatId || 'unknown',
      });
      // Don't throw - storage failure shouldn't break the request
    }
  }

  /**
   * Trigger chat history refresh by invalidating cache
   */
  private triggerChatHistoryRefresh(): void {
    // Use setTimeout to avoid blocking the main response
    setTimeout(async () => {
      try {
        // Make a cache-busting request to refresh chat history
        const timestamp = Date.now();
        const refreshUrl = `/api/history?type=all-specialists&limit=1&_refresh=${timestamp}`;

        this.logger.info('Triggering chat history refresh', { refreshUrl });

        // Don't await this - it's a fire-and-forget cache refresh
        fetch(refreshUrl, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }).catch((error) => {
          this.logger.warn('Chat history refresh failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      } catch (error) {
        this.logger.warn('Error triggering chat history refresh', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, 100);
  }

  /**
   * Execute request using LangChain path
   */
  private async executeLangChainPath(
    brainRequest: BrainRequest,
    context: ProcessedContext,
    userInput: string,
    conversationHistory: any[],
  ): Promise<Response> {
    this.logger.info('Executing LangChain path', {
      message: userInput.substring(0, 100),
    });

    let langchainAgent: LangChainAgent | undefined;

    try {
      // Generate current date/time with enhanced timezone support
      const dateTimeContext =
        await this.generateEnhancedDateTimeContext(brainRequest);

      this.logger.info('Generated enhanced date/time context', {
        currentDateTime: dateTimeContext.currentDateTime,
        userTimezone: dateTimeContext.userTimezone,
        detectionMethod: dateTimeContext.detectionMethod,
        iso: dateTimeContext.iso,
      });

      // Load proper system prompt with date/time context
      const systemPrompt = loadPrompt({
        modelId: context.selectedChatModel || 'global-orchestrator',
        contextId: context.activeBitContextId || null,
        clientConfig: this.config.clientConfig,
        currentDateTime: dateTimeContext.currentDateTime,
      });

      this.logger.info('Loaded system prompt with enhanced date/time context', {
        promptLength: systemPrompt.length,
        contextId: context.activeBitContextId,
        selectedModel: context.selectedChatModel,
        hasDateTime: systemPrompt.includes('Current date and time:'),
        chatInterface: context.activeBitContextId
          ? 'Chat Bit Specialist'
          : 'Quibit',
      });

      // Create LangChain agent
      const langchainConfig: LangChainBridgeConfig = {
        selectedChatModel: context.selectedChatModel,
        contextId: context.activeBitContextId,
        clientConfig: this.config.clientConfig,
        enableToolExecution: true,
        maxTools: 26,
        maxIterations: 10,
        verbose: false,
      };

      langchainAgent = await createLangChainAgent(
        systemPrompt, // Use proper prompt with date/time instead of hardcoded
        langchainConfig,
        this.logger,
      );

      // Execute with streaming and handle potential streaming errors
      try {
        const stream = await streamLangChainAgent(
          langchainAgent,
          userInput,
          conversationHistory,
          langchainConfig,
          this.logger,
        );

        // Convert the stream to a Response with error handling
        const encoder = new TextEncoder();
        const logger = this.logger; // Capture logger reference for use in stream handler
        const orchestratorRef = this; // Capture 'this' reference for saveAssistantMessage

        const readableStream = new ReadableStream({
          async start(controller) {
            try {
              let finalOutput = '';
              const toolsUsed: string[] = [];

              for await (const chunk of stream) {
                // Extract content from LangChain streaming chunks
                let content = '';

                if (chunk && typeof chunk === 'object') {
                  // Handle different chunk types from LangChain
                  if (
                    chunk.intermediateSteps &&
                    chunk.intermediateSteps.length > 0
                  ) {
                    // Tool execution step
                    const step =
                      chunk.intermediateSteps[
                        chunk.intermediateSteps.length - 1
                      ];
                    if (step?.action?.tool) {
                      toolsUsed.push(step.action.tool);
                    }
                  }

                  if (chunk.output) {
                    // Final output from agent execution
                    content = chunk.output;
                    finalOutput = content;
                  } else if (chunk.returnValues) {
                    // Handle cases where agent returns values without tool calls
                    if (chunk.returnValues.output) {
                      content = chunk.returnValues.output;
                      finalOutput = content;
                    } else if (typeof chunk.returnValues === 'string') {
                      content = chunk.returnValues;
                      finalOutput = content;
                    }
                  } else if (chunk.messages && chunk.messages.length > 0) {
                    // Message content
                    const lastMessage =
                      chunk.messages[chunk.messages.length - 1];
                    if (lastMessage?.content) {
                      content = lastMessage.content;
                    }
                  }
                }

                // Stream content character by character to match Vercel AI format
                if (content && typeof content === 'string') {
                  for (let i = 0; i < content.length; i++) {
                    const char = content[i];
                    const encoded = encoder.encode(
                      `0:${JSON.stringify(char)}\n`,
                    );
                    controller.enqueue(encoded);
                  }
                }
              }

              // Save assistant message after streaming completes
              if (finalOutput?.trim()) {
                await orchestratorRef.saveAssistantMessage(
                  brainRequest,
                  finalOutput,
                  toolsUsed,
                );
              }

              // Send completion metadata in Vercel AI format
              const finishMessage = encoder.encode(
                `d:${JSON.stringify({
                  finishReason: 'stop',
                  usage: {
                    promptTokens: 0,
                    completionTokens: finalOutput.length,
                    totalTokens: finalOutput.length,
                  },
                  metadata: {
                    model: context.selectedChatModel || 'gpt-4.1-mini',
                    toolsUsed: [...new Set(toolsUsed)], // Remove duplicates
                    executionPath: 'langchain',
                  },
                })}\n`,
              );
              controller.enqueue(finishMessage);

              controller.close();
            } catch (streamError) {
              // Handle specific LangChain streaming errors
              const errorMessage =
                streamError instanceof Error
                  ? streamError.message
                  : 'Unknown streaming error';

              logger.error('LangChain streaming error encountered', {
                error: errorMessage,
                userInput: userInput.substring(0, 100),
                errorType: 'langchain_streaming_error',
              });

              // Provide a fallback response in Vercel AI format
              const fallbackContent =
                'I encountered a technical issue while processing your request. This appears to be a document or knowledge retrieval query that requires access to internal systems. Please try rephrasing your question or contact support if the issue persists.';

              // Stream fallback content character by character
              for (let i = 0; i < fallbackContent.length; i++) {
                const char = fallbackContent[i];
                const encoded = encoder.encode(`0:${JSON.stringify(char)}\n`);
                controller.enqueue(encoded);
              }

              // Send error metadata
              const errorFinish = encoder.encode(
                `d:${JSON.stringify({
                  finishReason: 'error',
                  error: 'langchain_streaming_error',
                  originalError: errorMessage,
                })}\n`,
              );
              controller.enqueue(errorFinish);
              controller.close();
            }
          },
        });

        return new Response(readableStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control':
              'no-cache, no-transform, no-store, must-revalidate',
            'X-Accel-Buffering': 'no',
            Connection: 'keep-alive',
            'X-Execution-Path': 'langchain',
          },
        });
      } catch (streamSetupError) {
        // If we can't even set up the stream, fall back to a simple response
        this.logger.error('Failed to set up LangChain streaming', {
          error:
            streamSetupError instanceof Error
              ? streamSetupError.message
              : 'Unknown error',
          userInput: userInput.substring(0, 100),
        });

        // Create a simple fallback response stream
        const encoder = new TextEncoder();
        const fallbackStream = new ReadableStream({
          start(controller) {
            const fallbackMessage =
              "I'm experiencing technical difficulties accessing the knowledge base. Please try again in a moment or rephrase your request.";

            // Stream fallback content character by character in Vercel AI format
            for (let i = 0; i < fallbackMessage.length; i++) {
              const char = fallbackMessage[i];
              const encoded = encoder.encode(`0:${JSON.stringify(char)}\n`);
              controller.enqueue(encoded);
            }

            // Send completion metadata
            const finishMessage = encoder.encode(
              `d:${JSON.stringify({
                finishReason: 'error',
                error: 'stream-setup-failed',
                metadata: {
                  executionPath: 'langchain-fallback',
                },
              })}\n`,
            );
            controller.enqueue(finishMessage);

            controller.close();
          },
        });

        return new Response(fallbackStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control':
              'no-cache, no-transform, no-store, must-revalidate',
            'X-Accel-Buffering': 'no',
            Connection: 'keep-alive',
            'X-Execution-Path': 'langchain-fallback',
            'X-Error': 'stream-setup-failed',
          },
        });
      }
    } finally {
      // Cleanup resources
      if (langchainAgent) {
        cleanupLangChainAgent(langchainAgent, this.logger);
      }
    }
  }

  /**
   * Execute request using Vercel AI SDK path
   */
  private async executeVercelAIPath(
    userInput: string,
    conversationHistory: any[],
    brainRequest?: BrainRequest,
    context?: ProcessedContext,
  ): Promise<VercelAIResult> {
    this.logger.info('Executing Vercel AI SDK path', {
      message: userInput.substring(0, 100),
      historyLength: conversationHistory.length,
    });

    // Create a buffered data stream to capture artifact events during tool execution
    const artifactEventBuffer: any[] = [];
    const mockDataStream = {
      write: async (data: string) => {
        // Parse and store the artifact event
        try {
          // Data comes in format "2:[{"type":"artifact-start",...}]\n"
          if (data.startsWith('2:')) {
            const jsonStr = data.slice(2).trim();
            const eventArray = JSON.parse(jsonStr);
            if (Array.isArray(eventArray) && eventArray.length > 0) {
              artifactEventBuffer.push(eventArray[0]);
              this.logger.info('Buffered artifact event', {
                type: eventArray[0].type,
                kind: eventArray[0].kind,
              });
            }
          }
        } catch (error) {
          this.logger.warn('Failed to parse artifact event', {
            data: data.substring(0, 100),
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
      writeData: async (data: any) => {
        // Alternative method for writing data
        artifactEventBuffer.push(data);
        this.logger.info('Buffered artifact data', {
          type: data.type,
          kind: data.kind,
        });
      },
    };

    // Set up global context for document creation tools (image generation support)
    try {
      const session = await auth();
      global.CREATE_DOCUMENT_CONTEXT = {
        dataStream: mockDataStream,
        session: session,
        handlers: documentHandlersByArtifactKind,
        toolInvocationsTracker: [], // Initialize tracker for manual tool invocation tracking
      };

      this.logger.info('Set up CREATE_DOCUMENT_CONTEXT for Vercel AI path', {
        hasSession: !!session,
        handlerCount: documentHandlersByArtifactKind.length,
        hasMockDataStream: true,
      });
    } catch (error) {
      this.logger.warn('Failed to set up CREATE_DOCUMENT_CONTEXT', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue without global context - tools will fall back to placeholder responses
    }

    try {
      // Generate current date/time with timezone support (same as LangChain path)
      const userTimezone = brainRequest?.userTimezone || 'UTC';
      let now = DateTime.now().setZone(userTimezone);
      if (!now.isValid) {
        now = DateTime.now().setZone('UTC');
      }
      const userFriendlyDate = now.toLocaleString(DateTime.DATE_FULL);
      const userFriendlyTime = now.toLocaleString(DateTime.TIME_SIMPLE);
      const currentDateTime = `${userFriendlyDate} ${userFriendlyTime} (${userTimezone})`;

      this.logger.info('Generated current date/time context for VercelAI', {
        currentDateTime,
        userTimezone,
        iso: now.toISO(),
      });

      // Load proper system prompt with date/time context
      const systemPrompt = loadPrompt({
        modelId: context?.selectedChatModel || 'gpt-4.1-mini',
        contextId: context?.activeBitContextId || null,
        clientConfig: this.config.clientConfig,
        currentDateTime,
      });

      this.logger.info(
        'Loaded system prompt with date/time context for VercelAI',
        {
          promptLength: systemPrompt.length,
          contextId: context?.activeBitContextId,
          hasDateTime: systemPrompt.includes('Current date and time:'),
        },
      );

      const result = await this.vercelAIService.processQuery(
        systemPrompt, // Use proper prompt with date/time instead of hardcoded
        userInput,
        conversationHistory,
      );

      this.logger.info('Vercel AI SDK execution completed', {
        tokenUsage: result.tokenUsage,
        executionTime: result.executionTime,
        finishReason: result.finishReason,
        artifactEventsBuffered: artifactEventBuffer.length,
      });

      // Add buffered artifact events to the result for replay during streaming
      return {
        ...result,
        artifactEvents: artifactEventBuffer,
      };
    } finally {
      // Clean up global context
      global.CREATE_DOCUMENT_CONTEXT = undefined;
      this.logger.info('Cleaned up CREATE_DOCUMENT_CONTEXT');
    }
  }

  /**
   * Format Vercel AI SDK response to match expected Response format
   */
  private formatVercelAIResponse(
    result: VercelAIResult,
    performance: {
      totalTime: number;
      classificationTime?: number;
      executionTime: number;
      classification?: QueryClassificationResult;
      executionPath: string;
    },
  ): Response {
    // Create a streaming response to match the LangChain format expected by frontend
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        try {
          // First, replay any buffered artifact events from tool execution
          if (result.artifactEvents && result.artifactEvents.length > 0) {
            for (const event of result.artifactEvents) {
              // Send artifact events in the same format as LangChain route
              const artifactData = `2:${JSON.stringify([event])}\n`;
              controller.enqueue(encoder.encode(artifactData));
            }
          }

          // Stream the content character by character to match original behavior
          const content = result.content || '';
          const subChunkSize = 1; // Character-by-character streaming

          for (let i = 0; i < content.length; i += subChunkSize) {
            const subChunk = content.slice(i, i + subChunkSize);
            const encoded = encoder.encode(`0:${JSON.stringify(subChunk)}\n`);
            controller.enqueue(encoded);
          }

          // Send finish message with token usage
          const finishMessage = encoder.encode(
            `d:${JSON.stringify({
              finishReason: result.finishReason || 'stop',
              usage: {
                promptTokens: result.tokenUsage?.promptTokens || 0,
                completionTokens: result.tokenUsage?.completionTokens || 0,
                totalTokens: result.tokenUsage?.totalTokens || 0,
              },
              performance: {
                totalTime: performance.totalTime,
                classificationTime: performance.classificationTime,
                executionTime: performance.executionTime,
              },
              classification: performance.classification,
              metadata: {
                model:
                  performance.classification?.recommendedModel ||
                  'gpt-4.1-mini',
                toolsUsed: result.toolCalls?.map((call) => call.name) || [],
                confidence: performance.classification?.confidence,
                reasoning: performance.classification?.reasoning,
                artifactEventsReplayed: result.artifactEvents?.length || 0,
              },
            })}\n`,
          );
          controller.enqueue(finishMessage);

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    // Return streaming response with correct headers to match LangChain format
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform, no-store, must-revalidate',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
        'X-Execution-Path': 'vercel-ai',
        'X-Classification-Score':
          performance.classification?.complexityScore?.toString() || '',
        'X-Artifact-Events': result.artifactEvents?.length?.toString() || '0',
      },
    });
  }

  /**
   * Format error response
   */
  private formatErrorResponse(
    error: unknown,
    performance: {
      totalTime: number;
      classificationTime?: number;
      executionTime: number;
      executionPath: string;
    },
  ): Response {
    const errorResponse: BrainResponse = {
      success: false,
      content: {
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
        type: 'execution_error',
      },
      executionPath: performance.executionPath as any,
      classification: undefined,
      performance: {
        totalTime: performance.totalTime,
        classificationTime: performance.classificationTime,
        executionTime: performance.executionTime,
      },
      metadata: {
        model: 'unknown',
        toolsUsed: [],
        confidence: undefined,
        reasoning: undefined,
      },
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Execution-Path': performance.executionPath,
        'X-Error': 'true',
      },
    });
  }

  /**
   * Get orchestrator metrics and status
   */
  public getStatus(): {
    hybridRouting: boolean;
    classification: boolean;
    services: {
      queryClassifier: any;
      vercelAI: any;
    };
  } {
    return {
      hybridRouting: this.config.enableHybridRouting || false,
      classification: this.config.enableClassification || false,
      services: {
        queryClassifier: this.queryClassifier.getMetrics(),
        vercelAI: this.vercelAIService.getMetrics(),
      },
    };
  }

  /**
   * Update orchestrator configuration
   */
  public updateConfig(newConfig: Partial<BrainOrchestratorConfig>): void {
    this.config = { ...this.config, ...newConfig };

    this.logger.info('BrainOrchestrator configuration updated', {
      hybridRouting: this.config.enableHybridRouting,
      classification: this.config.enableClassification,
    });
  }

  /**
   * Generate enhanced date and time context with proper timezone handling
   */
  private async generateEnhancedDateTimeContext(brainRequest: any): Promise<{
    currentDateTime: string;
    userTimezone: string;
    iso: string;
    detectionMethod: string;
  }> {
    try {
      // Use timezone service for proper detection
      const timezoneService = createTimezoneService(this.logger, {
        userPreference: brainRequest.userTimezone, // Use user preference if available
        fallbackTimezone: 'UTC',
      });

      let timezoneInfo: TimezoneInfo;
      try {
        timezoneInfo = await timezoneService.detectTimezone();
      } catch (error) {
        this.logger.warn('Timezone detection failed, using UTC', { error });
        timezoneInfo = {
          timezone: 'UTC',
          offset: 0,
          isDST: false,
          displayName: 'Coordinated Universal Time',
          abbreviation: 'UTC',
          detectionMethod: 'fallback',
          confidence: 0.5,
        };
      }

      // Create date with detected timezone
      const now = DateTime.now().setZone(timezoneInfo.timezone);
      const currentDateTime = now.toFormat('MMMM d, yyyy h:mm a (ZZZZ)');
      const iso = now.toISO();

      this.logger.info('Generated current date/time context', {
        currentDateTime,
        userTimezone: timezoneInfo.timezone,
        timezoneDisplayName: timezoneInfo.displayName,
        detectionMethod: timezoneInfo.detectionMethod,
        confidence: timezoneInfo.confidence,
        iso,
      });

      return {
        currentDateTime,
        userTimezone: timezoneInfo.timezone,
        iso: iso || new Date().toISOString(),
        detectionMethod: timezoneInfo.detectionMethod,
      };
    } catch (error) {
      this.logger.error('Failed to generate date/time context', error);

      // Fallback to UTC if everything fails
      const now = DateTime.utc();
      const currentDateTime = now.toFormat('MMMM d, yyyy h:mm a (ZZZZ)');
      const iso = now.toISO();

      return {
        currentDateTime,
        userTimezone: 'UTC',
        iso: iso || new Date().toISOString(),
        detectionMethod: 'fallback',
      };
    }
  }
}

/**
 * Convenience functions for brain orchestration
 */

/**
 * Create a BrainOrchestrator instance with default configuration
 */
export function createBrainOrchestrator(
  logger: RequestLogger,
  config?: BrainOrchestratorConfig,
): BrainOrchestrator {
  return new BrainOrchestrator(logger, config);
}

/**
 * Process a brain request with automatic orchestration
 */
export async function processBrainRequest(
  brainRequest: BrainRequest,
  logger: RequestLogger,
  config?: BrainOrchestratorConfig,
): Promise<Response> {
  const orchestrator = createBrainOrchestrator(logger, config);
  return orchestrator.processRequest(brainRequest);
}
