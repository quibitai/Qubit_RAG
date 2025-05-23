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
  // Prioritize matching "me" directly
  let assigneeName: string | undefined;
  const meAssigneeMatch = input.match(
    /(?:assign(?:ed)?|allocate|give|for)\s+(?:it to|to)?\s*me\b/i,
  );

  if (meAssigneeMatch) {
    assigneeName = 'me';
  } else {
    // If not "me", try to match a quoted name or a more specific unquoted name
    const specificAssigneeMatch =
      input.match(
        /(?:assign(?:ed)?|allocate|give|for)\s+(?:to|it to)\s+['"]([^'"]+)['"]/i,
      ) ||
      input.match(
        /(?:assigned to|assignee is|assignee:)\s*['"]([^'"]+)['"]/i,
      ) ||
      // Match unquoted names but try to avoid single common words that might not be names.
      // This regex can be further refined if needed.
      input.match(
        /(?:assign(?:ed)?|allocate|give|for)\s+(?:to|it to)\s+([A-Za-z](?:[A-Za-z\s]*[A-Za-z])?)/i,
      );
    if (specificAssigneeMatch?.[1]) {
      assigneeName = specificAssigneeMatch[1].trim();
    }
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
      /(?:change|update|set|new)\s+(?:due date|deadline)\s*(?:to|for|on|by|at)\s+(today|tomorrow|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?(?:\s+at\s+\S+)?)/i,
    ) ||
    input.match(
      /(?:due|due date|deadline)\s+(?:is|to|as|on|for|at|by)\s+(today|tomorrow|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?(?:\s+at\s+\S+)?)/i,
    ) ||
    input.match(
      /(?:due|due date|deadline)\s+(?:to|on)\s+(\w+\s+\d+(?:st|nd|rd|th)?(?:,\s+\d{4})?(?:\s+at\s+\S+)?)/i,
    );

  const matchedDate = dueDateMatch?.[1];
  if (matchedDate) {
    updates.dueDate = matchedDate;
  }

  // Check for completion status update
  const completedMatch =
    input.match(
      /(?:mark|set)\s+(?:as|to)?\s+(?:complete|completed|done|finished)/i,
    ) || input.match(/(?:complete|finish|close|done|check off)/i);

  const incompleteMatch =
    input.match(
      /(?:mark|set)\s+(?:as|to)?\s+(?:incomplete|not complete|pending|open)/i,
    ) || input.match(/(?:reopen|uncross|uncheck)/i);

  if (completedMatch) {
    updates.completed = true;
  } else if (incompleteMatch) {
    updates.completed = false;
  }

  return updates;
}

/**
 * Valid Asana resource types for typeahead search.
 * Based on Asana API documentation for typeahead.
 */
export type AsanaSearchableResourceType =
  | 'task'
  | 'project'
  | 'user'
  | 'portfolio'
  | 'tag';
const VALID_RESOURCE_TYPES: AsanaSearchableResourceType[] = [
  'task',
  'project',
  'user',
  'portfolio',
  'tag',
];

/**
 * Extracts the search query and an optional resource type from natural language input.
 *
 * @param input The natural language input for the search.
 * @returns An object containing the query and optional resourceType.
 */
