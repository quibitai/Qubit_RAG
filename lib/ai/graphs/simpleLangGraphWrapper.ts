/**
 * Simple LangGraph Wrapper
 *
 * Provides a wrapper around LangGraph functionality that mimics the AgentExecutor
 * interface for easy integration with existing langchainBridge.ts code.
 * This is a transitional implementation for Task 1.1.
 */

import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { RequestLogger } from '@/lib/services/observabilityService';

/**
 * Configuration for the LangGraph wrapper
 */
export interface LangGraphWrapperConfig {
  systemPrompt: string;
  selectedChatModel?: string;
  contextId?: string | null;
  enableToolExecution?: boolean;
  maxIterations?: number;
  verbose?: boolean;
  logger: RequestLogger;
  tools: any[];
}

/**
 * Simple LangGraph wrapper that provides AgentExecutor-like interface
 */
export class SimpleLangGraphWrapper {
  private llm!: ChatOpenAI;
  private config: LangGraphWrapperConfig;
  private tools: any[];

  constructor(config: LangGraphWrapperConfig) {
    this.config = config;
    this.tools = config.tools || [];
    this.initializeLLM();
  }

  /**
   * Initialize the LLM with tools if available
   */
  private initializeLLM(): void {
    const selectedModel = this.config.selectedChatModel || 'gpt-4o-mini';

    this.llm = new ChatOpenAI({
      modelName: selectedModel,
      temperature: 0.7,
      apiKey: process.env.OPENAI_API_KEY,
      streaming: true,
    });

    // Bind tools if available and tool execution is enabled
    if (this.tools.length > 0 && this.config.enableToolExecution) {
      try {
        this.llm = this.llm.bindTools(this.tools) as ChatOpenAI;

        this.config.logger.info('LangGraph wrapper initialized with tools', {
          model: selectedModel,
          toolCount: this.tools.length,
          contextId: this.config.contextId,
        });
      } catch (error) {
        this.config.logger.warn('Failed to bind tools to LLM', {
          error: error instanceof Error ? error.message : 'Unknown error',
          toolCount: this.tools.length,
        });
      }
    } else {
      this.config.logger.info('LangGraph wrapper initialized without tools', {
        model: selectedModel,
        contextId: this.config.contextId,
      });
    }
  }

  /**
   * Invoke method that mimics AgentExecutor.invoke()
   */
  public async invoke(input: {
    input: string;
    chat_history: any[];
    activeBitContextId?: string | null;
  }): Promise<{ output: string }> {
    const startTime = Date.now();

    try {
      // Convert chat history to LangChain messages
      const messages = this.convertChatHistory(input.chat_history);

      // Add system prompt as initial message
      const systemMessage = new AIMessage(this.config.systemPrompt);

      // Add user input
      const userMessage = new HumanMessage(input.input);

      // Create conversation
      const conversation = [systemMessage, ...messages, userMessage];

      this.config.logger.info('LangGraph wrapper processing request', {
        inputLength: input.input.length,
        historyLength: input.chat_history.length,
        contextId: input.activeBitContextId,
      });

      // Invoke LLM
      const response = await this.llm.invoke(conversation);

      const executionTime = Date.now() - startTime;

      this.config.logger.info('LangGraph wrapper completed request', {
        executionTime: `${executionTime}ms`,
        outputLength: (response.content as string).length,
      });

      return {
        output: response.content as string,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.config.logger.error('LangGraph wrapper failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: `${executionTime}ms`,
        inputLength: input.input.length,
      });

      throw error;
    }
  }

  /**
   * Stream method that mimics AgentExecutor.stream()
   */
  public async *stream(
    input: {
      input: string;
      chat_history: any[];
      activeBitContextId?: string | null;
    },
    options?: { callbacks?: any },
  ): AsyncIterable<any> {
    try {
      // Convert chat history to LangChain messages
      const messages = this.convertChatHistory(input.chat_history);

      // Add system prompt as initial message
      const systemMessage = new AIMessage(this.config.systemPrompt);

      // Add user input
      const userMessage = new HumanMessage(input.input);

      // Create conversation
      const conversation = [systemMessage, ...messages, userMessage];

      this.config.logger.info('LangGraph wrapper streaming request', {
        inputLength: input.input.length,
        historyLength: input.chat_history.length,
        hasCallbacks: !!options?.callbacks,
      });

      // Stream LLM response
      const stream = await this.llm.stream(conversation);

      // Yield chunks in AgentExecutor-compatible format
      for await (const chunk of stream) {
        yield {
          output: chunk.content,
          messages: [chunk],
        };
      }
    } catch (error) {
      this.config.logger.error('LangGraph wrapper streaming failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        inputLength: input.input.length,
      });

      throw error;
    }
  }

  /**
   * Convert chat history to LangChain message format
   */
  private convertChatHistory(chatHistory: any[]): BaseMessage[] {
    return chatHistory.map((msg) => {
      if (msg.type === 'human' || msg.role === 'user') {
        return new HumanMessage(msg.content);
      } else if (msg.type === 'ai' || msg.role === 'assistant') {
        return new AIMessage(msg.content);
      } else {
        // Default to AI message for system messages
        return new AIMessage(msg.content);
      }
    });
  }

  /**
   * Get configuration for debugging
   */
  public getConfig(): LangGraphWrapperConfig {
    return this.config;
  }
}

/**
 * Factory function to create a LangGraph wrapper
 */
export function createLangGraphWrapper(
  config: LangGraphWrapperConfig,
): SimpleLangGraphWrapper {
  return new SimpleLangGraphWrapper(config);
}
