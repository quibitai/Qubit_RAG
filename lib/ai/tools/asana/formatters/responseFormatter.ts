/**
 * Response formatter for Asana integration
 * Formats API responses into user-friendly strings
 */

import type { RequestContext } from '../types';

/**
 * Format user info response
 *
 * @param userData User data from Asana API
 * @param requestContext Request context for tracking
 * @returns Formatted user info message
 */
export function formatUserInfo(
  userData: any,
  requestContext: RequestContext,
): string {
  if (!userData) {
    return `Error: No user data received. (Request ID: ${requestContext.requestId})`;
  }

  return `Successfully connected to Asana. Current user: ${userData.name} (${userData.email})
User ID: ${userData.gid}
Workspaces: ${userData.workspaces?.map((w: any) => w.name).join(', ') || 'None'}
(Request ID: ${requestContext.requestId})`;
}

/**
 * Format task creation response
 *
 * @param taskData Created task data from Asana API
 * @param creationContext Contextual information like resolved project/assignee names
 * @param requestContext Request context for tracking
 * @returns Formatted task creation message
 */
export function formatTaskCreation(
  taskData: any,
  creationContext: { projectName?: string; assigneeName?: string },
  requestContext: RequestContext,
): string {
  if (!taskData) {
    return `Error: No task data received. (Request ID: ${requestContext.requestId})`;
  }

  let message = `Successfully created Asana task: "${taskData.name}" (GID: ${taskData.gid})\n`;

  // Use resolved project name from creationContext if available, otherwise from taskData
  const projectNameToShow =
    creationContext.projectName || taskData.projects?.[0]?.name;
  if (projectNameToShow) {
    message += `- Project: ${projectNameToShow}\n`;
  }

  // Use resolved assignee name from creationContext if available, otherwise from taskData
  const assigneeNameToShow =
    creationContext.assigneeName || taskData.assignee?.name;
  if (assigneeNameToShow) {
    message += `- Assignee: ${assigneeNameToShow}\n`;
  }

  if (taskData.notes) {
    message += `- Notes: ${taskData.notes}\n`;
  }

  if (taskData.due_on) {
    message += `- Due on: ${taskData.due_on}\n`;
  }
  // Add due_at if you plan to support time for due dates during creation

  if (taskData.permalink_url) {
    message += `View at: ${taskData.permalink_url}\n`;
  }
  message += `(Request ID: ${requestContext.requestId})`;
  return message;
}

/**
 * Format task update response
 *
 * @param taskData Updated task data from Asana API
 * @param updateFields What fields were updated
 * @param requestContext Request context for tracking
 * @returns Formatted task update message
 */
export function formatTaskUpdate(
  taskData: any,
  updateFields: Record<string, any>,
  requestContext: RequestContext,
): string {
  if (!taskData) {
    return `Error: No task data received. (Request ID: ${requestContext.requestId})`;
  }

  const updatedFieldsStr = Object.keys(updateFields)
    .map((field) => {
      switch (field) {
        case 'name':
          return 'name';
        case 'notes':
          return 'description';
        case 'dueDate':
          return 'due date';
        case 'completed':
          return 'completion status';
        default:
          return field;
      }
    })
    .join(', ');

  return `Successfully updated ${updatedFieldsStr} for task "${taskData.name}" (GID: ${taskData.gid})
${taskData.permalink_url ? `View task at: ${taskData.permalink_url}` : ''}
(Request ID: ${requestContext.requestId})`;
}

/**
 * Format task details response
 *
 * @param taskData Task data from Asana API
 * @param requestContext Request context for tracking
 * @returns Formatted task details message
 */