export function extractSearchQueryAndType(input: string): {
  query: string;
  resourceType?: AsanaSearchableResourceType;
} {
  if (!input) return { query: '' };

  let query = input;
  let resourceType: AsanaSearchableResourceType | undefined = undefined;

  // Simplified patterns to extract query and resource type
  // Example: "search for tasks named 'My Task Query'"
  // Example: "find projects about 'Client X'"
  // Example: "lookup users matching 'John Doe'"
  // Example: "search 'Urgent Bugs' in asana"

  const typePattern = new RegExp(
    `(?:search|find|look up|query)(?:\s+(?:for|about|matching|in))?\s+(${VALID_RESOURCE_TYPES.join('|')})s?\s*(?:named|called|titled|about|matching|containing)?\s*[:'"]([^"']+)["']`,
    'i',
  );
  const typeMatch = input.match(typePattern);

  if (typeMatch?.[1] && typeMatch?.[2]) {
    query = typeMatch[2].trim();
    const extractedType =
      typeMatch[1].toLowerCase() as AsanaSearchableResourceType;
    if (VALID_RESOURCE_TYPES.includes(extractedType)) {
      resourceType = extractedType;
    }
  } else {
    // Simpler extraction if no explicit type, or for quoted queries
    const quotedQueryMatch = input.match(
      /(?:search|find|look up|query)(?:\s+(?:for|about|in))?\s*[:'"]([^"']+)["']/i,
    );
    if (quotedQueryMatch?.[1]) {
      query = quotedQueryMatch[1].trim();
    } else {
      // Fallback: treat everything after "search/find/query (for/in/about)?" as the query
      const generalSearchMatch = input.match(
        /(?:search|find|look up|query)(?:\s+(?:for|about|in|on))?\s*(.+)/i,
      );
      if (generalSearchMatch?.[1]) {
        query = generalSearchMatch[1].trim();
      } else {
        // If it's just "search querytext", query is querytext
        const directQueryMatch = input.match(
          /^(?:search|find|look up|query)\s+(.+)/i,
        );
        if (directQueryMatch?.[1]) {
          query = directQueryMatch[1].trim();
        } else {
          // Default to the whole input if no keywords found (should be rare due to intent classification)
          query = input.trim();
        }
      }
    }

    // Check for resource type keywords in the remaining query if not found with specific pattern
    if (!resourceType) {
      const lowerQuery = query.toLowerCase();
      for (const rType of VALID_RESOURCE_TYPES) {
        if (
          lowerQuery.includes(` ${rType}s `) ||
          lowerQuery.startsWith(`${rType}s `) ||
          lowerQuery.endsWith(` ${rType}s`)
        ) {
          resourceType = rType;
          // Attempt to remove the type from the query string itself if it seems to be part of it
          query = query
            .replace(new RegExp(`\s*${rType}s?\s*`, 'gi'), ' ')
            .trim();
          break;
        }
        if (
          lowerQuery.includes(` ${rType} `) ||
          lowerQuery.startsWith(`${rType} `) ||
          lowerQuery.endsWith(` ${rType}`)
        ) {
          resourceType = rType;
          query = query.replace(new RegExp(`\s*${rType}\s*`, 'gi'), ' ').trim();
          break;
        }
      }
    }
  }

  // Remove any lingering search keywords from the beginning of the query
  query = query
    .replace(
      /^(?:search|find|look up|query)(?:\s+(?:for|about|in|on))?\s*/i,
      '',
    )
    .trim();
  // Remove quotes if the query is still wrapped in them
  if (
    (query.startsWith('"') && query.endsWith('"')) ||
    (query.startsWith("'") && query.endsWith("'"))
  ) {
    query = query.substring(1, query.length - 1);
  }

  return { query, resourceType };
}

/**
 * Extracts task identifiers (GID or name/project) and a user identifier (name, email, or "me")
 * from natural language input, typically for operations like adding/removing followers or assignees.
 *
 * @param input The natural language input.
 * @returns An object containing taskGid, taskName, projectName, and userNameOrEmail/userGid.
 */
export function extractTaskAndUserIdentifiers(input: string): {
  taskGid?: string;
  taskName?: string;
  projectName?: string;
  userGid?: string; // If a GID for user is explicitly mentioned
  userNameOrEmail?: string; // For "me", name, or email
} {
  const baseTaskInfo = extractTaskIdentifier(input);
  let userNameOrEmail: string | undefined;
  let userGid: string | undefined;

  // Attempt to extract user GID first if present (e.g., "add user 123... to task X")
  const userGidMatch = input.match(
    /(?:user|person|follower|assignee)\s+(\d{16,})/i,
  );
  if (userGidMatch?.[1]) {
    userGid = userGidMatch[1];
    // Try to clean the input from the user GID part to avoid it being part of task name
    // This is a simple removal, might need refinement
    const cleanedInputForTask = input.replace(userGidMatch[0], '').trim();
    const refinedTaskInfo = extractTaskIdentifier(cleanedInputForTask);
    baseTaskInfo.gid = baseTaskInfo.gid || refinedTaskInfo.gid;
    baseTaskInfo.name = baseTaskInfo.name || refinedTaskInfo.name;
    baseTaskInfo.projectName =
      baseTaskInfo.projectName || refinedTaskInfo.projectName;
  } else {
    // Regex to find user mentions like "to me", "to john.doe@example.com", "to John Doe", "follower John Doe"
    // This is a simplified set of patterns and might need to be expanded for robustness.
    const userPatterns = [
      /(?:to|for|assign|add|remove|cc|bcc|follower|assignee)\s+me\b/i, // "to me", "assign me"
      /(?:to|for|assign|add|remove|cc|bcc|follower|assignee)\s+([\w.\-]+@[\w.\-]+\.[a-zA-Z]{2,})/i, // email
      /(?:to|for|assign|add|remove|cc|bcc|follower|assignee)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i, // Proper name (simple)
      /(?:user|person)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i, // "user John Doe"
      /(?:user|person)\s+([\w.\-]+@[\w.\-]+\.[a-zA-Z]{2,})/i, // "user john.doe@example.com"
      // Patterns for extracting from phrases like "add John Doe as a follower to task X"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:as|to be|is now)\s+(?:a )?(?:follower|assignee|watcher)/i,
      /([\w.\-]+@[\w.\-]+\.[a-zA-Z]{2,})\s+(?:as|to be|is now)\s+(?:a )?(?:follower|assignee|watcher)/i,
    ];

    for (const pattern of userPatterns) {
      const match = input.match(pattern);
      if (match) {
        if (pattern.source.includes('me\b')) {
          userNameOrEmail = 'me';
        } else if (match[1]) {
          userNameOrEmail = match[1].trim();
        }
        if (userNameOrEmail) break;
      }
    }
  }

  return {
    taskGid: baseTaskInfo.gid,
    taskName: baseTaskInfo.name,
    projectName: baseTaskInfo.projectName,
    userNameOrEmail,
    userGid,
  };
}

