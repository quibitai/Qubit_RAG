/**
 * Asana API Project operations
 */

import type { AsanaApiClient } from '../client';

/**
 * Parameters for creating a project
 */
export interface CreateProjectParams {
  /** Project name (required) */
  name: string;
  /** Workspace GID (required) */
  workspace: string;
  /** Team GID (required for organizations) */
  team?: string;
  /** Project description/notes (optional) */
  notes?: string;
  /** Project color (optional) */
  color?: string;
  /** Project owner GID (optional) */
  owner?: string;
  /**
   * Privacy setting for the project (optional)
   * Defaults to 'public_to_workspace' to ensure public visibility
   */
  privacy_setting?: 'public_to_workspace' | 'private_to_team' | 'private';
  /**
   * Deprecated public flag (optional)
   * Defaults to true for backward compatibility
   */
  public?: boolean;
  /** Due date for the project in YYYY-MM-DD format (optional) */
  due_on?: string;
  /** Start date for the project in YYYY-MM-DD format (optional) */
  start_on?: string;
}

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
  archived = false,
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

/**
 * Create a new project in Asana with public visibility by default
 *
 * @param apiClient Asana API client
 * @param params Project creation parameters
 * @param requestId Request ID for tracking
 * @returns Created project data
 */
export async function createProject(
  apiClient: AsanaApiClient,
  params: CreateProjectParams,
  requestId?: string,
): Promise<ProjectResponseData> {
  // Validate required parameters
  if (!params.name) {
    throw new Error('Project name is required');
  }

  if (!params.workspace) {
    throw new Error('Workspace GID is required');
  }

  // Prepare project data with public visibility defaults
  const projectData: Record<string, any> = {
    name: params.name,
    workspace: params.workspace,
    // Default to public visibility
    privacy_setting: params.privacy_setting || 'public_to_workspace',
    public: params.public !== undefined ? params.public : true,
  };

  // Add optional parameters
  if (params.team) projectData.team = params.team;
  if (params.notes) projectData.notes = params.notes;
  if (params.color) projectData.color = params.color;
  if (params.owner) projectData.owner = params.owner;
  if (params.due_on) projectData.due_on = params.due_on;
  if (params.start_on) projectData.start_on = params.start_on;

  // Default fields to include in the response
  const opt_fields = [
    'name',
    'gid',
    'permalink_url',
    'team.name',
    'privacy_setting',
    'public',
    'notes',
    'color',
    'due_on',
    'start_on',
  ];

  // Create the project
  try {
    console.log(
      `[ProjectOperations] [${requestId || 'no-id'}] Creating project "${params.name}" with public visibility (privacy_setting: ${projectData.privacy_setting}, public: ${projectData.public})`,
    );

    return await apiClient.createResource<ProjectResponseData>(
      'projects',
      projectData,
      requestId,
    );
  } catch (error) {
    console.error(`[ProjectOperations] Error creating project: ${error}`);
    throw error;
  }
}

/**
 * Verify if a project is set to public visibility
 *
 * @param apiClient Asana API client
 * @param projectGid Project GID to check
 * @param requestId Request ID for tracking
 * @returns Object indicating if project is public and details
 */
