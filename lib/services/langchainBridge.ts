/**
 * LangChain Integration Bridge
 *
 * Connects our modern BrainOrchestrator architecture with existing LangChain
 * tools, agents, and enhanced executor while adding observability and performance monitoring.
 * Now supports optional LangGraph integration for complex multi-step reasoning.
 */

import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { modelMapping } from '@/lib/ai/models';
import { createLangChainToolService } from './langchainToolService';
import {
  LangChainStreamingService,
  createLangChainStreamingService,
} from './langchainStreamingService';

// Import LangGraph support with UI capabilities
import { createLangGraphWrapper, shouldUseLangGraph } from '@/lib/ai/graphs';
import type { SimpleLangGraphWrapper } from '@/lib/ai/graphs/simpleLangGraphWrapper';

// Import LangChain UI utilities for generative UI
import { LangChainAdapter } from 'ai';

// Type imports
import type { RequestLogger } from './observabilityService';
import type { ClientConfig } from '@/lib/db/queries';
import type { LangChainToolConfig } from './langchainToolService';
import type { LangGraphWrapperConfig } from '@/lib/ai/graphs';
import { generateUUID } from '@/lib/utils';

/**
 * Configuration for LangChain bridge
 */
export interface LangChainBridgeConfig {
  selectedChatModel?: string;
  contextId?: string | null;
  clientConfig?: ClientConfig | null;
  enableToolExecution?: boolean;
  maxTools?: number;
  maxIterations?: number;
  verbose?: boolean;
  // New LangGraph options
  enableLangGraph?: boolean;
  langGraphPatterns?: string[];
}

/**
 * LangChain agent and executor wrapper
 * Now supports both AgentExecutor and LangGraph
 */
export interface LangChainAgent {
  agentExecutor?: AgentExecutor;
  langGraphWrapper?: SimpleLangGraphWrapper;
  tools: any[];
  llm: ChatOpenAI;
  prompt?: ChatPromptTemplate;
  executionType: 'agent' | 'langgraph';
}

/**
 * Initialize LangChain LLM with model mapping
 */
function initializeLLM(
  config: LangChainBridgeConfig,
  logger: RequestLogger,
): ChatOpenAI {
  const startTime = performance.now();

  // Use the model mapping to determine the correct model based on contextId
  let selectedModel: string;

  if (config.contextId && modelMapping[config.contextId]) {
    selectedModel = modelMapping[config.contextId];
  } else if (config.selectedChatModel) {
    selectedModel = config.selectedChatModel;
  } else {
    selectedModel = process.env.DEFAULT_MODEL_NAME || modelMapping.default;
  }

  // Check for required environment variables
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }

  logger.info('Initializing LLM with model', {
    selectedModel,
    contextId: config.contextId,
    requestedModel: config.selectedChatModel,
  });

  // Initialize OpenAI Chat model
  const llm = new ChatOpenAI({
    modelName: selectedModel,
    temperature: 0.7,
    apiKey: process.env.OPENAI_API_KEY,
    streaming: true,
    callbacks: [],
  });

  const duration = performance.now() - startTime;
  logger.info('LLM initialized successfully', {
    model: selectedModel,
    initTime: `${duration.toFixed(2)}ms`,
  });

  return llm;
}

/**
 * Select and filter tools based on context and configuration
 * Now uses LangChainToolService for better organization
 */
function selectTools(
  config: LangChainBridgeConfig,
  logger: RequestLogger,
): any[] {
  const toolConfig: LangChainToolConfig = {
    contextId: config.contextId,
    clientConfig: config.clientConfig,
    enableToolExecution: config.enableToolExecution,
    maxTools: config.maxTools,
    verbose: config.verbose,
  };

  const toolService = createLangChainToolService(logger, toolConfig);
  const result = toolService.selectTools();

  return result.tools;
}

/**
 * Create LangChain agent with tools and prompt
 * Now supports optional LangGraph integration
 */
