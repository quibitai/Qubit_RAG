/**
 * Simple LangGraph Implementation
 *
 * A simplified LangGraph implementation for transitioning from AgentExecutor
 * to LangGraph in the langchainBridge.ts service. Focuses on core functionality
 * with proper streaming support.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import type { RequestLogger } from '@/lib/services/observabilityService';
import { availableTools } from '@/lib/ai/tools/index';
import {
  selectRelevantTools,
  type ToolContext,
} from '@/lib/services/modernToolService';

/**
 * Simple state interface for the graph
 */
export interface SimpleGraphState {
  messages: BaseMessage[];
  userInput: string;
  response?: string;
  toolResults?: Record<string, any>;
  currentStep?: string;
}

/**
 * Configuration for the simple graph
 */
export interface SimpleGraphConfig {
  systemPrompt: string;
  selectedChatModel?: string;
  contextId?: string | null;
  enableToolExecution?: boolean;
  maxIterations?: number;
  verbose?: boolean;
  logger: RequestLogger;
}

/**
 * Simple LangGraph implementation
 */
export class SimpleGraph {
  private graph: StateGraph<SimpleGraphState>;
  private config: SimpleGraphConfig;
  private llm: ChatOpenAI;
  private tools: any[] = [];

  constructor(config: SimpleGraphConfig) {
    this.config = config;
    this.initializeLLM();
    this.graph = this.createGraph();
  }

  /**
   * Initialize the LLM
   */
  private initializeLLM(): void {
    const selectedModel = this.config.selectedChatModel || 'gpt-4o-mini';

    this.llm = new ChatOpenAI({
      modelName: selectedModel,
      temperature: 0.7,
      apiKey: process.env.OPENAI_API_KEY,
      streaming: true,
    });

    this.config.logger.info('Simple LangGraph LLM initialized', {
      model: selectedModel,
      contextId: this.config.contextId,
    });
  }

  /**
   * Create the graph structure
   */
  private createGraph(): StateGraph<SimpleGraphState> {
    // Create a simple graph structure
    const graph = new StateGraph<SimpleGraphState>({
      channels: {
        messages: {
          value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
          default: () => [],
        },
        userInput: {
          value: (x: string) => x,
          default: () => '',
        },
        response: {
          value: (x: string) => x,
          default: () => '',
        },
        toolResults: {
          value: (x: Record<string, any>, y: Record<string, any>) => ({
            ...x,
            ...y,
          }),
          default: () => ({}),
        },
        currentStep: {
          value: (x: string) => x,
          default: () => 'start',
        },
      },
    });

    // Add nodes
    graph.addNode('process_request', async (state: SimpleGraphState) => {
      return await this.processRequest(state);
    });

    // Add edges
    graph.addEdge(START, 'process_request');
    graph.addEdge('process_request', END);

    return graph;
  }

  /**
   * Process the request using LLM and tools
   */
  private async processRequest(
    state: SimpleGraphState,
  ): Promise<Partial<SimpleGraphState>> {
    try {
      // Select relevant tools if enabled
      if (this.config.enableToolExecution) {
        await this.selectTools(state.userInput);
      }

      // Bind tools to LLM if any are available
      const llmWithTools =
        this.tools.length > 0
          ? (this.llm.bindTools(this.tools) as any)
          : this.llm;

      // Create the conversation messages
      const systemMessage = new AIMessage(this.config.systemPrompt);
      const conversationMessages = [systemMessage, ...state.messages];

      // Invoke the LLM
      const response = await llmWithTools.invoke(conversationMessages);

      return {
        response: response.content as string,
        currentStep: 'completed',
        messages: [
          ...state.messages,
          new AIMessage(response.content as string),
        ],
      };
    } catch (error) {
      this.config.logger.error('Simple graph processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userInput: state.userInput.substring(0, 100),
      });

      return {
        response:
          'I encountered an error processing your request. Please try again.',
        currentStep: 'error',
      };
    }
  }

  /**
   * Select tools based on user input
   */
  private async selectTools(userInput: string): Promise<void> {
    try {
      const toolContext: ToolContext = {
        userQuery: userInput,
        activeBitContextId: this.config.contextId || undefined,
        logger: this.config.logger,
      };

      this.tools = await selectRelevantTools(toolContext, 5);

      this.config.logger.info('Selected tools for simple graph', {
        toolCount: this.tools.length,
        toolNames: this.tools.map((t) => t.name),
      });
    } catch (error) {
      this.config.logger.error('Tool selection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.tools = [];
    }
  }

  /**
   * Execute the graph
   */
  public async execute(
    userInput: string,
    conversationHistory: BaseMessage[] = [],
  ): Promise<string> {
    const initialState: SimpleGraphState = {
      messages: conversationHistory,
      userInput,
      currentStep: 'start',
      toolResults: {},
    };

    try {
      const compiledGraph = this.graph.compile();
      const finalState = await compiledGraph.invoke(initialState);

      return finalState.response || 'No response generated';
    } catch (error) {
      this.config.logger.error('Graph execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userInput: userInput.substring(0, 100),
      });

      throw error;
    }
  }

  /**
   * Stream events from graph execution
   */
  public async *streamEvents(
    userInput: string,
    conversationHistory: BaseMessage[] = [],
  ): AsyncIterable<any> {
    const initialState: SimpleGraphState = {
      messages: conversationHistory,
      userInput,
      currentStep: 'start',
      toolResults: {},
    };

    try {
      const compiledGraph = this.graph.compile();

      // Use LangGraph's streamEvents for proper streaming
      for await (const event of compiledGraph.streamEvents(initialState, {
        version: 'v2',
      })) {
        yield event;
      }
    } catch (error) {
      this.config.logger.error('Graph streaming failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userInput: userInput.substring(0, 100),
      });

      yield {
        event: 'on_chain_error',
        name: 'simple_graph',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}

/**
 * Factory function for creating simple graphs
 */
export function createSimpleGraph(config: SimpleGraphConfig): SimpleGraph {
  return new SimpleGraph(config);
}
