/**
 * Retry handler for Asana API requests
 * Implements exponential backoff and intelligent retry logic
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attemptCount: number;
  totalDuration: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504, 522, 524],
  retryableErrors: [
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
  ],
};

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate the delay for a retry attempt using exponential backoff
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  backoffMultiplier: number,
  maxDelay: number,
  jitter = true,
): number {
  let delay = baseDelay * Math.pow(backoffMultiplier, attempt);

  // Add jitter to prevent thundering herd
  if (jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.min(delay, maxDelay);
}

/**
 * Check if an error is retryable based on the error type and status code
 */
function isRetryableError(error: any, options: RetryOptions): boolean {
  // Check for HTTP status codes that are retryable
  if (error.status && options.retryableStatusCodes.includes(error.status)) {
    return true;
  }

  // Check for network/connection errors
  if (error.code && options.retryableErrors.includes(error.code)) {
    return true;
  }

  // Check for specific error messages
  if (error.message) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('socket hang up')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extract retry-after value from error response headers
 */
function getRetryAfterDelay(error: any): number | null {
  if (error.headers?.['retry-after']) {
    const retryAfter = error.headers['retry-after'];

    // Check if it's a number (seconds)
    const seconds = Number.parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) {
      return seconds * 1000; // Convert to milliseconds
    }

    // Check if it's a date
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }
  }

  return null;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  requestId?: string,
): Promise<RetryResult<T>> {
  const finalOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= finalOptions.maxRetries; attempt++) {
    try {
      if (requestId && attempt > 0) {
        console.log(
          `[RetryHandler] [${requestId}] Retry attempt ${attempt}/${finalOptions.maxRetries}`,
        );
      }

      const result = await operation();

      if (requestId && attempt > 0) {
        console.log(
          `[RetryHandler] [${requestId}] Operation succeeded on retry attempt ${attempt}`,
        );
      }

      return {
        success: true,
        data: result,
        attemptCount: attempt + 1,
        totalDuration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt
      if (attempt === finalOptions.maxRetries) {
        break;
      }

      // Check if the error is retryable
      if (!isRetryableError(error, finalOptions)) {
        if (requestId) {
          console.log(
            `[RetryHandler] [${requestId}] Non-retryable error encountered:`,
            error,
          );
        }
        break;
      }

      // Calculate delay for next attempt
      let delay = calculateDelay(
        attempt,
        finalOptions.baseDelay,
        finalOptions.backoffMultiplier,
        finalOptions.maxDelay,
      );

      // Check for Retry-After header (especially for 429 rate limit responses)
      const retryAfterDelay = getRetryAfterDelay(error);
      if (retryAfterDelay !== null) {
        delay = Math.min(retryAfterDelay, finalOptions.maxDelay);
        if (requestId) {
          console.log(
            `[RetryHandler] [${requestId}] Using Retry-After header: ${delay}ms`,
          );
        }
      }

      if (requestId) {
        console.log(
          `[RetryHandler] [${requestId}] Retryable error on attempt ${attempt + 1}. Waiting ${delay}ms before retry:`,
          lastError.message || lastError,
        );
      }

      await sleep(delay);
    }
  }

  // All retries exhausted
  if (requestId && lastError) {
    console.error(
      `[RetryHandler] [${requestId}] All retry attempts exhausted. Final error:`,
      lastError,
    );
  }

  return {
    success: false,
    error:
      lastError || new Error('Unknown error occurred during retry attempts'),
    attemptCount: finalOptions.maxRetries + 1,
    totalDuration: Date.now() - startTime,
  };
}

/**
 * Create a retry wrapper for a specific operation type
 */
export function createRetryWrapper<T extends any[], R>(
  operation: (...args: T) => Promise<R>,
  defaultOptions: Partial<RetryOptions> = {},
) {
  return async (...args: T): Promise<R> => {
    const result = await withRetry(() => operation(...args), defaultOptions);

    if (result.success && result.data !== undefined) {
      return result.data;
    } else {
      throw result.error;
    }
  };
}
