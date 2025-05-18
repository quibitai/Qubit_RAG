/**
 * Entity extractor for Asana integration
 * Extracts entities like task names, project names, and other parameters
 * from natural language input
 */

import { extractNamesFromInput } from '../utils/gidUtils';
import {
  extractTaskGidFromInput,
  extractProjectGidFromInput,
} from '../utils/gidUtils';

/**
 * Extract task parameters from a natural language description
 *
 * @param input The natural language input
 * @returns Extracted task parameters
 */
export function extractTaskParameters(input: string): {
  taskName?: string;
  taskNotes?: string;
  projectName?: string;
  dueDate?: string;
  assigneeName?: string;
} {
  if (!input) return {};

  const { taskName, projectName } = extractNamesFromInput(input);

  // Extract task notes/description
  const notesMatch =
    input.match(/(?:with|and)\s+(?:notes|description)\s*['"]([^'"]+)['"]/i) ||
    input.match(/(?:notes|description)\s*(?::|that says)\s*['"]([^'"]+)['"]/i);
  const taskNotes = notesMatch?.[1];

  // Extract due date
  const dueDateMatch =
    input.match(
      /(?:due|due date|deadline)\s*(?:of|is|:|on)?\s*['"]([^'"]+)['"]/i,
    ) ||
    input.match(
      /(?:due|due date|deadline)\s+(?:by|on|at)\s+(\w+\s+\d+(?:st|nd|rd|th)?(?:,\s+\d{4})?)/i,
    ) ||
    input.match(
      /(?:due|due date|deadline)\s+(?:by|on|at)\s+(today|tomorrow|next week|next month)/i,
    );
  const dueDate = dueDateMatch?.[1];

  // Extract assignee
  const assigneeMatch =
    input.match(
      /(?:assign(?:ed)?|allocate|give)\s+(?:to|it to)\s+['"]([^'"]+)['"]/i,
    ) ||
    input.match(/(?:assign(?:ed)?|allocate|give)\s+(?:to|it to)\s+(\w+)/i) ||
    input.match(/(?:assigned to|assignee is|assignee:)\s*['"]([^'"]+)['"]/i);
  let assigneeName = assigneeMatch?.[1];

  // Check for "me" as assignee
  if (
    !assigneeName &&
    input.match(/(?:assign(?:ed)?|allocate|give)\s+(?:to|it to)\s+me/i)
  ) {
    assigneeName = 'me';
  }

  return {
    taskName,
    taskNotes,
    projectName,
    dueDate,
    assigneeName,
  };
}

/**
 * Extract task identifier from input, which could be either a GID or a name
 *
 * @param input The natural language input
 * @returns Task identifier (name and/or GID)
 */
export function extractTaskIdentifier(input: string): {
  name?: string;
  gid?: string;
  projectName?: string;
} {
  if (!input) return {};

  // Try to extract GID first
  const gid = extractTaskGidFromInput(input);

  // Also extract names in case GID isn't found or for additional context
  const { taskName, projectName } = extractNamesFromInput(input);

  return {
    name: taskName,
    gid,
    projectName,
  };
}

/**
 * Extract project parameters from input
 *
 * @param input The natural language input
 * @returns Extracted project parameters
 */
export function extractProjectParameters(input: string): {
  projectName?: string;
  teamName?: string;
  notes?: string;
} {
  if (!input) return {};

  // Extract project name
  const projectMatch =
    input.match(
      /(?:project|project named|project called|project titled)\s*['"]([^'"]+)['"]/i,
    ) || input.match(/['"]([^'"]+)['"]\s*(?:project)/i);
  const projectName = projectMatch?.[1];

  // Extract team name
  const teamMatch =
    input.match(
      /(?:team|team named|team called|for team)\s*['"]([^'"]+)['"]/i,
    ) || input.match(/(?:in|for|under)\s+(?:the\s+)?team\s+['"]([^'"]+)['"]/i);
  const teamName = teamMatch?.[1];

  // Extract notes/description
  const notesMatch =
    input.match(/(?:with|and)\s+(?:notes|description)\s*['"]([^'"]+)['"]/i) ||
    input.match(/(?:notes|description)\s*(?::|that says)\s*['"]([^'"]+)['"]/i);
  const notes = notesMatch?.[1];

  return {
    projectName,
    teamName,
    notes,
  };
}

/**
 * Extract project identifier from input
 *
 * @param input The natural language input
 * @returns Project identifier
 */
export function extractProjectIdentifier(input: string): {
  name?: string;
  gid?: string;
} {
  if (!input) return {};

  // Try to extract GID first
  const gid = extractProjectGidFromInput(input);

  // Extract project name
  const { projectName } = extractNamesFromInput(input);

  return {
    name: projectName,
    gid,
  };
}

/**
 * Determine if the input suggests the tasks should be filtered to "my tasks"
 *
 * @param input The natural language input
 * @returns Boolean indicating if the request is for "my" tasks
 */
export function isMyTasksRequest(input: string): boolean {
  if (!input) return false;

  const lowerInput = input.toLowerCase();

  return (
    lowerInput.includes('my tasks') ||
    lowerInput.includes('assigned to me') ||
    lowerInput.includes('my to-do') ||
    lowerInput.includes('my todo') ||
    lowerInput.match(/tasks\s+(?:for|assigned to)\s+me\b/i) !== null
  );
}

/**
 * Extract update fields for a task from the input
 *
 * @param input The natural language input
 * @returns Object containing fields to update
 */
export function extractTaskUpdateFields(input: string): {
  name?: string;
  notes?: string;
  dueDate?: string;
  completed?: boolean;
} {
  if (!input) return {};

  const updates: {
    name?: string;
    notes?: string;
    dueDate?: string;
    completed?: boolean;
  } = {};

  // Check for title/name update
  const nameMatch =
    input.match(
      /(?:rename|change name|new name|title to|name to)\s*['"]([^'"]+)['"]/i,
    ) ||
    input.match(
      /(?:new|updated)\s+(?:name|title)\s*(?:is|:|to)?\s*['"]([^'"]+)['"]/i,
    );
  if (nameMatch) {
    updates.name = nameMatch[1];
  }

  // Check for notes/description update
  const notesMatch =
    input.match(
      /(?:change|update|set|new)\s+(?:notes|description)\s*(?:to|as)?\s*['"]([^'"]+)['"]/i,
    ) || input.match(/(?:notes|description)\s*(?:to|as|:)\s*['"]([^'"]+)['"]/i);
  if (notesMatch) {
    updates.notes = notesMatch[1];
  }

  // Check for due date update
  const dueDateMatch =
    input.match(
      /(?:change|update|set|new)\s+(?:due date|deadline)\s*(?:to|as)?\s*['"]([^'"]+)['"]/i,
    ) ||
    input.match(
      /(?:due|due date|deadline)\s*(?:to|as|:)\s*['"]([^'"]+)['"]/i,
    ) ||
    input.match(
      /(?:due|due date|deadline)\s+(?:to|on)\s+(\w+\s+\d+(?:st|nd|rd|th)?(?:,\s+\d{4})?)/i,
    );
  if (dueDateMatch) {
    updates.dueDate = dueDateMatch[1];
  }

  // Check for completion status update
  const completedMatch =
    input.match(
      /(?:mark|set)\s+(?:as|to)?\s+(?:complete|completed|done|finished)/i,
    ) || input.match(/(?:complete|finish|close|done|check off)/i);
  if (completedMatch) {
    updates.completed = true;
  }

  return updates;
}