export function formatTaskDetails(
  taskData: any,
  requestContext: RequestContext,
): string {
  if (!taskData) {
    return `Error: No task data received. (Request ID: ${requestContext.requestId})`;
  }

  let formattedDetails = `Task Details for "${taskData.name || 'N/A'}" (GID: ${taskData.gid || 'N/A'}):\n`;
  formattedDetails += `- Status: ${taskData.completed ? 'Completed' : 'In Progress'}\n`;
  if (taskData.resource_subtype) {
    formattedDetails += `- Type: ${taskData.resource_subtype}\n`;
  }

  if (taskData.assignee?.name) {
    formattedDetails += `- Assignee: ${taskData.assignee.name}${taskData.assignee.email ? ` (${taskData.assignee.email})` : ''}\n`;
  }

  if (taskData.due_on) {
    formattedDetails += `- Due Date: ${taskData.due_on}`;
    if (taskData.due_at) {
      formattedDetails += ` (Time: ${new Date(taskData.due_at).toLocaleTimeString()})\n`;
    } else {
      formattedDetails += '\n';
    }
  } else if (taskData.due_at) {
    // Only time, no date (less common but possible)
    formattedDetails += `- Due At: ${new Date(taskData.due_at).toLocaleString()}\n`;
  }

  if (taskData.start_on) {
    formattedDetails += `- Start Date: ${taskData.start_on}`;
    if (taskData.start_at) {
      formattedDetails += ` (Time: ${new Date(taskData.start_at).toLocaleTimeString()})\n`;
    } else {
      formattedDetails += '\n';
    }
  } else if (taskData.start_at) {
    formattedDetails += `- Start At: ${new Date(taskData.start_at).toLocaleString()}\n`;
  }

  if (taskData.notes) {
    formattedDetails += `- Description: ${taskData.notes}\n`;
  }
  // html_notes is often too verbose for a summary, could be used for a more detailed view if needed.

  if (taskData.projects && taskData.projects.length > 0) {
    formattedDetails += `- Projects: ${taskData.projects.map((p: any) => p.name || 'Unnamed Project').join(', ')}\n`;
  }

  if (taskData.parent?.name) {
    formattedDetails += `- Parent Task: ${taskData.parent.name} (GID: ${taskData.parent.gid})${taskData.parent.permalink_url ? ` - Link: ${taskData.parent.permalink_url}` : ''}\n`;
  }

  if (taskData.num_subtasks !== undefined && taskData.num_subtasks > 0) {
    formattedDetails += `- Subtasks: ${taskData.num_subtasks}\n`;
  }

  if (taskData.followers && taskData.followers.length > 0) {
    formattedDetails += `- Followers: ${taskData.followers.map((f: any) => f.name || 'Unnamed Follower').join(', ')}\n`;
  }

  if (taskData.tags && taskData.tags.length > 0) {
    formattedDetails += `- Tags: ${taskData.tags.map((t: any) => t.name || 'Unnamed Tag').join(', ')}\n`;
  }

  if (taskData.workspace?.name) {
    formattedDetails += `- Workspace: ${taskData.workspace.name}\n`;
  }

  if (taskData.created_at) {
    formattedDetails += `- Created: ${new Date(taskData.created_at).toLocaleString()}\n`;
  }

  if (taskData.modified_at) {
    formattedDetails += `- Last Modified: ${new Date(taskData.modified_at).toLocaleString()}\n`;
  }

  if (taskData.permalink_url) {
    formattedDetails += `- Link: ${taskData.permalink_url}\n`;
  }

  formattedDetails += `(Request ID: ${requestContext.requestId})`;

  return formattedDetails;
}

/**
 * Format task list response
 *
 * @param tasksData List of tasks from Asana API
 * @param filters Applied filters (project, assignee, etc.)
 * @param requestContext Request context for tracking
 * @returns Formatted task list message
 */
