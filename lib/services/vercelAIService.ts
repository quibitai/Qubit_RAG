/**
 * VercelAIService
 *
 * Handles Vercel AI SDK integration for simpler queries that don't require
 * complex tool orchestration. Provides streamUI integration, token tracking,
 * and React component streaming.
 * Target: ~120 lines as per roadmap specifications.
 */

import { streamUI } from 'ai/rsc';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { RequestLogger } from './observabilityService';
import type { ClientConfig } from '@/lib/db/queries';

/**
 * Configuration for VercelAI service
 */
export interface VercelAIConfig {
  selectedChatModel?: string;
  contextId?: string | null;
  clientConfig?: ClientConfig | null;
  enableTools?: boolean;
  maxTokens?: number;
  temperature?: number;
  verbose?: boolean;
}

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

    return suggestions;
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
  private availableTools: any[];

  constructor(logger: RequestLogger, config: VercelAIConfig = {}) {
    this.logger = logger;
    this.config = {
      selectedChatModel: 'gpt-4o-mini',
      maxTokens: 2000,
      temperature: 0.7,
      enableTools: true,
      verbose: false,
      ...config,
    };

    this.availableTools = this.config.enableTools
      ? [getWeatherTool, getRequestSuggestionsTool]
      : [];
    this.initializeService();
  }

  /**
   * Initialize the service and log configuration
   */
  private initializeService(): void {
    this.logger.info('Initializing VercelAI service', {
      model: this.config.selectedChatModel,
      enableTools: this.config.enableTools,
      toolCount: this.availableTools.length,
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

      // Build messages array
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...conversationHistory.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        { role: 'user' as const, content: userInput },
      ];

      // Use streamUI for enhanced React component streaming
      const result = await streamUI({
        model: openai(this.config.selectedChatModel || 'gpt-4o-mini'),
        messages,
        tools: this.config.enableTools
          ? {
              getWeather: getWeatherTool,
              getRequestSuggestions: getRequestSuggestionsTool,
            }
          : undefined,
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

          // Note: streamUI doesn't expose toolCalls in onFinish
          // Tool tracking would need to be implemented differently

          this.logger.logTokenUsage({
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
            model: this.config.selectedChatModel || 'gpt-4o-mini',
            provider: 'openai',
          });
        },
      });

      const executionTime = performance.now() - startTime;

      this.logger.info('VercelAI query completed', {
        executionTime: `${executionTime.toFixed(2)}ms`,
        tokenUsage,
        finishReason,
        toolCallCount: toolCalls.length,
      });

      return {
        content: result.value,
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
  public getAvailableTools(): string[] {
    return this.availableTools.map((tool) => tool.name);
  }

  /**
   * Get service metrics
   */
  public getMetrics(): {
    toolCount: number;
    model: string;
    enableTools: boolean;
  } {
    return {
      toolCount: this.availableTools.length,
      model: this.config.selectedChatModel || 'gpt-4o-mini',
      enableTools: this.config.enableTools || false,
    };
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
