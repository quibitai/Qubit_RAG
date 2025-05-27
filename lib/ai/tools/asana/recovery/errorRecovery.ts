/**
 * Intelligent Error Recovery System
 *
 * Provides sophisticated error handling, retry mechanisms, and user-friendly
 * error recovery for the Asana tool operations.
 */

import { AsanaIntegrationError } from '../utils/errorHandler';

export interface ErrorRecoveryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
  enableUserGuidance: boolean;
  contextualSuggestions: boolean;
}

export interface RecoveryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attemptCount: number;
  recoveryStrategy?: string;
  userGuidance?: string;
  alternativeActions?: string[];
}

export interface ErrorContext {
  operation: string;
  parameters: Record<string, any>;
  sessionId?: string;
  requestId?: string;
  userIntent?: string;
}

export type RecoveryStrategy =
  | 'retry'
  | 'fallback'
  | 'user_guidance'
  | 'alternative_approach'
  | 'graceful_degradation';

export class IntelligentErrorRecovery {
  private config: ErrorRecoveryOptions;
  private recoveryHistory: Map<string, number> = new Map();

  constructor(config: Partial<ErrorRecoveryOptions> = {}) {
    this.config = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
      enableUserGuidance: true,
      contextualSuggestions: true,
      ...config,
    };
  }

  /**
   * Execute an operation with intelligent error recovery
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
  ): Promise<RecoveryResult<T>> {
    let lastError: Error | undefined;
    let attemptCount = 0;

    while (attemptCount < this.config.maxRetries) {
      attemptCount++;

      try {
        const result = await operation();

        // Reset recovery history on success
        this.recoveryHistory.delete(context.operation);

        return {
          success: true,
          data: result,
          attemptCount,
        };
      } catch (error) {
        lastError = error as Error;

        console.log(
          `[ErrorRecovery] [${context.requestId}] Attempt ${attemptCount} failed for ${context.operation}: ${lastError.message}`,
        );

        // Determine if we should retry
        const shouldRetry = this.shouldRetry(lastError, attemptCount, context);

        if (!shouldRetry || attemptCount >= this.config.maxRetries) {
          break;
        }

        // Wait before retry with exponential backoff
        const delay = this.calculateDelay(attemptCount);
        await this.sleep(delay);
      }
    }

    // All retries failed, determine recovery strategy
    if (!lastError) {
      lastError = new Error('Unknown error occurred during operation');
    }
    return this.handleFailure(lastError, context, attemptCount);
  }

  /**
   * Determine the best recovery strategy for a failed operation
   */
  private async handleFailure(
    error: Error,
    context: ErrorContext,
    attemptCount: number,
  ): Promise<RecoveryResult<any>> {
    const strategy = this.determineRecoveryStrategy(error, context);
    const userGuidance = this.generateUserGuidance(error, context, strategy);
    const alternativeActions = this.suggestAlternativeActions(error, context);

    // Track recovery attempts
    const historyKey = `${context.operation}:${error.constructor.name}`;
    const previousAttempts = this.recoveryHistory.get(historyKey) || 0;
    this.recoveryHistory.set(historyKey, previousAttempts + 1);

    return {
      success: false,
      error,
      attemptCount,
      recoveryStrategy: strategy,
      userGuidance,
      alternativeActions,
    };
  }

  /**
   * Determine if an error is retryable
   */
  private shouldRetry(
    error: Error,
    attemptCount: number,
    context: ErrorContext,
  ): boolean {
    // Don't retry if we've hit the limit
    if (attemptCount >= this.config.maxRetries) {
      return false;
    }

    // Check for specific error types
    if (error instanceof AsanaIntegrationError) {
      const statusCode = (error as any).status;

      // Retry on specific HTTP status codes
      if (statusCode && this.config.retryableStatusCodes.includes(statusCode)) {
        return true;
      }

      // Don't retry on authentication errors
      if (statusCode === 401 || statusCode === 403) {
        return false;
      }
    }

    // Retry on network errors
    if (
      error.message.includes('timeout') ||
      error.message.includes('network') ||
      error.message.includes('ECONNRESET')
    ) {
      return true;
    }

    // Don't retry on validation errors
    if (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('not found')
    ) {
      return false;
    }

    // Default to retry for unknown errors
    return true;
  }

  /**
   * Determine the best recovery strategy
   */
  private determineRecoveryStrategy(
    error: Error,
    context: ErrorContext,
  ): RecoveryStrategy {
    if (error instanceof AsanaIntegrationError) {
      const statusCode = (error as any).status;

      switch (statusCode) {
        case 401:
        case 403:
          return 'user_guidance'; // Authentication/permission issues
        case 404:
          return 'alternative_approach'; // Resource not found
        case 429:
          return 'retry'; // Rate limiting
        case 500:
        case 502:
        case 503:
        case 504:
          return 'fallback'; // Server errors
        default:
          return 'user_guidance';
      }
    }

    // Network/timeout errors
    if (
      error.message.includes('timeout') ||
      error.message.includes('network')
    ) {
      return 'retry';
    }

    // Validation errors
    if (
      error.message.includes('required') ||
      error.message.includes('invalid')
    ) {
      return 'user_guidance';
    }

    // Default strategy
    return 'graceful_degradation';
  }

  /**
   * Generate user-friendly guidance based on the error and context
   */
  private generateUserGuidance(
    error: Error,
    context: ErrorContext,
    strategy: RecoveryStrategy,
  ): string {
    if (!this.config.enableUserGuidance) {
      return '';
    }

    const operation = context.operation.replace(/_/g, ' ');

    if (error instanceof AsanaIntegrationError) {
      const statusCode = (error as any).status;

      switch (statusCode) {
        case 401:
          return `🔐 **Authentication Required**\n\nYour Asana access token appears to be invalid or expired. Please check your Asana configuration and ensure you have a valid Personal Access Token set up.`;

        case 403:
          return `🚫 **Permission Denied**\n\nYou don't have permission to ${operation}. Please check that:\n• You have the necessary permissions in your Asana workspace\n• The resource exists and you have access to it\n• Your Asana account has the required privileges`;

        case 404:
          return `🔍 **Resource Not Found**\n\nThe requested resource for "${operation}" could not be found. This might mean:\n• The item was deleted or moved\n• You don't have access to it\n• There's a typo in the name\n\nTry searching for similar items or check if the resource still exists.`;

        case 429:
          return `⏱️ **Rate Limit Exceeded**\n\nAsana's API rate limit has been reached. The system will automatically retry in a moment. If this persists, try:\n• Reducing the frequency of requests\n• Waiting a few minutes before trying again`;

        case 500:
        case 502:
        case 503:
        case 504:
          return `🔧 **Service Temporarily Unavailable**\n\nAsana's servers are experiencing issues. This is usually temporary. Try:\n• Waiting a few minutes and trying again\n• Checking Asana's status page for known issues\n• Using basic operations instead of complex ones`;
      }
    }

    // Network/timeout errors
    if (error.message.includes('timeout')) {
      return `🌐 **Connection Timeout**\n\nThe request to ${operation} timed out. This might be due to:\n• Slow internet connection\n• Asana server delays\n• Large amounts of data being processed\n\nTry again in a moment or check your internet connection.`;
    }

    // Validation errors
    if (error.message.includes('required')) {
      return `📝 **Missing Required Information**\n\nTo ${operation}, please provide all required details. Check that you've included:\n• All mandatory fields\n• Proper formatting for dates and names\n• Valid references to existing items`;
    }

    // Generic guidance
    return `❗ **Operation Failed**\n\nThe ${operation} operation encountered an issue: ${error.message}\n\nTry rephrasing your request or providing more specific details.`;
  }

  /**
   * Suggest alternative actions the user can take
   */
  private suggestAlternativeActions(
    error: Error,
    context: ErrorContext,
  ): string[] {
    const suggestions: string[] = [];

    if (error instanceof AsanaIntegrationError) {
      const statusCode = (error as any).status;

      switch (statusCode) {
        case 404:
          suggestions.push('Search for similar items using partial names');
          suggestions.push('List all available items to find the correct one');
          suggestions.push('Check if the item was recently moved or renamed');
          break;

        case 403:
          suggestions.push('Request access from your workspace administrator');
          suggestions.push('Try viewing public projects instead');
          suggestions.push('Check your workspace membership status');
          break;

        case 429:
          suggestions.push('Wait 1-2 minutes before trying again');
          suggestions.push(
            'Use simpler operations that require fewer API calls',
          );
          break;
      }
    }

    // Operation-specific suggestions
    switch (context.operation) {
      case 'create_task':
        suggestions.push('Try creating the task in a different project');
        suggestions.push(
          'Simplify the task details and add more information later',
        );
        break;

      case 'update_task':
        suggestions.push('Try updating individual fields separately');
        suggestions.push('Check if the task still exists');
        break;

      case 'list_tasks':
        suggestions.push('Try listing tasks from a specific project');
        suggestions.push('Use filters to reduce the amount of data');
        break;
    }

    // Generic suggestions
    if (suggestions.length === 0) {
      suggestions.push('Try rephrasing your request with different wording');
      suggestions.push(
        'Provide more specific details about what you want to do',
      );
      suggestions.push("Check if the items you're referencing still exist");
    }

    return suggestions;
  }

  /**
   * Calculate delay for exponential backoff
   */
  private calculateDelay(attemptCount: number): number {
    const delay = this.config.baseDelayMs * Math.pow(2, attemptCount - 1);
    return Math.min(delay, this.config.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    totalRecoveryAttempts: number;
    uniqueErrorTypes: number;
  } {
    let totalAttempts = 0;
    for (const attempts of this.recoveryHistory.values()) {
      totalAttempts += attempts;
    }

    return {
      totalRecoveryAttempts: totalAttempts,
      uniqueErrorTypes: this.recoveryHistory.size,
    };
  }

  /**
   * Clear recovery history
   */
  clearRecoveryHistory(): void {
    this.recoveryHistory.clear();
  }
}

// Singleton instance
export const intelligentErrorRecovery = new IntelligentErrorRecovery();
