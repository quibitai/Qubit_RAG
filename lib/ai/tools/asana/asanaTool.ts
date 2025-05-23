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
import {
  getUsersMe,
  findUserGidByEmailOrName,
} from './api-client/operations/users';
import {
  createTask,
  listTasks,
  getTaskDetails,
  findTaskGidByName,
  updateTask,
  addFollowerToTask,
  removeFollowerFromTask,
  addDependency,
  removeDependency,
  type UpdateTaskParams,
  type CreateTaskParams,
  getSubtasks,
} from './api-client/operations/tasks';
import {
  listProjects,
  findProjectGidByName,
} from './api-client/operations/projects';
import {
  getProjectSections,
  createSectionInProject,
  addTaskToSection,
  findSectionGidByName,
} from './api-client/operations/sections';
import { AsanaIntegrationError, logAndFormatError } from './utils/errorHandler';
import { getWorkspaceGid } from './config';
import {
  extractTaskIdentifier,
  extractTaskUpdateFields,
  extractSearchQueryAndType,
  extractTaskAndUserIdentifiers,
  extractTaskAndDueDate,
  extractSubtaskCreationDetails,
  extractTaskDependencyDetails,
  extractProjectAndSectionIdentifiers,
  extractSectionCreationDetails,
  extractTaskAndSectionIdentifiers,
} from './intent-parser/entity.extractor';
import { typeaheadSearch } from './api-client/operations/search';
import { parseDateTime } from './utils/dateTimeParser';

