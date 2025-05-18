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
 * @param requestContext Request context for tracking
 * @returns Formatted task creation message
 */
export function formatTaskCreation(
  taskData: any,
  requestContext: RequestContext,
): string {
  if (!taskData) {
    return `Error: No task data received. (Request ID: ${requestContext.requestId})`;
  }

  return `Successfully created Asana task: "${taskData.name}" (GID: ${taskData.gid})
${taskData.permalink_url ? `View at: ${taskData.permalink_url}` : ''}
(Request ID: ${requestContext.requestId})`;
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

  let formattedDetails = `Task Details for "${taskData.name}":\n`;
  formattedDetails += `- Status: ${taskData.completed ? 'Completed' : 'In Progress'}\n`;

  if (taskData.assignee?.name) {
    formattedDetails += `- Assignee: ${taskData.assignee.name}\n`;
  }

  if (taskData.due_on) {
    formattedDetails += `- Due Date: ${taskData.due_on}\n`;
  }

  if (taskData.notes) {
    formattedDetails += `- Description: ${taskData.notes}\n`;
  }

  if (taskData.projects?.length > 0) {
    formattedDetails += `- Projects: ${taskData.projects.map((p: any) => p.name).join(', ')}\n`;
  }

  if (taskData.parent?.name) {
    formattedDetails += `- Parent Task: ${taskData.parent.name}\n`;
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
