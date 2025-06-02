import type { NextRequest } from 'next/server';
import type { ZodError, ZodSchema } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  brainRequestSchema,
  type BrainRequest,
  type ValidationResult,
  type ValidationError,
} from '@/lib/validation/brainValidation';

/**
 * ValidationService
 *
 * Provides centralized request validation using Zod schemas.
 * Ensures data integrity and provides clear error messages for malformed requests.
 */

/**
 * Validates a brain API request
 * @param req - The Next.js request object
 * @param schema - Optional custom schema (defaults to brainRequestSchema)
 * @returns Validation result with data or errors
 */
export async function validateRequest(
  req: NextRequest,
  schema: ZodSchema = brainRequestSchema,
): Promise<ValidationResult<BrainRequest>> {
  try {
    // Parse request body
    const body = await req.json();

    // Log the incoming request body for debugging
    console.log(
      '[ValidationService] Incoming request body:',
      JSON.stringify(body, null, 2),
    );

    // Transform Vercel AI SDK format to expected format if needed
    const transformedBody = transformVercelAIRequest(body);
    console.log(
      '[ValidationService] Transformed request body:',
      JSON.stringify(transformedBody, null, 2),
    );

    // Validate against schema
    const result = schema.safeParse(transformedBody);

    if (result.success) {
      return {
        success: true,
        data: result.data as BrainRequest,
      };
    } else {
      // Log detailed validation errors
      console.log(
        '[ValidationService] Validation failed with errors:',
        result.error.errors,
      );
      return {
        success: false,
        errors: formatZodErrors(result.error),
      };
    }
  } catch (error) {
    console.log('[ValidationService] Request parsing error:', error);
    if (error instanceof SyntaxError) {
      return {
        success: false,
        errors: [
          {
            field: 'body',
            message: 'Invalid JSON in request body',
            code: 'INVALID_JSON',
          },
        ],
      };
    }

    return {
      success: false,
      errors: [
        {
          field: 'request',
          message: 'Failed to parse request',
          code: 'PARSE_ERROR',
        },
      ],
    };
  }
}

/**
 * Transform Vercel AI SDK request format to our expected format
 */
function transformVercelAIRequest(body: any): any {
  // If it already looks like our format, return as-is with minimal processing
  if (body.messages && Array.isArray(body.messages) && body.id) {
    // Still process to ensure compatibility
    const transformed = {
      ...body,
      // Ensure messages have proper format
      messages: body.messages.map((msg: any) => ({
        ...msg,
        // Convert string dates to Date objects for consistency
        createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
      })),
      // Ensure context fields are properly nullable
      fileContext: body.fileContext || null,
      artifactContext: body.artifactContext || null,
      collapsedArtifactsContext: body.collapsedArtifactsContext || null,
    };

    return transformed;
  }

  // Vercel AI SDK might send different structure
  // Extract common patterns and transform them
  const transformed: any = {
    id: body.id || body.chatId || randomUUID(),
    messages: body.messages || [],
    selectedChatModel:
      body.selectedChatModel || body.model || 'global-orchestrator',
    activeBitContextId: body.activeBitContextId,
    currentActiveSpecialistId: body.currentActiveSpecialistId,
    isFromGlobalPane: body.isFromGlobalPane || false,
    userTimezone: body.userTimezone || 'UTC',
    // Ensure context fields are null if not provided
    fileContext: body.fileContext || null,
    artifactContext: body.artifactContext || null,
    collapsedArtifactsContext: body.collapsedArtifactsContext || null,
    ...body, // Spread other fields
  };

  // Handle case where messages might be in data field
  if (body.data?.messages) {
    transformed.messages = body.data.messages;
  }

  // Ensure messages is an array and process each message
  if (!Array.isArray(transformed.messages)) {
    transformed.messages = [];
  } else {
    // Process each message to ensure compatibility
    transformed.messages = transformed.messages.map((msg: any) => ({
      ...msg,
      // Convert string dates to Date objects if needed
      createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
    }));
  }

  return transformed;
}

/**
 * Validates any data against a schema
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @returns Validation result
 */
export function validateData<T>(
  data: unknown,
  schema: ZodSchema<T>,
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  } else {
    return {
      success: false,
      errors: formatZodErrors(result.error),
    };
  }
}

/**
 * Formats Zod validation errors into a consistent structure
 * @param error - ZodError object
 * @returns Array of formatted validation errors
 */
function formatZodErrors(error: ZodError): ValidationError[] {
  return error.errors.map((err) => ({
    field: err.path.join('.') || 'root',
    message: err.message,
    code: err.code,
  }));
}

/**
 * Validates request size limits
 * @param req - The Next.js request object
 * @returns Validation result for size limits
 */
export function validateRequestSize(
  req: NextRequest,
): ValidationResult<boolean> {
  const contentLength = req.headers.get('content-length');
  const maxSize = 50 * 1024 * 1024; // 50MB limit

  if (contentLength && Number.parseInt(contentLength) > maxSize) {
    return {
      success: false,
      errors: [
        {
          field: 'content-length',
          message: 'Request body too large',
          code: 'REQUEST_TOO_LARGE',
        },
      ],
    };
  }

  return { success: true, data: true };
}

/**
 * Validates content type
 * @param req - The Next.js request object
 * @returns Validation result for content type
 */
export function validateContentType(
  req: NextRequest,
): ValidationResult<boolean> {
  const contentType = req.headers.get('content-type');

  if (!contentType || !contentType.includes('application/json')) {
    return {
      success: false,
      errors: [
        {
          field: 'content-type',
          message: 'Content-Type must be application/json',
          code: 'INVALID_CONTENT_TYPE',
        },
      ],
    };
  }

  return { success: true, data: true };
}
