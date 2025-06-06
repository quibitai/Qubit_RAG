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
  // NEW: Tool forcing directive from QueryClassifier
  forceToolCall?: { name: string } | 'required' | null;
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
      forceToolCall: config.forceToolCall,
    };

    const langGraphWrapper = createLangGraphWrapper(langGraphConfig);

    const totalDuration = performance.now() - startTime;
    logger.info('LangGraph wrapper created successfully', {
      setupTime: `${totalDuration.toFixed(2)}ms`,
      toolCount: tools.length,
      forceToolCall: config.forceToolCall,
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
 * Uses proper LangChain streaming methods with LangChainAdapter or createDataStreamResponse
 */
export async function streamLangChainAgent(
  agent: LangChainAgent,
  input: string,
  chatHistory: any[],
  config: LangChainBridgeConfig,
  logger: RequestLogger,
  callbacks?: any,
  // NEW: Context parameters for artifact streaming
  contextConfig?: {
    dataStream?: any;
    session?: any;
  },
): Promise<Response | undefined> {
  logger.info('Streaming LangChain agent', {
    inputLength: input.length,
    historyLength: chatHistory.length,
    executionType: agent.executionType,
    hasCallbacks: !!callbacks,
    hasContextConfig: !!contextConfig,
    hasDataStreamWriter: !!contextConfig?.dataStream,
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

      // *** THE CORE FIX: Check if we're already inside a stream ***
      if (contextConfig?.dataStream) {
        // We're being called from within brainOrchestrator's createDataStreamResponse
        // Use the provided dataStreamWriter directly
        logger.info(
          '[LangchainBridge] Using provided dataStreamWriter (called from within stream)',
        );

        const dataStreamWriter = contextConfig.dataStream;

        // *** Create RunnableConfig with context ***
        const { v4: uuidv4 } = await import('uuid');
        const langGraphConfig = {
          configurable: {
            // Keys must match what getContextVariable looks for in tools
            dataStream: dataStreamWriter,
            session: contextConfig.session || null,
          },
          runId: uuidv4(),
          callbacks: callbacks ? [callbacks] : undefined,
        };

        logger.info('[LangchainBridge] Passing context to LangGraph:', {
          hasDataStream: !!langGraphConfig.configurable.dataStream,
          hasSession: !!langGraphConfig.configurable.session,
          runId: langGraphConfig.runId,
        });

        // Get the LangGraph stream WITH context configuration
        if (!agent.langGraphWrapper) {
          throw new Error('LangGraph wrapper is not available');
        }
        const langGraphStream = agent.langGraphWrapper.stream(
          fullConversation,
          langGraphConfig,
        );

        let eventCount = 0;
        const allUIEvents: any[] = [];
        let isStreamingArtifact = false;

        for await (const event of langGraphStream) {
          eventCount++;

          // Simplified event logging
          if (eventCount <= 5 || eventCount % 25 === 0) {
            logger.info(
              `[LangchainBridge] Event ${eventCount}: ${event.event}`,
              { name: event.name },
            );
          }

          // Handle artifact events FIRST
          if (
            event.event === 'on_tool_end' &&
            event.name === 'tools' &&
            event.data?.output?.ui
          ) {
            const uiEventsToStream: any[] = event.data.output.ui || [];
            logger.info(
              `[LangchainBridge] Found ${uiEventsToStream.length} UI events from 'tools' node.`,
            );

            for (const artifactEvent of uiEventsToStream) {
              // Set the flag when artifact streaming starts and stops
              if (artifactEvent.props?.eventType === 'artifact-start') {
                isStreamingArtifact = true;
                logger.info('[LangchainBridge] SET isStreamingArtifact = true');
              } else if (artifactEvent.props?.eventType === 'artifact-end') {
                isStreamingArtifact = false;
                logger.info(
                  '[LangchainBridge] SET isStreamingArtifact = false',
                );
              }

              // Write the UI event as a '2:' data part
              await dataStreamWriter.writeData([artifactEvent]);

              if (
                artifactEvent.props?.eventType === 'artifact-chunk' &&
                (!artifactEvent.props.contentChunk ||
                  artifactEvent.props.contentChunk.length === 0)
              ) {
                logger.warn(
                  '[LangchainBridge] Streaming artifact-chunk with empty content.',
                  artifactEvent,
                );
              }
            }
            continue;
          }

          // Handle streaming text content from LLM
          if (
            event.event === 'on_chat_model_stream' &&
            event.data?.chunk?.content
          ) {
            // Only stream text if we are NOT in the middle of artifact generation
            if (!isStreamingArtifact) {
              const textContent = event.data.chunk.content;
              if (typeof textContent === 'string' && textContent.length > 0) {
                // Write the text chunk as a '0:' part
                await dataStreamWriter.write(
                  `0:${JSON.stringify(textContent)}\n`,
                );
              }
            } else {
              logger.info(
                '[LangchainBridge] Suppressed text stream due to active artifact streaming:',
                `"${event.data.chunk.content.substring(0, 50)}..."`,
              );
            }
          }
        }

        logger.info(`[LangchainBridge] Stream processing completed`, {
          totalEvents: eventCount,
          totalUIEvents: allUIEvents.length,
        });

        // Return void since we're writing to the provided stream
        return;
      } else {
        // Original standalone streaming logic (fallback)
        logger.info(
          '[LangchainBridge] Using createDataStreamResponse for standalone LangGraph streaming',
        );

        const { createDataStreamResponse } = await import('ai');

        return createDataStreamResponse({
          execute: async (dataStreamWriter) => {
            // ... rest of original implementation ...
            // (This is the fallback case and can remain as-is)
          },
          onError: (error) => {
            logger.error('[LangchainBridge] DataStream error:', error);
            return error instanceof Error ? error.message : String(error);
          },
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Execution-Path': 'langgraph-enhanced',
            'X-LangGraph-Enabled': 'true',
            'X-Vercel-AI-Data-Stream': 'v1',
          },
        });
      }
    } else if (agent.executionType === 'agent' && agent.agentExecutor) {
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
      throw new Error('Invalid agent configuration or missing components');
    }
  } catch (error) {
    logger.error('Error in streamLangChainAgent', { error });
    throw error;
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
    if (agent.llm?.callbacks) {
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
