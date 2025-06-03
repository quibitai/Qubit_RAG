/**
 * VercelAIService
 *
 * Handles Vercel AI SDK integration for simpler queries that don't require
 * complex tool orchestration. Provides streamText integration, token tracking,
 * and proper string responses for the frontend.
 * Target: ~120 lines as per roadmap specifications.
 */

import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { RequestLogger } from './observabilityService';
import type { ClientConfig } from '@/lib/db/queries';

// Import date/time and prompt loading utilities
import { DateTime } from 'luxon';
import { loadPrompt } from '@/lib/ai/prompts/loader';

// Import modern tool service for proper tool selection
import { selectRelevantTools, type ToolContext } from './modernToolService';

/**
 * Configuration for VercelAI service
 */
export interface VercelAIConfig {
  enableToolExecution?: boolean;
  enableTools?: boolean;
  selectedChatModel?: string;
  maxTokens?: number;
  temperature?: number;
  contextId?: string | null;
  clientConfig?: ClientConfig | null;
}

const DEFAULT_CONFIG: VercelAIConfig = {
  enableToolExecution: true,
  enableTools: true,
  selectedChatModel: 'gpt-4.1-mini',
  maxTokens: 4000,
  temperature: 0.7,
  contextId: null,
  clientConfig: null,
};

/**
 * Vercel AI execution result
 */
export interface VercelAIResult {
  content: any; // ReactNode or string content
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  executionTime: number;
  toolCalls?: Array<{
    name: string;
    input: any;
    result: any;
  }>;
  artifactEvents?: any[]; // Buffered artifact events for image/document generation
}

/**
 * Simple weather tool for Vercel AI SDK
 */
const getWeatherTool = {
  name: 'getWeather',
  description: 'Get current weather for a location',
  parameters: z.object({
    location: z.string().describe('The city and state/country'),
  }),
  execute: async ({ location }: { location: string }) => {
    // Mock weather data for now - in production this would call a real API
    const weatherData = {
      location,
      temperature: Math.floor(Math.random() * 30) + 15, // 15-45°C
      condition: ['sunny', 'cloudy', 'rainy', 'partly cloudy'][
        Math.floor(Math.random() * 4)
      ],
      humidity: Math.floor(Math.random() * 40) + 40, // 40-80%
    };

    return `Current weather in ${location}: ${weatherData.temperature}°C, ${weatherData.condition}, humidity ${weatherData.humidity}%`;
  },
};

/**
 * Simple suggestion tool for Vercel AI SDK
 */
const getRequestSuggestionsTool = {
  name: 'getRequestSuggestions',
  description: 'Generate helpful suggestions for user requests',
  parameters: z.object({
    context: z.string().describe('The current conversation context'),
    userIntent: z.string().describe('What the user is trying to accomplish'),
  }),
  execute: async ({
    context,
    userIntent,
  }: { context: string; userIntent: string }) => {
    // Simple suggestion generation based on intent
    const suggestions = [
      `Try asking: "Can you help me with ${userIntent}?"`,
      `You might want to: "Show me examples of ${userIntent}"`,
      `Consider: "What are the best practices for ${userIntent}?"`,
    ];

    return suggestions.join('\n');
  },
};

/**
 * VercelAIService class
 *
 * Provides streamlined AI interactions using Vercel AI SDK
 */
export class VercelAIService {
  private logger: RequestLogger;
  private config: VercelAIConfig;

  constructor(logger: RequestLogger, config: VercelAIConfig = {}) {
    this.logger = logger;
    this.config = {
      selectedChatModel: 'gpt-4.1-mini',
      maxTokens: 2000,
      temperature: 0.7,
      enableTools: true,
      contextId: config.contextId,
      clientConfig: config.clientConfig,
      ...config,
    };

    this.initializeService();
  }

  /**
   * Initialize the service and log configuration
   */
  private initializeService(): void {
    this.logger.info('Initializing VercelAI service', {
      model: this.config.selectedChatModel,
      enableTools: this.config.enableTools,
      contextId: this.config.contextId,
    });
  }

