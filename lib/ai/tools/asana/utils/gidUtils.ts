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

  // Try to extract task name (quoted or following task-related keywords)
  const taskMatch =
    input.match(
      /(?:task|task named|task called|task titled)\s*["']([^"']+)["']/i,
    ) || input.match(/["']([^"']+)["']\s*(?:task|assignment)/i);

  // Try to extract project name (quoted and following project-related keywords)
  const projectMatch =
    input.match(
      /(?:in|for|within)\s+(?:project|the project)\s*["']([^"']+)["']/i,
    ) || input.match(/project\s*["']([^"']+)["']/i);

  // Try to extract workspace name (quoted and following workspace-related keywords)
  const workspaceMatch =
    input.match(
      /(?:in|for|within)\s+(?:workspace|the workspace)\s*["']([^"']+)["']/i,
    ) || input.match(/workspace\s*["']([^"']+)["']/i);

  return {
    taskName: taskMatch?.[1],
    projectName: projectMatch?.[1],
    workspaceName: workspaceMatch?.[1],
  };
}
