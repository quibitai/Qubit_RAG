/**
 * Base LangGraph Factory
 *
 * Provides common functionality for creating and configuring LangGraphs,
 * including LLM initialization, tool selection, and structured tool calling setup.
 */

import { ChatOpenAI } from '@langchain/openai';
import { StateGraph } from '@langchain/langgraph';
import type { RequestLogger } from '@/lib/services/observabilityService';
import { availableTools } from '@/lib/ai/tools/index';
import { modelMapping } from '@/lib/ai/models';
import {
  selectRelevantTools,
  type ToolContext,
} from '@/lib/services/modernToolService';
import type {
  LangGraphConfig,
  BaseGraphState,
  GraphExecutionResult,
  ErrorRecoveryStrategy,
} from './types';

/**
 * Base graph factory for creating LangGraphs with common functionality
 */
export class BaseLangGraphFactory {
  protected logger: RequestLogger;
  protected config: LangGraphConfig;

  constructor(config: LangGraphConfig) {
    this.config = config;
    this.logger = config.logger;
  }

  /**
   * Initialize LLM with structured tool calling enabled
   */
  protected initializeLLM(tools: any[] = []): ChatOpenAI {
    const selectedModel = this.getSelectedModel();

    this.logger.info('Initializing LLM for LangGraph', {
      model: selectedModel,
      contextId: this.config.contextId,
      toolCount: tools.length,
      toolsEnabled: this.config.enableToolExecution,
    });

    const llm = new ChatOpenAI({
      modelName: selectedModel,
      temperature: 0.7,
      apiKey: process.env.OPENAI_API_KEY,
      streaming: true,
    });

    // Bind tools for structured calling if tools are provided
    if (tools.length > 0 && this.config.enableToolExecution) {
      // Create a new instance with bound tools but return as ChatOpenAI type
      const boundLLM = llm.bindTools(tools) as any;
      // Copy over the original properties for compatibility
      return Object.assign(boundLLM, {
        modelName: llm.modelName,
        temperature: llm.temperature,
        streaming: llm.streaming,
      }) as ChatOpenAI;
    }

    return llm;
  }

  /**
   * Select relevant tools based on context and query
   */
  protected async selectTools(userQuery: string): Promise<any[]> {
    if (!this.config.enableToolExecution) {
      return [];
    }

    try {
      const toolContext: ToolContext = {
        userQuery,
        activeBitContextId: this.config.contextId || undefined,
        logger: this.logger,
      };

      // Use the modern tool service to select relevant tools
      const selectedTools = await selectRelevantTools(toolContext, 10);

      this.logger.info('Selected tools for LangGraph', {
        toolCount: selectedTools.length,
        toolNames: selectedTools.map((t) => t.name),
        userQuery: userQuery.substring(0, 100),
      });

      return selectedTools;
    } catch (error) {
      this.logger.error('Tool selection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userQuery: userQuery.substring(0, 100),
      });
      return [];
    }
  }

  /**
   * Get the selected model based on configuration
   */
  private getSelectedModel(): string {
    if (this.config.contextId && modelMapping[this.config.contextId]) {
      return modelMapping[this.config.contextId];
    }

    if (this.config.selectedChatModel) {
      return this.config.selectedChatModel;
    }

    return process.env.DEFAULT_MODEL_NAME || modelMapping.default;
  }

  /**
   * Create initial state with common metadata
   */
  protected createInitialState(
    userQuery: string,
    messages: any[] = [],
  ): Partial<BaseGraphState> {
    return {
      messages,
      currentStep: 'start',
      metadata: {
        startTime: Date.now(),
        stepTimes: {},
        toolsUsed: [],
        totalSteps: 0,
      },
    };
  }

  /**
   * Record step timing for observability
   */
  protected recordStepTime(state: BaseGraphState, stepName: string): void {
    if (state.metadata) {
      state.metadata.stepTimes[stepName] = Date.now();
      state.metadata.totalSteps += 1;
    }
  }

  /**
   * Handle errors with recovery strategies
   */
  protected handleError(
    state: BaseGraphState,
    error: Error,
    step: string,
    strategy: ErrorRecoveryStrategy = 'abort',
  ): Partial<BaseGraphState> {
    this.logger.error('Graph execution error', {
      step,
      error: error.message,
      strategy,
      graphState: {
        currentStep: state.currentStep,
        toolsUsed: state.metadata?.toolsUsed || [],
      },
    });

    const errorInfo = {
      message: error.message,
      step,
      recoverable: strategy !== 'abort',
    };

    switch (strategy) {
      case 'retry':
        // Mark for retry but don't change the current step
        return { error: errorInfo };

      case 'skip':
        // Skip to next step
        return {
          error: errorInfo,
          currentStep: 'next', // This would be determined by the specific graph
        };

      case 'fallback':
        // Use fallback strategy
        return {
          error: errorInfo,
          currentStep: 'fallback',
        };

      case 'human_intervention':
        // Require human input
        return {
          error: errorInfo,
          currentStep: 'human_input_required',
        };

      case 'abort':
      default:
        return {
          error: errorInfo,
          currentStep: 'error',
          finalResponse: `I encountered an error: ${error.message}. Please try again or rephrase your request.`,
        };
    }
  }

  /**
   * Finalize graph execution with metrics
   */
  protected finalizeExecution(
    state: BaseGraphState,
    success: boolean,
    executionPath: string[],
  ): GraphExecutionResult {
    const endTime = Date.now();
    const totalTime = state.metadata?.startTime
      ? endTime - state.metadata.startTime
      : 0;

    return {
      finalState: state,
      success,
      metrics: {
        totalTime,
        stepCount: state.metadata?.totalSteps || 0,
        toolCallCount: state.metadata?.toolsUsed.length || 0,
      },
      executionPath,
    };
  }

  /**
   * Create a conditional edge function
   */
  protected createConditionalEdge(
    conditions: Record<string, (state: BaseGraphState) => boolean>,
  ): (state: BaseGraphState) => string {
    return (state: BaseGraphState) => {
      for (const [targetNode, condition] of Object.entries(conditions)) {
        if (condition(state)) {
          return targetNode;
        }
      }
      return 'end'; // Default fallback
    };
  }

  /**
   * Validate state before proceeding
   */
  protected validateState(
    state: BaseGraphState,
    requiredFields: string[],
  ): boolean {
    for (const field of requiredFields) {
      if (!(field in state) || state[field as keyof BaseGraphState] == null) {
        this.logger.warn('State validation failed', {
          missingField: field,
          currentStep: state.currentStep,
        });
        return false;
      }
    }
    return true;
  }

  /**
   * Log state transition for debugging
   */
  protected logStateTransition(
    fromStep: string,
    toStep: string,
    state: BaseGraphState,
    reason?: string,
  ): void {
    if (this.config.verbose) {
      this.logger.info('Graph state transition', {
        fromStep,
        toStep,
        reason,
        stateSnapshot: {
          currentStep: state.currentStep,
          hasError: !!state.error,
          toolResultsCount: Object.keys(state.toolResults || {}).length,
          messagesCount: state.messages.length,
        },
      });
    }
  }
}
