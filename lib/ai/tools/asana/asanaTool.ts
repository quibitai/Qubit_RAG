/**
 * Asana Tool for LangChain integration
 * Provides natural language interface to Asana API
 */

import { Tool } from '@langchain/core/tools';
import { AsanaToolInputSchema, generateRequestId } from './types';
import { parseIntent } from './intent-parser';
import { AsanaOperationType } from './intent-parser/types';
import { createAsanaClient } from './api-client';
import type { AsanaApiClient } from './api-client';
import { getUsersMe } from './api-client/operations/users';
import { createTask, listTasks } from './api-client/operations/tasks';
import {
  listProjects,
  findProjectGidByName,
} from './api-client/operations/projects';
import { AsanaIntegrationError, logAndFormatError } from './utils/errorHandler';
import { getWorkspaceGid } from './config';

// Import formatters for response formatting
import {
  formatUserInfo,
  formatTaskCreation,
  formatProjectList,
  formatTaskList,
} from './formatters/responseFormatter';

/**
 * Asana tool for LangChain
 * Enables natural language interaction with Asana API
 */
export class AsanaTool extends Tool {
  name = 'asana';
  description =
    'A tool that connects directly to the Asana API to perform operations. ' +
    'Use this for ANY Asana-related tasks such as creating, listing, updating, or completing Asana tasks and projects. ' +
    'This tool provides a native integration with Asana for task and project management. ' +
    'The input should be a natural language description of what you want to do in Asana, such as: ' +
    '\'Create a new task called "Review design mockups" in the Marketing project\'' +
    " or 'List all my incomplete tasks in the Development project'";

  protected client: AsanaApiClient;

  constructor(apiKey?: string) {
    super();
    this.client = createAsanaClient(apiKey);
  }

  // Define the Zod schema for validation
  zodSchema = AsanaToolInputSchema;