/**
 * Extracts task identifiers and a raw due date expression from natural language input.
 *
 * @param input The natural language input.
 * @returns An object containing taskGid, taskName, projectName, and dueDateExpression.
 */
export function extractTaskAndDueDate(input: string): {
  taskGid?: string;
  taskName?: string;
  projectName?: string;
  dueDateExpression?: string;
} {
  const baseTaskInfo = extractTaskIdentifier(input);
  let dueDateExpression: string | undefined;

  // Regex to find due date expressions.
  // Examples: "due tomorrow", "deadline next Friday at 5pm", "due on 2023-12-31"
  // This pattern aims to capture the text following "due", "deadline", etc.
  const dueDatePatterns = [
    /(?:due|deadline|due date|set due|set deadline|make due)(?:\s+(?:on|by|at|to))?\s+(.+)/i,
    // For phrases where the task is mentioned after the date: "set tomorrow as due date for task X"
    // This is harder to capture generally without overmatching, so focus on simpler structures first.
  ];

  for (const pattern of dueDatePatterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      // We need to be careful not to include the task name itself if the pattern is too greedy.
      // Example: "set due date for task Alpha to tomorrow evening"
      // Here, match[1] might be "for task Alpha to tomorrow evening".
      // We only want "tomorrow evening".

      let potentialExpression = match[1].trim();

      // Attempt to remove task identifiers from the end of the potential expression
      if (baseTaskInfo.name) {
        const taskNamePattern = new RegExp(
          `(?:for|on|of|to)\s+(?:task|item|to-do)?\s*(?:named|called)?\s*['"]?${escapeRegex(baseTaskInfo.name)}['"]?$`,
          'i',
        );
        potentialExpression = potentialExpression
          .replace(taskNamePattern, '')
          .trim();
      }
      if (baseTaskInfo.gid) {
        const taskGidPattern = new RegExp(
          `(?:for|on|of|to)\s+(?:task|item|to-do)?\s*${escapeRegex(baseTaskInfo.gid)}$`,
          'i',
        );
        potentialExpression = potentialExpression
          .replace(taskGidPattern, '')
          .trim();
      }
      // Remove trailing prepositions like "for", "to"
      potentialExpression = potentialExpression
        .replace(/\s+(?:for|to|on|of)$/i, '')
        .trim();

      if (potentialExpression) {
        dueDateExpression = potentialExpression;
        break;
      }
    }
  }

  // If no specific dueDateExpression is found through keywords,
  // but the intent was SET_TASK_DUE_DATE, the entity extractor might have to rely on chrono-node
  // parsing the whole input later, or the intent classifier might need to be more specific.
  // For now, this extractor focuses on keyword-driven extraction for the expression.

  return {
    taskGid: baseTaskInfo.gid,
    taskName: baseTaskInfo.name,
    projectName: baseTaskInfo.projectName,
    dueDateExpression,
  };
}

/**
 * Helper to escape regex special characters in a string
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

/**
 * Extracts details required for creating a subtask, including the parent task identifier
 * and the name for the new subtask.
 *
 * @param input The natural language input.
 * @returns An object containing parentTaskGid/parentTaskName, parentProjectName (for context), and subtaskName.
 */
