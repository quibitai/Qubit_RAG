/**
 * Entity extractor for Asana integration
 * Extracts entities like task names, project names, and other parameters
 * from natural language input
 */

import {
  extractNamesFromInput,
  extractTaskGidFromInput,
  extractProjectGidFromInput,
  isValidGid,
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

  // Check if this is a simple confirmation or project selection response
  const isSimpleConfirmation =
    /^(?:yes|yep|yeah|confirm|confirmed|ok|okay|sure|proceed|go ahead|do it)[.,!]*$/i.test(
      input.trim(),
    );
  const isSimpleProjectSelection =
    /^\d{16,}$/.test(input.trim()) ||
    input.toLowerCase().trim() === 'echo tango';

  // For simple confirmations/selections, don't extract new parameters
  // The calling code should handle context preservation
  if (isSimpleConfirmation || isSimpleProjectSelection) {
    const result: any = {};

    // Only extract project name if it's clearly mentioned
    if (input.toLowerCase().includes('echo tango')) {
      result.projectName = 'Echo Tango';
    }

    // Only extract assignment if explicitly mentioned
    if (
      input.toLowerCase().includes('assign') &&
      input.toLowerCase().includes('me')
    ) {
      result.assigneeName = 'me';
    }

    return result;
  }

  // For full task creation requests, extract all parameters
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
      /(?:due|due date|deadline)\s+(?:by|on|at|for)\s+(today|tomorrow|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
    ) ||
    input.match(
      /(?:make|set)\s+(?:the\s+)?(?:due\s+date|deadline)\s+(?:to\s+|for\s+)?(today|tomorrow|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
    ) ||
    input.match(
      /(?:and|with)\s+(?:a\s+)?(?:due\s+date|deadline)\s+(?:of|on|at|for)\s+(today|tomorrow|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
    ) ||
    input.match(
      /(?:due|deadline)\s+(?:for|on)\s+(today|tomorrow|next\s+(?:week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i,
    );
  const dueDate = dueDateMatch?.[1];

  // Extract assignee with improved "me" detection
  let assigneeName: string | undefined;
  const meAssigneeMatch =
    input.match(
      /(?:assign(?:ed)?(?:\s+it)?|allocate|give|for)\s+(?:it\s+)?to\s+me\b/i,
    ) ||
    input.match(/(?:assign(?:ed)?)\s+(?:to\s+)?me\b/i) ||
    input.match(/(?:for|to)\s+me\b/i);

  if (meAssigneeMatch) {
    assigneeName = 'me';
  } else {
    // Check for other assignee patterns
    const specificAssigneeMatch =
      input.match(
        /(?:assign(?:ed)?|allocate|give|for)\s+(?:to|it to)\s+['"]([^'"]+)['"]/i,
      ) ||
      input.match(
        /(?:assigned to|assignee is|assignee:)\s*['"]([^'"]+)['"]/i,
      ) ||
      // Match unquoted names but try to avoid single common words that might not be names.
      input.match(
        /(?:assign(?:ed)?|allocate|give|for)\s+(?:to|it to)\s+([A-Za-z](?:[A-Za-z\s]*[A-Za-z])?)/i,
      );
    if (specificAssigneeMatch?.[1]) {
      const candidateName = specificAssigneeMatch[1].trim();
      // Don't capture generic terms that aren't names
      if (
        ![
          'the',
          'this',
          'that',
          'user',
          'person',
          'someone',
          'requesting',
        ].includes(candidateName.toLowerCase())
      ) {
        assigneeName = candidateName;
      }
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

  // Direct "my tasks" patterns
  if (
    lowerInput.includes('my tasks') ||
    lowerInput.includes('my current tasks') ||
    lowerInput.includes('my active tasks') ||
    lowerInput.includes('my open tasks') ||
    lowerInput.includes('my pending tasks') ||
    lowerInput.includes('my incomplete tasks') ||
    lowerInput.includes('my outstanding tasks') ||
    lowerInput.includes('my to-do') ||
    lowerInput.includes('my todo') ||
    lowerInput.includes('my work')
  ) {
    return true;
  }

  // "All my" patterns
  if (
    lowerInput.includes('all my tasks') ||
    lowerInput.includes('all my current tasks') ||
    lowerInput.includes('all my active tasks') ||
    lowerInput.includes('all my work')
  ) {
    return true;
  }

  // "Show me" patterns - these are very strong indicators of "my tasks"
  if (
    /(?:show|list|get|display)\s+(?:me\s+)?(?:all\s+)?my\s+(?:current\s+|active\s+|open\s+|pending\s+)?tasks?/i.test(
      lowerInput,
    ) ||
    /(?:show|list|get|display)\s+me\s+(?:all\s+)?(?:current\s+|active\s+|open\s+|pending\s+)?tasks?/i.test(
      lowerInput,
    )
  ) {
    return true;
  }

  // Assignment patterns
  if (
    lowerInput.includes('assigned to me') ||
    lowerInput.match(/tasks\s+(?:for|assigned to)\s+me\b/i) !== null
  ) {
    return true;
  }

  // "I have" patterns
  if (
    /(?:tasks|work|assignments)\s+(?:i\s+have|that\s+i\s+have)/i.test(
      lowerInput,
    )
  ) {
    return true;
  }

  // Direct requests without explicit "my" but clearly personal
  // Only match if there are no indicators that it's for someone else
  if (
    /^(?:show|list|get|display)\s+(?:me\s+)?(?:all\s+)?(?:current\s+|active\s+|open\s+|pending\s+)?tasks?/.test(
      lowerInput,
    ) &&
    !lowerInput.includes('for ') &&
    !lowerInput.includes('assigned to ') &&
    !lowerInput.includes("'s ") &&
    !lowerInput.includes(' by ') &&
    !lowerInput.includes(' from ')
  ) {
    return true;
  }

  return false;
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
  assigneeName?: string; // Added for subtask assignee
  dueDate?: string; // Added for subtask due date
} {
  if (!input) return {};

  let parentTaskGid: string | undefined;
  let parentTaskName: string | undefined;
  let subtaskName: string | undefined;
  let assigneeName: string | undefined;
  let dueDate: string | undefined;
  let parentProjectName: string | undefined;

  // NEW PATTERN: Handle "add a subtask to [task] in [project] for [assignee] called [name]"
  const complexSubtaskMatch = input.match(
    /add\s+(?:a\s+)?subtask\s+to\s*["']([^"']+)["']\s+in\s+(?:the\s+)?([A-Za-z0-9\s_-]+)\s+project\s+for\s+([^"']+?)\s+called\s*["']([^"']+)["']/i,
  );

  if (complexSubtaskMatch) {
    parentTaskName = complexSubtaskMatch[1];
    parentProjectName = complexSubtaskMatch[2].trim();
    const rawAssigneeName = complexSubtaskMatch[3].trim();
    subtaskName = complexSubtaskMatch[4];

    // Clean up assignee name, removing any trailing phrases
    const assigneeCleanMatch = rawAssigneeName.match(
      /^([^,]+?)(?:\s+with\s+|\s+called\s+|\s+and\s+|$)/i,
    );
    if (assigneeCleanMatch) {
      assigneeName = assigneeCleanMatch[1].trim();
    } else {
      assigneeName = rawAssigneeName;
    }
  }

  // Enhanced pattern for "add a subtask for [assignee] called [name]"
  const subtaskForAssigneeMatch = input.match(
    /add\s+(?:a\s+)?subtask\s+for\s+([^"']+?)\s+called\s*["']([^"']+)["']/i,
  );

  if (!subtaskName && subtaskForAssigneeMatch) {
    const rawAssigneeName = subtaskForAssigneeMatch[1].trim();
    subtaskName = subtaskForAssigneeMatch[2];

    // Extract just the assignee name, removing any trailing phrases
    const assigneeCleanMatch = rawAssigneeName.match(
      /^([^,]+?)(?:\s+with\s+|\s+called\s+|\s+and\s+|$)/i,
    );
    if (assigneeCleanMatch) {
      assigneeName = assigneeCleanMatch[1].trim();
    } else {
      assigneeName = rawAssigneeName;
    }
  }

  // Enhanced pattern for "add a subtask called [name] to the task [parent] in the [project] project"
  if (!subtaskName) {
    const subtaskToTaskMatch = input.match(
      /add\s+(?:a\s+)?subtask\s+called\s*["']([^"']+)["']\s+to\s+(?:the\s+)?task\s*["']([^"']+)["']\s+in\s+the\s+([A-Za-z0-9\s_-]+)\s+project/i,
    );

    if (subtaskToTaskMatch) {
      subtaskName = subtaskToTaskMatch[1];
      parentTaskName = subtaskToTaskMatch[2];
      parentProjectName = subtaskToTaskMatch[3].trim();
    }
  }

  // Pattern for "add a subtask called [name] to [parent]"
  if (!subtaskName) {
    const subtaskCalledMatch = input.match(
      /add\s+(?:a\s+)?subtask\s+called\s*["']([^"']+)["']\s+to\s+(?:the\s+)?(?:task\s+)?["']?([^"']+?)["']?(?:\s+in\s+|\s*$)/i,
    );

    if (subtaskCalledMatch) {
      subtaskName = subtaskCalledMatch[1];
      const potentialParent = subtaskCalledMatch[2].trim();

      // Don't use common words as parent names
      if (
        !['task', 'parent', 'item', 'the'].includes(
          potentialParent.toLowerCase(),
        )
      ) {
        parentTaskName = potentialParent;
      }
    }
  }

  // If no subtask name found yet, try original extraction logic
  if (!subtaskName) {
    // Try to extract parent task GID first
    // Look for patterns like "add subtask to task GID 123..."
    const parentGidMatch = input.match(
      /(?:to|for|under|on|parent)\s+(?:task|item|parent)?\s*(\d{16,})/i,
    );
    if (parentGidMatch?.[1]) {
      parentTaskGid = parentGidMatch[1];
    }

    // Extract subtask name from general patterns
    const subtaskNameMatch =
      input.match(
        /(?:sub-?task|child task|item under|new task)\s*(?:named|called|titled)?\s*['"]([^'"]+)['"]/i,
      ) ||
      input.match(
        /['"]([^'"]+)['"]\s*(?:as|is the name of the|for the)?\s*(?:sub-?task|child task|item)/i,
      );

    if (subtaskNameMatch?.[1]) {
      subtaskName = subtaskNameMatch[1];
    }
  }

  // Extract assignee if not already found
  if (!assigneeName) {
    // Look for "assign it to [name]" or "for [name]"
    const assigneeMatch =
      input.match(
        /(?:assign(?:ed)?\s+(?:it\s+)?to|for)\s+([^"'\s,]+(?:\s+[^"'\s,]+)*)/i,
      ) ||
      input.match(
        /(?:assignee|assigned to)\s*:\s*([^"'\s,]+(?:\s+[^"'\s,]+)*)/i,
      );

    if (assigneeMatch?.[1]) {
      const candidateAssignee = assigneeMatch[1].trim();
      // Remove trailing prepositions and common words
      const cleanedAssignee = candidateAssignee
        .replace(/\s*(?:with|and|in|on|at|by|,).*$/i, '')
        .trim();
      if (
        cleanedAssignee &&
        !['the', 'task', 'project'].includes(cleanedAssignee.toLowerCase())
      ) {
        assigneeName = cleanedAssignee;
      }
    }
  }

  // Extract due date if not already found
  if (!dueDate) {
    const dueDateMatch =
      input.match(
        /(?:due date|deadline)\s+(?:of|is|on)?\s*([^,]+?)(?:\s+with|\s*$)/i,
      ) ||
      input.match(
        /(?:due date|deadline)\s+(?:for|on|by|at)\s*([^,]+?)(?:\s+with|\s*$)/i,
      ) ||
      input.match(
        /(?:with|and)\s+(?:a\s+)?due\s+date\s+(?:of|on|for|by)?\s*([^,]+?)(?:\s+with|\s*$)/i,
      ) ||
      input.match(
        /(?:due|deadline)\s+(?:on|by|for)?\s*([^,]+?)(?:\s+with|\s*$)/i,
      ) ||
      input.match(
        /(?:set|make)\s+(?:the\s+)?due\s+date\s+(?:to|for|on|by)?\s*([^,]+?)(?:\s+with|\s*$)/i,
      );
    if (dueDateMatch?.[1]) {
      const extractedDate = dueDateMatch[1].trim();
      // Don't capture prepositions or common words, but allow multi-word expressions
      const cleanedDate = extractedDate
        .replace(/^(?:for|on|by|to|with|and|the)\s+/i, '')
        .replace(/\s+(?:for|on|by|to|with|and|the)\s*$/i, '')
        .trim();

      if (
        cleanedDate &&
        !['for', 'on', 'by', 'to', 'with', 'and', 'the'].includes(
          cleanedDate.toLowerCase(),
        )
      ) {
        dueDate = cleanedDate;
      }
    }
  }

  // Extract project name if not already found
  if (!parentProjectName) {
    // Look for "in the [project] project" pattern
    const projectMatch = input.match(
      /in\s+the\s+([A-Za-z0-9\s_-]+)\s+project/i,
    );
    if (projectMatch?.[1]) {
      parentProjectName = projectMatch[1].trim();
    }
  }

  // Look for parent task context if not already found
  if (!parentTaskGid && !parentTaskName) {
    // Look for patterns like "under test5" or "to the task test5"
    const parentTaskMatch =
      input.match(
        /(?:under|to)\s+(?:the\s+)?(?:task\s+)?["']?([^"'\s]+)["']?/i,
      ) || input.match(/(?:parent|task)\s+["']?([^"'\s]+)["']?/i);
    if (parentTaskMatch?.[1] && parentTaskMatch[1] !== subtaskName) {
      parentTaskName = parentTaskMatch[1];
    }
  }

  return {
    parentTaskGid,
    parentTaskName,
    parentProjectName,
    subtaskName,
    assigneeName,
    dueDate,
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
  let dependencyTaskProjectName: string | undefined;

  // Extract task GIDs first (most reliable)
  const gidMatches = input.match(/\d{16,}/g);
  if (gidMatches && gidMatches.length >= 2) {
    taskGid = gidMatches[0];
    dependencyTaskGid = gidMatches[1];
  }

  // Extract names using quoted strings and common patterns
  const names = extractNamesFromInput(input);

  // For dependency operations, we need to identify two tasks
  // This is a simplified extraction - more sophisticated parsing would be needed for complex cases
  if (!taskGid && !dependencyTaskGid) {
    const quotedNames = input.match(/['"]([^'"]+)['"]/g);
    if (quotedNames && quotedNames.length >= 2) {
      taskName = quotedNames[0].slice(1, -1);
      dependencyTaskName = quotedNames[1].slice(1, -1);
    } else if (names.taskName) {
      taskName = names.taskName;
    }
  }

  if (names.projectName) {
    taskProjectName = names.projectName;
  }

  return {
    taskGid,
    taskName,
    taskProjectName,
    dependencyTaskGid,
    dependencyTaskName,
    dependencyTaskProjectName,
  };
}

/**
 * Extract task dependency details from input.
 * Expected patterns: "make task A dependent on task B", "remove dependency from task X to task Y"
 *
 * @param input The input string to parse
 * @returns Object with dependent task and dependency task identifiers
 */
export function extractTaskDependencyDetails(input: string): {
  dependentTaskGid?: string;
  dependentTaskName?: string;
  dependencyTaskGid?: string;
  dependencyTaskName?: string;
  projectName?: string;
} {
  if (!input) return {};

  const result: {
    dependentTaskGid?: string;
    dependentTaskName?: string;
    dependencyTaskGid?: string;
    dependencyTaskName?: string;
    projectName?: string;
  } = {};

  // Pattern: "make task A dependent on task B" or "add dependency from A to B"
  const dependencyPattern1 =
    /make\s+(?:task\s+)?["']?([^"']+?)["']?\s+dependent\s+on\s+(?:task\s+)?["']?([^"']+?)["']?/i;
  const dependencyMatch1 = input.match(dependencyPattern1);

  if (dependencyMatch1) {
    const dependentName = dependencyMatch1[1]?.trim();
    const dependencyName = dependencyMatch1[2]?.trim();

    if (isValidGid(dependentName)) {
      result.dependentTaskGid = dependentName;
    } else {
      result.dependentTaskName = dependentName;
    }

    if (isValidGid(dependencyName)) {
      result.dependencyTaskGid = dependencyName;
    } else {
      result.dependencyTaskName = dependencyName;
    }

    return result;
  }

  // Pattern: "add dependency from task A to task B"
  const dependencyPattern2 =
    /add\s+dependency\s+from\s+(?:task\s+)?["']?([^"']+?)["']?\s+to\s+(?:task\s+)?["']?([^"']+?)["']?/i;
  const dependencyMatch2 = input.match(dependencyPattern2);

  if (dependencyMatch2) {
    const dependencyName = dependencyMatch2[1]?.trim();
    const dependentName = dependencyMatch2[2]?.trim();

    if (isValidGid(dependentName)) {
      result.dependentTaskGid = dependentName;
    } else {
      result.dependentTaskName = dependentName;
    }

    if (isValidGid(dependencyName)) {
      result.dependencyTaskGid = dependencyName;
    } else {
      result.dependencyTaskName = dependencyName;
    }

    return result;
  }

  // Pattern: "remove dependency between A and B" or "remove dependency from A to B"
  const removeDependencyPattern =
    /remove\s+dependency\s+(?:between|from)\s+(?:task\s+)?["']?([^"']+?)["']?\s+(?:and|to)\s+(?:task\s+)?["']?([^"']+?)["']?/i;
  const removeDependencyMatch = input.match(removeDependencyPattern);

  if (removeDependencyMatch) {
    const firstTask = removeDependencyMatch[1]?.trim();
    const secondTask = removeDependencyMatch[2]?.trim();

    // For remove operations, we need context to determine which is dependent vs dependency
    // For now, assume first task is dependent, second is dependency
    if (isValidGid(firstTask)) {
      result.dependentTaskGid = firstTask;
    } else {
      result.dependentTaskName = firstTask;
    }

    if (isValidGid(secondTask)) {
      result.dependencyTaskGid = secondTask;
    } else {
      result.dependencyTaskName = secondTask;
    }

    return result;
  }

  // Try to extract project context
  const projectMatch = input.match(
    /(?:in|from)\s+(?:project\s+)?["']?([^"']+?)["']?\s*$/i,
  );
  if (projectMatch) {
    result.projectName = projectMatch[1]?.trim();
  }

  return result;
}

/**
 * Extract project and section identifiers for section operations.
 *
 * @param input The natural language input
 * @returns Object containing project and section identifiers
 */
export function extractProjectAndSectionIdentifiers(input: string): {
  projectGid?: string;
  projectName?: string;
  sectionGid?: string;
  sectionName?: string;
} {
  if (!input) return {};

  const result: {
    projectGid?: string;
    projectName?: string;
    sectionGid?: string;
    sectionName?: string;
  } = {};

  // Extract project information
  const projectInfo = extractProjectIdentifier(input);
  result.projectGid = projectInfo.gid;
  result.projectName = projectInfo.name;

  // Extract section information
  const sectionGidMatch = input.match(/section\s+(\d{16,})/i);
  if (sectionGidMatch) {
    result.sectionGid = sectionGidMatch[1];
  }

  const sectionNameMatch =
    input.match(/section\s*(?:named|called)?\s*["']([^"']+)["']/i) ||
    input.match(/["']([^"']+)["']\s*section/i) ||
    input.match(/(?:to|in|into)\s+["']([^"']+)["']/i);

  if (sectionNameMatch) {
    result.sectionName = sectionNameMatch[1];
  }

  return result;
}

/**
 * Extract section creation details from input.
 *
 * @param input The natural language input
 * @returns Object containing section name and project identifiers
 */
export function extractSectionCreationDetails(input: string): {
  projectGid?: string;
  projectName?: string;
  sectionName?: string;
} {
  if (!input) return {};

  const result: {
    projectGid?: string;
    projectName?: string;
    sectionName?: string;
  } = {};

  // Extract project information
  const projectInfo = extractProjectIdentifier(input);
  result.projectGid = projectInfo.gid;
  result.projectName = projectInfo.name;

  // Extract section name
  const sectionNameMatch =
    input.match(/section\s*(?:named|called)\s*["']([^"']+)["']/i) ||
    input.match(/["']([^"']+)["']\s*section/i) ||
    input.match(/(?:create|add|make)\s+(?:section\s+)?["']([^"']+)["']/i);

  if (sectionNameMatch) {
    result.sectionName = sectionNameMatch[1];
  }

  return result;
}

/**
 * Extract task and section identifiers for moving tasks to sections.
 *
 * @param input The natural language input
 * @returns Object containing task, section, and project identifiers
 */
export function extractTaskAndSectionIdentifiers(input: string): {
  taskGid?: string;
  taskName?: string;
  taskProjectName?: string;
  sectionGid?: string;
  sectionName?: string;
  sectionProjectName?: string;
} {
  if (!input) return {};

  const result: {
    taskGid?: string;
    taskName?: string;
    taskProjectName?: string;
    sectionGid?: string;
    sectionName?: string;
    sectionProjectName?: string;
  } = {};

  // Extract task information
  const taskInfo = extractTaskIdentifier(input);
  result.taskGid = taskInfo.gid;
  result.taskName = taskInfo.name;
  result.taskProjectName = taskInfo.projectName;

  // Extract section information
  const sectionGidMatch = input.match(/(?:to|in|into)\s+section\s+(\d{16,})/i);
  if (sectionGidMatch) {
    result.sectionGid = sectionGidMatch[1];
  }

  const sectionNameMatch =
    input.match(/(?:to|in|into)\s+section\s*["']([^"']+)["']/i) ||
    input.match(/(?:to|in|into)\s+["']([^"']+)["']\s*section/i) ||
    input.match(/section\s*["']([^"']+)["']/i);

  if (sectionNameMatch) {
    result.sectionName = sectionNameMatch[1];
  }

  // If we didn't find section name in the standard patterns, try to extract it from the remaining quoted strings
  if (!result.sectionName && !result.sectionGid) {
    const allQuotes = input.match(/["']([^"']+)["']/g);
    if (allQuotes && allQuotes.length >= 2) {
      // If we have multiple quoted strings and one is the task name, the other might be the section
      const potentialSectionName = allQuotes.find((quote) => {
        const quotedText = quote.slice(1, -1);
        return quotedText !== result.taskName;
      });
      if (potentialSectionName) {
        result.sectionName = potentialSectionName.slice(1, -1);
      }
    }
  }

  return result;
}

// Re-export utility functions from gidUtils for convenience
export { extractProjectGidFromInput, extractTaskGidFromInput, isValidGid };