export async function createLangChainAgent(
  systemPrompt: string,
  config: LangChainBridgeConfig,
  logger: RequestLogger,
): Promise<LangChainAgent> {
  const startTime = performance.now();

  logger.info('Creating LangChain agent', {
    contextId: config.contextId,
    enableToolExecution: config.enableToolExecution,
    maxIterations: config.maxIterations,
    enableLangGraph: config.enableLangGraph,
  });

  // Initialize LLM
  const llmStartTime = performance.now();
  const llm = initializeLLM(config, logger);
  const llmDuration = performance.now() - llmStartTime;

  // Select tools using the new LangChainToolService
  const toolStartTime = performance.now();
  const tools =
    config.enableToolExecution !== false ? selectTools(config, logger) : [];
  const toolDuration = performance.now() - toolStartTime;

  // Determine if we should use LangGraph
  const useLangGraph =
    config.enableLangGraph &&
    (config.langGraphPatterns
      ? shouldUseLangGraph(config.langGraphPatterns)
      : true);

  if (useLangGraph) {
    // Create LangGraph wrapper
    logger.info('Creating LangGraph wrapper for complex reasoning');

    const langGraphConfig: LangGraphWrapperConfig = {
      systemPrompt,
      llm,
      tools,
      logger,
    };

    const langGraphWrapper = createLangGraphWrapper(langGraphConfig);

    const totalDuration = performance.now() - startTime;
    logger.info('LangGraph wrapper created successfully', {
      setupTime: `${totalDuration.toFixed(2)}ms`,
      toolCount: tools.length,
    });

    return {
      langGraphWrapper,
      tools,
      llm,
      executionType: 'langgraph',
    };
  } else {
    // Create traditional AgentExecutor
    logger.info('Creating traditional AgentExecutor');

    // Create streaming callbacks using the new LangChainStreamingService
    const streamingConfig = {
      enableTokenStreaming: true,
      enableToolTracking: config.enableToolExecution !== false,
      verbose: config.verbose || false,
    };
    const streamingService = createLangChainStreamingService(
      logger,
      streamingConfig,
    );
    const callbacks = streamingService.createStreamingCallbacks();

    // Add callbacks to LLM
    llm.callbacks = callbacks;

    // Create prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    // Create the agent
    const agentStartTime = performance.now();
    const agent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt,
    });
    const agentDuration = performance.now() - agentStartTime;

    // Create agent executor
    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      maxIterations: config.maxIterations || 10,
      verbose: config.verbose || false,
      returnIntermediateSteps: true,
    });

    const totalDuration = performance.now() - startTime;

    logger.info('LangChain agent created successfully', {
      setupTime: `${totalDuration.toFixed(2)}ms`,
      llmTime: `${llmDuration.toFixed(2)}ms`,
      toolTime: `${toolDuration.toFixed(2)}ms`,
      agentTime: `${agentDuration.toFixed(2)}ms`,
      toolCount: tools.length,
    });

    return {
      agentExecutor,
      tools,
      llm,
      prompt,
      executionType: 'agent',
    };
  }
}

/**
 * Execute LangChain agent with proper error handling
 * Now supports both AgentExecutor and LangGraph
 */
export async function executeLangChainAgent(
  agent: LangChainAgent,
  input: string,
  chatHistory: any[],
  config: LangChainBridgeConfig,
  logger: RequestLogger,
): Promise<any> {
  const startTime = performance.now();

  logger.info('Executing LangChain agent', {
    inputLength: input.length,
    historyLength: chatHistory.length,
    executionType: agent.executionType,
  });

  try {
    let result: any;

    if (agent.executionType === 'langgraph' && agent.langGraphWrapper) {
      // Execute with LangGraph wrapper - convert to BaseMessage[]
      const messages = chatHistory.map((msg) => {
        if (msg.type === 'human' || msg.role === 'user') {
          return new HumanMessage(msg.content);
        } else if (msg.type === 'ai' || msg.role === 'assistant') {
          return new AIMessage(msg.content);
        } else {
          return new SystemMessage(msg.content);
        }
      });

      // Add system prompt and user input
      const wrapperConfig = agent.langGraphWrapper.getConfig();
      const fullConversation = [
        new SystemMessage(wrapperConfig.systemPrompt),
        ...messages,
        new HumanMessage(input),
      ];

      result = await agent.langGraphWrapper.invoke(fullConversation);
    } else if (agent.executionType === 'agent' && agent.agentExecutor) {
      // Execute with traditional AgentExecutor
      result = await agent.agentExecutor.invoke({
        input,
        chat_history: chatHistory,
        activeBitContextId: config.contextId,
      });
    } else {
      throw new Error(`Invalid agent configuration: ${agent.executionType}`);
    }

    const duration = performance.now() - startTime;
    logger.info('LangChain agent execution completed', {
      executionTime: `${duration.toFixed(2)}ms`,
      outputLength: result?.output?.length || 0,
      executionType: agent.executionType,
    });

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('LangChain agent execution failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime: `${duration.toFixed(2)}ms`,
      executionType: agent.executionType,
    });
    throw error;
  }
}