export function extractSubtaskCreationDetails(input: string): {
  parentTaskGid?: string;
  parentTaskName?: string;
  parentProjectName?: string; // Context for finding parent task by name
  subtaskName?: string;
} {
  if (!input) return {};

  let parentTaskGid: string | undefined;
  let parentTaskName: string | undefined;
  let parentProjectName: string | undefined;
  let subtaskName: string | undefined;

  // Try to extract parent task GID first
  // Look for patterns like "add subtask to task GID 123..."
  const parentGidMatch = input.match(
    /(?:to|for|under|on|parent)\s+(?:task|item|parent)?\s*(\d{16,})/i,
  );
  if (parentGidMatch?.[1]) {
    parentTaskGid = parentGidMatch[1];
  }

  // Extract names for parent task and project context using existing utility
  const names = extractNamesFromInput(input);
  parentTaskName = names.taskName; // extractNamesFromInput might pick up the *parent* task name here
  parentProjectName = names.projectName;

  // Extract subtask name
  // Pattern: "add subtask (named|called) 'New Subtask Name' ..."
  // Pattern: "... subtask 'New Subtask Name' to parent ..."
  const subtaskNameMatch =
    input.match(
      /(?:sub-?task|child task|item under|new task)\s*(?:named|called|titled)?\s*['"]([^'"]+)['"]/i,
    ) ||
    input.match(
      /['"]([^'"]+)['"]\s*(?:as|is the name of the|for the)?\s*(?:sub-?task|child task|item)/i,
    );

  if (subtaskNameMatch?.[1]) {
    subtaskName = subtaskNameMatch[1];

    // Clean up: If extractNamesFromInput picked up the subtask name as the main taskName, clear it from parentTaskName
    if (
      parentTaskName &&
      parentTaskName.toLowerCase() === subtaskName.toLowerCase()
    ) {
      // This logic is tricky because extractNamesFromInput is general.
      // If the input is "add subtask 'A' to task 'B'", extractNamesFromInput might return taskName 'B'.
      // If input is "add subtask to task 'B' named 'A'", extractNamesFromInput might return taskName 'B'.
      // If input is "add subtask 'A'", extractNamesFromInput might return taskName 'A'.
      // For now, we assume if a subtask name is explicitly found, and it matches what extractNamesFromInput found for taskName,
      // the user likely didn't specify a parent task name explicitly in a way extractNamesFromInput could distinguish.
      // The intent classifier should make this less ambiguous. The GID for parent is more reliable.
      // A more robust solution might involve more complex NLP or iterative extraction.
    }
  } else {
    // This is less reliable and might be removed if too problematic.
    const allQuotes = input.match(/['']([^'']+)['']/g); // Get all quoted strings
    if (allQuotes && parentTaskName) {
      const otherQuote = allQuotes.find((q) => {
        const qText = q.slice(1, -1).toLowerCase();
        const pNameLower = parentTaskName?.toLowerCase();
        return pNameLower ? qText !== pNameLower : true; // If parentTaskName is undefined, consider it not a match
      });
      if (otherQuote) {
        subtaskName = otherQuote.slice(1, -1);
      }
    }
  }

  // If a parent GID was found, it takes precedence for identifying the parent.
  // If parentTaskName was extracted by extractNamesFromInput, and a subtaskName was also found,
  // we need to ensure parentTaskName is indeed the parent and not the subtask.
  // This heuristic might need refinement.
  if (
    subtaskName &&
    parentTaskName &&
    subtaskName.toLowerCase() === parentTaskName.toLowerCase()
  ) {
    // If a specific parent GID isn't found, and the subtask name is the only task-like name extracted,
    // assume the user intends to specify the parent differently or expects context.
    // This state might require clarification from the user by the calling tool if no GID is present.
    // For now, we'll clear parentTaskName if it seems it was actually the subtask's name.
    if (!parentGidMatch) {
      // Only do this if we don't have a GID for the parent
      parentTaskName = undefined;
    }
  }

  return {
    parentTaskGid,
    parentTaskName,
    parentProjectName,
    subtaskName,
  };
}

/**
 * Extracts details for adding or removing a task dependency.
 * Identifies the primary task and the dependency/dependent task.
 *
 * @param input The natural language input.
 * @returns An object containing identifiers for both tasks and the dependency type if applicable.
 */
export function extractDependencyDetails(input: string): {
  taskGid?: string;
  taskName?: string;
  taskProjectName?: string; // Context for taskName
  dependencyTaskGid?: string;
  dependencyTaskName?: string;
  dependencyTaskProjectName?: string; // Context for dependencyTaskName
  // For ADD_TASK_DEPENDENCY, Asana API uses `dependency` parameter to specify the task that the primary task `depends_on` (is blocked by).
  // Or, if primary task is `blocking` another, that's also a way to phrase it.
  // For simplicity, we'll aim to identify: Task A (taskGid/Name) and Task B (dependencyTaskGid/Name)
  // and the intent (e.g. "A depends on B" or "A blocks B") will determine how API is called.
} {
  if (!input) return {};

  let taskGid: string | undefined;
  let taskName: string | undefined;
  let taskProjectName: string | undefined;
  let dependencyTaskGid: string | undefined;
  let dependencyTaskName: string | undefined;