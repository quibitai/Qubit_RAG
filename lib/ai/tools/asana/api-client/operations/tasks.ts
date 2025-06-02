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
  /** Parent task GID for creating a subtask (optional) */
  parent?: string;
  /**
   * IMPORTANT: Task visibility is determined by the projects they're added to.
   * The Asana API does not provide direct control over task-level visibility.
   * To ensure tasks are public, they must be added to verified public projects.
   */
}

/**
 * Simplified type representing a task response from Asana API
 */
export interface TaskResponseData {
  gid: string;
  name: string;
  permalink_url?: string;
  notes?: string;
  html_notes?: string;
  due_on?: string;
  due_at?: string;
  start_on?: string;
  start_at?: string;
  completed?: boolean;
  resource_subtype?: string;
  assignee?: {
    gid: string;
    name: string;
    resource_type?: string;
  };
  projects?: {
    gid: string;
    name: string;
    resource_type?: string;
  }[];
  parent?: {
    gid: string;
    name: string;
    resource_type?: string;
    permalink_url?: string;
  };
  followers?: {
    gid: string;
    name: string;
    resource_type?: string;
  }[];
  tags?: {
    gid: string;
    name: string;
    resource_type?: string;
  }[];
  workspace?: {
    gid: string;
    name: string;
    resource_type?: string;
  };
  num_subtasks?: number;
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
  if (params.parent) taskData.parent = params.parent;

  // Debug logging
  console.log(
    `[TaskOperations] [${requestId}] Creating task with data:`,
    JSON.stringify(taskData, null, 2),
  );

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
    console.error(
      `[TaskOperations] Task data that failed:`,
      JSON.stringify(taskData, null, 2),
    );
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
  // If project is specified, it implies the workspace.
  if (params.project) {
    queryParams.project = params.project;
    // If assignee is also specified, add it for filtering within the project.
    if (params.assignee) {
      queryParams.assignee = params.assignee;
    }
  } else if (params.workspace) {
    // If no project, use workspace (especially for assignee-focused queries)
    queryParams.workspace = params.workspace;
    if (params.assignee) {
      queryParams.assignee = params.assignee;
    }
  } else {
    // This case should ideally be caught by the initial validation,
    // but as a safeguard:
    throw new Error(
      'Insufficient parameters to list tasks. Provide project or workspace/assignee.',
    );
  }

  // Set completed_since only if explicitly provided in params
  if (params.completed_since) {
    queryParams.completed_since = params.completed_since;
  }
  // If not provided, Asana's default behavior for listing tasks will apply,
  // which typically prioritizes incomplete tasks or tasks relevant to "My Tasks".

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
    const tasksResponse = await apiClient.request<TaskResponseData[]>(
      'tasks',
      'GET',
      undefined,
      queryParams,
      requestId,
    );
    // Log the raw response from Asana API
    console.log(
      `[TaskOperations] [${requestId}] Raw Asana response for listTasks:`,
      JSON.stringify(tasksResponse, null, 2),
    );
    return tasksResponse;
  } catch (error) {
    console.error(`[TaskOperations] Error listing tasks: ${error}`);
    throw error;
  }
}

/**
 * Get details for a specific task in Asana
 *
 * @param apiClient Asana API client
 * @param taskGid GID of the task to retrieve
 * @param opt_fields Optional array of fields to include in the response
 * @param requestId Request ID for tracking
 * @returns Task data
 */