export async function verifyProjectVisibility(
  apiClient: AsanaApiClient,
  projectGid: string,
  requestId?: string,
): Promise<{
  isPublic: boolean;
  privacySetting?: string;
  publicFlag?: boolean;
  details: string;
}> {
  if (!projectGid) {
    throw new Error('Project GID is required to verify visibility');
  }

  try {
    console.log(
      `[ProjectOperations] [${requestId || 'no-id'}] Verifying visibility for project ${projectGid}`,
    );

    const projectData = await apiClient.request<any>(
      `projects/${projectGid}`,
      'GET',
      undefined,
      { opt_fields: 'privacy_setting,public,name' },
      requestId,
    );

    const privacySetting = projectData.privacy_setting;
    const publicFlag = projectData.public;

    // Determine if project is public based on available fields
    let isPublic = false;
    let details = '';

    if (privacySetting) {
      isPublic = privacySetting === 'public_to_workspace';
      details = `Privacy setting: ${privacySetting}`;
    } else if (publicFlag !== undefined) {
      isPublic = publicFlag;
      details = `Public flag: ${publicFlag}`;
    } else {
      details = 'Unable to determine privacy settings';
    }

    console.log(
      `[ProjectOperations] [${requestId || 'no-id'}] Project "${projectData.name}" visibility check: ${details}, isPublic: ${isPublic}`,
    );

    return {
      isPublic,
      privacySetting,
      publicFlag,
      details,
    };
  } catch (error) {
    console.error(
      `[ProjectOperations] Error verifying project visibility: ${error}`,
    );
    throw error;
  }
}

/**
 * Get detailed information about a specific project
 *
 * @param apiClient Asana API client
 * @param projectGid Project GID to get details for
 * @param requestId Request ID for tracking
 * @returns Detailed project information
 */
export async function getProjectDetails(
  apiClient: AsanaApiClient,
  projectGid: string,
  requestId?: string,
): Promise<
  ProjectResponseData & {
    notes?: string;
    owner?: { gid: string; name: string };
    members?: Array<{ gid: string; name: string }>;
    followers?: Array<{ gid: string; name: string }>;
    workspace?: { gid: string; name: string };
    privacy_setting?: string;
    public?: boolean;
    start_on?: string;
    due_on?: string;
    created_by?: { gid: string; name: string };
    modified_at?: string;
    icon?: string;
    default_view?: string;
    completed?: boolean;
    completed_at?: string;
    completed_by?: { gid: string; name: string };
  }
> {
  // Validate required parameters
  if (!projectGid) {
    throw new Error('Project GID is required');
  }

  // Prepare query parameters with comprehensive opt_fields
  const queryParams: Record<string, string | string[]> = {
    opt_fields: [
      'name',
      'gid',
      'permalink_url',
      'archived',
      'color',
      'notes',
      'team.name',
      'team.gid',
      'owner.name',
      'owner.gid',
      'members.name',
      'members.gid',
      'followers.name',
      'followers.gid',
      'workspace.name',
      'workspace.gid',
      'privacy_setting',
      'public',
      'created_at',
      'modified_at',
      'created_by.name',
      'created_by.gid',
      'current_status.title',
      'current_status.color',
      'current_status.text',
      'current_status.author.name',
      'current_status.created_at',
      'due_date',
      'due_on',
      'start_on',
      'icon',
      'default_view',
      'completed',
      'completed_at',
      'completed_by.name',
      'completed_by.gid',
    ],
  };

  // Make the request
  try {
    console.log(
      `[ProjectOperations] [${requestId || 'no-id'}] Getting details for project: ${projectGid}`,
    );

    const projectDetails = await apiClient.request<
      ProjectResponseData & {
        notes?: string;
        owner?: { gid: string; name: string };
        members?: Array<{ gid: string; name: string }>;
        followers?: Array<{ gid: string; name: string }>;
        workspace?: { gid: string; name: string };
        privacy_setting?: string;
        public?: boolean;
        start_on?: string;
        due_on?: string;
        created_by?: { gid: string; name: string };
        modified_at?: string;
        icon?: string;
        default_view?: string;
        completed?: boolean;
        completed_at?: string;
        completed_by?: { gid: string; name: string };
      }
    >(`projects/${projectGid}`, 'GET', undefined, queryParams, requestId);

    console.log(
      `[ProjectOperations] [${requestId || 'no-id'}] Successfully retrieved details for project: ${projectDetails.name} (${projectGid})`,
    );

    return projectDetails;
  } catch (error) {
    console.error(
      `[ProjectOperations] [${requestId || 'no-id'}] Error getting project details for ${projectGid}: ${error}`,
    );
    throw error;
  }
}
