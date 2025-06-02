/**
 * ContextService
 *
 * Handles context processing, client configuration, conversation memory,
 * and cross-UI context sharing for the brain API.
 * Target: ~140 lines as per roadmap specifications.
 */

import type { BrainRequest } from '@/lib/validation/brainValidation';
import type { RequestLogger } from './observabilityService';
import type { ClientConfig } from '@/lib/db/queries';

/**
 * Context processing configuration
 */
export interface ContextConfig {
  enableMemory?: boolean;
  maxMemoryDepth?: number;
  enableCrossUIContext?: boolean;
  enableContextValidation?: boolean;
}

/**
 * Processed context information
 */
export interface ProcessedContext {
  activeBitContextId?: string | null;
  currentActiveSpecialistId?: string | null;
  activeBitPersona?: string | null;
  selectedChatModel: string;
  userTimezone?: string;
  isFromGlobalPane?: boolean;
  referencedChatId?: string | null;
  clientConfig?: ClientConfig | null;
  memoryContext?: any[];
}

/**
 * Context validation result
 */
export interface ContextValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * ContextService class
 *
 * Provides centralized context processing capabilities for the brain API
 */
export class ContextService {
  private logger: RequestLogger;
  private config: ContextConfig;
  private clientConfig?: ClientConfig | null;

  constructor(
    logger: RequestLogger,
    clientConfig?: ClientConfig | null,
    config: ContextConfig = {},
  ) {
    this.logger = logger;
    this.clientConfig = clientConfig;
    this.config = {
      enableMemory: true,
      maxMemoryDepth: 10,
      enableCrossUIContext: true,
      enableContextValidation: true,
      ...config,
    };
  }

  /**
   * Process and enrich context from brain request
   */
  public processContext(brainRequest: BrainRequest): ProcessedContext {
    this.logger.info('Processing request context', {
      activeBitContextId: brainRequest.activeBitContextId,
      currentActiveSpecialistId: brainRequest.currentActiveSpecialistId,
      isFromGlobalPane: brainRequest.isFromGlobalPane,
      selectedChatModel: brainRequest.selectedChatModel,
    });

    const processedContext: ProcessedContext = {
      activeBitContextId: brainRequest.activeBitContextId,
      currentActiveSpecialistId: brainRequest.currentActiveSpecialistId,
      activeBitPersona: brainRequest.activeBitPersona,
      selectedChatModel:
        brainRequest.selectedChatModel || this.getDefaultModel(),
      userTimezone: brainRequest.userTimezone,
      isFromGlobalPane: brainRequest.isFromGlobalPane,
      referencedChatId: brainRequest.referencedChatId,
      clientConfig: this.clientConfig,
    };

    // Add memory context if enabled
    if (this.config.enableMemory) {
      processedContext.memoryContext = this.extractMemoryContext(brainRequest);
    }

    return processedContext;
  }

  /**
   * Validate context integrity and completeness
   */
  public validateContext(brainRequest: BrainRequest): ContextValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!brainRequest.selectedChatModel && !this.getDefaultModel()) {
      errors.push('No chat model specified and no default available');
    }

    // Validate specialist context consistency
    if (
      brainRequest.activeBitContextId &&
      !brainRequest.currentActiveSpecialistId
    ) {
      warnings.push(
        'Active bit context without specialist ID may lead to inconsistent behavior',
      );
    }

    // Validate global pane context
    if (brainRequest.isFromGlobalPane && !brainRequest.referencedChatId) {
      warnings.push('Global pane request without referenced chat ID');
    }

    // Validate timezone format
    if (
      brainRequest.userTimezone &&
      !this.isValidTimezone(brainRequest.userTimezone)
    ) {
      warnings.push('Invalid timezone format provided');
    }

    this.logger.info('Context validation completed', {
      valid: errors.length === 0,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Extract conversation memory context
   */
  private extractMemoryContext(brainRequest: BrainRequest): any[] {
    if (!this.config.enableMemory || !brainRequest.messages) {
      return [];
    }

    // Extract relevant context from recent messages
    const maxDepth = this.config.maxMemoryDepth || 10;
    const recentMessages = brainRequest.messages
      .slice(-maxDepth)
      .filter((msg) => msg.role === 'assistant' || msg.role === 'user');

    this.logger.info('Extracted memory context', {
      recentMessageCount: recentMessages.length,
      maxDepth: maxDepth,
    });

    return recentMessages;
  }

  /**
   * Get default model based on client configuration
   */
  private getDefaultModel(): string {
    // ClientConfig doesn't have defaultModel property, use environment default
    return process.env.DEFAULT_MODEL_NAME || 'gpt-4.1';
  }

  /**
   * Validate timezone format
   */
  private isValidTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create context-aware system prompt additions
   */
  public createContextPromptAdditions(context: ProcessedContext): string {
    const additions: string[] = [];

    if (context.userTimezone) {
      additions.push(`User timezone: ${context.userTimezone}`);
    }

    if (context.isFromGlobalPane) {
      additions.push('Request from global assistant pane');
    }

    if (context.activeBitPersona) {
      additions.push(`Active specialist persona: ${context.activeBitPersona}`);
    }

    if (context.referencedChatId && context.isFromGlobalPane) {
      additions.push(`Referenced main chat: ${context.referencedChatId}`);
    }

    return additions.length > 0 ? `\n\nContext: ${additions.join(', ')}` : '';
  }
}

/**
 * Convenience functions for context operations
 */

/**
 * Create a ContextService instance with default configuration
 */
export function createContextService(
  logger: RequestLogger,
  clientConfig?: ClientConfig | null,
  config?: ContextConfig,
): ContextService {
  return new ContextService(logger, clientConfig, config);
}

/**
 * Quick context processing utility
 */
export function processRequestContext(
  brainRequest: BrainRequest,
  logger: RequestLogger,
  clientConfig?: ClientConfig | null,
): ProcessedContext {
  const service = createContextService(logger, clientConfig);
  return service.processContext(brainRequest);
}
