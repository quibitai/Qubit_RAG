/**
 * Asana integration configuration
 */

// API key retrieval from environment variables
export const ASANA_PAT =
  global.CURRENT_TOOL_CONFIGS?.nativeAsana?.apiKey ||
  process.env.NATIVE_ASANA_PAT ||
  process.env.ASANA_PAT;

// Default workspace and team GIDs
export const ASANA_DEFAULT_WORKSPACE_GID =
  global.CURRENT_TOOL_CONFIGS?.nativeAsana?.defaultWorkspaceGid ||
  process.env.ASANA_DEFAULT_WORKSPACE_GID;

export const ASANA_DEFAULT_TEAM_GID =
  global.CURRENT_TOOL_CONFIGS?.nativeAsana?.defaultTeamGid ||
  process.env.ASANA_DEFAULT_TEAM_GID;

// Request timeout in milliseconds
export const ASANA_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.NATIVE_ASANA_TIMEOUT_MS || '30000',
  10,
);

/**
 * Get the configured workspace GID
 *
 * @returns The configured workspace GID or undefined if not configured
 */
export function getWorkspaceGid(): string | undefined {
  return ASANA_DEFAULT_WORKSPACE_GID === 'undefined' ||
    !ASANA_DEFAULT_WORKSPACE_GID
    ? undefined
    : ASANA_DEFAULT_WORKSPACE_GID;
}

/**
 * Get the configured team GID
 *
 * @returns The configured team GID or undefined if not configured
 */
export function getTeamGid(): string | undefined {
  return ASANA_DEFAULT_TEAM_GID === 'undefined' || !ASANA_DEFAULT_TEAM_GID
    ? undefined
    : ASANA_DEFAULT_TEAM_GID;
}

// Validation and warnings
if (!ASANA_PAT) {
  console.warn(
    'Asana PAT not found in environment variables or client configuration. Asana tool will not function properly.',
  );
}

if (!ASANA_DEFAULT_WORKSPACE_GID) {
  console.warn(
    'Default Asana Workspace GID not found. Some operations will require explicit workspace specification.',
  );
}
