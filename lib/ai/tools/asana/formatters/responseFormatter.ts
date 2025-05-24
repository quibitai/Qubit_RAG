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

  // Create task name as a link if permalink_url is available
  let taskDisplay = `"${taskData.name}"`;
  if (taskData.permalink_url) {
    taskDisplay = `[${taskData.name}](${taskData.permalink_url})`;
  }

  let message = `Successfully created Asana task: ${taskDisplay} (GID: ${taskData.gid})\n`;

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

  // Add visibility note
  if (projectNameToShow) {
    message += `\n📋 Note: Task visibility inherits from project "${projectNameToShow}" settings.\n`;
  } else {
    message += `\n⚠️ Note: Task created without a project - may default to private visibility.\n`;
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

  // Create task name as a link if permalink_url is available
  let taskDisplay = `"${taskData.name}"`;
  if (taskData.permalink_url) {
    taskDisplay = `[${taskData.name}](${taskData.permalink_url})`;
  }

  return `Successfully updated ${updatedFieldsStr} for task ${taskDisplay} (GID: ${taskData.gid})
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

  // Create task name as a link if permalink_url is available
  let taskDisplay = `"${taskData.name || 'N/A'}"`;
  if (taskData.permalink_url) {
    taskDisplay = `[${taskData.name || 'N/A'}](${taskData.permalink_url})`;
  }

  let formattedDetails = `Task Details for ${taskDisplay} (GID: ${taskData.gid || 'N/A'}):\n`;
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
    // Create parent task link if available
    let parentDisplay = taskData.parent.name;
    if (taskData.parent.permalink_url) {
      parentDisplay = `[${taskData.parent.name}](${taskData.parent.permalink_url})`;
    }
    formattedDetails += `- Parent Task: ${parentDisplay} (GID: ${taskData.parent.gid})\n`;
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
    customDescription?: string;
  },
  requestContext: RequestContext,
): string {
  if (!Array.isArray(tasksData)) {
    return `Error: Invalid task data received. (Request ID: ${requestContext.requestId})`;
  }

  let filterDescription = '';

  if (filters.customDescription) {
    filterDescription += filters.customDescription;
  } else if (filters.assignedToMe) {
    filterDescription += ' assigned to you';
  }

  if (filters.projectName) {
    filterDescription += ` in project "${filters.projectName}"`;
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
    // Create the task name as a link if permalink_url is available
    let taskDisplay = task.name;
    if (task.permalink_url) {
      taskDisplay = `[${task.name}](${task.permalink_url})`;
    }

    formattedList += `${index + 1}. ${taskDisplay}`;

    if (task.due_on) {
      formattedList += ` — Due: ${task.due_on}`;
    }

    // Only show assignee if not already specified in filter description
    if (
      task.assignee?.name &&
      !filters.assignedToMe &&
      !filters.customDescription
    ) {
      formattedList += ` (Assignee: ${task.assignee.name})`;
    }

    if (task.projects?.length > 0 && !filters.projectName) {
      formattedList += ` (In: ${task.projects.map((p: any) => p.name).join(', ')})`;
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

  let visibilityInfo = '';
  if (projectData.privacy_setting) {
    const privacyMap: Record<string, string> = {
      public_to_workspace: 'Public to workspace',
      private_to_team: 'Private to team',
      private: 'Private',
    };
    visibilityInfo = `\nPrivacy: ${privacyMap[projectData.privacy_setting] || projectData.privacy_setting}`;
  } else if (projectData.public !== undefined) {
    visibilityInfo = `\nPrivacy: ${projectData.public ? 'Public' : 'Private'}`;
  }

  // Create project name as a link if permalink_url is available
  let projectDisplay = `"${projectData.name}"`;
  if (projectData.permalink_url) {
    projectDisplay = `[${projectData.name}](${projectData.permalink_url})`;
  }

  return `Successfully created Asana project: ${projectDisplay} (GID: ${projectData.gid})${visibilityInfo}
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
    // Create the project name as a link if permalink_url is available
    let projectDisplay = project.name;
    if (project.permalink_url) {
      projectDisplay = `[${project.name}](${project.permalink_url})`;
    }

    formattedList += `${index + 1}. ${projectDisplay}`;

    if (project.team?.name && !filters.teamName) {
      formattedList += ` (Team: ${project.team.name})`;
    }

    if (project.current_status?.title) {
      formattedList += ` (Status: ${project.current_status.title})`;
    }

    if (project.due_date) {
      formattedList += ` (Due: ${project.due_date})`;
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
    // Create the item name as a link if permalink_url is available
    let itemDisplay = item.name || 'Unnamed Resource';
    if (item.permalink_url) {
      itemDisplay = `[${item.name || 'Unnamed Resource'}](${item.permalink_url})`;
    }

    message += `${index + 1}. ${itemDisplay} (Type: ${item.resource_type || 'unknown'}, GID: ${item.gid || 'N/A'})`;

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

  // Create task name as a link if permalink_url is available
  let taskDisplay = `"${taskData.name || taskIdentifier}"`;
  if (taskData.permalink_url) {
    taskDisplay = `[${taskData.name || taskIdentifier}](${taskData.permalink_url})`;
  }

  // Asana API for addFollowers might return the task with updated followers list or just a 200 OK with empty body.
  // If taskData.followers is available and includes the user, we can be more specific.
  return `Successfully added user (${userIdentifier}) as a follower to task ${taskDisplay} (GID: ${taskData.gid}).
(Request ID: ${requestContext.requestId})`;
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
  // Create task name as a link if available and taskData has the info
  let taskDisplay = `"${taskIdentifier}"`;
  if (taskData?.permalink_url) {
    taskDisplay = `[${taskData.name || taskIdentifier}](${taskData.permalink_url})`;
  }

  // The removeFollowers endpoint usually returns an empty body with 200 OK on success.
  // So, taskData might be minimal or just a confirmation from our client.
  // We rely on the operation succeeding if no error was thrown.
  return `Successfully removed user (${userIdentifier}) as a follower from task ${taskDisplay}.
(Request ID: ${requestContext.requestId})`;
}

/**
 * Format section list response
 *
 * @param sectionsData List of sections from Asana API
 * @param projectContext Project context information
 * @param requestContext Request context for tracking
 * @returns Formatted section list message
 */
export function formatSectionList(
  sectionsData: any[],
  projectContext: { projectName?: string; projectGid?: string },
  requestContext: RequestContext,
): string {
  if (!Array.isArray(sectionsData)) {
    return `Error: Invalid section data received. (Request ID: ${requestContext.requestId})`;
  }

  const projectIdentifier =
    projectContext.projectName ||
    projectContext.projectGid ||
    'Unknown Project';

  if (sectionsData.length === 0) {
    return `No sections found in project "${projectIdentifier}". (Request ID: ${requestContext.requestId})`;
  }

  let formattedList = `Found ${sectionsData.length} section(s) in project "${projectIdentifier}":\n`;

  sectionsData.forEach((section, index) => {
    formattedList += `${index + 1}. ${section.name} (GID: ${section.gid})`;

    if (section.created_at) {
      formattedList += ` - Created: ${new Date(section.created_at).toLocaleDateString()}`;
    }

    formattedList += '\n';
  });

  formattedList += `(Request ID: ${requestContext.requestId})`;

  return formattedList;
}

/**
 * Format section creation response
 *
 * @param sectionData Created section data from Asana API
 * @param projectContext Project context information
 * @param requestContext Request context for tracking
 * @returns Formatted section creation message
 */
export function formatSectionCreation(
  sectionData: any,
  projectContext: { projectName?: string; projectGid?: string },
  requestContext: RequestContext,
): string {
  if (!sectionData) {
    return `Error: No section data received. (Request ID: ${requestContext.requestId})`;
  }

  const projectIdentifier =
    projectContext.projectName ||
    sectionData.project?.name ||
    projectContext.projectGid ||
    'Unknown Project';

  return `Successfully created section "${sectionData.name}" (GID: ${sectionData.gid}) in project "${projectIdentifier}".\n(Request ID: ${requestContext.requestId})`;
}

/**
 * Format response for moving a task to a section
 *
 * @param taskData Updated task data (may be minimal)
 * @param moveContext Context about the move operation
 * @param requestContext Request context for tracking
 * @returns Formatted success message
 */
export function formatTaskMoveToSection(
  taskData: any,
  moveContext: {
    taskName?: string;
    taskGid?: string;
    sectionName?: string;
    sectionGid?: string;
    projectName?: string;
  },
  requestContext: RequestContext,
): string {
  const taskIdentifier =
    moveContext.taskName ||
    taskData?.name ||
    moveContext.taskGid ||
    'Unknown Task';

  // Create task name as a link if available
  let taskDisplay = `"${taskIdentifier}"`;
  if (taskData?.permalink_url) {
    taskDisplay = `[${taskData.name || taskIdentifier}](${taskData.permalink_url})`;
  }

  const sectionIdentifier =
    moveContext.sectionName || moveContext.sectionGid || 'Unknown Section';
  const projectIdentifier = moveContext.projectName || 'the project';

  return `Successfully moved task ${taskDisplay} to section "${sectionIdentifier}" in ${projectIdentifier}.
(Request ID: ${requestContext.requestId})`;
}

/**
 * Format enhanced date/time parsing result with confidence feedback
 *
 * @param parsedResult Result from enhanced date/time parsing
 * @param context Additional context about the operation
 * @param requestContext Request context for tracking
 * @returns Formatted message with date confirmation and suggestions if needed
 */
export function formatDateTimeParsingResult(
  parsedResult: {
    success: boolean;
    userFriendlyFormat: string;
    confidence: 'high' | 'medium' | 'low';
    suggestions?: string[];
    errorMessage?: string;
  },
  context: {
    operation: string; // e.g., "due date", "start date"
    taskName?: string;
  },
  requestContext: RequestContext,
): string {
  if (!parsedResult.success) {
    let message = `Error: Could not understand the ${context.operation}. ${parsedResult.errorMessage}\n`;

    if (parsedResult.suggestions && parsedResult.suggestions.length > 0) {
      message += `\n${parsedResult.suggestions.join('\n')}\n`;
    }

    message += `\n(Request ID: ${requestContext.requestId})`;
    return message;
  }

  let message = `Parsed ${context.operation} as: ${parsedResult.userFriendlyFormat}`;

  if (context.taskName) {
    message += ` for task "${context.taskName}"`;
  }

  // Add confidence feedback for medium/low confidence
  if (parsedResult.confidence === 'medium') {
    message +=
      '\n\n⚠️  Medium confidence in date parsing. Please verify this is correct.';
  } else if (parsedResult.confidence === 'low') {
    message +=
      '\n\n⚠️  Low confidence in date parsing. Please confirm or rephrase.';
    if (parsedResult.suggestions && parsedResult.suggestions.length > 0) {
      message += `\n\n${parsedResult.suggestions.join('\n')}`;
    }
  }

  message += `\n\n(Request ID: ${requestContext.requestId})`;
  return message;
}

/**
 * Format user details response
 *
 * @param userData User data from Asana API
 * @param requestContext Request context for tracking
 * @returns Formatted user details message
 */
export function formatUserDetails(
  userData: any,
  requestContext: RequestContext,
): string {
  if (!userData) {
    return `Error: No user data received. (Request ID: ${requestContext.requestId})`;
  }

  let message = `User Profile for ${userData.name}:\n`;
  message += `- User ID: ${userData.gid}\n`;

  if (userData.email) {
    message += `- Email: ${userData.email}\n`;
  }

  if (userData.workspaces && userData.workspaces.length > 0) {
    message += `- Workspaces: ${userData.workspaces.map((w: any) => w.name).join(', ')}\n`;
  }

  message += `(Request ID: ${requestContext.requestId})`;
  return message;
}

/**
 * Format workspace users list response
 *
 * @param usersData Array of user data from Asana API
 * @param workspaceInfo Workspace context information
 * @param requestContext Request context for tracking
 * @returns Formatted users list message
 */
export function formatWorkspaceUsersList(
  usersData: any[],
  workspaceInfo: { name?: string; gid?: string },
  requestContext: RequestContext,
): string {
  if (!Array.isArray(usersData)) {
    return `Error: Invalid user data received. (Request ID: ${requestContext.requestId})`;
  }

  const workspaceIdentifier =
    workspaceInfo.name || workspaceInfo.gid || 'Unknown Workspace';

  if (usersData.length === 0) {
    return `No users found in workspace "${workspaceIdentifier}". (Request ID: ${requestContext.requestId})`;
  }

  let formattedList = `Found ${usersData.length} user(s) in workspace "${workspaceIdentifier}":\n`;

  usersData.forEach((user, index) => {
    formattedList += `${index + 1}. ${user.name}`;

    if (user.email) {
      formattedList += ` (${user.email})`;
    }

    formattedList += ` - ID: ${user.gid}\n`;
  });

  formattedList += `(Request ID: ${requestContext.requestId})`;
  return formattedList;
}
