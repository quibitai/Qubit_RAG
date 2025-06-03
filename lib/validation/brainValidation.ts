import { z } from 'zod';

/**
 * Validation schemas for the Brain API
 *
 * These schemas ensure request data integrity and provide clear error messages
 * for malformed requests, preventing invalid data from reaching the core logic.
 *
 * Updated to be compatible with Vercel AI SDK useChat format.
 */

// File context schema for uploaded files - fully optional
export const fileContextSchema = z
  .object({
    filename: z.string().min(1, 'Filename is required'),
    contentType: z.string().min(1, 'Content type is required'),
    url: z.string().url('Invalid file URL'),
    extractedText: z.string().optional(),
  })
  .optional()
  .nullable();

// Artifact context schema - fully optional
export const artifactContextSchema = z
  .object({
    documentId: z.string().uuid('Invalid document ID'),
    title: z.string().min(1, 'Artifact title is required'),
    kind: z.enum(['text', 'code', 'markdown'], {
      errorMap: () => ({ message: 'Invalid artifact kind' }),
    }),
    content: z.string().min(1, 'Artifact content is required'),
  })
  .optional()
  .nullable();

// Message schema - flexible for AI SDK compatibility
export const messageSchema = z
  .object({
    id: z.string().min(1, 'Message ID is required'),
    role: z.enum(['user', 'assistant', 'system'], {
      errorMap: () => ({ message: 'Invalid message role' }),
    }),
    content: z.string().max(50000, 'Message content too long'),
    // Handle both string and Date formats for createdAt
    createdAt: z
      .union([z.string(), z.date()])
      .optional()
      .transform((val) => {
        if (typeof val === 'string') {
          return new Date(val);
        }
        return val;
      }),
    attachments: z.array(z.any()).optional(),
    experimental_attachments: z.array(z.any()).optional(),
    // Allow Vercel AI SDK's parts field with flexible structure for streaming
    parts: z
      .array(
        z.object({
          type: z.string(),
          text: z.string().optional(), // Make text optional for streaming parts like step-start
          language: z.string().optional(), // For code parts
          image: z.string().optional(), // For image parts
          toolName: z.string().optional(), // For tool calls/results
          toolInput: z.any().optional(), // For tool calls
          toolResult: z.any().optional(), // For tool results
        }),
      )
      .optional(),
  })
  .passthrough(); // Allow additional fields

// Main brain request schema - compatible with Vercel AI SDK
export const brainRequestSchema = z
  .object({
    // Flexible message handling - can be from useChat or direct API
    messages: z
      .array(messageSchema)
      .max(100, 'Too many messages in conversation')
      .optional()
      .default([]), // Default to empty array if not provided

    // Chat ID - required but flexible format
    id: z.string().min(1, 'Chat ID is required'),

    // Optional context fields - all nullable
    selectedChatModel: z.string().optional(),
    fileContext: fileContextSchema.optional().nullable(),
    artifactContext: artifactContextSchema.optional().nullable(),
    collapsedArtifactsContext: z
      .object({
        collapsedArtifacts: z.array(artifactContextSchema),
      })
      .optional()
      .nullable(),

    // Context identification - all optional and nullable
    activeBitContextId: z.string().nullable().optional(),
    currentActiveSpecialistId: z.string().nullable().optional(),
    activeBitPersona: z.string().nullable().optional(),
    activeDocId: z.string().nullable().optional(),

    // Cross-UI context sharing
    isFromGlobalPane: z.boolean().default(false),
    referencedChatId: z.string().nullable().optional(),
    mainUiChatId: z.string().nullable().optional(),
    referencedGlobalPaneChatId: z.string().nullable().optional(),

    // User preferences
    userTimezone: z.string().default('UTC'),

    // Additional fields that Vercel AI SDK might send
    data: z.record(z.any()).optional(),
    body: z.record(z.any()).optional(),
    chatId: z.string().optional(), // Sometimes sent separately
    globalPaneChatId: z.string().optional(), // From the logs
  })
  .passthrough(); // Allow additional fields for maximum compatibility

// Validation result types
export type BrainRequest = z.infer<typeof brainRequestSchema>;
export type FileContext = z.infer<typeof fileContextSchema>;
export type ArtifactContext = z.infer<typeof artifactContextSchema>;
export type MessageData = z.infer<typeof messageSchema>;

// Validation error type
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}
