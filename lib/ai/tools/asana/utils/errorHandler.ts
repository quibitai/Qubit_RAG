/**
 * Error handling utilities for Asana integration
 */

/**
 * Custom error class for Asana integration errors
 */
export class AsanaIntegrationError extends Error {
  constructor(
    message: string,
    public readonly operationName?: string,
    public readonly details?: any,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AsanaIntegrationError';
  }

  /**
   * Format the error for user display
   */
  public toUserFriendlyMessage(): string {
    let message = this.message;

    if (this.operationName) {
      message = `Error during ${this.operationName}: ${message}`;
    }

    if (this.requestId) {
      message += ` (Request ID: ${this.requestId})`;
    }

    return message;
  }

  /**
   * Format the error for logging
   */
  public toLogString(): string {
    const detailsStr = this.details
      ? `\nDetails: ${JSON.stringify(this.details, null, 2)}`
      : '';

    return `[AsanaIntegrationError]${this.requestId ? ` [${this.requestId}]` : ''} ${this.operationName ? `[${this.operationName}]` : ''}: ${this.message}${detailsStr}`;
  }
}

/**
 * Handle errors from Asana API calls
 */
export function handleAsanaApiError(
  error: any,
  operationName: string,
  requestId?: string,
): AsanaIntegrationError {
  console.error(`Error during Asana operation '${operationName}':`, error);

  // Extract error message from Asana API response if available
  const asanaError = error?.response?.data?.errors?.[0];
  const message =
    asanaError?.message || error.message || 'Unknown Asana API error';
  const help = asanaError?.help ? ` (Help: ${asanaError.help})` : '';

  return new AsanaIntegrationError(
    `${message}${help}`,
    operationName,
    error?.response?.data,
    requestId,
  );
}

/**
 * Log an error and return a user-friendly message
 */
export function logAndFormatError(
  error: any,
  operationName: string,
  requestId?: string,
): string {
  const asanaError =
    error instanceof AsanaIntegrationError
      ? error
      : handleAsanaApiError(error, operationName, requestId);

  console.error(asanaError.toLogString());
  return asanaError.toUserFriendlyMessage();
}
