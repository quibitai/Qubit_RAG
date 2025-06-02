import { openai } from '@ai-sdk/openai';
import { streamText, type LanguageModel } from 'ai';
import type { RequestLogger, TokenUsage } from './observabilityService';
import type { BrainRequest } from '@/lib/validation/brainValidation';

/**
 * StreamingService
 *
 * Provides streaming response capabilities using Vercel AI SDK
 * Integrates with existing LangChain tools and modern observability
 */

export interface StreamingConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  topP?: number;
  seed?: number;
}

export interface StreamingContext {
  systemPrompt: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  tools?: any[];
  logger: RequestLogger;
}

export interface StreamingResult {
  stream: ReadableStream;
  tokenUsage?: TokenUsage;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Gets the appropriate language model based on configuration
 */
function getLanguageModel(config: StreamingConfig): LanguageModel {
  const modelName = config.model;

  // Map your model names to AI SDK models - use simpler configuration
  if (modelName.includes('gpt-4o-mini')) {
    return openai('gpt-4o-mini');
  }

  if (modelName.includes('gpt-4o')) {
    return openai('gpt-4o');
  }

  if (modelName.includes('gpt-4')) {
    return openai('gpt-4-turbo');
  }

  // Default to gpt-4o-mini for unknown models
  return openai('gpt-4o-mini');
}

/**
 * Converts chat messages to the format expected by AI SDK
 */
function formatMessages(
  context: StreamingContext,
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  const messages = [...context.messages];

  // Add system message if not already present
  if (!messages.some((m) => m.role === 'system')) {
    messages.unshift({
      role: 'system',
      content: context.systemPrompt,
    });
  }

  return messages;
}

/**
 * Creates a streaming response using Vercel AI SDK
 */
export async function createStreamingResponse(
  config: StreamingConfig,
  context: StreamingContext,
): Promise<StreamingResult> {
  const startTime = performance.now();

  context.logger.info('Starting streaming response', {
    model: config.model,
    messageCount: context.messages.length,
    hasTools: context.tools && context.tools.length > 0,
    temperature: config.temperature,
  });

  try {
    const model = getLanguageModel(config);
    const messages = formatMessages(context);

    const result = await streamText({
      model,
      messages,
      tools: context.tools || {},
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      presencePenalty: config.presencePenalty,
      frequencyPenalty: config.frequencyPenalty,
      seed: config.seed,
      onFinish: (finishData) => {
        const duration = performance.now() - startTime;

        // Log token usage
        if (finishData.usage) {
          const tokenUsage: TokenUsage = {
            promptTokens: finishData.usage.promptTokens,
            completionTokens: finishData.usage.completionTokens,
            totalTokens: finishData.usage.totalTokens,
            model: config.model,
            provider: 'openai',
          };

          context.logger.logTokenUsage(tokenUsage);
        }

        context.logger.info('Streaming completed', {
          duration: `${duration.toFixed(2)}ms`,
          finishReason: finishData.finishReason,
          usage: finishData.usage,
        });
      },
    });

    return {
      stream: result.toDataStream(),
      usage: undefined, // Will be populated in onFinish
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    context.logger.error('Streaming failed', error);

    // Create an error stream
    const errorStream = new ReadableStream({
      start(controller) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown streaming error';
        controller.enqueue(`data: {"error": "${errorMessage}"}\n\n`);
        controller.close();
      },
    });

    return {
      stream: errorStream,
    };
  }
}

/**
 * Creates a non-streaming response for compatibility
 */
export async function createSingleResponse(
  config: StreamingConfig,
  context: StreamingContext,
): Promise<{
  content: string;
  tokenUsage?: TokenUsage;
  finishReason?: string;
}> {
  const startTime = performance.now();

  context.logger.info('Creating single response', {
    model: config.model,
    messageCount: context.messages.length,
  });

  try {
    const model = getLanguageModel(config);
    const messages = formatMessages(context);

    const result = await streamText({
      model,
      messages,
      tools: context.tools || {},
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      presencePenalty: config.presencePenalty,
      frequencyPenalty: config.frequencyPenalty,
      seed: config.seed,
    });

    // Collect the full response
    let content = '';
    for await (const delta of result.textStream) {
      content += delta;
    }

    const duration = performance.now() - startTime;

    // Get final result with usage - await the promises
    const finalResult = await result;
    const usage = await finalResult.usage;
    const finishReason = await finalResult.finishReason;

    let tokenUsage: TokenUsage | undefined;
    if (usage) {
      tokenUsage = {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        model: config.model,
        provider: 'openai',
      };

      context.logger.logTokenUsage(tokenUsage);
    }

    context.logger.info('Single response completed', {
      duration: `${duration.toFixed(2)}ms`,
      contentLength: content.length,
      finishReason,
    });

    return {
      content,
      tokenUsage,
      finishReason,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    context.logger.error('Single response failed', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      content: `Error: ${errorMessage}`,
      finishReason: 'error',
    };
  }
}

/**
 * Validates streaming configuration
 */
export function validateStreamingConfig(config: StreamingConfig): {
  valid: boolean;
  errors?: string[];
} {
  const errors: string[] = [];

  if (!config.model) {
    errors.push('Model is required');
  }

  if (
    config.temperature !== undefined &&
    (config.temperature < 0 || config.temperature > 2)
  ) {
    errors.push('Temperature must be between 0 and 2');
  }

  if (config.maxTokens !== undefined && config.maxTokens < 1) {
    errors.push('Max tokens must be positive');
  }

  if (config.topP !== undefined && (config.topP < 0 || config.topP > 1)) {
    errors.push('TopP must be between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Gets default streaming configuration
 */
export function getDefaultStreamingConfig(model?: string): StreamingConfig {
  return {
    model: model || 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 4000,
    presencePenalty: 0,
    frequencyPenalty: 0,
    topP: 1,
  };
}
