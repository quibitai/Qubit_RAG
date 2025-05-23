/**
 * Utility functions for working with Asana GIDs (Global IDs)
 */

/**
 * Extract a task GID from an Asana URL or direct GID string
 *
 * @param input A string that might contain an Asana URL or task GID
 * @returns The extracted task GID or undefined if not found
 */
export function extractTaskGidFromInput(input: string): string | undefined {
  if (!input) return undefined;

  // Match Asana task URLs (both old and new formats)
  const urlMatch = input.match(/asana\.com\/(?:0|tasks)\/(?:\d+|me)\/(\d+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Match standalone GID (numeric string of appropriate length)
  const gidMatch = input.match(/\b(\d{16,19})\b/);
  if (gidMatch) {
    return gidMatch[1];
  }

  return undefined;
}

/**
 * Extract project GID from an Asana URL or direct GID string
 *
 * @param input A string that might contain an Asana project URL or project GID
 * @returns The extracted project GID or undefined if not found
 */
export function extractProjectGidFromInput(input: string): string | undefined {
  if (!input) return undefined;

  // Match Asana project URLs
  const urlMatch = input.match(/asana\.com\/(?:0|projects)\/(\d+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Match standalone GID (numeric string of appropriate length)
  const gidMatch = input.match(/\b(\d{16,19})\b/);
  if (gidMatch) {
    return gidMatch[1];
  }

  return undefined;
}

/**
 * Validate that a string is likely a valid Asana GID
 *
 * @param gid The GID string to validate
 * @returns boolean indicating if the GID appears valid
 */
export function isValidGid(gid: string): boolean {
  // Asana GIDs are typically 16-19 digit numbers
  return /^\d{16,19}$/.test(gid);
}

/**
 * Extract resource names from a natural language input
 *
 * @param input Natural language input that might contain task, project, or workspace names
 * @returns Object containing extracted names or undefined if not found
 */
export function extractNamesFromInput(input: string): {
  taskName?: string;
  projectName?: string;
  workspaceName?: string;
} {
  if (!input) return {};

  let taskName: string | undefined;
  // Priority 1: Quoted string explicitly labeled as task or assignment
  const explicitTaskMatch =
    input.match(
      /(?:task|task named|task called|task titled)\s*["']([^"']+)["']/i,
    ) || input.match(/["']([^"']+)["']\s*(?:task|assignment)/i);
  if (explicitTaskMatch) {
    taskName = explicitTaskMatch[1];
  } else {
    // Priority 2: A general quoted string, if no explicit task found yet.
    // This is broader. We try to avoid capturing project names that are quoted in context like "in project 'XYZ'".
    const generalQuotedMatch = input.match(/["']([^"']+)["']/);
    const potentialTaskNameFromGeneralMatch = generalQuotedMatch?.[1];

    if (potentialTaskNameFromGeneralMatch) {
      // Check if this quoted string is part of a common project specification phrase
      const projectContextRegex = new RegExp(
        `(?:in|for|within|to)\s+(?:the\s+)?project\s*["']${escapeRegex(
          potentialTaskNameFromGeneralMatch,
        )}["']`,
        'i',
      );
      if (!projectContextRegex.test(input)) {
        taskName = potentialTaskNameFromGeneralMatch;
      }
    }
  }

  // Try to extract project name
  // Priority 1: Quoted project name after keywords like "in project 'Name'"
  let projectMatch =
    input.match(
      /(?:in|for|within|to)\s+(?:the\s+)?project\s*["']([^\"']+)["']/i,
    ) || input.match(/project\s*["']([^\"']+)["']/i);
  let projectName = projectMatch?.[1];

  // Priority 2: Unquoted project name after keywords, assuming it's not just a short common word. Capture multi-word names.
  if (!projectName) {
    projectMatch = input.match(
      /(?:in|for|within|to)\s+(?:the\s+)?project\s+([A-Z][A-Za-z0-9\s_-]*[A-Za-z0-9])(?=\s|$|\s+(?:assign|due|with|and|notes|description))/i,
    );
    if (
      projectMatch?.[1] &&
      projectMatch[1].toLowerCase() !== taskName?.toLowerCase()
    ) {
      projectName = projectMatch[1].trim();
    }
  }

  // Priority 3: Unquoted project name that might be a single, capitalized word (common for project names)
  // after "project" keyword, if not already captured.
  if (!projectName) {
    projectMatch = input.match(
      /(?:in|for|within|to)\s+(?:the\s+)?project\s+([A-Z][A-Za-z0-9_-]+)/i,
    );
    if (
      projectMatch?.[1] &&
      projectMatch[1].toLowerCase() !== taskName?.toLowerCase()
    ) {
      projectName = projectMatch[1].trim();
    }
  }

  // If a task name was found and part of it looks like "in project X", remove that from task name.
  if (taskName && projectName) {
    const taskNameLower = taskName.toLowerCase();
    const projectNameInTaskLower = `in project ${projectName.toLowerCase()}`;
    const forProjectNameInTaskLower = `for project ${projectName.toLowerCase()}`;
    if (taskNameLower.includes(projectNameInTaskLower)) {
      taskName = taskName
        .replace(new RegExp(`in project ${escapeRegex(projectName)}`, 'i'), '')
        .trim();
    } else if (taskNameLower.includes(forProjectNameInTaskLower)) {
      taskName = taskName
        .replace(new RegExp(`for project ${escapeRegex(projectName)}`, 'i'), '')
        .trim();
    }
    // Remove trailing prepositions if any remain after stripping project context
    taskName = taskName
      .replace(/\s+(?:in|for|with|to|assign|due)$/i, '')
      .trim();
    // Remove surrounding quotes if they are now at the very start/end of a cleaned task name
    if (
      (taskName.startsWith('"') && taskName.endsWith('"')) ||
      (taskName.startsWith("'") && taskName.endsWith("'"))
    ) {
      taskName = taskName.substring(1, taskName.length - 1);
    }
  }

  // Try to extract workspace name (quoted and following workspace-related keywords)
  const workspaceMatch =
    input.match(
      /(?:in|for|within)\s+(?:workspace|the workspace)\s*["']([^"']+)["']/i,
    ) || input.match(/workspace\s*["']([^"']+)["']/i);

  return {
    taskName: taskName,
    projectName: projectName,
    workspaceName: workspaceMatch?.[1],
  };
}

/**
 * Helper to escape regex special characters in a string
 */
function escapeRegex(string: string): string {
  return string.replace(/[\.*+?^${}()|[\]\\]/g, '$&');
}
