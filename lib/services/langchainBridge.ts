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
import { modelMapping } from '@/lib/ai/models';
import {
  LangChainToolService,
  createLangChainToolService,
} from './langchainToolService';
import {
  LangChainStreamingService,
  createLangChainStreamingService,
} from './langchainStreamingService';

// Import LangGraph support
import { createLangGraphWrapper, shouldUseLangGraph } from '@/lib/ai/graphs';
import type { SimpleLangGraphWrapper } from '@/lib/ai/graphs';

// Type imports
import type { EnhancedAgentExecutor } from '@/lib/ai/executors/EnhancedAgentExecutor';
import type { RequestLogger } from './observabilityService';
import type { ClientConfig } from '@/lib/db/queries';
import type { LangChainToolConfig } from './langchainToolService';
import type { LangChainStreamingConfig } from './langchainStreamingService';
import type { LangGraphWrapperConfig } from '@/lib/ai/graphs';

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
  enhancedExecutor?: EnhancedAgentExecutor;
  tools: any[];
  llm: ChatOpenAI;
  prompt?: ChatPromptTemplate;
  executionType: 'agent' | 'langgraph';
}

/**
 * Performance metrics for LangChain operations
 */
export interface LangChainMetrics {
  agentCreationTime: number;
  toolSelectionTime: number;
  llmInitializationTime: number;
  totalSetupTime: number;
  toolCount: number;
  selectedModel: string;
  contextId: string | null;
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
      selectedChatModel: config.selectedChatModel,
      contextId: config.contextId,
      enableToolExecution: config.enableToolExecution,
      maxIterations: config.maxIterations,
      verbose: config.verbose || false,
      logger,
      tools,
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
      // Execute with LangGraph wrapper
      result = await agent.langGraphWrapper.invoke({
        input,
        chat_history: chatHistory,
        activeBitContextId: config.contextId,
      });
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
 * Now supports both AgentExecutor and LangGraph streaming
 */
export async function streamLangChainAgent(
  agent: LangChainAgent,
  input: string,
  chatHistory: any[],
  config: LangChainBridgeConfig,
  logger: RequestLogger,
  callbacks?: any,
): Promise<AsyncIterable<any>> {
  logger.info('Streaming LangChain agent', {
    inputLength: input.length,
    historyLength: chatHistory.length,
    executionType: agent.executionType,
    hasCallbacks: !!callbacks,
  });

  try {
    if (agent.executionType === 'langgraph' && agent.langGraphWrapper) {
      // Stream with LangGraph wrapper
      return agent.langGraphWrapper.stream(
        {
          input,
          chat_history: chatHistory,
          activeBitContextId: config.contextId,
        },
        { callbacks },
      );
    } else if (agent.executionType === 'agent' && agent.agentExecutor) {
      // Stream with traditional AgentExecutor
      return agent.agentExecutor.stream(
        {
          input,
          chat_history: chatHistory,
          activeBitContextId: config.contextId,
        },
        { callbacks },
      );
    } else {
      throw new Error(`Invalid agent configuration: ${agent.executionType}`);
    }
  } catch (error) {
    logger.error('LangChain agent streaming failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      executionType: agent.executionType,
    });
    throw error;
  }
}

/**
 * Get performance metrics for LangChain operations
 */
export function getLangChainMetrics(
  agent: LangChainAgent,
  config: LangChainBridgeConfig,
  setupTime: number,
): LangChainMetrics {
  return {
    agentCreationTime: setupTime,
    toolSelectionTime: 0, // Would need to be tracked during creation
    llmInitializationTime: 0, // Would need to be tracked during creation
    totalSetupTime: setupTime,
    toolCount: agent.tools.length,
    selectedModel: config.selectedChatModel || 'default',
    contextId: config.contextId || null,
  };
}

/**
 * Clean up LangChain resources
 */
export function cleanupLangChainAgent(
  agent: LangChainAgent,
  logger: RequestLogger,
): void {
  logger.info('Cleaning up LangChain agent resources', {
    toolCount: agent.tools.length,
  });

  // Clean up global tool configurations
  if (global.CURRENT_TOOL_CONFIGS) {
    global.CURRENT_TOOL_CONFIGS = {};
  }

  // LangChain objects are garbage collected automatically
  logger.info('LangChain agent cleanup completed');
}
