/**
 * Shared types for the Asana integration
 */

import { z } from 'zod';

/**
 * Input schema for Asana tool
 */
export const AsanaToolInputSchema = z.object({
  action_description: z
    .string()
    .describe(
      'A clear, natural language description of the Asana operation to be performed. ' +
        'Example: "Create a new task in Asana titled "Review Q4 budget" and assign it to me in the "Finance Team" project." ' +
        'Or: "List all my incomplete tasks in the Marketing project on Asana." ' +
        'Or: "Mark my "Update website content" task as complete in Asana."',
    ),
  input: z
    .string()
    .optional()
    .describe(
      'Alternative way to provide the action description, for compatibility with some LLM formats.',
    ),
  toolInput: z
    .object({
      action_description: z.string(),
    })
    .optional()
    .describe('Tool-specific input format for some LLM integrations.'),
});

/**
 * Request tracking information
 */
export interface RequestContext {
  requestId: string;
  startTime: number;
}

/**
 * Asana operation result
 */
export interface AsanaOperationResult {
  success: boolean;
  message: string;
  data?: any;
  error?: any;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}