/**
 * Stream LangChain agent execution
 * Uses proper LangChain streaming methods with LangChainAdapter
 */
export async function streamLangChainAgent(
  agent: LangChainAgent,
  input: string,
  chatHistory: any[],
  config: LangChainBridgeConfig,
  logger: RequestLogger,
  callbacks?: any,
): Promise<Response> {
  logger.info('Streaming LangChain agent', {
    inputLength: input.length,
    historyLength: chatHistory.length,
    executionType: agent.executionType,
    hasCallbacks: !!callbacks,
  });

  try {
    if (agent.executionType === 'langgraph' && agent.langGraphWrapper) {
      // Execute with LangGraph wrapper - convert to BaseMessage[]
      const messages = chatHistory.map((msg) => {
        if (msg.type === 'human' || msg.role === 'user') {
          return new HumanMessage(msg.content);
        } else if (msg.type === 'ai' || msg.role === 'assistant') {
          return new AIMessage(msg.content);
        } else {
          return new SystemMessage(msg.content);
        }
      });

      // Add system prompt and user input
      const wrapperConfig = agent.langGraphWrapper.getConfig();
      const fullConversation = [
        new SystemMessage(wrapperConfig.systemPrompt),
        ...messages,
        new HumanMessage(input),
      ];

      // Get the LangGraph stream
      const langGraphStream = agent.langGraphWrapper.stream(fullConversation);

      // Process LangGraph stream with comprehensive artifact and tool event handling
      logger.info(
        '[LangchainBridge] Processing LangGraph stream with enhanced event handling',
      );

      const { createDataStream } = await import('ai');

      const dataStream = createDataStream({
        async execute(dataStreamWriter) {
          try {
            logger.info(
              '[LangchainBridge] Starting enhanced LangGraph stream processing',
            );
            let eventCount = 0;
            const lastLogTime = Date.now();
            let allUIEvents: any[] = [];

            for await (const event of langGraphStream) {
              eventCount++;

              // Log all events for debugging
              if (eventCount <= 10 || eventCount % 20 === 0) {
                logger.info(
                  `[LangchainBridge] Event ${eventCount}: ${event.event}`,
                  {
                    name: event.name,
                    tags: event.tags,
                    hasData: !!event.data,
                    dataKeys: event.data ? Object.keys(event.data) : [],
                  },
                );
              }

              // Handle streaming text content from LLM
              if (
                event.event === 'on_chat_model_stream' &&
                event.data?.chunk?.content
              ) {
                const textContent = event.data.chunk.content;
                if (typeof textContent === 'string' && textContent.length > 0) {
                  await (dataStreamWriter as any).write(
                    `0:${JSON.stringify(textContent)}\n`,
                  );
                }
              }

              // Handle tool call start events
              else if (event.event === 'on_tool_start') {
                const toolCallData = {
                  toolCallId: event.run_id || generateUUID(),
                  toolName: event.name,
                  args: event.data?.input || {},
                };
                await (dataStreamWriter as any).write(
                  `9:${JSON.stringify(toolCallData)}\n`,
                );
                logger.info(
                  `[LangchainBridge] Tool call started: ${event.name}`,
                  { toolCallId: toolCallData.toolCallId },
                );
              }

              // Handle tool call end events and extract artifact data
              else if (event.event === 'on_tool_end') {
                // Send tool result
                const toolOutput = event.data?.output;
                const toolResultData = {
                  toolCallId: event.run_id || generateUUID(),
                  toolName: event.name,
                  result:
                    typeof toolOutput === 'string'
                      ? toolOutput
                      : JSON.stringify(toolOutput),
                };
                await (dataStreamWriter as any).write(
                  `a:${JSON.stringify(toolResultData)}\n`,
                );

                logger.info(
                  `[LangchainBridge] Tool call completed: ${event.name}`,
                  {
                    toolCallId: toolResultData.toolCallId,
                    outputType: typeof toolOutput,
                    outputLength: toolResultData.result.length,
                  },
                );

                // Check if tool execution results contain artifact events (from executeToolsNode)
                if (
                  event.data?.output &&
                  typeof event.data.output === 'object'
                ) {
                  const output = event.data.output as any;

                  // Look for artifact events in tool execution results
                  if (
                    output._lastToolExecutionResults &&
                    Array.isArray(output._lastToolExecutionResults)
                  ) {
                    for (const toolExecResult of output._lastToolExecutionResults) {
                      if (
                        toolExecResult.quibitArtifactEvents &&
                        Array.isArray(toolExecResult.quibitArtifactEvents)
                      ) {
                        logger.info(
                          `[LangchainBridge] Found ${toolExecResult.quibitArtifactEvents.length} artifact events for tool ${toolExecResult.toolName}`,
                        );

                        for (const artifactEvent of toolExecResult.quibitArtifactEvents) {
                          const uiData = {
                            type: 'artifact',
                            componentName: 'document', // Maps to frontend DocumentComponent
                            props: {
                              documentId: artifactEvent.documentId || 'unknown',
                              title:
                                artifactEvent.title ||
                                `Document from ${toolExecResult.toolName}`,
                              status: artifactEvent.status || 'complete',
                              eventType: artifactEvent.type,
                              artifactEvent: artifactEvent,
                            },
                            metadata: {
                              toolCallId: toolExecResult.toolCallId,
                              toolName: toolExecResult.toolName,
                              timestamp: new Date().toISOString(),
                            },
                            id: generateUUID(),
                          };

                          // Stream as Data part
                          dataStreamWriter.writeData(uiData);
                          allUIEvents.push(uiData);

                          logger.info(
                            '[LangchainBridge] Streamed artifact event:',
                            {
                              documentId: uiData.props.documentId,
                              title: uiData.props.title,
                              toolName: uiData.metadata.toolName,
                            },
                          );
                        }
                      }
                    }
                  }
                }
              }

              // Handle node execution events for enhanced debugging
              else if (
                event.event === 'on_chain_end' &&
                event.name !== 'RunnableSequence'
              ) {
                logger.info(`[LangchainBridge] Node completed: ${event.name}`, {
                  runId: event.run_id,
                  duration: `${Date.now() - lastLogTime}ms`,
                });

                // Check if this is our graph's final state containing UI events
                if (
                  event.data?.output &&
                  typeof event.data.output === 'object'
                ) {
                  const output = event.data.output as any;

                  // Look for UI events in the final graph state
                  if (
                    output.ui &&
                    Array.isArray(output.ui) &&
                    output.ui.length > 0
                  ) {
                    logger.info(
                      `[LangchainBridge] Found ${output.ui.length} UI events in final graph state`,
                    );

                    for (const uiEvent of output.ui) {
                      // Check if we haven't already processed this UI event
                      const existingEvent = allUIEvents.find(
                        (e) => e.id === uiEvent.id,
                      );
                      if (!existingEvent) {
                        const uiData = {
                          type: 'artifact',
                          componentName: uiEvent.name,
                          props: uiEvent.props,
                          metadata: uiEvent.metadata,
                          id: uiEvent.id,
                        };

                        dataStreamWriter.writeData(uiData);
                        allUIEvents.push(uiData);

                        logger.info(
                          '[LangchainBridge] Streamed UI event from final state:',
                          {
                            componentName: uiEvent.name,
                            eventId: uiEvent.id,
                          },
                        );
                      }
                    }
                  }
                }
              }

              // Log progress periodically
              const now = Date.now();
              if (eventCount % 50 === 0 || now - lastLogTime > 5000) {
                logger.info(
                  `[LangchainBridge] Processed ${eventCount} events`,
                  {
                    eventType: event.event,
                    elapsed: `${now - lastLogTime}ms`,
                    totalUIEvents: allUIEvents.length,
                  },
                );
              }
            }

            logger.info(`[LangchainBridge] Stream processing completed`, {
              totalEvents: eventCount,
              totalUIEvents: allUIEvents.length,
            });
          } catch (error) {
            logger.error(
              '[LangchainBridge] Error in enhanced stream processing:',
              error,
            );

            // Write error to stream
            const errorData = {
              type: 'error',
              message:
                error instanceof Error
                  ? error.message
                  : 'Unknown streaming error',
              timestamp: new Date().toISOString(),
            };
            await (dataStreamWriter as any).write(
              `3:${JSON.stringify(errorData)}\n`,
            );
            throw error;
          }
        },
        onError: (error) => {
          logger.error('[LangchainBridge] DataStream error:', error);
          return error instanceof Error ? error.message : String(error);
        },
      });

      // Schedule cleanup for global context
      if (global.CREATE_DOCUMENT_CONTEXT) {
        const cleanupTimeout = setTimeout(() => {
          logger.info('Cleaning up global artifact context after timeout');
          if (global.CREATE_DOCUMENT_CONTEXT?.cleanupTimeout) {
            clearTimeout(global.CREATE_DOCUMENT_CONTEXT.cleanupTimeout);
          }
          global.CREATE_DOCUMENT_CONTEXT = undefined;
        }, 30000);

        global.CREATE_DOCUMENT_CONTEXT.cleanupTimeout = cleanupTimeout;
      }

      return new Response(dataStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Execution-Path': 'langgraph-enhanced',
          'X-LangGraph-Enabled': 'true',
          'X-Vercel-AI-Data-Stream': 'v1',
        },
      });
    } else if (agent.agentExecutor) {
      // Use regular AgentExecutor streaming with LangChainAdapter
      logger.info('Using AgentExecutor execution path');

      // Create input for AgentExecutor
      const executorInput = {
        input: input,
        chat_history: chatHistory,
      };

      // For AgentExecutor, we can't use direct streaming the same way
      // Let's use the underlying LLM stream directly like we do for LangGraph
      const messages = chatHistory.map((msg) => {
        if (msg.type === 'human' || msg.role === 'user') {
          return new HumanMessage(msg.content);
        } else if (msg.type === 'ai' || msg.role === 'assistant') {
          return new AIMessage(msg.content);
        } else {
          return new SystemMessage(msg.content);
        }
      });

      // Create full conversation with system prompt and user input
      const fullConversation = [
        new SystemMessage(
          config.selectedChatModel || 'You are a helpful AI assistant.',
        ),
        ...messages,
        new HumanMessage(input),
      ];

      // Use the LLM directly for streaming with LangChainAdapter
      const llmStream = await agent.llm.stream(fullConversation);

      // Use LangChainAdapter with the actual LangChain stream
      return LangChainAdapter.toDataStreamResponse(llmStream, {
        init: {
          headers: {
            'X-Execution-Path': 'langchain',
            'X-LangGraph-Enabled': 'false',
          },
        },
      });
    } else {
      throw new Error('No valid agent execution method available');
    }
  } catch (error) {
    logger.error('Error in streamLangChainAgent:', error);

    // Return error response in proper format
    const { createDataStream } = await import('ai');
    const errorStream = createDataStream({
      async execute(dataStreamWriter) {
        const errorData = {
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Agent execution failed',
          timestamp: new Date().toISOString(),
        };
        await (dataStreamWriter as any).write(
          `3:${JSON.stringify(errorData)}\n`,
        );
      },
    });

    return new Response(errorStream, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Execution-Path': 'error',
      },
    });
  }
}

