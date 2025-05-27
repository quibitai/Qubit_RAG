/**
 * User-Friendly Error Handler for Asana API
 *
 * This module provides intelligent error handling that:
 * - Detects when API calls fail due to missing/invalid parameters
 * - Provides user-friendly error messages
 * - Assumes users work with names, not GIDs
 * - Guides users to provide the right information
 */

import type { AsanaIntegrationError } from '../utils/errorHandler';

export interface UserFriendlyErrorResult {
  isUserError: boolean;
  userMessage: string;
  suggestedAction?: string;
  requiresUserInput: boolean;
}

/**
 * Analyzes Asana API errors and provides user-friendly guidance
 */
export function analyzeAsanaError(
  error: AsanaIntegrationError,
  operation: string,
  parameters: Record<string, any>,
): UserFriendlyErrorResult {
  const errorMessage = error.message.toLowerCase();
  const apiErrors = error.details?.errors || [];

  // Check for common parameter validation errors
  for (const apiError of apiErrors) {
    const message = apiError.message || '';

    // Handle "Not a recognized ID" errors
    if (
      message.includes('Not a recognized ID') ||
      message.includes('Not a Long')
    ) {
      const field = extractFieldFromError(message);
      return handleUnrecognizedIdError(field, parameters, operation);
    }

    // Handle missing required fields
    if (
      message.includes('Missing required field') ||
      message.includes('is required')
    ) {
      const field = extractFieldFromError(message);
      return handleMissingFieldError(field, operation);
    }

    // Handle invalid workspace/project access
    if (message.includes('workspace') && message.includes('access')) {
      return {
        isUserError: true,
        userMessage:
          "I don't have access to that workspace or it doesn't exist. Please check the workspace name or make sure I have the right permissions.",
        requiresUserInput: true,
        suggestedAction:
          'Please specify a different workspace or project name.',
      };
    }

    // Handle assignee not found
    if (
      message.includes('assignee') &&
      (message.includes('not found') || message.includes('Not a recognized'))
    ) {
      return {
        isUserError: true,
        userMessage:
          "I couldn't find that user in your Asana workspace. Please check the name spelling or use their exact name as it appears in Asana.",
        requiresUserInput: true,
        suggestedAction:
          "Try using the person's full name as it appears in Asana, or ask me to list all users in the workspace.",
      };
    }

    // Handle invalid assignee format
    if (
      message.includes('assignee') &&
      message.includes('Not an email, GID, or')
    ) {
      return {
        isUserError: true,
        userMessage:
          "There was an issue with the assignee format. Please provide the person's name as it appears in Asana.",
        requiresUserInput: true,
        suggestedAction:
          "Try using the person's full name as it appears in Asana, or ask me to list all users in the workspace.",
      };
    }

    // Handle project not found
    if (
      message.includes('project') &&
      (message.includes('not found') || message.includes('Not a recognized'))
    ) {
      return {
        isUserError: true,
        userMessage:
          "I couldn't find that project in your Asana workspace. Please check the project name spelling.",
        requiresUserInput: true,
        suggestedAction:
          'Try using the exact project name as it appears in Asana, or ask me to list all projects.',
      };
    }

    // Handle task not found
    if (
      message.includes('task') &&
      (message.includes('not found') || message.includes('Not a recognized'))
    ) {
      return {
        isUserError: true,
        userMessage:
          "I couldn't find that task. Please check the task name spelling or make sure it exists in the specified project.",
        requiresUserInput: true,
        suggestedAction:
          'Try using the exact task name, or ask me to list tasks in the project to find the right one.',
      };
    }

    // Handle Asana API constraint errors
    if (
      message.includes(
        'Must specify exactly one of project, tag, section, user task list, or assignee',
      )
    ) {
      return {
        isUserError: false,
        userMessage:
          "I encountered an Asana API constraint. I'll adjust the search to use only one filter at a time.",
        requiresUserInput: false,
        suggestedAction:
          "I'll automatically retry with the appropriate filter.",
      };
    }
  }

  // Handle permission errors
  if (
    errorMessage.includes('forbidden') ||
    errorMessage.includes('permission') ||
    apiErrors.some(
      (err: any) =>
        err.message &&
        (err.message.toLowerCase().includes('forbidden') ||
          err.message.toLowerCase().includes('permission')),
    )
  ) {
    return {
      isUserError: true,
      userMessage:
        "I don't have permission to perform this action. This might be due to workspace settings or the item being private.",
      requiresUserInput: false,
      suggestedAction:
        'Please check if you have the necessary permissions or if the item is accessible to me.',
    };
  }

  // Handle rate limiting
  if (errorMessage.includes('rate limit') || (error as any).status === 429) {
    return {
      isUserError: false,
      userMessage:
        "Asana's API rate limit was reached. Please wait a moment and try again.",
      requiresUserInput: false,
      suggestedAction:
        "I'll automatically retry this operation in a few seconds.",
    };
  }

  // Default case - not a user error
  return {
    isUserError: false,
    userMessage: `An unexpected error occurred: ${error.message}`,
    requiresUserInput: false,
  };
}

