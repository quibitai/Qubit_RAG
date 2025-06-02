/**
 * BrainOrchestrator
 *
 * Unified orchestration service that intelligently routes queries between
 * LangChain (complex tool orchestration) and Vercel AI SDK (simple responses).
 * Provides fallback mechanisms, response standardization, and comprehensive
 * error handling for the hybrid RAG system.
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
   * Process a brain request with intelligent routing
   */
  public async processRequest(brainRequest: BrainRequest): Promise<Response> {
    const startTime = performance.now();
    let classificationTime = 0;
    let executionTime = 0;
    let classification: QueryClassificationResult | undefined;
    let executionPath: 'langchain' | 'vercel-ai' | 'fallback' = 'langchain';

    try {
      this.logger.info('Processing brain request', {
        hybridRouting: this.config.enableHybridRouting,
        classification: this.config.enableClassification,
      });

      // 1. Process context and extract message data
      const context = this.contextService.processContext(brainRequest);
      const userInput = this.messageService.extractUserInput(brainRequest);
      const conversationHistory = this.messageService.convertToLangChainFormat(
        brainRequest.messages,
      );

      // 2. Classify query if hybrid routing is enabled
      if (this.config.enableHybridRouting && this.config.enableClassification) {
        const classificationStart = performance.now();

        classification = await this.queryClassifier.classifyQuery(
          userInput,
          conversationHistory,
          'You are a helpful AI assistant.',
        );

        classificationTime = performance.now() - classificationStart;

        this.logger.info('Query classified', {
          shouldUseLangChain: classification.shouldUseLangChain,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
          complexityScore: classification.complexityScore,
        });
      }

      // 3. Route to appropriate execution path
      const executionStart = performance.now();

      if (classification?.shouldUseLangChain !== false) {
        // Use LangChain for complex queries or when classification disabled
        executionPath = 'langchain';
        const response = await this.executeLangChainPath(
          brainRequest,
          context,
          userInput,
          conversationHistory,
        );
        executionTime = performance.now() - executionStart;
        return response;
      } else {
        // Use Vercel AI SDK for simple queries
        executionPath = 'vercel-ai';
        const response = await this.executeVercelAIPath(
          userInput,
          conversationHistory,
        );
        executionTime = performance.now() - executionStart;
        return this.formatVercelAIResponse(response, {
          totalTime: performance.now() - startTime,
          classificationTime,
          executionTime,
          classification,
          executionPath,
        });
      }
    } catch (error) {
      executionTime = performance.now() - startTime;

      this.logger.error('Brain request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        executionPath,
        totalTime: executionTime,
        classificationTime,
      });

      // Implement fallback mechanism
      if (this.config.enableFallbackOnError && executionPath === 'vercel-ai') {
        this.logger.info('Attempting fallback to LangChain');

        try {
          const context = this.contextService.processContext(brainRequest);
          const userInput = this.messageService.extractUserInput(brainRequest);
          const conversationHistory =
            this.messageService.convertToLangChainFormat(brainRequest.messages);

          executionPath = 'fallback';
          return await this.executeLangChainPath(
            brainRequest,
            context,
            userInput,
            conversationHistory,
          );
        } catch (fallbackError) {
          this.logger.error('Fallback to LangChain also failed', {
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : 'Unknown error',
          });
        }
      }

      // Return error response
      return this.formatErrorResponse(error, {
        totalTime: performance.now() - startTime,
        classificationTime,
        executionTime,
        classification,
        executionPath,
      });
    }
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
        'You are a helpful AI assistant.',
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

        const readableStream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of stream) {
                const encoded = encoder.encode(`${JSON.stringify(chunk)}\n`);
                controller.enqueue(encoded);
              }
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

              // Provide a fallback response instead of failing completely
              const fallbackResponse = JSON.stringify({
                output:
                  'I encountered a technical issue while processing your request. This appears to be a document or knowledge retrieval query that requires access to internal systems. Please try rephrasing your question or contact support if the issue persists.',
                metadata: {
                  error: 'langchain_streaming_error',
                  fallback: true,
                  originalError: errorMessage,
                },
              });

              const encoded = encoder.encode(`${fallbackResponse}\n`);
              controller.enqueue(encoded);
              controller.close();
            }
          },
        });

        return new Response(readableStream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
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
            const encoded = encoder.encode(
              `${JSON.stringify({ output: fallbackMessage })}\n`,
            );
            controller.enqueue(encoded);
            controller.close();
          },
        });

        return new Response(fallbackStream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
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
  ): Promise<VercelAIResult> {
    this.logger.info('Executing Vercel AI SDK path', {
      message: userInput.substring(0, 100),
      historyLength: conversationHistory.length,
    });

    const result = await this.vercelAIService.processQuery(
      'You are a helpful AI assistant.',
      userInput,
      conversationHistory,
    );

    this.logger.info('Vercel AI SDK execution completed', {
      tokenUsage: result.tokenUsage,
      executionTime: result.executionTime,
      finishReason: result.finishReason,
    });

    return result;
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
      classification?: QueryClassificationResult;
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
      classification: performance.classification,
      performance: {
        totalTime: performance.totalTime,
        classificationTime: performance.classificationTime,
        executionTime: performance.executionTime,
      },
      metadata: {
        model: performance.classification?.recommendedModel || 'unknown',
        toolsUsed: [],
        confidence: performance.classification?.confidence,
        reasoning: performance.classification?.reasoning,
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