export async function getTaskDetails(
  apiClient: AsanaApiClient,
  taskGid: string,
  opt_fields?: string[],
  requestId?: string,
): Promise<TaskResponseData> {
  if (!taskGid) {
    throw new Error('Task GID is required to get task details.');
  }

  const default_opt_fields = [
    'name',
    'gid',
    'notes',
    'html_notes',
    'permalink_url',
    'due_on',
    'due_at',
    'start_on',
    'start_at',
    'completed',
    'resource_subtype',
    'assignee',
    'assignee.name',
    'assignee.email',
    'assignee.resource_type',
    'projects',
    'projects.name',
    'projects.resource_type',
    'parent',
    'parent.name',
    'parent.resource_type',
    'parent.permalink_url',
    'created_at',
    'modified_at',
    'followers',
    'followers.name',
    'followers.resource_type',
    'tags',
    'tags.name',
    'tags.resource_type',
    'workspace',
    'workspace.name',
    'workspace.resource_type',
    'num_subtasks',
    // Consider adding 'custom_fields' if there's a generic way to handle/display them,
    // or if specific common custom fields are known.
    // For now, omitting to keep default payload reasonable.
  ];

  const queryParams: Record<string, string | string[]> = {
    opt_fields: opt_fields || default_opt_fields,
  };

  try {
    return await apiClient.request<TaskResponseData>(
      `tasks/${taskGid}`,
      'GET',
      undefined,
      queryParams,
      requestId,
    );
  } catch (error) {
    console.error(
      `[TaskOperations] Error getting task details for GID ${taskGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Result type for findTaskGidByName to handle ambiguity
 */
export type FindTaskResult =
  | { type: 'found'; gid: string; name: string }
  | { type: 'not_found' }
  | { type: 'ambiguous'; message: string };

/**
 * Find a task GID by its name, optionally within a specific project or workspace.
 * Handles ambiguity by returning specific result types.
 *
 * @param apiClient Asana API client
 * @param taskName Name of the task to find
 * @param workspaceGid GID of the workspace to search within (required)
 * @param projectGid Optional GID of the project to search within first
 * @param includeCompleted Whether to include completed tasks in the search
 * @param requestId Optional request ID for tracking
 * @returns FindTaskResult indicating whether the task was found, not found, or if the name is ambiguous.
 */
export async function findTaskGidByName(
  apiClient: AsanaApiClient,
  taskName: string,
  workspaceGid: string,
  projectGid?: string,
  includeCompleted = false,
  requestId?: string,
): Promise<FindTaskResult> {
  if (!taskName) {
    throw new Error('Task name is required to find by name.');
  }
  if (!workspaceGid) {
    throw new Error('Workspace GID is required to find task by name.');
  }

  let partialTypeaheadMatches: TaskResponseData[] = []; // Initialize with let and type

  const commonOptFields = [
    'name',
    'gid',
    'completed',
    'permalink_url',
    'projects.name',
  ];

  // 1. Search within the project if projectGid is provided
  if (projectGid) {
    try {
      const projectTasks = await apiClient.request<TaskResponseData[]>(
        `projects/${projectGid}/tasks`,
        'GET',
        undefined,
        { opt_fields: [...commonOptFields, 'name'] },
        requestId,
      );
      const matchingTasks = projectTasks.filter(
        (task) =>
          task.name.toLowerCase() === taskName.toLowerCase() &&
          (includeCompleted ? true : !task.completed),
      );

      if (matchingTasks.length === 1) {
        return {
          type: 'found',
          gid: matchingTasks[0].gid,
          name: matchingTasks[0].name,
        };
      }
      if (matchingTasks.length > 1) {
        const options = matchingTasks
          .map((task) => `- "${task.name}" (GID: ${task.gid})`)
          .join('\n');
        return {
          type: 'ambiguous',
          message: `Multiple tasks named "${taskName}" found in the specified project. Please provide a GID or be more specific:\n${options}`,
        };
      }
      // If not found in project, will proceed to workspace search strategies
    } catch (error) {
      console.warn(
        `[TaskOperations] Error searching for task "${taskName}" in project ${projectGid}: ${error}. Will try other search methods.`,
      );
    }
  }

  // 2. Search using workspace typeahead
  try {
    const typeaheadResults = await apiClient.request<TaskResponseData[]>(
      `workspaces/${workspaceGid}/typeahead`,
      'GET',
      undefined,
      {
        resource_type: 'task',
        query: taskName,
        opt_fields: [...commonOptFields, 'name', 'completed'],
        count: '10', // Increased count slightly for better chance
      },
      requestId,
    );

    const exactMatchesTypeahead = typeaheadResults.filter(
      (task) =>
        task.name.toLowerCase() === taskName.toLowerCase() &&
        (includeCompleted ? true : !task.completed),
    );

    if (exactMatchesTypeahead.length === 1) {
      return {
        type: 'found',
        gid: exactMatchesTypeahead[0].gid,
        name: exactMatchesTypeahead[0].name,
      };
    }
    if (exactMatchesTypeahead.length > 1) {
      const options = exactMatchesTypeahead
        .map(
          (task) =>
            `- "${task.name}" (GID: ${task.gid}) in project(s): ${task.projects?.map((p) => p.name).join(', ') || 'N/A'}`,
        )
        .join('\n');
      return {
        type: 'ambiguous',
        message: `Multiple tasks named "${taskName}" found via typeahead. Please clarify by GID or provide more project context:\n${options}`,
      };
    }
    // If typeahead found no exact matches, and no projectGid was specified,
    // consider its partial matches *after* trying general text search if projectGid was not specified.
    // Store partials for now if projectGid was not specified.
    if (
      !projectGid &&
      typeaheadResults.length > 0 &&
      exactMatchesTypeahead.length === 0
    ) {
      partialTypeaheadMatches = typeaheadResults;
    }
  } catch (error) {
    console.warn(
      `[TaskOperations] Error using typeahead for task "${taskName}" in workspace ${workspaceGid}: ${error}. Will try general text search if applicable.`,
    );
    // partialTypeaheadMatches remains [] if an error occurs here before it's assigned
  }

  // 3. Fallback: If no projectGid was specified and typeahead didn't find a unique exact match,
  if (!projectGid) {
    try {
      console.log(
        `[TaskOperations] Typeahead failed for "${taskName}", trying general text search in workspace ${workspaceGid}.`,
      );
      const generalSearchResults = await apiClient.request<TaskResponseData[]>(
        'tasks', // GET /tasks
        'GET',
        undefined,
        {
          workspace: workspaceGid,
          text: taskName,
          opt_fields: [...commonOptFields, 'name', 'completed'],
        },
        requestId,
      );

      const exactMatchesGeneral = generalSearchResults.filter(
        (task) =>
          task.name.toLowerCase() === taskName.toLowerCase() &&
          (includeCompleted ? true : !task.completed),
      );

      if (exactMatchesGeneral.length === 1) {
        return {
          type: 'found',
          gid: exactMatchesGeneral[0].gid,
          name: exactMatchesGeneral[0].name,
        };
      }
      if (exactMatchesGeneral.length > 1) {
        const options = exactMatchesGeneral
          .map(
            (task) =>
              `- "${task.name}" (GID: ${task.gid}) in project(s): ${task.projects?.map((p) => p.name).join(', ') || 'N/A'}`,
          )
          .join('\n');
        return {
          type: 'ambiguous',
          message: `Multiple tasks named "${taskName}" found via general search in workspace. Please clarify by GID or provide more project context:\n${options}`,
        };
      }
    } catch (error) {
      console.error(
        `[TaskOperations] Error using general text search for task "${taskName}" in workspace ${workspaceGid}: ${error}`,
      );
      // Fall through, to potentially use partial typeahead results or return not_found
    }
  }

  // 4. Handle ambiguous partial matches from typeahead if all else failed and no projectGid was specified
  if (!projectGid && partialTypeaheadMatches.length > 0) {
    // No need to check for null/undefined due to initialization
    const filteredPartials = partialTypeaheadMatches.filter((task) =>
      includeCompleted ? true : !task.completed,
    );
    if (filteredPartials.length > 0) {
      const partialOptions = filteredPartials
        .map(
          (task) =>
            `- "${task.name}" (GID: ${task.gid}) in project(s): ${task.projects?.map((p) => p.name).join(', ') || 'N/A'}`,
        )
        .join('\n');
      return {
        type: 'ambiguous',
        message: `No exact match for task "${taskName}". Did you mean one of these tasks?
${partialOptions}`,
      };
    }
  }

  return { type: 'not_found' };
}

/**
 * Parameters for updating a task.
 * Initially, only supports notes, but can be expanded.
 */
export interface UpdateTaskParams {
  notes?: string;
  completed?: boolean;
  due_on?: string;
  due_at?: string;
  // Future fields: name?: string; assignee?: string; etc.
}

/**
 * Update specific fields of a task in Asana.
 *
 * @param apiClient Asana API client
 * @param taskGid GID of the task to update
 * @param dataToUpdate Object containing fields to update (e.g., { notes: "new description" })
 * @param requestId Optional request ID for tracking
 * @returns Updated task data
 */
export async function updateTask(
  apiClient: AsanaApiClient,
  taskGid: string,
  dataToUpdate: UpdateTaskParams,
  requestId?: string,
): Promise<TaskResponseData> {
  if (!taskGid) {
    throw new Error('Task GID is required to update a task.');
  }
  if (Object.keys(dataToUpdate).length === 0) {
    throw new Error('No data provided to update the task.');
  }

  // Ensure that only supported fields are passed
  const validData: Record<string, any> = {};
  if (dataToUpdate.notes !== undefined) {
    validData.notes = dataToUpdate.notes;
  }
  if (dataToUpdate.completed !== undefined) {
    validData.completed = dataToUpdate.completed;
  }
  if (dataToUpdate.due_on !== undefined) {
    validData.due_on = dataToUpdate.due_on;
  }
  if (dataToUpdate.due_at !== undefined) {
    validData.due_at = dataToUpdate.due_at;
  }
  // Add other updatable fields here as they are implemented

  if (Object.keys(validData).length === 0) {
    // This might happen if dataToUpdate contains only unsupported fields
    throw new Error('No supported data fields provided for task update.');
  }

  // Define opt_fields to ensure permalink_url and other necessary fields are returned
  const queryParams = {
    opt_fields: [
      'gid',
      'name',
      'completed',
      'permalink_url',
      'due_on',
      'due_at',
      'notes',
      // Add other fields that formatTaskUpdate might need
    ],
  };

  try {
    return await apiClient.request<TaskResponseData>(
      `tasks/${taskGid}`,
      'PUT',
      { data: validData },
      queryParams, // Pass queryParams here to specify opt_fields
      requestId,
    );
  } catch (error) {
    console.error(
      `[TaskOperations] Error updating task GID ${taskGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Adds a follower to a task.
 *
 * @param apiClient Asana API client
 * @param taskGid GID of the task
 * @param userGid GID of the user to add as a follower
 * @param requestId Optional request ID for tracking
 * @returns The updated task data with the new follower information (or a minimal response if Asana returns that)
 */
export async function addFollowerToTask(
  apiClient: AsanaApiClient,
  taskGid: string,
  userGid: string,
  requestId?: string,
): Promise<TaskResponseData> {
  // Assuming Asana returns the task object, adjust if it returns something else like just followers
  if (!taskGid) {
    throw new Error('Task GID is required to add a follower.');
  }
  if (!userGid) {
    throw new Error('User GID is required to add a follower.');
  }

  try {
    // The API expects an object with a "followers" key, which is an array of user GIDs.
    // However, for adding a single follower, it seems more idiomatic to use the endpoint designed for it, which takes userGid in the path.
    // No, the standard endpoint is POST /tasks/{task_gid}/addFollowers and takes { data: { followers: ["user_gid"] } }
    return await apiClient.request<TaskResponseData>(
      `tasks/${taskGid}/addFollowers`,
      'POST',
      { data: { followers: [userGid] } },
      undefined,
      requestId,
    );
  } catch (error) {
    console.error(
      `[TaskOperations] Error adding follower ${userGid} to task ${taskGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Removes a follower from a task.
 *
 * @param apiClient Asana API client
 * @param taskGid GID of the task
 * @param userGid GID of the user to remove as a follower
 * @param requestId Optional request ID for tracking
 * @returns The updated task data (or a minimal response)
 */
export async function removeFollowerFromTask(
  apiClient: AsanaApiClient,
  taskGid: string,
  userGid: string,
  requestId?: string,
): Promise<TaskResponseData> {
  // Assuming Asana returns the task object
  if (!taskGid) {
    throw new Error('Task GID is required to remove a follower.');
  }
  if (!userGid) {
    throw new Error('User GID is required to remove a follower.');
  }

  try {
    return await apiClient.request<TaskResponseData>(
      `tasks/${taskGid}/removeFollowers`,
      'POST',
      { data: { followers: [userGid] } },
      undefined,
      requestId,
    );
  } catch (error) {
    console.error(
      `[TaskOperations] Error removing follower ${userGid} from task ${taskGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Retrieves subtasks for a given parent task.
 *
 * @param apiClient Asana API client
 * @param parentTaskGid GID of the parent task
 * @param opt_fields Optional array of fields to include in the response for subtasks
 * @param requestId Optional request ID for tracking
 * @returns Array of subtask data
 */
export async function getSubtasks(
  apiClient: AsanaApiClient,
  parentTaskGid: string,
  opt_fields?: string[],
  requestId?: string,
): Promise<TaskResponseData[]> {
  if (!parentTaskGid) {
    throw new Error('Parent Task GID is required to get subtasks.');
  }

  const default_opt_fields = [
    'name',
    'gid',
    'completed',
    'permalink_url',
    'assignee.name',
    'due_on',
    // Add other fields relevant for a subtask list view if necessary
  ];

  const queryParams: Record<string, string | string[]> = {
    opt_fields: opt_fields || default_opt_fields,
  };

  try {
    return await apiClient.request<TaskResponseData[]>(
      `tasks/${parentTaskGid}/subtasks`,
      'GET',
      undefined,
      queryParams,
      requestId,
    );
  } catch (error) {
    console.error(
      `[TaskOperations] Error getting subtasks for parent GID ${parentTaskGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Adds a dependency to a task.
 * The dependent task will be blocked until the dependency task is completed.
 *
 * @param apiClient Asana API client
 * @param taskGid GID of the task that depends on another task
 * @param dependencyTaskGid GID of the task that must be completed first
 * @param requestId Optional request ID for tracking
 * @returns The updated task data
 */
export async function addDependency(
  apiClient: AsanaApiClient,
  taskGid: string,
  dependencyTaskGid: string,
  requestId?: string,
): Promise<TaskResponseData> {
  if (!taskGid) {
    throw new Error('Task GID is required to add a dependency.');
  }
  if (!dependencyTaskGid) {
    throw new Error('Dependency task GID is required to add a dependency.');
  }

  try {
    return await apiClient.request<TaskResponseData>(
      `tasks/${taskGid}/addDependencies`,
      'POST',
      { data: { dependencies: [dependencyTaskGid] } },
      undefined,
      requestId,
    );
  } catch (error) {
    console.error(
      `[TaskOperations] Error adding dependency ${dependencyTaskGid} to task ${taskGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Removes a dependency from a task.
 *
 * @param apiClient Asana API client
 * @param taskGid GID of the task to remove dependency from
 * @param dependencyTaskGid GID of the dependency task to remove
 * @param requestId Optional request ID for tracking
 * @returns The updated task data
 */
export async function removeDependency(
  apiClient: AsanaApiClient,
  taskGid: string,
  dependencyTaskGid: string,
  requestId?: string,
): Promise<TaskResponseData> {
  if (!taskGid) {
    throw new Error('Task GID is required to remove a dependency.');
  }
  if (!dependencyTaskGid) {
    throw new Error('Dependency task GID is required to remove a dependency.');
  }

  try {
    return await apiClient.request<TaskResponseData>(
      `tasks/${taskGid}/removeDependencies`,
      'POST',
      { data: { dependencies: [dependencyTaskGid] } },
      undefined,
      requestId,
    );
  } catch (error) {
    console.error(
      `[TaskOperations] Error removing dependency ${dependencyTaskGid} from task ${taskGid}: ${error}`,
    );
    throw error;
  }
}

/**
 * Delete a task in Asana
 *
 * @param apiClient Asana API client
 * @param taskGid GID of the task to delete
 * @param requestId Request ID for tracking
 * @returns True if deletion was successful
 */
export async function deleteTask(
  apiClient: AsanaApiClient,
  taskGid: string,
  requestId?: string,
): Promise<boolean> {
  // Validate required parameters
  if (!taskGid) {
    throw new Error('Task GID is required');
  }

  try {
    // Make DELETE request to tasks endpoint
    await apiClient.request(
      `tasks/${taskGid}`,
      'DELETE',
      undefined,
      undefined,
      requestId,
    );

    console.log(
      `[TaskOperations] [${requestId}] Successfully deleted task ${taskGid}`,
    );
    return true;
  } catch (error) {
    console.error(
      `[TaskOperations] [${requestId}] Error deleting task ${taskGid}: ${error}`,
    );
    throw error;
  }
}