/**
 * Extract field name from error message
 */
function extractFieldFromError(message: string): string {
  // Try to extract field name from common error patterns
  const patterns = [
    /(\w+): Not a recognized ID/,
    /(\w+): Not a Long/,
    /Missing required field[:\s]+(\w+)/,
    /(\w+) is required/,
    /(\w+) not found/,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return 'parameter';
}

/**
 * Handle unrecognized ID errors
 */
function handleUnrecognizedIdError(
  field: string,
  parameters: Record<string, any>,
  operation: string,
): UserFriendlyErrorResult {
  const fieldValue =
    parameters[field] || parameters[`${field}_id`] || parameters[`${field}s`];

  switch (field) {
    case 'task':
    case 'parent':
      return {
        isUserError: true,
        userMessage: `I couldn't find the task "${fieldValue}". Please check the task name spelling or make sure it exists.`,
        requiresUserInput: true,
        suggestedAction:
          'Please provide the exact task name as it appears in Asana, or ask me to search for tasks in the project.',
      };

    case 'project':
      return {
        isUserError: true,
        userMessage: `I couldn't find the project "${fieldValue}". Please check the project name spelling.`,
        requiresUserInput: true,
        suggestedAction:
          'Please provide the exact project name as it appears in Asana, or ask me to list all projects.',
      };

    case 'assignee':
      return {
        isUserError: true,
        userMessage: `I couldn't find the user "${fieldValue}" in your Asana workspace.`,
        requiresUserInput: true,
        suggestedAction:
          "Please provide the person's full name as it appears in Asana, or ask me to list all users.",
      };

    default:
      return {
        isUserError: true,
        userMessage: `I couldn't find the ${field} "${fieldValue}". Please check the spelling and try again.`,
        requiresUserInput: true,
        suggestedAction: `Please provide the exact ${field} name as it appears in Asana.`,
      };
  }
}

/**
 * Handle missing required field errors
 */
function handleMissingFieldError(
  field: string,
  operation: string,
): UserFriendlyErrorResult {
  const fieldDescriptions: Record<string, string> = {
    name: 'task or project name',
    workspace: 'workspace',
    project: 'project name',
    assignee: 'person to assign this to',
    parent: 'parent task name (for subtasks)',
    due_date: 'due date',
    notes: 'description or notes',
  };

  const description = fieldDescriptions[field] || field;

  return {
    isUserError: true,
    userMessage: `To ${operation}, I need you to specify the ${description}.`,
    requiresUserInput: true,
    suggestedAction: `Please provide the ${description} and I'll try again.`,
  };
}

/**
 * Format user-friendly error message for display
 */
export function formatUserFriendlyError(
  result: UserFriendlyErrorResult,
): string {
  let message = result.userMessage;

  if (result.suggestedAction) {
    message += `\n\n💡 ${result.suggestedAction}`;
  }

  if (result.requiresUserInput) {
    message += "\n\nPlease let me know how you'd like to proceed!";
  }

  return message;
}