  /**
   * Process a simple query using Vercel AI SDK
   */
  public async processQuery(
    systemPrompt: string,
    userInput: string,
    conversationHistory: any[] = [],
  ): Promise<VercelAIResult> {
    const startTime = performance.now();

    this.logger.info('Processing query with VercelAI', {
      inputLength: userInput.length,
      historyLength: conversationHistory.length,
      toolsEnabled: this.config.enableTools,
    });

    try {
      let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      let finishReason = 'stop';
      const toolCalls: Array<{ name: string; input: any; result: any }> = [];

      // Get relevant tools from modern tool service
      let availableTools: any[] = [];
      if (this.config.enableTools) {
        const toolContext: ToolContext = {
          userQuery: userInput,
          activeBitContextId: this.config.contextId || undefined,
          logger: this.logger,
        };

        availableTools = await selectRelevantTools(toolContext, 26);

        this.logger.info('Selected tools for VercelAI', {
          toolCount: availableTools.length,
          toolNames: availableTools.map((t) => t.name),
          contextId: this.config.contextId,
        });
      }

      // Convert LangChain format messages to CoreMessage format for Vercel AI SDK
      const convertedHistory = conversationHistory.map((msg) => {
        // Handle LangChain format (type: 'human'|'ai'|'system')
        if (msg.type) {
          if (msg.type === 'human') {
            return { role: 'user' as const, content: msg.content };
          } else if (msg.type === 'ai') {
            return { role: 'assistant' as const, content: msg.content };
          } else {
            return { role: 'system' as const, content: msg.content };
          }
        }
        // Handle direct role format
        else if (msg.role) {
          return {
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content,
          };
        }
        // Fallback for unknown format
        else {
          this.logger.warn('Unknown message format, treating as user message', {
            messageKeys: Object.keys(msg),
            message: msg,
          });
          return { role: 'user' as const, content: String(msg.content || msg) };
        }
      });

      // Build messages array with proper CoreMessage format
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...convertedHistory,
        { role: 'user' as const, content: userInput },
      ];

      // Convert modern tools to Vercel AI format
      const vercelTools: Record<string, any> = {};
      if (this.config.enableTools && availableTools.length > 0) {
        for (const tool of availableTools) {
          vercelTools[tool.name] = {
            description: tool.description,
            parameters: tool.schema,
            execute: tool.func || tool.execute, // Handle both interfaces
          };
        }
      }

      // Use streamText for proper text responses
      const result = await streamText({
        model: openai(this.config.selectedChatModel || 'gpt-4.1-mini'),
        messages,
        tools: Object.keys(vercelTools).length > 0 ? vercelTools : undefined,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        onFinish: (event) => {
          // Track token usage
          if (event.usage) {
            tokenUsage = {
              promptTokens: event.usage.promptTokens,
              completionTokens: event.usage.completionTokens,
              totalTokens: event.usage.totalTokens,
            };
          }
          finishReason = event.finishReason || 'stop';

          this.logger.logTokenUsage({
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
            model: this.config.selectedChatModel || 'gpt-4.1-mini',
            provider: 'openai',
          });
        },
      });

      // Collect both text content and tool calls
      let content = '';

      // Handle both text and tool calls
      for await (const delta of result.fullStream) {
        switch (delta.type) {
          case 'text-delta':
            content += delta.textDelta;
            break;
          case 'tool-call':
            // Track tool calls for logging
            toolCalls.push({
              name: delta.toolName,
              input: delta.args,
              result: null, // Will be filled when tool-result comes
            });
            break;
          case 'tool-result': {
            // Find the corresponding tool call and update its result
            const toolCall = toolCalls.find(
              (call) => call.name === delta.toolName,
            );
            if (toolCall) {
              toolCall.result = delta.result;
              // Add tool result to content
              content += `\n\n${delta.result}`;
            }
            break;
          }
        }
      }

      // Get final usage statistics
      const finalResult = await result;
      const usage = await finalResult.usage;
      const finalFinishReason = await finalResult.finishReason;

      if (usage) {
        tokenUsage = {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        };
      }

      finishReason = finalFinishReason || 'stop';

      const executionTime = performance.now() - startTime;

      this.logger.info('VercelAI query completed', {
        executionTime: `${executionTime.toFixed(2)}ms`,
        tokenUsage,
        finishReason,
        toolCallCount: toolCalls.length,
        contentLength: content.length,
      });

      return {
        content, // Now includes both text and tool results
        tokenUsage,
        finishReason,
        executionTime,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;

      this.logger.error('VercelAI query failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: `${executionTime.toFixed(2)}ms`,
        inputLength: userInput.length,
      });

      throw error;
    }
  }

  /**
   * Generate simple UI components for responses
   */
  public generateResponseUI(content: string, metadata?: any): any {
    // Simple React component generation for responses
    // In a real implementation, this would create proper JSX
    return {
      type: 'response',
      content,
      metadata,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get available tools
   */
  public async getAvailableTools(userQuery = ''): Promise<string[]> {
    if (!this.config.enableTools) {
      return [];
    }

    const toolContext: ToolContext = {
      userQuery,
      activeBitContextId: this.config.contextId || undefined,
      logger: this.logger,
    };

    const tools = await selectRelevantTools(toolContext, 26);
    return tools.map((tool) => tool.name);
  }

  /**
   * Get service metrics
   */
  public async getMetrics(userQuery = ''): Promise<{
    toolCount: number;
    model: string;
    enableTools: boolean;
  }> {
    const availableTools = await this.getAvailableTools(userQuery);

    return {
      toolCount: availableTools.length,
      model: this.config.selectedChatModel || 'gpt-4.1-mini',
      enableTools: this.config.enableTools || false,
    };
  }

  /**
   * Stream a query using Vercel AI SDK with proper Response object
   */
  public async streamQuery(
    systemPrompt: string,
    userInput: string,
    conversationHistory: any[] = [],
  ): Promise<Response> {
    this.logger.info('Streaming query with VercelAI', {
      inputLength: userInput.length,
      historyLength: conversationHistory.length,
      toolsEnabled: this.config.enableTools,
    });

    try {
      // Get relevant tools from modern tool service
      let availableTools: any[] = [];
      if (this.config.enableTools) {
        const toolContext: ToolContext = {
          userQuery: userInput,
          activeBitContextId: this.config.contextId || undefined,
          logger: this.logger,
        };

        availableTools = await selectRelevantTools(toolContext, 26);

        this.logger.info('Selected tools for VercelAI streaming', {
          toolCount: availableTools.length,
          toolNames: availableTools.map((t) => t.name),
          contextId: this.config.contextId,
        });
      }

      // Convert LangChain format messages to CoreMessage format for Vercel AI SDK
      const convertedHistory = conversationHistory.map((msg) => {
        // Handle LangChain format (type: 'human'|'ai'|'system')
        if (msg.type) {
          if (msg.type === 'human') {
            return { role: 'user' as const, content: msg.content };
          } else if (msg.type === 'ai') {
            return { role: 'assistant' as const, content: msg.content };
          } else {
            return { role: 'system' as const, content: msg.content };
          }
        }
        // Handle direct role format
        else if (msg.role) {
          return {
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content,
          };
        }
        // Fallback for unknown format
        else {
          this.logger.warn(
            'Unknown message format in streaming, treating as user message',
            {
              messageKeys: Object.keys(msg),
              message: msg,
            },
          );
          return { role: 'user' as const, content: String(msg.content || msg) };
        }
      });

      // Build messages array with proper CoreMessage format
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...convertedHistory,
        { role: 'user' as const, content: userInput },
      ];

      // Convert modern tools to Vercel AI format
      const vercelTools: Record<string, any> = {};
      if (this.config.enableTools && availableTools.length > 0) {
        for (const tool of availableTools) {
          vercelTools[tool.name] = {
            description: tool.description,
            parameters: tool.schema,
            execute: tool.func || tool.execute, // Handle both interfaces
          };
        }
      }

      // Use streamText and return proper Response object
      const result = streamText({
        model: openai(this.config.selectedChatModel || 'gpt-4.1-mini'),
        messages,
        tools: Object.keys(vercelTools).length > 0 ? vercelTools : undefined,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        onFinish: (event) => {
          // Track token usage
          if (event.usage) {
            this.logger.logTokenUsage({
              promptTokens: event.usage.promptTokens,
              completionTokens: event.usage.completionTokens,
              totalTokens: event.usage.totalTokens,
              model: this.config.selectedChatModel || 'gpt-4.1-mini',
              provider: 'openai',
            });
          }

          this.logger.info('VercelAI streaming completed', {
            finishReason: event.finishReason,
            usage: event.usage,
          });
        },
      });

      // Return proper Response object for streaming
      return result.toDataStreamResponse();
    } catch (error) {
      this.logger.error('VercelAI streaming failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        inputLength: userInput.length,
      });

      throw error;
    }
  }
}

/**
 * Convenience functions for VercelAI operations
 */

/**
 * Create a VercelAIService instance with default configuration
 */
export function createVercelAIService(
  logger: RequestLogger,
  config?: VercelAIConfig,
): VercelAIService {
  return new VercelAIService(logger, config);
}

/**
 * Quick query processing utility
 */
export async function processSimpleQuery(
  logger: RequestLogger,
  systemPrompt: string,
  userInput: string,
  config?: VercelAIConfig,
): Promise<VercelAIResult> {
  const service = createVercelAIService(logger, config);
  return service.processQuery(systemPrompt, userInput);
}
