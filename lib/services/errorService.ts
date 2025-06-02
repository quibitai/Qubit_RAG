import { NextResponse } from 'next/server';
import type { ValidationError } from '@/lib/validation/brainValidation';

/**
 * ErrorService
 *
 * Provides centralized error handling and response formatting.
 * Ensures consistent error responses across the API.
 */

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  success: false;
  error: {
    type: string;
    message: string;
    details?: any;
    timestamp: string;
    correlationId: string;
  };
}

/**
 * Error types for categorization
 */
export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  RATE_LIMIT = 'RATE_LIMIT_ERROR',
  INTERNAL = 'INTERNAL_ERROR',
  TOOL_ERROR = 'TOOL_ERROR',
  STREAMING = 'STREAMING_ERROR',
}

/**
 * Generates a unique correlation ID for error tracking
 */
function generateCorrelationId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a standardized error response
 */
function createErrorResponse(
  type: ErrorType,
  message: string,
  details?: any,
  statusCode = 500,
): NextResponse<ErrorResponse> {
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      type,
      message,
      details,
      timestamp: new Date().toISOString(),
      correlationId: generateCorrelationId(),
    },
  };

  return NextResponse.json(errorResponse, { status: statusCode });
}

/**
 * Handles validation errors with detailed field information
 */
export function validationError(
  errors: ValidationError[],
  message = 'Request validation failed',
): NextResponse<ErrorResponse> {
  return createErrorResponse(
    ErrorType.VALIDATION,
    message,
    { validationErrors: errors },
    400,
  );
}

/**
 * Handles authentication errors
 */
export function authenticationError(
  message = 'Authentication required',
): NextResponse<ErrorResponse> {
  return createErrorResponse(ErrorType.AUTHENTICATION, message, undefined, 401);
}

/**
 * Handles authorization errors
 */
export function authorizationError(
  message = 'Insufficient permissions',
): NextResponse<ErrorResponse> {
  return createErrorResponse(ErrorType.AUTHORIZATION, message, undefined, 403);
}

/**
 * Handles not found errors
 */
export function notFoundError(
  resource = 'Resource',
  message?: string,
): NextResponse<ErrorResponse> {
  const errorMessage = message || `${resource} not found`;
  return createErrorResponse(
    ErrorType.NOT_FOUND,
    errorMessage,
    { resource },
    404,
  );
}

/**
 * Handles rate limiting errors
 */
export function rateLimitError(
  message = 'Rate limit exceeded',
  retryAfter?: number,
): NextResponse<ErrorResponse> {
  const response = createErrorResponse(
    ErrorType.RATE_LIMIT,
    message,
    { retryAfter },
    429,
  );

  if (retryAfter) {
    response.headers.set('Retry-After', retryAfter.toString());
  }

  return response;
}

/**
 * Handles tool execution errors
 */
export function toolError(
  toolName: string,
  error: Error,
  message?: string,
): NextResponse<ErrorResponse> {
  const errorMessage = message || `Tool execution failed: ${toolName}`;
  return createErrorResponse(
    ErrorType.TOOL_ERROR,
    errorMessage,
    {
      toolName,
      originalError: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
    500,
  );
}

/**
 * Handles streaming errors
 */
export function streamingError(
  error: Error,
  message = 'Streaming response failed',
): NextResponse<ErrorResponse> {
  return createErrorResponse(
    ErrorType.STREAMING,
    message,
    {
      originalError: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    },
    500,
  );
}

/**
 * Handles generic internal server errors
 */
export function internalError(
  error: Error | string,
  message = 'Internal server error',
): NextResponse<ErrorResponse> {
  const errorDetails =
    typeof error === 'string'
      ? { message: error }
      : {
          message: error.message,
          stack:
            process.env.NODE_ENV === 'development' ? error.stack : undefined,
        };

  return createErrorResponse(ErrorType.INTERNAL, message, errorDetails, 500);
}

/**
 * Logs error details for monitoring and debugging
 */
export function logError(
  error: Error | string,
  context?: Record<string, any>,
): void {
  const timestamp = new Date().toISOString();
  const correlationId = generateCorrelationId();

  const logData = {
    timestamp,
    correlationId,
    error:
      typeof error === 'string'
        ? error
        : {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
    context,
  };

  console.error('[ErrorService]', JSON.stringify(logData, null, 2));
}
