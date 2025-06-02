/**
 * LangChain Integration Bridge
 *
 * Connects our modern BrainOrchestrator architecture with existing LangChain
 * tools, agents, and enhanced executor while adding observability and performance monitoring.
 */

import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { EnhancedAgentExecutor } from '@/lib/ai/executors/EnhancedAgentExecutor';
import { availableTools } from '@/lib/ai/tools/index';
import { specialistRegistry } from '@/lib/ai/prompts/specialists';
import { modelMapping } from '@/lib/ai/models';
import type { RequestLogger } from './observabilityService';
import type { ClientConfig } from '@/lib/db/queries';

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
}

/**
 * LangChain agent and executor wrapper
 */
export interface LangChainAgent {
  agentExecutor: AgentExecutor;
  enhancedExecutor?: EnhancedAgentExecutor;
  tools: any[];
  llm: ChatOpenAI;
  prompt: ChatPromptTemplate;
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
 */
function selectTools(
  config: LangChainBridgeConfig,
  logger: RequestLogger,
): any[] {
  const startTime = performance.now();

  // Get client-specific tool configurations
  if (config.clientConfig?.configJson?.tool_configs) {
    logger.info('Setting up client-specific tool configurations');
    global.CURRENT_TOOL_CONFIGS = config.clientConfig.configJson.tool_configs;
  }

  let selectedTools = [...availableTools];

  logger.info('All tools available to all specialists', {
    contextId: config.contextId,
    toolCount: selectedTools.length,
    selectedTools: selectedTools.map((t) => t.name),
  });

  // Limit tools if specified
  if (config.maxTools && selectedTools.length > config.maxTools) {
    selectedTools = selectedTools.slice(0, config.maxTools);
    logger.info('Limited tool count', {
      maxTools: config.maxTools,
      finalCount: selectedTools.length,
    });
  }

  const duration = performance.now() - startTime;
  logger.info('Tool selection completed', {
    totalAvailable: availableTools.length,
    selected: selectedTools.length,
    selectionTime: `${duration.toFixed(2)}ms`,
    tools: selectedTools.map((t) => t.name),
  });

  return selectedTools;
}

/**
 * Create LangChain agent with tools and prompt
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
  });

  // Initialize LLM
  const llmStartTime = performance.now();
  const llm = initializeLLM(config, logger);
  const llmDuration = performance.now() - llmStartTime;

  // Select tools
  const toolStartTime = performance.now();
  const tools =
    config.enableToolExecution !== false ? selectTools(config, logger) : [];
  const toolDuration = performance.now() - toolStartTime;

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
    returnIntermediateSteps: false,
    verbose: config.verbose || false,
  });

  // Create enhanced executor for smarter tool call enforcement
  const enhancedExecutor = EnhancedAgentExecutor.fromExecutor(agentExecutor, {
    enforceToolCalls: false, // Conservative approach for stability
    verbose: config.verbose || false,
  });

  const totalDuration = performance.now() - startTime;

  logger.info('LangChain agent created successfully', {
    totalSetupTime: `${totalDuration.toFixed(2)}ms`,
    llmInitTime: `${llmDuration.toFixed(2)}ms`,
    toolSelectionTime: `${toolDuration.toFixed(2)}ms`,
    agentCreationTime: `${agentDuration.toFixed(2)}ms`,
    toolCount: tools.length,
    contextId: config.contextId,
  });

  return {
    agentExecutor,
    enhancedExecutor,
    tools,
    llm,
    prompt,
  };
}

/**
 * Execute LangChain agent with observability
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
    hasEnhancedExecutor: !!agent.enhancedExecutor,
    contextId: config.contextId,
  });

  try {
    const executionInput = {
      input,
      chat_history: chatHistory,
      activeBitContextId: config.contextId || null,
    };

    // Use enhanced executor if available, otherwise fall back to standard
    const executor = agent.enhancedExecutor || agent.agentExecutor;
    const result = await executor.invoke(executionInput);

    const duration = performance.now() - startTime;

    logger.info('LangChain agent execution completed', {
      executionTime: `${duration.toFixed(2)}ms`,
      outputLength: result.output?.length || 0,
      success: true,
    });

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;

    logger.error('LangChain agent execution failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime: `${duration.toFixed(2)}ms`,
      inputLength: input.length,
    });

    throw error;
  }
}

/**
 * Stream LangChain agent execution with observability
 */
export async function streamLangChainAgent(
  agent: LangChainAgent,
  input: string,
  chatHistory: any[],
  config: LangChainBridgeConfig,
  logger: RequestLogger,
  callbacks?: any,
): Promise<AsyncIterable<any>> {
  const startTime = performance.now();

  logger.info('Starting LangChain agent streaming', {
    inputLength: input.length,
    historyLength: chatHistory.length,
    hasCallbacks: !!callbacks,
    contextId: config.contextId,
  });

  try {
    const executionInput = {
      input,
      chat_history: chatHistory,
      activeBitContextId: config.contextId || null,
    };

    const options = callbacks ? { callbacks } : {};

    // Use enhanced executor if available for streaming
    const executor = agent.enhancedExecutor || agent.agentExecutor;
    const stream = await executor.stream(executionInput, options);

    logger.info('LangChain agent streaming started', {
      setupTime: `${(performance.now() - startTime).toFixed(2)}ms`,
    });

    return stream;
  } catch (error) {
    const duration = performance.now() - startTime;

    logger.error('LangChain agent streaming failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      setupTime: `${duration.toFixed(2)}ms`,
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
