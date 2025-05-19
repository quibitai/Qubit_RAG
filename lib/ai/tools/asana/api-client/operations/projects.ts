/**
 * Asana API Project operations
 */

import type { AsanaApiClient } from '../client';

/**
 * Simplified type representing a project response from Asana API
 */
export interface ProjectResponseData {
  gid: string;
  name: string;
  permalink_url?: string;
  archived?: boolean;
  color?: string;
  team?: {
    gid: string;
    name: string;
  };
  created_at?: string;
  modified_at?: string;
  current_status?: {
    title: string;
    color: string;
  };
  due_date?: string;
}

/**
 * List projects in an Asana workspace
 *
 * @param apiClient Asana API client
 * @param workspaceGid Workspace GID
 * @param archived Whether to include archived projects (default: false)
 * @param requestId Request ID for tracking
 * @returns Array of project data
 */
export async function listProjects(
  apiClient: AsanaApiClient,
  workspaceGid: string,
  archived: boolean = false,
  requestId?: string,
): Promise<ProjectResponseData[]> {
  // Validate required parameters
  if (!workspaceGid) {
    throw new Error('Workspace GID is required');
  }

  // Prepare query parameters
  const queryParams: Record<string, string | string[]> = {
    workspace: workspaceGid,
    archived: String(archived),
    opt_fields: [
      'name',
      'gid',
      'permalink_url',
      'archived',
      'color',
      'team.name',
      'created_at',
      'current_status.title',
      'current_status.color',
      'due_date',
    ],
  };

  // Make the request
  try {
    return await apiClient.request<ProjectResponseData[]>(
      'projects',
      'GET',
      undefined,
      queryParams,
      requestId,
    );
  } catch (error) {
    console.error(`[ProjectOperations] Error listing projects: ${error}`);
    throw error;
  }
}

/**
 * Find a project GID by its name in a workspace
 * Uses the typeahead API to search for projects
 *
 * @param apiClient Asana API client
 * @param projectName Project name to search for
 * @param workspaceGid Workspace GID to search in
 * @param requestId Request ID for tracking
 * @returns Project GID if found, 'ambiguous' if multiple matches, undefined if not found
 */
export async function findProjectGidByName(
  apiClient: AsanaApiClient,
  projectName: string,
  workspaceGid: string,
  requestId?: string,
): Promise<string | 'ambiguous' | undefined> {
  // Validate required parameters
  if (!projectName || !workspaceGid) {
    throw new Error('Project name and workspace GID are required');
  }

  // Convert to lowercase for case-insensitive comparison
  const searchName = projectName.toLowerCase();

  // Prepare query parameters for typeahead endpoint
  const queryParams: Record<string, string | string[]> = {
    resource_type: 'project',
    query: projectName,
    opt_fields: ['name', 'gid'],
  };

  // Make the request
  try {
    console.log(
      `[ProjectOperations] [${requestId || 'no-id'}] Searching for project: "${projectName}" in workspace ${workspaceGid}`,
    );

    const results = await apiClient.request<
      { gid: string; name: string; resource_type: string }[]
    >(
      `workspaces/${workspaceGid}/typeahead`,
      'GET',
      undefined,
      queryParams,
      requestId,
    );

    if (!Array.isArray(results) || results.length === 0) {
      console.log(
        `[ProjectOperations] [${requestId || 'no-id'}] No projects found matching "${projectName}"`,
      );
      return undefined;
    }

    // Look for an exact match first
    const exactMatch = results.find(
      (project) => project.name.toLowerCase() === searchName,
    );

    if (exactMatch) {
      console.log(
        `[ProjectOperations] [${requestId || 'no-id'}] Found exact match for project "${projectName}": ${exactMatch.gid}`,
      );
      return exactMatch.gid;
    }

    // If multiple potential matches but no exact match
    if (results.length > 1) {
      console.log(
        `[ProjectOperations] [${requestId || 'no-id'}] Found multiple potential matches for project "${projectName}": ${results.map((p) => p.name).join(', ')}`,
      );
      return 'ambiguous';
    }

    // If only one result but not an exact match, return it
    console.log(
      `[ProjectOperations] [${requestId || 'no-id'}] Found one potential match for project "${projectName}": ${results[0].name} (${results[0].gid})`,
    );
    return results[0].gid;
  } catch (error) {
    console.error(
      `[ProjectOperations] Error finding project by name: ${error}`,
    );
    throw error;
  }
}