/**
 * Clean up LangChain agent resources
 * Disposes of callbacks, clears any internal state, and performs cleanup operations
 */
export function cleanupLangChainAgent(
  agent: LangChainAgent,
  logger: RequestLogger,
): void {
  try {
    logger.info('Cleaning up LangChain agent resources', {
      executionType: agent.executionType,
      toolCount: agent.tools.length,
    });

    // Clean up LLM callbacks if they exist
    if (agent.llm && agent.llm.callbacks) {
      agent.llm.callbacks = [];
      logger.info('Cleared LLM callbacks');
    }

    // Clean up agent executor callbacks if present
    if (agent.executionType === 'agent' && agent.agentExecutor) {
      // AgentExecutor cleanup - we know agentExecutor exists here
      agent.agentExecutor.verbose = false;
      logger.info('Cleaned up AgentExecutor resources');
    }

    // Clean up LangGraph wrapper if present
    if (agent.executionType === 'langgraph' && agent.langGraphWrapper) {
      // LangGraph wrapper cleanup - no specific cleanup needed as it's stateless
      logger.info('LangGraph wrapper cleanup completed (stateless)');
    }

    // Clean up tools if they have cleanup methods
    agent.tools.forEach((tool, index) => {
      try {
        // Some tools might have cleanup methods
        if (tool && typeof tool.cleanup === 'function') {
          tool.cleanup();
          logger.info(`Cleaned up tool ${index}: ${tool.name || 'unnamed'}`);
        }
      } catch (toolError) {
        logger.warn(`Failed to cleanup tool ${index}`, {
          error:
            toolError instanceof Error ? toolError.message : 'Unknown error',
        });
      }
    });

    logger.info('LangChain agent cleanup completed successfully');
  } catch (error) {
    logger.error('Error during LangChain agent cleanup', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Don't throw - cleanup failures shouldn't break the main flow
  }
}