export function formatTaskList(
  tasksData: any[],
  filters: {
    projectName?: string;
    assignedToMe?: boolean;
    completed?: boolean;
  },
  requestContext: RequestContext,
): string {
  if (!Array.isArray(tasksData)) {
    return `Error: Invalid task data received. (Request ID: ${requestContext.requestId})`;
  }

  let filterDescription = '';

  if (filters.projectName) {
    filterDescription += ` in project "${filters.projectName}"`;
  }

  if (filters.assignedToMe) {
    filterDescription += ' assigned to you';
  }

  if (filters.completed !== undefined) {
    filterDescription += filters.completed
      ? ' (completed)'
      : ' (not completed)';
  }

  if (tasksData.length === 0) {
    return `No tasks found${filterDescription}. (Request ID: ${requestContext.requestId})`;
  }

  let formattedList = `Found ${tasksData.length} task(s)${filterDescription}:\n`;

  tasksData.forEach((task, index) => {
    formattedList += `${index + 1}. ${task.name}`;

    if (task.due_on) {
      formattedList += ` (Due: ${task.due_on})`;
    }

    if (task.assignee?.name && !filters.assignedToMe) {
      formattedList += ` (Assignee: ${task.assignee.name})`;
    }

    if (task.projects?.length > 0 && !filters.projectName) {
      formattedList += ` (In: ${task.projects.map((p: any) => p.name).join(', ')})`;
    }

    if (task.permalink_url) {
      formattedList += ` (Link: ${task.permalink_url})`;
    }

    formattedList += '\n';
  });

  formattedList += `(Request ID: ${requestContext.requestId})`;

  return formattedList;
}

/**
 * Format project creation response
 *
 * @param projectData Created project data from Asana API
 * @param requestContext Request context for tracking
 * @returns Formatted project creation message
 */
export function formatProjectCreation(
  projectData: any,
  requestContext: RequestContext,
): string {
  if (!projectData) {
    return `Error: No project data received. (Request ID: ${requestContext.requestId})`;
  }

  return `Successfully created Asana project: "${projectData.name}" (GID: ${projectData.gid})
${projectData.permalink_url ? `Permalink: ${projectData.permalink_url}` : ''}
(Request ID: ${requestContext.requestId})`;
}

/**
 * Format project list response
 *
 * @param projectsData List of projects from Asana API
 * @param filters Applied filters (team, archived, etc.)
 * @param requestContext Request context for tracking
 * @returns Formatted project list message
 */
export function formatProjectList(
  projectsData: any[],
  filters: { teamName?: string; archived?: boolean },
  requestContext: RequestContext,
): string {
  if (!Array.isArray(projectsData)) {
    return `Error: Invalid project data received. (Request ID: ${requestContext.requestId})`;
  }

  let filterDescription = '';

  if (filters.teamName) {
    filterDescription += ` in team "${filters.teamName}"`;
  }

  if (filters.archived !== undefined) {
    filterDescription += filters.archived ? ' (archived)' : ' (active)';
  }

  if (projectsData.length === 0) {
    return `No projects found${filterDescription}. (Request ID: ${requestContext.requestId})`;
  }

  let formattedList = `Found ${projectsData.length} project(s)${filterDescription}:\n`;

  projectsData.forEach((project, index) => {
    formattedList += `${index + 1}. ${project.name}`;

    if (project.team?.name && !filters.teamName) {
      formattedList += ` (Team: ${project.team.name})`;
    }

    if (project.current_status?.title) {
      formattedList += ` (Status: ${project.current_status.title})`;
    }

    if (project.due_date) {
      formattedList += ` (Due: ${project.due_date})`;
    }

    if (project.permalink_url) {
      formattedList += ` (Link: ${project.permalink_url})`;
    }

    formattedList += '\n';
  });

  formattedList += `(Request ID: ${requestContext.requestId})`;

  return formattedList;
}

/**
 * Format typeahead search results response.
 *
 * @param searchResults Array of AsanaNamedResource from typeahead search
 * @param originalQuery The user's original search query string
 * @param searchedResourceType Optional resource type that was filtered on
 * @param requestContext Request context for tracking
 * @returns Formatted search results message
 */
