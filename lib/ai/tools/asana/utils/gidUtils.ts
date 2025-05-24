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

  // Match explicit task ID patterns like "Task ID: 1234567890123456", "Task: 1234567890123456", "(ID: 1234567890123456)"
  const explicitIdMatch = input.match(
    /(?:task\s*(?:id|gid)?|id)\s*[:()]?\s*(\d{16,19})\b/i,
  );
  if (explicitIdMatch) {
    return explicitIdMatch[1];
  }

  // Match parenthetical task IDs like "(Task ID: 1234567890123456)" or "(1234567890123456)"
  const parentheticalMatch = input.match(
    /\(\s*(?:task\s*(?:id|gid)?[:\s]*)?\s*(\d{16,19})\s*\)/i,
  );
  if (parentheticalMatch) {
    return parentheticalMatch[1];
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
  // console.log(`[gidUtils] Attempting to extract project GID from: "${input.substring(0, 100)}..."`);

  // 1. Highly specific match for "(Project ID: GID)"
  const specificParentheticalMatch = input.match(
    /\(Project ID:\s*(\d{16,19})\)/i,
  );
  if (specificParentheticalMatch) {
    // console.log(`[gidUtils] Matched specific (Project ID: GID) pattern: ${specificParentheticalMatch[1]}`);
    return specificParentheticalMatch[1];
  }

  // 2. Match Asana project URLs
  const urlMatch = input.match(/asana\.com\/(?:0|projects)\/(\d+)/i);
  if (urlMatch) {
    // console.log(`[gidUtils] Matched URL pattern: ${urlMatch[1]}`);
    return urlMatch[1];
  }

  // 3. Match explicit project ID patterns like "Project ID: 123...", "Project: 123..."
  // This pattern should not be too greedy with parentheses if they are handled by the parentheticalMatch.
  const explicitIdMatch = input.match(
    /(?:project\s*(?:id|gid)?|id)\s*[:=()]?\s*(\d{16,19})\b/i, // Adjusted to be less greedy on surrounding parens
  );
  if (explicitIdMatch) {
    // console.log(`[gidUtils] Matched explicit ID pattern: ${explicitIdMatch[1]}`);
    return explicitIdMatch[1];
  }

  // 4. General parenthetical project IDs like "(Project Name / ID: 123...)" or "(123...)"
  const generalParentheticalMatch = input.match(
    /\(\s*(?:project\s*(?:id|gid)?[:\s]*)?\s*(\d{16,19})\s*\)/i,
  );
  if (generalParentheticalMatch) {
    // console.log(`[gidUtils] Matched general parenthetical GID pattern: ${generalParentheticalMatch[1]}`);
    return generalParentheticalMatch[1];
  }

  // 5. Match standalone GID (numeric string of appropriate length)
  // Ensure it's not immediately preceded by "task" to avoid confusion.
  const gidMatch = input.match(
    /(?<!task\s*(?:id|gid)?\s*[:=(]?\s*)\b(\d{16,19})\b/i,
  );
  if (gidMatch) {
    // console.log(`[gidUtils] Matched standalone GID pattern: ${gidMatch[1]}`);
    return gidMatch[1];
  }
  // console.log('[gidUtils] No project GID pattern matched.');
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

  console.log(`[gidUtils] extractNamesFromInput called with: "${input}"`);

  let taskName: string | undefined;
  // Priority 1: Quoted string explicitly labeled as task or assignment
  const explicitTaskMatch =
    input.match(
      /(?:task|task named|task called|task titled)\s*["']([^"']+)["']/i,
    ) ||
    input.match(/["']([^"']+)["']\s*(?:task|assignment)/i) ||
    input.match(/(?:called|named|titled)\s*["']([^"']+)["']/i);
  if (explicitTaskMatch) {
    taskName = explicitTaskMatch[1];
    console.log(`[gidUtils] Found explicit task name: "${taskName}"`);
  } else {
    // Priority 2: A general quoted string, if no explicit task found yet.
    // This is broader. We try to avoid capturing project names that are quoted in context like "in project 'XYZ'".
    const generalQuotedMatch = input.match(/["']([^"']+)["']/);
    const potentialTaskNameFromGeneralMatch = generalQuotedMatch?.[1];

    if (potentialTaskNameFromGeneralMatch) {
      console.log(
        `[gidUtils] Found potential task name from general quote: "${potentialTaskNameFromGeneralMatch}"`,
      );
      // Check if this quoted string is part of a common project specification phrase
      const projectContextRegex = new RegExp(
        `(?:in|for|within|to)\\s+(?:the\\s+)?project\\s*["']${escapeRegex(
          potentialTaskNameFromGeneralMatch,
        )}["']`,
        'i',
      );
      const taskLabelContextRegex = new RegExp(
        `(?:called|named|titled)\\s*["']${escapeRegex(
          potentialTaskNameFromGeneralMatch,
        )}["']`,
        'i',
      );

      if (
        !projectContextRegex.test(input) &&
        !taskLabelContextRegex.test(input)
      ) {
        taskName = potentialTaskNameFromGeneralMatch;
        console.log(
          `[gidUtils] Using general quoted string as task name: "${taskName}"`,
        );
      } else {
        console.log(
          `[gidUtils] Rejected general quoted string as it's in project or task label context`,
        );
      }
    }
  }

  // Try to extract project name
  // Priority 1: Quoted project name after keywords like "in the 'Name' project"
  let projectMatch =
    input.match(
      /(?:in|for|within|to)\s+(?:the\s+)?["']([^\"']+)["']\s*project/i,
    ) || input.match(/project\s*["']([^\"']+)["']/i);
  let projectName = projectMatch?.[1];

  if (projectName) {
    console.log(`[gidUtils] Found quoted project name: "${projectName}"`);
  } else {
    console.log(
      `[gidUtils] No quoted project name found, trying unquoted patterns`,
    );
  }

  // Priority 2: Unquoted project name after keywords, assuming it's not just a short common word. Capture multi-word names.
  if (!projectName) {
    projectMatch = input.match(
      /(?:in|for|within|to)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s_-]*[A-Za-z0-9_()\s]+[A-Za-z0-9_()])\s+project(?=\s|$|\s*[(]|\s+(?:assign|due|with|and|notes|description|called))/i,
    );
    if (
      projectMatch?.[1] &&
      projectMatch[1].toLowerCase() !== taskName?.toLowerCase()
    ) {
      projectName = projectMatch[1].trim();
      console.log(
        `[gidUtils] Found unquoted multi-word project name: "${projectName}"`,
      );
    } else if (projectMatch?.[1]) {
      console.log(
        `[gidUtils] Rejected unquoted project name as it matches task name: "${projectMatch[1]}"`,
      );
    } else {
      console.log(`[gidUtils] No unquoted multi-word project name found`);
    }
  }

  // Priority 3: Unquoted project name that might be a single, capitalized word (common for project names)
  // after keywords, if not already captured.
  if (!projectName) {
    projectMatch = input.match(
      /(?:in|for|within|to)\s+(?:the\s+)?([A-Z][A-Za-z0-9_-]+)\s+project(?=\s|$|\s*[(]|\s+(?:assign|due|with|and|notes|description|called))/i,
    );
    if (
      projectMatch?.[1] &&
      projectMatch[1].toLowerCase() !== taskName?.toLowerCase()
    ) {
      projectName = projectMatch[1].trim();
      console.log(
        `[gidUtils] Found unquoted single-word project name: "${projectName}"`,
      );
    } else if (projectMatch?.[1]) {
      console.log(
        `[gidUtils] Rejected unquoted single-word project name as it matches task name: "${projectMatch[1]}"`,
      );
    } else {
      console.log(`[gidUtils] No unquoted single-word project name found`);
    }
  }

  console.log(
    `[gidUtils] Final extraction results: taskName="${taskName}", projectName="${projectName}"`,
  );

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
