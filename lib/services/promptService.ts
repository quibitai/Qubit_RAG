import { loadPrompt } from '@/lib/ai/prompts/loader';
import type { ClientConfig } from '@/lib/db/queries';
import type { RequestLogger } from './observabilityService';
import type { BrainRequest } from '@/lib/validation/brainValidation';

/**
 * PromptService
 *
 * Modernizes prompt loading with caching, error handling, and context awareness
 * Wraps the existing prompt system with additional reliability and observability
 */

export interface PromptContext {
  activeBitContextId?: string | null;
  currentActiveSpecialistId?: string | null;
  activeBitPersona?: string | null;
  selectedChatModel?: string;
  userTimezone?: string;
  isFromGlobalPane?: boolean;
}

export interface PromptConfig {
  clientConfig?: ClientConfig | null;
  currentDateTime?: string;
  temperature?: number;
  maxTokens?: number;
  customInstructions?: string;
}

export interface PromptResult {
  systemPrompt: string;
  contextId: string | null;
  modelId: string;
  config: PromptConfig;
  cacheHit: boolean;
  loadTime: number;
}

/**
 * Simple in-memory cache for prompts
 */
class PromptCache {
  private cache = new Map<
    string,
    { prompt: string; timestamp: number; ttl: number }
  >();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  set(key: string, prompt: string, ttl = this.defaultTTL): void {
    this.cache.set(key, {
      prompt,
      timestamp: Date.now(),
      ttl,
    });
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.prompt;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instance
const promptCache = new PromptCache();

// Periodic cleanup every 10 minutes
setInterval(() => promptCache.cleanup(), 10 * 60 * 1000);

/**
 * Generates a cache key for prompt parameters
 */
function generateCacheKey(
  modelId: string,
  contextId: string | null,
  clientId?: string,
  configHash?: string,
): string {
  return `${modelId}:${contextId || 'null'}:${clientId || 'default'}:${configHash || 'noconfig'}`;
}

/**
 * Creates a simple hash from client config for caching
 */
function hashClientConfig(config?: ClientConfig | null): string {
  if (!config) return 'none';

  const relevant = {
    client_display_name: config.client_display_name,
    client_core_mission: config.client_core_mission,
    customInstructions: config.customInstructions,
    configJson: config.configJson,
  };

  return btoa(JSON.stringify(relevant)).slice(0, 16);
}

/**
 * Loads system prompt with caching and error handling
 */
export async function loadSystemPrompt(
  request: BrainRequest,
  context: PromptContext,
  config: PromptConfig,
  logger: RequestLogger,
): Promise<PromptResult> {
  const startTime = performance.now();

  // Determine model ID and context ID
  const modelId = context.selectedChatModel || 'default';
  const contextId =
    context.activeBitContextId || context.currentActiveSpecialistId || null;

  // Generate cache key
  const configHash = hashClientConfig(config.clientConfig);
  const cacheKey = generateCacheKey(
    modelId,
    contextId,
    config.clientConfig?.id,
    configHash,
  );

  logger.info('Loading system prompt', {
    modelId,
    contextId,
    cacheKey,
    isFromGlobalPane: context.isFromGlobalPane,
  });

  // Check cache first
  const cachedPrompt = promptCache.get(cacheKey);
  if (cachedPrompt) {
    const loadTime = performance.now() - startTime;
    logger.info('Prompt cache hit', {
      cacheKey,
      loadTime: `${loadTime.toFixed(2)}ms`,
    });

    return {
      systemPrompt: cachedPrompt,
      contextId,
      modelId,
      config,
      cacheHit: true,
      loadTime,
    };
  }

  try {
    // Load prompt using existing system
    const currentDateTime = config.currentDateTime || new Date().toISOString();

    const systemPrompt = loadPrompt({
      modelId,
      contextId,
      clientConfig: config.clientConfig,
      currentDateTime,
    });

    // Cache the result
    promptCache.set(cacheKey, systemPrompt);

    const loadTime = performance.now() - startTime;
    logger.info('Prompt loaded successfully', {
      modelId,
      contextId,
      cacheKey,
      promptLength: systemPrompt.length,
      loadTime: `${loadTime.toFixed(2)}ms`,
    });

    return {
      systemPrompt,
      contextId,
      modelId,
      config,
      cacheHit: false,
      loadTime,
    };
  } catch (error) {
    const loadTime = performance.now() - startTime;
    logger.error('Failed to load system prompt', error);

    // Return a safe fallback prompt
    const fallbackPrompt = `# Role: General Assistant
You are a helpful assistant within the Quibit system. Address user queries directly and use available tools as needed.

## Current Context
- Model: ${modelId}
- Context: ${contextId || 'general'}
- Time: ${config.currentDateTime || new Date().toISOString()}

Please assist the user with their request while being helpful, accurate, and concise.`;

    return {
      systemPrompt: fallbackPrompt,
      contextId,
      modelId,
      config,
      cacheHit: false,
      loadTime,
    };
  }
}

/**
 * Preloads common prompts for performance
 */
export function preloadCommonPrompts(
  clientConfigs: ClientConfig[],
  logger: RequestLogger,
): void {
  logger.info('Preloading common prompts', {
    configCount: clientConfigs.length,
  });

  const commonContexts = [
    null, // default
    'global-orchestrator',
    'chat-model',
  ];

  const commonModels = [
    'default',
    'gpt-4o',
    'gpt-4o-mini',
    'global-orchestrator',
  ];

  for (const clientConfig of clientConfigs) {
    for (const contextId of commonContexts) {
      for (const modelId of commonModels) {
        try {
          const prompt = loadPrompt({
            modelId,
            contextId,
            clientConfig,
          });

          const configHash = hashClientConfig(clientConfig);
          const cacheKey = generateCacheKey(
            modelId,
            contextId,
            clientConfig.id,
            configHash,
          );
          promptCache.set(cacheKey, prompt, 30 * 60 * 1000); // 30 minute TTL for preloaded
        } catch (error) {
          logger.warn('Failed to preload prompt', {
            modelId,
            contextId,
            clientId: clientConfig.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  }

  logger.info('Prompt preloading completed', { cacheSize: promptCache.size() });
}

/**
 * Clears the prompt cache
 */
export function clearPromptCache(): void {
  promptCache.clear();
}

/**
 * Gets cache statistics
 */
export function getPromptCacheStats(): {
  size: number;
  hits: number;
  misses: number;
} {
  // Note: This is a simplified version - in production you'd want proper metrics
  return {
    size: promptCache.size(),
    hits: 0, // Would need to implement hit counting
    misses: 0, // Would need to implement miss counting
  };
}