// Import formatters for response formatting
import {
  formatUserInfo,
  formatTaskCreation,
  formatProjectList,
  formatTaskList,
  formatTaskDetails,
  formatTaskUpdate,
  formatSearchResults,
  formatAddFollowerResponse,
  formatRemoveFollowerResponse,
  formatSectionList,
  formatSectionCreation,
  formatTaskMoveToSection,
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
          const createTaskIntent = parsedIntent as any;
          const {
            taskName,
            taskNotes,
            projectName: initialProjectName,
            assigneeName: initialAssigneeName,
            confirmationNeeded,
            confirmedProjectName,
            confirmedAssigneeName,
            dueDate,
          } = createTaskIntent;
          const workspaceGid = getWorkspaceGid();
          const { requestId } = requestContext;

          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID. (Request ID: ${requestId})`;
          }

          // Smart context handling for confirmations
          const isConfirmation =
            /^(?:yes|yep|yeah|confirm|confirmed|ok|okay|sure|proceed|go ahead|do it)[.,!]*$/i.test(
              actionDescription.trim(),
            );
          const isProjectSelection =
            /^\d{16,}$/.test(actionDescription.trim()) ||
            actionDescription.toLowerCase().includes('echo tango');

          // For confirmations, try to use context from original request
          let resolvedTaskName = taskName;
          let resolvedTaskNotes = taskNotes;
          let resolvedDueDate = dueDate;

          if (isConfirmation && !taskName) {
            // Look for task details in the original actionDescription
            const originalTaskMatch = actionDescription.match(
              /task\s+(?:called|named)?\s*['"]([^'"]+)['"]/i,
            );
            if (originalTaskMatch) {
              resolvedTaskName = originalTaskMatch[1];
            }

            const originalNotesMatch = actionDescription.match(
              /(?:note|notes|description)\s*(?:that says?|:)?\s*['"]([^'"]+)['"]/i,
            );
            if (originalNotesMatch) {
              resolvedTaskNotes = originalNotesMatch[1];
            }

            // Extract due date from original context
            const originalDueDateMatch = actionDescription.match(
              /(?:due|deadline)\s+(?:date\s+)?(?:is\s+|for\s+|on\s+)?(tomorrow|today|next\s+\w+)/i,
            );
            if (originalDueDateMatch) {
              resolvedDueDate = originalDueDateMatch[1];
            }
          }

          if (!resolvedTaskName) {
            return `Error: Task name is required. Please specify a task name to create. (Request ID: ${requestId})`;
          }

          let projectGid: string | undefined | 'ambiguous' = undefined;
          const resolvedProjectName =
            confirmedProjectName || initialProjectName;
          let assigneeGid: string | undefined | 'ambiguous' = undefined;
          let resolvedAssigneeName =
            confirmedAssigneeName || initialAssigneeName;

          // 1. Enhanced Project Resolution
          if (resolvedProjectName) {
            // Get all projects first for smart matching
            const projects = await listProjects(
              this.client,
              workspaceGid,
              false,
              requestId,
            );

            // Try exact match first (case-insensitive)
            const exactMatch = projects.find(
              (p) => p.name.toLowerCase() === resolvedProjectName.toLowerCase(),
            );

            if (exactMatch) {
              projectGid = exactMatch.gid;
              console.log(
                `[AsanaTool] [${requestId}] Found exact project match: "${exactMatch.name}" (${exactMatch.gid})`,
              );
            } else {
              // Fallback to fuzzy matching
              projectGid = await findProjectGidByName(
                this.client,
                resolvedProjectName,
                workspaceGid,
                requestId,
              );

              if (projectGid === 'ambiguous') {
                const projectOptions = projects.filter((p) =>
                  p.name
                    .toLowerCase()
                    .includes(resolvedProjectName.toLowerCase()),
                );
                return `Which project should task "${resolvedTaskName}" be created in?\nFound ${projects.length} project(s):\n${formatProjectList(projectOptions.length > 0 ? projectOptions : projects, {}, requestContext)}\n(Request ID: ${requestId})\nReply with project name/GID.`;
              }
              if (!projectGid) {
                return `Project "${resolvedProjectName}" not found. Do you want to create it, or try a different project name? (Request ID: ${requestId})`;
              }
            }
          } else if (!confirmationNeeded && !isConfirmation) {
            const projects = await listProjects(
              this.client,
              workspaceGid,
              false,
              requestId,
            );
            if (!projects || projects.length === 0) {
              return `No projects found. Please create a project first. (Request ID: ${requestId})`;
            }
            return `Which project should task "${resolvedTaskName}" be created in?\nFound ${projects.length} project(s):\n${formatProjectList(projects, {}, requestContext)}\n(Request ID: ${requestId})\nReply with project name/GID.`;
          }

          // 2. Resolve Assignee
          if (resolvedAssigneeName) {
            if (resolvedAssigneeName.toLowerCase() === 'me') {
              const meUser = await getUsersMe(this.client, requestId);
              assigneeGid = meUser.gid;
              resolvedAssigneeName = meUser.name;
            } else {
              const userLookup = await findUserGidByEmailOrName(
                this.client,
                workspaceGid,
                resolvedAssigneeName,
                requestId,
              );
              if (userLookup === 'ambiguous') {
                return `Multiple users match "${resolvedAssigneeName}". Please provide a more specific name or user GID. (Request ID: ${requestId})`;
              }
              if (!userLookup) {
                return `User "${resolvedAssigneeName}" not found. Create task unassigned or try a different assignee? (Request ID: ${requestId})`;
              }
              assigneeGid = userLookup;
              const userDetails = await this.client.request<any>(
                `users/${assigneeGid}`,
                'GET',
                undefined,
                { opt_fields: 'name' },
                requestId,
              );
              resolvedAssigneeName = userDetails.name || resolvedAssigneeName;
            }
          }

          // 3. Skip final confirmation for confirmations and direct project matches
          if (
            !confirmationNeeded &&
            !isConfirmation &&
            projectGid &&
            projectGid !== 'ambiguous' &&
            (resolvedAssigneeName
              ? assigneeGid && assigneeGid !== 'ambiguous'
              : true)
          ) {
            let confirmationMessage = `Ready to create task "${resolvedTaskName}"`;
            if (
              resolvedProjectName &&
              projectGid &&
              typeof projectGid === 'string'
            ) {
              confirmationMessage += ` in project "${resolvedProjectName}"`;
            }
            if (
              resolvedAssigneeName &&
              assigneeGid &&
              typeof assigneeGid === 'string'
            ) {
              confirmationMessage += ` and assign it to ${resolvedAssigneeName}`;
            }
            confirmationMessage += `.\nPlease confirm (yes/no). (Request ID: ${requestId})`;

            return JSON.stringify({
              action: AsanaOperationType.CREATE_TASK,
              confirmationRequired: true,
              details: {
                taskName: resolvedTaskName,
                taskNotes: resolvedTaskNotes,
                projectName: resolvedProjectName,
                assigneeName: resolvedAssigneeName,
                projectGid,
                assigneeGid,
              },
              message: confirmationMessage,
            });
          }

          if (!projectGid || projectGid === 'ambiguous') {
            return `Cannot create task: Project not resolved. Please specify a valid project. (Request ID: ${requestId})`;
          }
          if (
            initialAssigneeName &&
            (!assigneeGid || assigneeGid === 'ambiguous')
          ) {
            return `Cannot create task: Assignee "${initialAssigneeName}" not resolved. Please specify a valid assignee or omit. (Request ID: ${requestId})`;
          }

          const createTaskParams: CreateTaskParams = {
            name: resolvedTaskName,
            workspace: workspaceGid,
            projects:
              projectGid && typeof projectGid === 'string'
                ? [projectGid]
                : undefined,
          };
          if (resolvedTaskNotes) createTaskParams.notes = resolvedTaskNotes;
          if (assigneeGid && typeof assigneeGid === 'string')
            createTaskParams.assignee = assigneeGid;

          // Process due date if provided
          if (resolvedDueDate) {
            const parsedDate = parseDateTime(resolvedDueDate);
            if (parsedDate.success && parsedDate.date) {
              // Format date as YYYY-MM-DD for Asana API
              const formattedDate = parsedDate.date.toISOString().split('T')[0];
              createTaskParams.due_on = formattedDate;
              console.log(
                `[AsanaTool] [${requestId}] Parsed due date "${resolvedDueDate}" as ${formattedDate}`,
              );
            } else {
              console.warn(
                `[AsanaTool] [${requestId}] Could not parse due date: "${resolvedDueDate}"`,
              );
            }
          }

          const taskData = await createTask(
            this.client,
            createTaskParams,
            requestId,
          );
          return formatTaskCreation(
            taskData,
            {
              projectName: resolvedProjectName,
              assigneeName: resolvedAssigneeName,
            },
            requestContext,
          );
        }

        case AsanaOperationType.UPDATE_TASK: {
          const {
            gid: taskGidFromInput,
            name: taskNameFromInput,
            projectName: projectContext,
          } = extractTaskIdentifier(actionDescription);

          const updateFields = extractTaskUpdateFields(actionDescription);

          // Ensure at least one updatable field is present
          if (
            !updateFields.notes &&
            !updateFields.dueDate &&
            updateFields.completed === undefined &&
            !updateFields.name // Assuming name updates might be added here later
          ) {
            return `Could not determine the changes to make to the task. Please specify what to update (e.g., description, due date, status). (Request ID: ${requestContext.requestId})`;
          }

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualTaskGid = taskGidFromInput;
          if (!actualTaskGid && taskNameFromInput) {
            // For UPDATE_TASK, find the task regardless of its current completion status.
            const taskLookup = await findTaskGidByName(
              this.client,
              taskNameFromInput,
              workspaceGid,
              projectContext,
              true,
              requestContext.requestId,
            );
            if (taskLookup.type === 'found') actualTaskGid = taskLookup.gid;
            else if (taskLookup.type === 'ambiguous')
              return `Error: Task to update is ambiguous: ${taskLookup.message} (Request ID: ${requestContext.requestId})`;
            else
              return `Error: Task named "${taskNameFromInput}"${projectContext ? ` in project "${projectContext}"` : ''} not found to update. (Request ID: ${requestContext.requestId})`;
          }

          if (!actualTaskGid) {
            return `Error: Could not identify the task for update. (Request ID: ${requestContext.requestId})`;
          }

          // Prepare the payload for the API call
          const updatePayload: UpdateTaskParams = {};
          if (updateFields.notes) {
            updatePayload.notes = updateFields.notes;
          }
          if (updateFields.completed !== undefined) {
            updatePayload.completed = updateFields.completed;
          }

          if (updateFields.dueDate) {
            const parsedResult = parseDateTime(
              updateFields.dueDate,
              new Date(),
            );
            if (!parsedResult.success) {
              return `Error: Could not understand the due date "${updateFields.dueDate}". ${parsedResult.errorMessage}${parsedResult.suggestions ? `\n\n${parsedResult.suggestions.join('\n')}` : ''} (Request ID: ${requestContext.requestId})`;
            }

            // Use the formatted result from our enhanced parser
            if (parsedResult.hasTime) {
              updatePayload.due_at = parsedResult.formattedForAsana.due_at;
            } else {
              updatePayload.due_on = parsedResult.formattedForAsana.due_on;
            }
          }

          if (Object.keys(updatePayload).length === 0) {
            return `No valid fields to update were found in your request. (Request ID: ${requestContext.requestId})`;
          }

          const updatedTask = await updateTask(
            this.client,
            actualTaskGid,
            updatePayload,
            requestContext.requestId,
          );

          return formatTaskUpdate(updatedTask, updatePayload, requestContext);
        }

        case AsanaOperationType.GET_TASK_DETAILS: {
          const {
            gid: taskGidFromInput,
            name: taskNameFromInput,
            projectName: projectContext,
          } = extractTaskIdentifier(actionDescription);

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID. (Request ID: ${requestContext.requestId})`;
          }

          let actualTaskGid = taskGidFromInput;

          if (!actualTaskGid && taskNameFromInput) {
            // For GET_TASK_DETAILS, find the task regardless of its current completion status.
            const findResult = await findTaskGidByName(
              this.client,
              taskNameFromInput,
              workspaceGid,
              projectContext,
              true,
              requestContext.requestId,
            );

            if (findResult.type === 'found') {
              actualTaskGid = findResult.gid;
            } else if (findResult.type === 'ambiguous') {
              return `Error: ${findResult.message} (Request ID: ${requestContext.requestId})`;
            } else {
              return `Error: Task named "${taskNameFromInput}"${projectContext ? ` in project context "${projectContext}"` : ''} not found. (Request ID: ${requestContext.requestId})`;
            }
          }

          if (!actualTaskGid) {
            return `Error: Could not identify the task from your request. Please provide a task GID or a clear name. (Request ID: ${requestContext.requestId})`;
          }

          const taskData = await getTaskDetails(
            this.client,
            actualTaskGid,
            undefined,
            requestContext.requestId,
          );
          return formatTaskDetails(taskData, requestContext);
        }

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

          // Handle completion status for task listing
          if (listTasksIntent.completed === true) {
            // Asana's `completed_since` parameter is for incomplete tasks.
            // To get *only* completed tasks reliably, one typically needs to use
            // `completed_on` with a date or `completed_until`, or fetch all and filter.
            // For now, inform the user and show active tasks.
            // We'll still set completed_since to 'now' to show active tasks predominantly.
            console.warn(
              `[AsanaTool] [${requestContext.requestId}] User requested completed tasks. Current implementation primarily shows active tasks. Consider enhancing completed task filtering.`,
            );
            // By default, if neither completed nor incomplete is specified, we show incomplete tasks.
            // If 'completed' is specified, for now, we still show active tasks as this is what completed_since=now does.
            // A future improvement could be to fetch with a wider date range for 'completed_on' or leave completed_since unset.
            listTasksParams.completed_since = 'now'; // Shows incomplete, which is the active view.
            // It might be better to return a message here and not proceed if this is not the desired behavior.
            // For now, let's proceed with showing active tasks and potentially add a note in the formatter.
          } else if (listTasksIntent.completed === false) {
            listTasksParams.completed_since = 'now'; // Explicitly ask for incomplete
          } else {
            // Default to incomplete tasks if not specified
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
        case AsanaOperationType.MARK_TASK_INCOMPLETE: {
          const {
            gid: taskGidFromInput,
            name: taskNameFromInput,
            projectName: projectContext,
          } = extractTaskIdentifier(actionDescription);

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualTaskGid = taskGidFromInput;
          if (!actualTaskGid && taskNameFromInput) {
            const shouldIncludeCompleted =
              parsedIntent.operationType ===
              AsanaOperationType.MARK_TASK_INCOMPLETE;
            const taskLookupResult = await findTaskGidByName(
              this.client,
              taskNameFromInput,
              workspaceGid,
              projectContext,
              shouldIncludeCompleted,
              requestContext.requestId,
            );
            if (taskLookupResult.type === 'found') {
              actualTaskGid = taskLookupResult.gid;
            } else if (taskLookupResult.type === 'ambiguous') {
              return `Error: Task "${taskNameFromInput}"${projectContext ? ` in project context "${projectContext}"` : ''} is ambiguous. ${taskLookupResult.message} (Request ID: ${requestContext.requestId})`;
            } else {
              const statusHint = shouldIncludeCompleted
                ? '(completed)'
                : '(incomplete)';
              return `Error: Task "${taskNameFromInput}"${projectContext ? ` in project "${projectContext}"` : ''} ${statusHint} not found. (Request ID: ${requestContext.requestId})`;
            }
          }

          // If after trying to get by GID or by Name, we still don't have a GID, then error out.
          if (!actualTaskGid) {
            const actionVerb =
              parsedIntent.operationType === AsanaOperationType.COMPLETE_TASK
                ? 'complete'
                : 'reopen';
            return `Error: Could not identify the task to ${actionVerb}. Please provide a task GID or name. (Request ID: ${requestContext.requestId})`;
          }

          // By this point, actualTaskGid is guaranteed to be a string.
          const newCompletedStatus =
            parsedIntent.operationType === AsanaOperationType.COMPLETE_TASK;

          const updatedTask = await updateTask(
            this.client,
            actualTaskGid, // No non-null assertion needed here
            { completed: newCompletedStatus },
            requestContext.requestId,
          );

          return formatTaskUpdate(
            updatedTask,
            { completed: newCompletedStatus },
            requestContext,
          );
        }

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

        case AsanaOperationType.SEARCH_ASANA: {
          const { query, resourceType } =
            extractSearchQueryAndType(actionDescription);

          if (!query) {
            return `Error: Please provide a search query. (Request ID: ${requestContext.requestId})`;
          }

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          const searchResults = await typeaheadSearch(
            this.client,
            {
              workspaceGid,
              query,
              resourceType, // Will be undefined if not specified by user, leading to mixed results
              count: 10, // Default to 10 results for general search
            },
            requestContext.requestId,
          );

          return formatSearchResults(
            searchResults,
            query,
            resourceType,
            requestContext,
          );
        }

        case AsanaOperationType.ADD_FOLLOWER_TO_TASK: {
          const {
            taskGid: taskGidFromInput,
            taskName: taskNameFromInput,
            projectName: projectContext,
            userGid: userGidFromInput,
            userNameOrEmail,
          } = extractTaskAndUserIdentifiers(actionDescription);

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualTaskGid = taskGidFromInput;
          if (!actualTaskGid && taskNameFromInput) {
            const taskLookup = await findTaskGidByName(
              this.client,
              taskNameFromInput,
              workspaceGid,
              projectContext,
              true, // Search for task regardless of completion status
              requestContext.requestId,
            );
            if (taskLookup.type === 'found') actualTaskGid = taskLookup.gid;
            else if (taskLookup.type === 'ambiguous')
              return `Error: Task to add follower to is ambiguous: ${taskLookup.message} (Request ID: ${requestContext.requestId})`;
            else
              return `Error: Task "${taskNameFromInput}" not found. (Request ID: ${requestContext.requestId})`;
          }

          if (!actualTaskGid) {
            return `Error: Could not identify the task to add a follower to. Please provide a task GID or a clear name. (Request ID: ${requestContext.requestId})`;
          }

          let actualUserGid = userGidFromInput;
          if (!actualUserGid && userNameOrEmail) {
            if (userNameOrEmail.toLowerCase() === 'me') {
              const meUser = await getUsersMe(
                this.client,
                requestContext.requestId,
              );
              actualUserGid = meUser.gid;
            } else {
              const userLookupResult = await findUserGidByEmailOrName(
                this.client,
                workspaceGid, // Corrected order: client, workspaceGid, userNameOrEmail
                userNameOrEmail,
                requestContext.requestId,
              );
              if (userLookupResult && userLookupResult !== 'ambiguous') {
                actualUserGid = userLookupResult;
              } else if (userLookupResult === 'ambiguous') {
                return `Error: User "${userNameOrEmail}" to add as follower is ambiguous. Please provide a unique identifier or GID. (Request ID: ${requestContext.requestId})`;
              } else {
                // userLookupResult is undefined (not found)
                return `Error: User "${userNameOrEmail}" not found to add as follower. (Request ID: ${requestContext.requestId})`;
              }
            }
          }

          if (!actualUserGid) {
            return `Error: Could not identify the user to add as a follower. Please provide a user GID, name, or email. (Request ID: ${requestContext.requestId})`;
          }

          const updatedTaskData = await addFollowerToTask(
            this.client,
            actualTaskGid,
            actualUserGid,
            requestContext.requestId,
          );
          return formatAddFollowerResponse(
            updatedTaskData,
            userNameOrEmail || actualUserGid, // Pass the identifier used by the user or the resolved GID
            taskNameFromInput || actualTaskGid, // Pass the task name used by user or resolved GID
            requestContext,
          );
        }

        case AsanaOperationType.REMOVE_FOLLOWER_FROM_TASK: {
          const {
            taskGid: taskGidFromInput,
            taskName: taskNameFromInput,
            projectName: projectContext,
            userGid: userGidFromInput,
            userNameOrEmail,
          } = extractTaskAndUserIdentifiers(actionDescription);

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualTaskGid = taskGidFromInput;
          if (!actualTaskGid && taskNameFromInput) {
            const taskLookup = await findTaskGidByName(
              this.client,
              taskNameFromInput,
              workspaceGid,
              projectContext,
              true, // Search for task regardless of completion status
              requestContext.requestId,
            );
            if (taskLookup.type === 'found') actualTaskGid = taskLookup.gid;
            else if (taskLookup.type === 'ambiguous')
              return `Error: Task to remove follower from is ambiguous: ${taskLookup.message} (Request ID: ${requestContext.requestId})`;
            else
              return `Error: Task "${taskNameFromInput}" not found. (Request ID: ${requestContext.requestId})`;
          }

          if (!actualTaskGid) {
            return `Error: Could not identify the task to remove a follower from. Please provide a task GID or a clear name. (Request ID: ${requestContext.requestId})`;
          }

          let actualUserGid = userGidFromInput;
          if (!actualUserGid && userNameOrEmail) {
            if (userNameOrEmail.toLowerCase() === 'me') {
              const meUser = await getUsersMe(
                this.client,
                requestContext.requestId,
              );
              actualUserGid = meUser.gid;
            } else {
              const userLookupResult = await findUserGidByEmailOrName(
                this.client,
                workspaceGid,
                userNameOrEmail,
                requestContext.requestId,
              );
              if (userLookupResult && userLookupResult !== 'ambiguous') {
                actualUserGid = userLookupResult;
              } else if (userLookupResult === 'ambiguous') {
                return `Error: User "${userNameOrEmail}" to remove as follower is ambiguous. Please provide a unique identifier or GID. (Request ID: ${requestContext.requestId})`;
              } else {
                // userLookupResult is undefined (not found)
                return `Error: User "${userNameOrEmail}" not found to remove as follower. (Request ID: ${requestContext.requestId})`;
              }
            }
          }

          if (!actualUserGid) {
            return `Error: Could not identify the user to remove as a follower. Please provide a user GID, name, or email. (Request ID: ${requestContext.requestId})`;
          }

          const updatedTaskData = await removeFollowerFromTask(
            this.client,
            actualTaskGid,
            actualUserGid,
            requestContext.requestId,
          );
          return formatRemoveFollowerResponse(
            updatedTaskData, // This might be an empty object if Asana returns 204 No Content
            userNameOrEmail || actualUserGid,
            taskNameFromInput || actualTaskGid,
            requestContext,
          );
        }

        case AsanaOperationType.SET_TASK_DUE_DATE: {
          const {
            taskGid: taskGidFromInput,
            taskName: taskNameFromInput,
            projectName: projectContext,
            dueDateExpression,
          } = extractTaskAndDueDate(actionDescription);

          if (!dueDateExpression) {
            return `Error: Could not determine the due date from your request. Please specify a date or time. (Request ID: ${requestContext.requestId})`;
          }

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualTaskGid = taskGidFromInput;
          if (!actualTaskGid && taskNameFromInput) {
            const taskLookup = await findTaskGidByName(
              this.client,
              taskNameFromInput,
              workspaceGid,
              projectContext,
              true,
              requestContext.requestId,
            );
            if (taskLookup.type === 'found') actualTaskGid = taskLookup.gid;
            else if (taskLookup.type === 'ambiguous')
              return `Error: Task "${taskNameFromInput}" is ambiguous: ${taskLookup.message}. (Request ID: ${requestContext.requestId})`;
            else
              return `Error: Task "${taskNameFromInput}" not found. (Request ID: ${requestContext.requestId})`;
          }
          if (!actualTaskGid) {
            return `Error: Could not identify the task. (Request ID: ${requestContext.requestId})`;
          }

          const parsedResult = parseDateTime(dueDateExpression, new Date());

          if (!parsedResult.success) {
            return `Error: Could not understand the due date "${dueDateExpression}". ${parsedResult.errorMessage}${parsedResult.suggestions ? `\n\n${parsedResult.suggestions.join('\n')}` : ''} (Request ID: ${requestContext.requestId})`;
          }

          const updatePayload: { due_on?: string; due_at?: string } = {};

          // Use the formatted result from our enhanced parser
          if (parsedResult.hasTime) {
            updatePayload.due_at = parsedResult.formattedForAsana.due_at;
          } else {
            updatePayload.due_on = parsedResult.formattedForAsana.due_on;
          }

          const updatedTask = await updateTask(
            this.client,
            actualTaskGid,
            updatePayload,
            requestContext.requestId,
          );
          return formatTaskUpdate(updatedTask, updatePayload, requestContext);
        }

        case AsanaOperationType.ADD_SUBTASK: {
          const {
            parentTaskGid: parentGidFromInput,
            parentTaskName,
            parentProjectName,
            subtaskName,
          } = extractSubtaskCreationDetails(actionDescription);

          if (!subtaskName) {
            return `Error: Subtask name is required to create a subtask. (Request ID: ${requestContext.requestId})`;
          }

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          // If no parent project specified, prompt the user to select one for context (optional, but can help with parent task disambiguation)
          if (!parentProjectName) {
            const projects = await listProjects(
              this.client,
              workspaceGid,
              false,
              requestContext.requestId,
            );
            if (!projects || projects.length === 0) {
              return `No projects found in your Asana workspace. Please create a project first. (Request ID: ${requestContext.requestId})`;
            }
            return `Please specify which project the parent task belongs to (for better subtask association). Here are your available projects:\n\n${formatProjectList(projects, {}, requestContext)}\n\nReply with the project name or GID.`;
          }

          let actualParentTaskGid = parentGidFromInput;
          if (!actualParentTaskGid && parentTaskName) {
            const parentTaskLookup = await findTaskGidByName(
              this.client,
              parentTaskName,
              workspaceGid,
              parentProjectName, // Use project context if available for parent task
              true, // Include completed tasks in search for parent
              requestContext.requestId,
            );
            if (parentTaskLookup.type === 'found') {
              actualParentTaskGid = parentTaskLookup.gid;
            } else if (parentTaskLookup.type === 'ambiguous') {
              return `Error: Parent task "${parentTaskName}" is ambiguous: ${parentTaskLookup.message} (Request ID: ${requestContext.requestId})`;
            } else {
              return `Error: Parent task "${parentTaskName}" not found. (Request ID: ${requestContext.requestId})`;
            }
          }

          if (!actualParentTaskGid) {
            return `Error: Could not identify the parent task to add a subtask to. Please provide a parent task GID or a clear name. (Request ID: ${requestContext.requestId})`;
          }

          // Create subtask params
          const subtaskParams: CreateTaskParams = {
            name: subtaskName,
            workspace: workspaceGid, // Subtasks still need workspace GID
            parent: actualParentTaskGid,
          };

          // Create the subtask
          const createdSubtask = await createTask(
            this.client,
            subtaskParams,
            requestContext.requestId,
          );

          // Use the existing formatTaskCreation, it should work fine for subtasks too.
          // We might want a more specific formatter later if needed.
          return formatTaskCreation(
            createdSubtask,
            {
              projectName: parentProjectName,
            },
            requestContext,
          );
        }

        case AsanaOperationType.LIST_SUBTASKS: {
          const {
            gid: parentGidFromInput,
            name: parentTaskNameFromInput,
            projectName: parentProjectContext, // Project context of the parent task
          } = extractTaskIdentifier(actionDescription); // Use existing extractor for parent task

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualParentTaskGid = parentGidFromInput;
          let resolvedParentTaskName = parentTaskNameFromInput; // Keep for formatter

          if (!actualParentTaskGid && parentTaskNameFromInput) {
            const parentTaskLookup = await findTaskGidByName(
              this.client,
              parentTaskNameFromInput,
              workspaceGid,
              parentProjectContext,
              true, // Include completed tasks in search for parent
              requestContext.requestId,
            );
            if (parentTaskLookup.type === 'found') {
              actualParentTaskGid = parentTaskLookup.gid;
              resolvedParentTaskName = parentTaskLookup.name; // Use the name from lookup
            } else if (parentTaskLookup.type === 'ambiguous') {
              return `Error: Parent task "${parentTaskNameFromInput}" is ambiguous: ${parentTaskLookup.message} (Request ID: ${requestContext.requestId})`;
            } else {
              return `Error: Parent task "${parentTaskNameFromInput}" not found. (Request ID: ${requestContext.requestId})`;
            }
          }

          if (!actualParentTaskGid) {
            return `Error: Could not identify the parent task to list subtasks for. Please provide a parent task GID or a clear name. (Request ID: ${requestContext.requestId})`;
          }

          const subtasksData = await getSubtasks(
            this.client,
            actualParentTaskGid,
            undefined, // Use default opt_fields for now
            requestContext.requestId,
          );

          // Use existing formatTaskList, but add context about the parent task
          const parentTaskIdentifier =
            resolvedParentTaskName || actualParentTaskGid;
          const listTitle = `Subtasks for parent task "${parentTaskIdentifier}"`;

          if (subtasksData.length === 0) {
            return `${listTitle}: None found. (Request ID: ${requestContext.requestId})`;
          }
          // Re-using formatTaskList might be okay, or a dedicated subtask list formatter could be better for clarity
          // For now, prepend a title to the existing formatter's output.
          const formattedSubtaskList = formatTaskList(
            subtasksData,
            {},
            requestContext,
          );
          return `${listTitle}:\n${formattedSubtaskList.substring(formattedSubtaskList.indexOf(':\n') + 2)}`; // Attempt to clean up original title
        }

        case AsanaOperationType.ADD_TASK_DEPENDENCY:
        case AsanaOperationType.REMOVE_TASK_DEPENDENCY: {
          const {
            dependentTaskGid: dependentGidFromInput,
            dependentTaskName,
            dependencyTaskGid: dependencyGidFromInput,
            dependencyTaskName,
            projectName: projectContext,
          } = extractTaskDependencyDetails(actionDescription);

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          // Resolve dependent task GID
          let actualDependentTaskGid = dependentGidFromInput;
          if (!actualDependentTaskGid && dependentTaskName) {
            const dependentTaskLookup = await findTaskGidByName(
              this.client,
              dependentTaskName,
              workspaceGid,
              projectContext,
              true, // Search for task regardless of completion status
              requestContext.requestId,
            );
            if (dependentTaskLookup.type === 'found') {
              actualDependentTaskGid = dependentTaskLookup.gid;
            } else if (dependentTaskLookup.type === 'ambiguous') {
              return `Error: Dependent task "${dependentTaskName}" is ambiguous: ${dependentTaskLookup.message} (Request ID: ${requestContext.requestId})`;
            } else {
              return `Error: Dependent task "${dependentTaskName}" not found. (Request ID: ${requestContext.requestId})`;
            }
          }

          // Resolve dependency task GID
          let actualDependencyTaskGid = dependencyGidFromInput;
          if (!actualDependencyTaskGid && dependencyTaskName) {
            const dependencyTaskLookup = await findTaskGidByName(
              this.client,
              dependencyTaskName,
              workspaceGid,
              projectContext,
              true, // Search for task regardless of completion status
              requestContext.requestId,
            );
            if (dependencyTaskLookup.type === 'found') {
              actualDependencyTaskGid = dependencyTaskLookup.gid;
            } else if (dependencyTaskLookup.type === 'ambiguous') {
              return `Error: Dependency task "${dependencyTaskName}" is ambiguous: ${dependencyTaskLookup.message} (Request ID: ${requestContext.requestId})`;
            } else {
              return `Error: Dependency task "${dependencyTaskName}" not found. (Request ID: ${requestContext.requestId})`;
            }
          }

          if (!actualDependentTaskGid) {
            return `Error: Could not identify the dependent task. Please provide a task GID or clear name. (Request ID: ${requestContext.requestId})`;
          }

          if (!actualDependencyTaskGid) {
            return `Error: Could not identify the dependency task. Please provide a task GID or clear name. (Request ID: ${requestContext.requestId})`;
          }

          // Perform the dependency operation
          try {
            if (
              parsedIntent.operationType ===
              AsanaOperationType.ADD_TASK_DEPENDENCY
            ) {
              const updatedTask = await addDependency(
                this.client,
                actualDependentTaskGid,
                actualDependencyTaskGid,
                requestContext.requestId,
              );
              return `Successfully added dependency: task "${dependentTaskName || actualDependentTaskGid}" now depends on task "${dependencyTaskName || actualDependencyTaskGid}".
${updatedTask.permalink_url ? `View dependent task at: ${updatedTask.permalink_url}` : ''}
(Request ID: ${requestContext.requestId})`;
            } else {
              const updatedTask = await removeDependency(
                this.client,
                actualDependentTaskGid,
                actualDependencyTaskGid,
                requestContext.requestId,
              );
              return `Successfully removed dependency: task "${dependentTaskName || actualDependentTaskGid}" is no longer dependent on task "${dependencyTaskName || actualDependencyTaskGid}".
${updatedTask.permalink_url ? `View task at: ${updatedTask.permalink_url}` : ''}
(Request ID: ${requestContext.requestId})`;
            }
          } catch (error) {
            const operation =
              parsedIntent.operationType ===
              AsanaOperationType.ADD_TASK_DEPENDENCY
                ? 'adding'
                : 'removing';
            return `Error ${operation} dependency between tasks: ${error instanceof Error ? error.message : 'Unknown error'} (Request ID: ${requestContext.requestId})`;
          }
        }

        case AsanaOperationType.LIST_PROJECT_SECTIONS: {
          const {
            projectGid: projectGidFromInput,
            projectName: projectNameFromInput,
          } = extractProjectAndSectionIdentifiers(actionDescription);

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualProjectGid = projectGidFromInput;
          const resolvedProjectName = projectNameFromInput;

          if (!actualProjectGid && projectNameFromInput) {
            const projectLookup = await findProjectGidByName(
              this.client,
              projectNameFromInput,
              workspaceGid,
              requestContext.requestId,
            );
            if (projectLookup === 'ambiguous') {
              return `Error: Project "${projectNameFromInput}" is ambiguous. Please specify which project by GID or a more specific name. (Request ID: ${requestContext.requestId})`;
            }
            if (!projectLookup) {
              return `Error: Project "${projectNameFromInput}" not found. (Request ID: ${requestContext.requestId})`;
            }
            actualProjectGid = projectLookup;
          }

          if (!actualProjectGid) {
            return `Error: Could not identify the project to list sections for. Please provide a project GID or clear name. (Request ID: ${requestContext.requestId})`;
          }

          const sectionsData = await getProjectSections(
            this.client,
            actualProjectGid,
            undefined, // Use default opt_fields
            requestContext.requestId,
          );

          return formatSectionList(
            sectionsData,
            {
              projectName: resolvedProjectName,
              projectGid: actualProjectGid,
            },
            requestContext,
          );
        }

        case AsanaOperationType.CREATE_PROJECT_SECTION: {
          const {
            projectGid: projectGidFromInput,
            projectName: projectNameFromInput,
            sectionName,
          } = extractSectionCreationDetails(actionDescription);

          if (!sectionName) {
            return `Error: Section name is required to create a section. (Request ID: ${requestContext.requestId})`;
          }

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualProjectGid = projectGidFromInput;
          const resolvedProjectName = projectNameFromInput;

          if (!actualProjectGid && projectNameFromInput) {
            const projectLookup = await findProjectGidByName(
              this.client,
              projectNameFromInput,
              workspaceGid,
              requestContext.requestId,
            );
            if (projectLookup === 'ambiguous') {
              return `Error: Project "${projectNameFromInput}" is ambiguous. Please specify which project by GID or a more specific name. (Request ID: ${requestContext.requestId})`;
            }
            if (!projectLookup) {
              return `Error: Project "${projectNameFromInput}" not found. (Request ID: ${requestContext.requestId})`;
            }
            actualProjectGid = projectLookup;
          }

          if (!actualProjectGid) {
            return `Error: Could not identify the project to create a section in. Please provide a project GID or clear name. (Request ID: ${requestContext.requestId})`;
          }

          const createdSection = await createSectionInProject(
            this.client,
            {
              name: sectionName,
              projectGid: actualProjectGid,
            },
            requestContext.requestId,
          );

          return formatSectionCreation(
            createdSection,
            {
              projectName: resolvedProjectName,
              projectGid: actualProjectGid,
            },
            requestContext,
          );
        }

        case AsanaOperationType.MOVE_TASK_TO_SECTION: {
          const {
            taskGid: taskGidFromInput,
            taskName: taskNameFromInput,
            taskProjectName,
            sectionGid: sectionGidFromInput,
            sectionName: sectionNameFromInput,
          } = extractTaskAndSectionIdentifiers(actionDescription);

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualTaskGid = taskGidFromInput;
          if (!actualTaskGid && taskNameFromInput) {
            const taskLookup = await findTaskGidByName(
              this.client,
              taskNameFromInput,
              workspaceGid,
              taskProjectName,
              true, // Include completed tasks
              requestContext.requestId,
            );
            if (taskLookup.type === 'found') {
              actualTaskGid = taskLookup.gid;
            } else if (taskLookup.type === 'ambiguous') {
              return `Error: Task "${taskNameFromInput}" is ambiguous: ${taskLookup.message} (Request ID: ${requestContext.requestId})`;
            } else {
              return `Error: Task "${taskNameFromInput}" not found. (Request ID: ${requestContext.requestId})`;
            }
          }

          if (!actualTaskGid) {
            return `Error: Could not identify the task to move. Please provide a task GID or clear name. (Request ID: ${requestContext.requestId})`;
          }

          let actualSectionGid = sectionGidFromInput;
          const resolvedSectionName = sectionNameFromInput;

          if (!actualSectionGid && sectionNameFromInput) {
            // Need to find the section, but we need the project GID for that
            // Try to get project GID from the task details first
            let projectGidForSection: string | undefined;

            if (taskProjectName) {
              const projectLookup = await findProjectGidByName(
                this.client,
                taskProjectName,
                workspaceGid,
                requestContext.requestId,
              );
              if (projectLookup && projectLookup !== 'ambiguous') {
                projectGidForSection = projectLookup;
              }
            }

            if (!projectGidForSection) {
              // Get task details to find its project
              const taskDetails = await getTaskDetails(
                this.client,
                actualTaskGid,
                ['projects.gid', 'projects.name'],
                requestContext.requestId,
              );
              if (taskDetails.projects && taskDetails.projects.length > 0) {
                projectGidForSection = taskDetails.projects[0].gid;
              }
            }

            if (!projectGidForSection) {
              return `Error: Could not determine the project to search for section "${sectionNameFromInput}". Please specify the project context. (Request ID: ${requestContext.requestId})`;
            }

            const sectionLookup = await findSectionGidByName(
              this.client,
              sectionNameFromInput,
              projectGidForSection,
              requestContext.requestId,
            );

            if (sectionLookup === 'ambiguous') {
              return `Error: Section "${sectionNameFromInput}" is ambiguous in the project. Please specify a section GID. (Request ID: ${requestContext.requestId})`;
            }
            if (!sectionLookup) {
              return `Error: Section "${sectionNameFromInput}" not found in the project. (Request ID: ${requestContext.requestId})`;
            }
            actualSectionGid = sectionLookup;
          }

          if (!actualSectionGid) {
            return `Error: Could not identify the section to move the task to. Please provide a section GID or clear name with project context. (Request ID: ${requestContext.requestId})`;
          }

          const moveResult = await addTaskToSection(
            this.client,
            actualSectionGid,
            actualTaskGid,
            requestContext.requestId,
          );

          return formatTaskMoveToSection(
            moveResult,
            {
              taskName: taskNameFromInput,
              taskGid: actualTaskGid,
              sectionName: resolvedSectionName,
              sectionGid: actualSectionGid,
              projectName: taskProjectName,
            },
            requestContext,
          );
        }

        case AsanaOperationType.UNKNOWN:
        default: {
          // Handle unknown or unsupported operations
          let finalErrorMessage = `I couldn't understand what Asana operation you want to perform. Please try rephrasing your request. (Request ID: ${requestContext.requestId})`;
          if (
            'errorMessage' in parsedIntent &&
            typeof parsedIntent.errorMessage === 'string'
          ) {
            finalErrorMessage = parsedIntent.errorMessage;
          }
          return finalErrorMessage;
        }
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
