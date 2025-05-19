/**
 * Asana API Task operations
 */

import type { AsanaApiClient } from '../client';

/**
 * Parameters for creating a task
 */
export interface CreateTaskParams {
  /** Task name (required) */
  name: string;
  /** Workspace GID (required) */
  workspace: string;
  /** Task description/notes (optional) */
  notes?: string;
  /** Project GIDs to add the task to (optional) */
  projects?: string[];
  /** Assignee GID (optional) */
  assignee?: string;
  /** Due date in YYYY-MM-DD format (optional) */
  due_on?: string;
}

/**
 * Simplified type representing a task response from Asana API
 */
export interface TaskResponseData {
  gid: string;
  name: string;
  permalink_url?: string;
  notes?: string;
  due_on?: string;
  completed?: boolean;
  assignee?: {
    gid: string;
    name: string;
  };
  projects?: {
    gid: string;
    name: string;
  }[];
  created_at?: string;
  modified_at?: string;
}

/**
 * Parameters for listing tasks
 */
export interface ListTasksParams {
  /** Workspace GID (required) */
  workspace: string;
  /** Project GID to filter tasks by (optional) */
  project?: string;
  /** Assignee - can be 'me' for current user or a user GID (optional) */
  assignee?: string;
  /** Filter for completion status (optional) */
  completed_since?: string;
  /** Fields to include in the response */
  opt_fields?: string[];
}

/**
 * Create a new task in Asana
 *
 * @param apiClient Asana API client
 * @param params Task creation parameters
 * @param requestId Request ID for tracking
 * @returns Created task data
 */
export async function createTask(
  apiClient: AsanaApiClient,
  params: CreateTaskParams,
  requestId?: string,
): Promise<TaskResponseData> {
  // Validate required parameters
  if (!params.name) {
    throw new Error('Task name is required');
  }

  if (!params.workspace) {
    throw new Error('Workspace GID is required');
  }

  // Prepare task data
  const taskData: Record<string, any> = {
    name: params.name,
    workspace: params.workspace,
  };

  // Add optional parameters
  if (params.notes) taskData.notes = params.notes;
  if (params.projects && params.projects.length > 0) {
    taskData.projects = params.projects;
  }
  if (params.assignee) taskData.assignee = params.assignee;
  if (params.due_on) taskData.due_on = params.due_on;

  // Default fields to include in the response
  const opt_fields = [
    'name',
    'gid',
    'permalink_url',
    'projects.name',
    'assignee.name',
    'due_on',
    'notes',
  ];

  // Create the task
  try {
    return await apiClient.createResource<TaskResponseData>(
      'tasks',
      taskData,
      requestId,
    );
  } catch (error) {
    console.error(`[TaskOperations] Error creating task: ${error}`);
    throw error;
  }
}

/**
 * List tasks in Asana based on filters
 *
 * @param apiClient Asana API client
 * @param params Task listing parameters
 * @param requestId Request ID for tracking
 * @returns Array of task data
 */
export async function listTasks(
  apiClient: AsanaApiClient,
  params: ListTasksParams,
  requestId?: string,
): Promise<TaskResponseData[]> {
  // Validate required parameters
  if (!params.workspace && !params.project) {
    throw new Error('Either workspace or project GID is required');
  }

  // Prepare query parameters
  const queryParams: Record<string, string | string[]> = {};

  // Add filters
  if (params.workspace) queryParams.workspace = params.workspace;
  if (params.project) queryParams.project = params.project;
  if (params.assignee) queryParams.assignee = params.assignee;

  // Default to incomplete tasks unless otherwise specified
  if (params.completed_since) {
    queryParams.completed_since = params.completed_since;
  } else {
    queryParams.completed_since = 'now';
  }

  // Fields to include in the response
  queryParams.opt_fields = params.opt_fields || [
    'name',
    'gid',
    'permalink_url',
    'projects.name',
    'assignee.name',
    'due_on',
    'completed',
  ];

  // Make the request
  try {
    return await apiClient.request<TaskResponseData[]>(
      'tasks',
      'GET',
      undefined,
      queryParams,
      requestId,
    );
  } catch (error) {
    console.error(`[TaskOperations] Error listing tasks: ${error}`);
    throw error;
  }
}