  /**
   * Main execution method for the tool
   *
   * @param input Natural language description of the Asana operation to perform
   * @returns Result of the Asana operation
   */
  protected async _call(input: string | Record<string, any>): Promise<string> {
    // Extract the action description from the input
    let actionDescription: string;

    if (typeof input === 'string') {
      actionDescription = input;
    } else if (typeof input === 'object') {
      if (input.action_description) {
        actionDescription = input.action_description;
      } else if (input.input) {
        actionDescription = input.input;
      } else if (
        input.toolInput &&
        typeof input.toolInput === 'object' &&
        (input.toolInput as { action_description?: string }).action_description
      ) {
        actionDescription = (input.toolInput as { action_description: string })
          .action_description;
      } else {
        const requestId = generateRequestId();
        const errorMsg = `Invalid input: Missing 'action_description', 'input', or valid 'toolInput' field. (Request ID: ${requestId})`;
        console.error(`[AsanaTool] ${errorMsg}`, JSON.stringify(input));
        return errorMsg;
      }
    } else {
      const requestId = generateRequestId();
      const errorMsg = `Invalid input: Expected string or object, but received ${typeof input}. (Request ID: ${requestId})`;
      console.error(`[AsanaTool] ${errorMsg}`);
      return errorMsg;
    }

    // Parse the intent
    const parsedIntent = parseIntent(actionDescription);
    const { requestContext } = parsedIntent;

    console.log(
      `[AsanaTool] [${requestContext.requestId}] Executing operation: ${parsedIntent.operationType}`,
    );

    try {
      // Execute the appropriate operation based on the parsed intent
      switch (parsedIntent.operationType) {
        case AsanaOperationType.GET_USER_ME: {
          // Get the current user's information
          const userData = await getUsersMe(
            this.client,
            requestContext.requestId,
          );
          return formatUserInfo(userData, requestContext);
        }

        case AsanaOperationType.CREATE_TASK: {
          // Get the create task intent
          const createTaskIntent = parsedIntent as any;

          // Get the workspace GID
          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID in your environment. (Request ID: ${requestContext.requestId})`;
          }

          // Extract parameters from the intent
          const { taskName, taskNotes, projectName, assigneeName } =
            createTaskIntent;

          if (!taskName) {
            return `Error: Task name is required to create a task. (Request ID: ${requestContext.requestId})`;
          }

          // Create task params
          const createTaskParams: any = {
            name: taskName,
            workspace: workspaceGid,
          };

          // Add optional params
          if (taskNotes) {
            createTaskParams.notes = taskNotes;
          }

          // If project name is specified, resolve it to a GID
          if (projectName) {
            try {
              const projectGid = await findProjectGidByName(
                this.client,
                projectName,
                workspaceGid,
                requestContext.requestId,
              );

              if (projectGid === 'ambiguous') {
                return `Error: Multiple projects found matching '${projectName}'. Please be more specific. (Request ID: ${requestContext.requestId})`;
              }

              if (projectGid) {
                createTaskParams.projects = [projectGid];
              } else {
                // Project not found but we'll still create the task
                if (createTaskParams.notes) {
                  createTaskParams.notes += `\n\n(Note: Intended for project "${projectName}" but project not found)`;
                } else {
                  createTaskParams.notes = `(Note: Intended for project "${projectName}" but project not found)`;
                }
              }
            } catch (error) {
              console.error(`[AsanaTool] Error resolving project: ${error}`);
              // Continue without project assignment
              if (createTaskParams.notes) {
                createTaskParams.notes += `\n\n(Note: Error finding project "${projectName}")`;
              } else {
                createTaskParams.notes = `(Note: Error finding project "${projectName}")`;
              }
            }
          }

          // Handle assignee - for now only support "me"
          if (assigneeName === 'me') {
            createTaskParams.assignee = 'me';
          }

          // Create the task
          const taskData = await createTask(
            this.client,
            createTaskParams,
            requestContext.requestId,
          );

          return formatTaskCreation(taskData, requestContext);
        }

        case AsanaOperationType.UPDATE_TASK:
          // Implementation of task update
          // This is a placeholder
          return `This operation is not yet implemented: Update Task (Request ID: ${requestContext.requestId})`;

        case AsanaOperationType.GET_TASK_DETAILS:
          // Implementation of task details retrieval
          // This is a placeholder
          return `This operation is not yet implemented: Get Task Details (Request ID: ${requestContext.requestId})`;

        case AsanaOperationType.LIST_TASKS: {
          // Get the list tasks intent
          const listTasksIntent = parsedIntent as any;

          // Get the workspace GID
          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID in your environment. (Request ID: ${requestContext.requestId})`;
          }

          // Prepare list tasks params
          const listTasksParams: any = {
            workspace: workspaceGid,
          };

          // Add filters
          if (listTasksIntent.assignedToMe) {
            listTasksParams.assignee = 'me';
          }

          if (listTasksIntent.completed === true) {
            // To get completed tasks, we don't set completed_since
            listTasksParams.completed_since = undefined;
          } else {
            // Default to incomplete tasks
            listTasksParams.completed_since = 'now';
          }

          // If project name is specified, resolve it to a GID
          if (listTasksIntent.projectName) {
            try {
              const projectGid = await findProjectGidByName(
                this.client,
                listTasksIntent.projectName,
                workspaceGid,
                requestContext.requestId,
              );

              if (projectGid === 'ambiguous') {
                return `Error: Multiple projects found matching '${listTasksIntent.projectName}'. Please be more specific. (Request ID: ${requestContext.requestId})`;
              }

              if (projectGid) {
                listTasksParams.project = projectGid;
              } else {
                // Project not found, so return a helpful message
                return `No project found matching "${listTasksIntent.projectName}". Please check the project name and try again. (Request ID: ${requestContext.requestId})`;
              }
            } catch (error) {
              console.error(`[AsanaTool] Error resolving project: ${error}`);
              return `Error finding project "${listTasksIntent.projectName}". (Request ID: ${requestContext.requestId})`;
            }
          }

          // List the tasks
          const tasksData = await listTasks(
            this.client,
            listTasksParams,
            requestContext.requestId,
          );

          return formatTaskList(
            tasksData,
            {
              projectName: listTasksIntent.projectName,
              assignedToMe: listTasksIntent.assignedToMe,
              completed: listTasksIntent.completed,
            },
            requestContext,
          );
        }

        case AsanaOperationType.COMPLETE_TASK:
          // Implementation of task completion
          // This is a placeholder
          return `This operation is not yet implemented: Complete Task (Request ID: ${requestContext.requestId})`;

        case AsanaOperationType.CREATE_PROJECT:
          // Implementation of project creation
          // This is a placeholder
          return `This operation is not yet implemented: Create Project (Request ID: ${requestContext.requestId})`;

        case AsanaOperationType.UPDATE_PROJECT:
          // Implementation of project update
          // This is a placeholder
          return `This operation is not yet implemented: Update Project (Request ID: ${requestContext.requestId})`;

        case AsanaOperationType.LIST_PROJECTS: {
          // Get the workspace GID
          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID in your environment. (Request ID: ${requestContext.requestId})`;
          }

          // Get the list projects intent
          const listProjectsIntent = parsedIntent as any;

          // Get archived parameter
          const archived = listProjectsIntent.archived || false;

          // List the projects
          const projectsData = await listProjects(
            this.client,
            workspaceGid,
            archived,
            requestContext.requestId,
          );

          return formatProjectList(
            projectsData,
            {
              teamName: listProjectsIntent.teamName,
              archived,
            },
            requestContext,
          );
        }

        case AsanaOperationType.UNKNOWN:
        default:
          // Handle unknown or unsupported operations
          return (
            parsedIntent.errorMessage ||
            `I couldn't understand what Asana operation you want to perform. Please try rephrasing your request. (Request ID: ${requestContext.requestId})`
          );
      }
    } catch (error) {
      // Handle errors
      if (error instanceof AsanaIntegrationError) {
        console.error(
          `[AsanaTool] [${requestContext.requestId}] ${error.toLogString()}`,
        );
        return error.toUserFriendlyMessage();
      }

      // Generic error handling
      return logAndFormatError(
        error,
        'Asana operation',
        requestContext.requestId,
      );
    }
  }
}

// Create a singleton instance
export const asanaTool = new AsanaTool();