export function formatSearchResults(
  searchResults: any[], // Should ideally be AsanaNamedResource[] from search.ts
  originalQuery: string,
  searchedResourceType: string | undefined,
  requestContext: RequestContext,
): string {
  if (!Array.isArray(searchResults)) {
    return `Error: Invalid search results received. (Request ID: ${requestContext.requestId})`;
  }

  let message = `Search results for "${originalQuery}"${searchedResourceType ? ` (type: ${searchedResourceType})` : ' (all types)'}:
`;

  if (searchResults.length === 0) {
    message += `No results found. (Request ID: ${requestContext.requestId})`;
    return message;
  }

  searchResults.forEach((item, index) => {
    message += `${index + 1}. ${item.name || 'Unnamed Resource'} (Type: ${item.resource_type || 'unknown'}, GID: ${item.gid || 'N/A'})`;
    if (item.permalink_url) {
      message += ` - Link: ${item.permalink_url}`;
    }
    // Add more type-specific details if available and useful for a summary
    if (item.resource_type === 'task') {
      if (item.completed !== undefined) {
        message += ` - Status: ${item.completed ? 'Completed' : 'In Progress'}`;
      }
      if (item.assignee?.name) {
        message += ` - Assignee: ${item.assignee.name}`;
      }
      if (item.parent?.name) {
        message += ` - Parent: ${item.parent.name}`;
      }
    } else if (item.resource_type === 'project') {
      if (item.workspace?.name) {
        message += ` - Workspace: ${item.workspace.name}`;
      }
    }
    message += '\n';
  });

  message += `(Request ID: ${requestContext.requestId})`;
  return message;
}

/**
 * Format error response
 *
 * @param error Error object or message
 * @param requestContext Request context for tracking
 * @returns Formatted error message
 */
export function formatError(
  error: any,
  requestContext: RequestContext,
): string {
  const errorMessage =
    typeof error === 'string'
      ? error
      : error.message || 'Unknown error occurred';

  return `Error: ${errorMessage} (Request ID: ${requestContext.requestId})`;
}

/**
 * Format response for adding a follower to a task.
 *
 * @param taskData The updated task data, which should ideally include follower info.
 * @param userIdentifier The GID or name/email of the user added.
 * @param taskIdentifier The GID or name of the task.
 * @param requestContext Request context for tracking.
 * @returns Formatted success message.
 */
export function formatAddFollowerResponse(
  taskData: any, // Should be TaskResponseData
  userIdentifier: string,
  taskIdentifier: string,
  requestContext: RequestContext,
): string {
  if (!taskData || !taskData.gid) {
    return `Error: Failed to confirm follower addition, task data incomplete. (Request ID: ${requestContext.requestId})`;
  }
  // Asana API for addFollowers might return the task with updated followers list or just a 200 OK with empty body.
  // If taskData.followers is available and includes the user, we can be more specific.
  return `Successfully added user (${userIdentifier}) as a follower to task "${taskData.name || taskIdentifier}" (GID: ${taskData.gid}).\n${taskData.permalink_url ? `View task at: ${taskData.permalink_url}` : ''}\n(Request ID: ${requestContext.requestId})`;
}

/**
 * Format response for removing a follower from a task.
 *
 * @param taskData The updated task data or a confirmation.
 * @param userIdentifier The GID or name/email of the user removed.
 * @param taskIdentifier The GID or name of the task.
 * @param requestContext Request context for tracking.
 * @returns Formatted success message.
 */
export function formatRemoveFollowerResponse(
  taskData: any, // Should be TaskResponseData or simply a success confirmation if API returns empty body
  userIdentifier: string,
  taskIdentifier: string,
  requestContext: RequestContext,
): string {
  // The removeFollowers endpoint usually returns an empty body with 200 OK on success.
  // So, taskData might be minimal or just a confirmation from our client.
  // We rely on the operation succeeding if no error was thrown.
  return `Successfully removed user (${userIdentifier}) as a follower from task "${taskIdentifier}".\n(Request ID: ${requestContext.requestId})`;
}
