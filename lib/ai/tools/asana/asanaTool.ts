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
  getUserDetails,
  listWorkspaceUsers,
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
  deleteTask,
  type UpdateTaskParams,
  type CreateTaskParams,
  getSubtasks,
} from './api-client/operations/tasks';
import {
  listProjects,
  findProjectGidByName,
  createProject,
  verifyProjectVisibility,
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
  extractProjectGidFromInput,
} from './intent-parser/entity.extractor';
import { typeaheadSearch } from './api-client/operations/search';
import { parseDateTime } from './utils/dateTimeParser';
import { extractNamesFromInput } from './utils/gidUtils';

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
  formatUserDetails,
  formatWorkspaceUsersList,
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

        case AsanaOperationType.GET_USER_DETAILS: {
          const getUserDetailsIntent = parsedIntent as any;
          const workspaceGid = getWorkspaceGid();

          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID. (Request ID: ${requestContext.requestId})`;
          }

          // Extract user identifier from the parsed intent or action description
          let userGid: string | undefined;
          let userName: string | undefined;
          let userEmail: string | undefined;

          if (getUserDetailsIntent.userIdentifier) {
            userGid = getUserDetailsIntent.userIdentifier.gid;
            userName = getUserDetailsIntent.userIdentifier.name;
            userEmail = getUserDetailsIntent.userIdentifier.email;
          }

          // If no parsed identifier, try to extract from action description
          if (!userGid && !userName && !userEmail) {
            const userNameMatch =
              actionDescription.match(
                /(?:show|get|find|lookup).*(?:profile|details|info).*(?:for|of|about)\s+["']?([^"']+)["']?/i,
              ) ||
              actionDescription.match(
                /["']?([^"']+)["']?(?:'s)?\s+(?:profile|details|info)/i,
              );
            if (userNameMatch) {
              userName = userNameMatch[1].trim();
            }
          }

          if (!userGid && !userName && !userEmail) {
            return `Error: Could not identify which user's profile to show. Please specify a name, email, or GID. (Request ID: ${requestContext.requestId})`;
          }

          // If we have a name or email, look up the GID
          if (!userGid && (userName || userEmail)) {
            const identifier = userName || userEmail;
            if (!identifier) {
              return `Error: Could not extract user identifier. (Request ID: ${requestContext.requestId})`;
            }

            try {
              const lookupResult = await findUserGidByEmailOrName(
                this.client,
                workspaceGid,
                identifier,
                requestContext.requestId,
              );

              if (lookupResult === 'ambiguous') {
                return `Error: Multiple users found matching "${identifier}". Please be more specific or provide a user GID. (Request ID: ${requestContext.requestId})`;
              }

              if (!lookupResult) {
                return `Error: No user found matching "${identifier}". Please check the name/email and try again. (Request ID: ${requestContext.requestId})`;
              }

              userGid = lookupResult;
            } catch (error) {
              return `Error looking up user "${identifier}": ${error instanceof Error ? error.message : 'Unknown error'}. (Request ID: ${requestContext.requestId})`;
            }
          }

          if (!userGid) {
            return `Error: Could not resolve user identifier. (Request ID: ${requestContext.requestId})`;
          }

          // Get user details
          try {
            const userDetails = await getUserDetails(
              this.client,
              userGid,
              requestContext.requestId,
            );
            return formatUserDetails(userDetails, requestContext);
          } catch (error) {
            return `Error retrieving user details: ${error instanceof Error ? error.message : 'Unknown error'}. (Request ID: ${requestContext.requestId})`;
          }
        }

        case AsanaOperationType.LIST_WORKSPACE_USERS: {
          const listUsersIntent = parsedIntent as any;
          const workspaceGid = getWorkspaceGid();

          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID. (Request ID: ${requestContext.requestId})`;
          }

          try {
            // Get workspace info for better formatting
            const workspaceDetails = await this.client.request<any>(
              `workspaces/${workspaceGid}`,
              'GET',
              undefined,
              { opt_fields: 'name,gid' },
              requestContext.requestId,
            );

            // List all users in the workspace
            const usersData = await listWorkspaceUsers(
              this.client,
              workspaceGid,
              requestContext.requestId,
            );

            return formatWorkspaceUsersList(
              usersData,
              {
                name: workspaceDetails.name,
                gid: workspaceDetails.gid,
              },
              requestContext,
            );
          } catch (error) {
            return `Error listing workspace users: ${error instanceof Error ? error.message : 'Unknown error'}. (Request ID: ${requestContext.requestId})`;
          }
        }

        case AsanaOperationType.CREATE_TASK: {
          const { requestId } = requestContext;
          console.log(
            `[AsanaTool] [${requestId}] CREATE_TASK received actionDescription: "${actionDescription.substring(0, 200)}..."`,
          );

          const createTaskIntent = parsedIntent as any;
          const workspaceGid = getWorkspaceGid();

          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID. (Request ID: ${requestId})`;
          }

          // --- State variables for gathering information ---
          let resolvedTaskName: string | undefined = createTaskIntent.taskName;
          let resolvedProjectGid: string | undefined =
            extractProjectGidFromInput(actionDescription);
          let resolvedProjectName: string | undefined = resolvedProjectGid
            ? undefined
            : createTaskIntent.projectName;
          let projectPermalink: string | undefined;
          let resolvedAssigneeGid: string | undefined;
          let resolvedAssigneeName: string | undefined =
            createTaskIntent.assigneeName;
          let resolvedDueDate: string | undefined; // YYYY-MM-DD
          const originalDueDateExpression: string | undefined =
            createTaskIntent.dueDate;
          const resolvedTaskNotes: string | undefined =
            createTaskIntent.taskNotes;

          // Debug logging
          console.log(`[AsanaTool] [${requestId}] Initial extraction results:`);
          console.log(
            `[AsanaTool] [${requestId}]   taskName from intent: ${resolvedTaskName}`,
          );
          console.log(
            `[AsanaTool] [${requestId}]   projectGid extracted: ${resolvedProjectGid}`,
          );
          console.log(
            `[AsanaTool] [${requestId}]   projectName from intent: ${createTaskIntent.projectName}`,
          );
          console.log(
            `[AsanaTool] [${requestId}]   assigneeName from intent: ${resolvedAssigneeName}`,
          );
          console.log(
            `[AsanaTool] [${requestId}]   dueDate from intent: ${originalDueDateExpression}`,
          );

          const isPotentiallyConfirmedCreation =
            actionDescription
              .toLowerCase()
              .startsWith('confirmed_create_task:') ||
            (resolvedProjectGid &&
              resolvedTaskName &&
              (createTaskIntent as any).confirmedByUser); // Cast to any for hypothetical field

          // Detect if this is a confirmation response to a previous comprehensive preview
          const isConfirmationResponse =
            /^(?:yes|yep|yeah|confirm|confirmed|ok|okay|sure|proceed|go ahead|do it|create|make it|sounds good)[.,!]*$/i.test(
              actionDescription.trim(),
            ) ||
            (actionDescription.toLowerCase().includes('confirm') &&
              actionDescription.length < 50);

          console.log(
            `[AsanaTool] [${requestId}] isConfirmationResponse: ${isConfirmationResponse}, isPotentiallyConfirmed: ${isPotentiallyConfirmedCreation}`,
          );
          console.log(
            `[AsanaTool] [${requestId}] actionDescription length: ${actionDescription.length}, trimmed: "${actionDescription.trim().substring(0, 100)}"`,
          );

          // Additional heuristic: If we have detailed task parameters and this looks like a repeat request within a conversation,
          // it's likely a confirmation flow
          const hasDetailedParams =
            resolvedTaskName &&
            (resolvedProjectName || resolvedProjectGid) &&
            (createTaskIntent.assigneeName ||
              createTaskIntent.dueDate ||
              createTaskIntent.taskNotes);
          const looksLikeRepeatRequest =
            hasDetailedParams &&
            actionDescription.includes(resolvedTaskName || '') &&
            actionDescription.includes(resolvedProjectName || '');

          console.log(
            `[AsanaTool] [${requestId}] hasDetailedParams: ${hasDetailedParams}, looksLikeRepeatRequest: ${looksLikeRepeatRequest}`,
          );

          const shouldProceedToCreation =
            isConfirmationResponse ||
            (looksLikeRepeatRequest && hasDetailedParams);

          // --- Information Gathering & Resolution (No early returns) ---

          // A. Task Name and fallback extraction
          if (!resolvedTaskName || !resolvedProjectName) {
            console.log(
              `[AsanaTool] [${requestId}] Missing taskName or projectName, performing fallback extraction from actionDescription`,
            );
            const names = extractNamesFromInput(actionDescription);
            console.log(
              `[AsanaTool] [${requestId}] Fallback extraction results:`,
              names,
            );

            if (!resolvedTaskName) {
              resolvedTaskName = names.taskName;
            }
            if (!resolvedProjectName) {
              resolvedProjectName = names.projectName;
            }

            console.log(
              `[AsanaTool] [${requestId}] After fallback extraction:`,
            );
            console.log(
              `[AsanaTool] [${requestId}]   resolvedTaskName: ${resolvedTaskName}`,
            );
            console.log(
              `[AsanaTool] [${requestId}]   resolvedProjectName: ${resolvedProjectName}`,
            );
          }

          // Also check if notes weren't captured but are present in the actionDescription
          let finalTaskNotes = resolvedTaskNotes;
          if (!finalTaskNotes) {
            const notesMatch =
              actionDescription.match(
                /(?:with|and)\s+(?:notes?|description)\s*(?:that says?|:)?\s*["']([^"']+)["']/i,
              ) || actionDescription.match(/note\s*["']([^"']+)["']/i);
            if (notesMatch) {
              finalTaskNotes = notesMatch[1];
              console.log(
                `[AsanaTool] [${requestId}] Extracted notes from actionDescription: "${finalTaskNotes}"`,
              );
            }
          }

          // Task name is the only truly required field - if missing, ask for it
          if (!resolvedTaskName) {
            return `What is the name of the task you'd like to create? (Request ID: ${requestId})`;
          }

          // B. Project Resolution (attempt, but don't fail)
          let projectResolutionStatus = '';
          if (!resolvedProjectGid) {
            console.log(
              `[AsanaTool] [${requestId}] No project GID found, attempting to resolve project name: "${resolvedProjectName}"`,
            );
            if (resolvedProjectName) {
              try {
                const projectLookup = await findProjectGidByName(
                  this.client,
                  resolvedProjectName,
                  workspaceGid,
                  requestId,
                );
                console.log(
                  `[AsanaTool] [${requestId}] Project lookup result for "${resolvedProjectName}": ${projectLookup}`,
                );

                if (projectLookup === 'ambiguous') {
                  projectResolutionStatus = `Ambiguous: Multiple projects match "${resolvedProjectName}"`;
                } else if (!projectLookup) {
                  projectResolutionStatus = `Not found: No project named "${resolvedProjectName}"`;
                } else {
                  resolvedProjectGid = projectLookup;
                  projectResolutionStatus = 'Resolved successfully';
                  console.log(
                    `[AsanaTool] [${requestId}] Successfully resolved project "${resolvedProjectName}" to GID: ${resolvedProjectGid}`,
                  );
                }
              } catch (error) {
                projectResolutionStatus = `Error: Could not resolve project "${resolvedProjectName}": ${error instanceof Error ? error.message : 'Unknown error'}`;
                console.log(
                  `[AsanaTool] [${requestId}] Project resolution error: ${projectResolutionStatus}`,
                );
              }
            } else {
              projectResolutionStatus = 'Not specified';
              console.log(`[AsanaTool] [${requestId}] No project name found`);
            }
          }

          // Fetch project details if resolved
          if (resolvedProjectGid) {
            try {
              const projectDetails = await this.client.request<any>(
                `projects/${resolvedProjectGid}`,
                'GET',
                undefined,
                { opt_fields: 'name,permalink_url' },
                requestId,
              );
              resolvedProjectName = projectDetails.name;
              projectPermalink = projectDetails.permalink_url;
              projectResolutionStatus = 'Resolved successfully';
            } catch (e) {
              console.warn(
                `[AsanaTool] [${requestId}] Failed to fetch details for project GID ${resolvedProjectGid}: ${e}`,
              );
              projectResolutionStatus = `Warning: Project GID ${resolvedProjectGid} exists but details couldn't be fetched`;
              if (!resolvedProjectName)
                resolvedProjectName = resolvedProjectGid;
            }
          }

          // C. Assignee Resolution (attempt, but don't fail)
          let assigneeResolutionStatus = '';
          if (createTaskIntent.assigneeName && !resolvedAssigneeGid) {
            resolvedAssigneeName = createTaskIntent.assigneeName;
            if (
              resolvedAssigneeName &&
              resolvedAssigneeName.toLowerCase() === 'me'
            ) {
              try {
                const meUser = await getUsersMe(this.client, requestId);
                resolvedAssigneeGid = meUser.gid;
                resolvedAssigneeName = meUser.name;
                assigneeResolutionStatus = 'Resolved to current user';
              } catch (error) {
                assigneeResolutionStatus = `Error: Could not resolve "me": ${error instanceof Error ? error.message : 'Unknown error'}`;
              }
            } else if (resolvedAssigneeName) {
              try {
                const userLookup = await findUserGidByEmailOrName(
                  this.client,
                  workspaceGid,
                  resolvedAssigneeName,
                  requestId,
                );
                if (userLookup === 'ambiguous') {
                  assigneeResolutionStatus = `Ambiguous: Multiple users match "${resolvedAssigneeName}"`;
                } else if (!userLookup) {
                  assigneeResolutionStatus = `Not found: No user named or emailed "${resolvedAssigneeName}"`;
                } else {
                  resolvedAssigneeGid = userLookup;
                  assigneeResolutionStatus = 'Resolved successfully';
                  // Fetch canonical name if GID was resolved
                  try {
                    const userDetails = await this.client.request<any>(
                      `users/${resolvedAssigneeGid}`,
                      'GET',
                      undefined,
                      { opt_fields: 'name' },
                      requestId,
                    );
                    resolvedAssigneeName =
                      userDetails.name || resolvedAssigneeName;
                  } catch (e) {
                    console.warn(
                      `[AsanaTool] [${requestId}] Failed to fetch details for user GID ${resolvedAssigneeGid}: ${e}`,
                    );
                  }
                }
              } catch (error) {
                assigneeResolutionStatus = `Error: Could not resolve assignee "${resolvedAssigneeName}": ${error instanceof Error ? error.message : 'Unknown error'}`;
              }
            }
          } else if (!createTaskIntent.assigneeName) {
            assigneeResolutionStatus = 'Not specified - will be unassigned';
          }

          // D. Due Date Resolution (attempt, but don't fail)
          let dueDateResolutionStatus = '';
          if (originalDueDateExpression) {
            const parsedDate = parseDateTime(originalDueDateExpression);
            if (parsedDate.success && parsedDate.date) {
              resolvedDueDate = parsedDate.date.toISOString().split('T')[0]; // YYYY-MM-DD
              dueDateResolutionStatus = 'Parsed successfully';
            } else {
              dueDateResolutionStatus = `Could not parse: "${originalDueDateExpression}"`;
            }
          } else {
            dueDateResolutionStatus = 'Not specified';
          }

          // --- Comprehensive Confirmation or Direct Creation ---

          // If this is a confirmation response and we have minimum required info, proceed to creation
          if (shouldProceedToCreation && resolvedTaskName) {
            console.log(
              `[AsanaTool] [${requestId}] User confirmed, proceeding with task creation`,
            );
            console.log(
              `[AsanaTool] [${requestId}] Final values for creation: taskName="${resolvedTaskName}", projectGid="${resolvedProjectGid}", assigneeGid="${resolvedAssigneeGid}", dueDate="${resolvedDueDate}"`,
            );

            // Check if we have critical issues that would prevent creation
            if (
              !resolvedProjectGid &&
              projectResolutionStatus.includes('Ambiguous')
            ) {
              return `Cannot create task: Project "${resolvedProjectName}" is ambiguous. Please specify which project by providing a more specific name or GID. (Request ID: ${requestId})`;
            }

            if (!resolvedProjectGid && !resolvedProjectName) {
              return `Cannot create task: No project specified. Please specify a project for the task. (Request ID: ${requestId})`;
            }

            if (
              !resolvedProjectGid &&
              projectResolutionStatus.includes('Not found')
            ) {
              return `Cannot create task: Project "${resolvedProjectName}" was not found. Please check the project name or provide a valid project GID. (Request ID: ${requestId})`;
            }

            // Proceed with creation using available information
            const createTaskParams: CreateTaskParams = {
              name: resolvedTaskName,
              workspace: workspaceGid,
            };

            // Add project if resolved - verify it's public to ensure task visibility
            if (resolvedProjectGid) {
              // Verify the project is actually public before creating tasks
              try {
                const visibilityCheck = await verifyProjectVisibility(
                  this.client,
                  resolvedProjectGid,
                  requestId,
                );

                if (visibilityCheck.isPublic) {
                  createTaskParams.projects = [resolvedProjectGid];
                  console.log(
                    `[AsanaTool] [${requestId}] ✅ Verified project ${resolvedProjectGid} is public (${visibilityCheck.details}). Task will inherit public visibility.`,
                  );
                } else {
                  createTaskParams.projects = [resolvedProjectGid];
                  console.warn(
                    `[AsanaTool] [${requestId}] ⚠️ Warning: Project ${resolvedProjectGid} appears to be private (${visibilityCheck.details}). Task may inherit private visibility.`,
                  );
                }
              } catch (error) {
                // Still create the task but warn about verification failure
                createTaskParams.projects = [resolvedProjectGid];
                console.warn(
                  `[AsanaTool] [${requestId}] ⚠️ Could not verify project visibility for ${resolvedProjectGid}: ${error}. Task will be created but visibility is uncertain.`,
                );
              }
            } else {
              console.warn(
                `[AsanaTool] [${requestId}] ⚠️ Warning: Creating task without a project. Task will default to private visibility. Consider specifying a public project.`,
              );
            }

            // Add notes if provided
            if (finalTaskNotes) {
              createTaskParams.notes = finalTaskNotes;
            }

            // Add assignee if resolved
            if (resolvedAssigneeGid) {
              createTaskParams.assignee = resolvedAssigneeGid;
            }

            // Add due date if resolved
            if (resolvedDueDate) {
              createTaskParams.due_on = resolvedDueDate; // Expects YYYY-MM-DD
            }

            console.log(
              `[AsanaTool] [${requestId}] Creating task with params:`,
              createTaskParams,
            );

            try {
              const taskData = await createTask(
                this.client,
                createTaskParams,
                requestId,
              );
              return formatTaskCreation(
                taskData,
                {
                  projectName: resolvedProjectName || resolvedProjectGid,
                  assigneeName: resolvedAssigneeName,
                },
                requestContext,
              );
            } catch (error) {
              console.error(
                `[AsanaTool] [${requestId}] Task creation failed:`,
                error,
              );
              return `Error creating task: ${error instanceof Error ? error.message : 'Unknown error'}. (Request ID: ${requestId})`;
            }
          }

          // --- Comprehensive Confirmation ---
          console.log(
            `[AsanaTool] [${requestId}] Presenting comprehensive confirmation for task creation`,
          );

          const confirmationMessageParts = [`**Task:** ${resolvedTaskName}`];

          // Project display
          let projectDisplay = '';
          if (resolvedProjectGid && projectPermalink) {
            projectDisplay = `[${resolvedProjectName}](${projectPermalink})`;
          } else if (resolvedProjectName) {
            projectDisplay = resolvedProjectName;
          } else {
            projectDisplay = 'Not specified';
          }
          if (projectResolutionStatus !== 'Resolved successfully') {
            projectDisplay += ` _(${projectResolutionStatus})_`;
          }
          confirmationMessageParts.push(`**Project:** ${projectDisplay}`);

          // Assignee display
          let assigneeDisplay = '';
          if (resolvedAssigneeGid && resolvedAssigneeName) {
            assigneeDisplay = resolvedAssigneeName; // Could add user link if Asana provides user URLs
          } else if (resolvedAssigneeName) {
            assigneeDisplay = resolvedAssigneeName;
          } else {
            assigneeDisplay = 'Unassigned';
          }
          if (
            assigneeResolutionStatus &&
            assigneeResolutionStatus !== 'Resolved successfully' &&
            assigneeResolutionStatus !== 'Not specified - will be unassigned'
          ) {
            assigneeDisplay += ` _(${assigneeResolutionStatus})_`;
          }
          confirmationMessageParts.push(`**Assignee:** ${assigneeDisplay}`);

          // Due date display
          let dueDateDisplay = '';
          if (resolvedDueDate) {
            dueDateDisplay = resolvedDueDate;
          } else if (originalDueDateExpression) {
            dueDateDisplay = `Not set _(${dueDateResolutionStatus})_`;
          } else {
            dueDateDisplay = 'Not set';
          }
          confirmationMessageParts.push(`**Due Date:** ${dueDateDisplay}`);

          // Notes display
          const notesDisplay = finalTaskNotes || 'None';
          confirmationMessageParts.push(`**Notes:** ${notesDisplay}`);

          const fullConfirmationPrompt = `I'm ready to create this Asana task. Please review the details:

${confirmationMessageParts.join('\n')}

${
  projectResolutionStatus.includes('Ambiguous') ||
  projectResolutionStatus.includes('Not found') ||
  assigneeResolutionStatus.includes('Ambiguous') ||
  assigneeResolutionStatus.includes('Not found') ||
  dueDateResolutionStatus.includes('Could not parse')
    ? "\n⚠️ **Note:** Some fields couldn't be resolved as shown above. The task will be created with available information.\n"
    : ''
}
Confirm to create this task, or provide corrections. (Request ID: ${requestId})`;

          return fullConfirmationPrompt;
        }

        case AsanaOperationType.UPDATE_TASK: {
          const {
            gid: taskGidFromInput,
            name: taskNameFromInput,
            projectName: projectContext,
          } = extractTaskIdentifier(actionDescription);

          const updateFields = extractTaskUpdateFields(actionDescription);

          if (
            !updateFields.notes &&
            !updateFields.dueDate &&
            updateFields.completed === undefined &&
            !updateFields.name
          ) {
            return `Could not determine the changes to make to the task. Please specify what to update (e.g., description, due date, status). (Request ID: ${requestContext.requestId})`;
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
              return `Error: Task to update is ambiguous: ${taskLookup.message} (Request ID: ${requestContext.requestId})`;
            else
              return `Error: Task named "${taskNameFromInput}"${projectContext ? ` in project "${projectContext}"` : ''} not found to update. (Request ID: ${requestContext.requestId})`;
          }

          if (!actualTaskGid) {
            return `Error: Could not identify the task for update. (Request ID: ${requestContext.requestId})`;
          }

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
          const listTasksIntent = parsedIntent as any;

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID in your environment. (Request ID: ${requestContext.requestId})`;
          }

          const listTasksParams: any = {
            workspace: workspaceGid,
          };

          // Handle assignee resolution
          if (listTasksIntent.assignedToMe) {
            listTasksParams.assignee = 'me';
          } else if (
            listTasksIntent.assigneeName ||
            listTasksIntent.assigneeEmail
          ) {
            // Resolve assignee name/email to GID
            const assigneeIdentifier =
              listTasksIntent.assigneeEmail || listTasksIntent.assigneeName;

            try {
              const assigneeGid = await findUserGidByEmailOrName(
                this.client,
                workspaceGid,
                assigneeIdentifier,
                requestContext.requestId,
              );

              if (assigneeGid === 'ambiguous') {
                return `Error: Multiple users found matching "${assigneeIdentifier}". Please be more specific with the user name or provide an email. (Request ID: ${requestContext.requestId})`;
              }

              if (!assigneeGid) {
                return `Error: No user found matching "${assigneeIdentifier}". Please check the name/email and try again. (Request ID: ${requestContext.requestId})`;
              }

              listTasksParams.assignee = assigneeGid;
              console.log(
                `[AsanaTool] [${requestContext.requestId}] Resolved assignee "${assigneeIdentifier}" to GID: ${assigneeGid}`,
              );
            } catch (error) {
              return `Error looking up user "${assigneeIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}. (Request ID: ${requestContext.requestId})`;
            }
          }

          if (listTasksIntent.completed === true) {
            console.warn(
              `[AsanaTool] [${requestContext.requestId}] User requested completed tasks. Current implementation primarily shows active tasks. Consider enhancing completed task filtering.`,
            );
            listTasksParams.completed_since = 'now';
          } else if (listTasksIntent.completed === false) {
            listTasksParams.completed_since = 'now';
          } else {
            listTasksParams.completed_since = 'now';
          }

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
                return `No project found matching "${listTasksIntent.projectName}". Please check the project name and try again. (Request ID: ${requestContext.requestId})`;
              }
            } catch (error) {
              console.error(`[AsanaTool] Error resolving project: ${error}`);
              return `Error finding project "${listTasksIntent.projectName}". (Request ID: ${requestContext.requestId})`;
            }
          }

          // Create custom filter description for specific assignee
          let customFilterDescription = '';
          if (listTasksIntent.assigneeName || listTasksIntent.assigneeEmail) {
            const assigneeName =
              listTasksIntent.assigneeName || listTasksIntent.assigneeEmail;
            customFilterDescription = ` assigned to ${assigneeName}`;
          }

          const tasksData = await listTasks(
            this.client,
            listTasksParams,
            requestContext.requestId,
          );

          // Enhanced filter context for formatting
          const filterContext = {
            projectName: listTasksIntent.projectName,
            assignedToMe: listTasksIntent.assignedToMe,
            completed: listTasksIntent.completed,
            customDescription: customFilterDescription,
          };

          return formatTaskList(tasksData, filterContext, requestContext);
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

          if (!actualTaskGid) {
            const actionVerb =
              parsedIntent.operationType === AsanaOperationType.COMPLETE_TASK
                ? 'complete'
                : 'reopen';
            return `Error: Could not identify the task to ${actionVerb}. Please provide a task GID or name. (Request ID: ${requestContext.requestId})`;
          }

          const newCompletedStatus =
            parsedIntent.operationType === AsanaOperationType.COMPLETE_TASK;

          const updatedTask = await updateTask(
            this.client,
            actualTaskGid,
            { completed: newCompletedStatus },
            requestContext.requestId,
          );

          return formatTaskUpdate(
            updatedTask,
            { completed: newCompletedStatus },
            requestContext,
          );
        }

        case AsanaOperationType.CREATE_PROJECT: {
          const createProjectIntent = parsedIntent as any;
          const workspaceGid = getWorkspaceGid();

          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID. (Request ID: ${requestContext.requestId})`;
          }

          if (!createProjectIntent.projectName) {
            return `Error: Project name is required to create a project. (Request ID: ${requestContext.requestId})`;
          }

          // Prepare project creation parameters with public visibility by default
          const createProjectParams = {
            name: createProjectIntent.projectName,
            workspace: workspaceGid,
            privacy_setting: 'public_to_workspace' as const,
            public: true,
            ...(createProjectIntent.teamGid && {
              team: createProjectIntent.teamGid,
            }),
            ...(createProjectIntent.notes && {
              notes: createProjectIntent.notes,
            }),
          };

          try {
            const projectData = await createProject(
              this.client,
              createProjectParams,
              requestContext.requestId,
            );

            return `Successfully created public Asana project: "${projectData.name}" (GID: ${projectData.gid})
Privacy: Public to workspace
${projectData.permalink_url ? `Permalink: ${projectData.permalink_url}` : ''}
(Request ID: ${requestContext.requestId})`;
          } catch (error) {
            console.error(
              `[AsanaTool] [${requestContext.requestId}] Project creation failed:`,
              error,
            );
            return `Error creating project: ${error instanceof Error ? error.message : 'Unknown error'}. (Request ID: ${requestContext.requestId})`;
          }
        }

        case AsanaOperationType.UPDATE_PROJECT:
          return `This operation is not yet implemented: Update Project (Request ID: ${requestContext.requestId})`;

        case AsanaOperationType.LIST_PROJECTS: {
          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID in your environment. (Request ID: ${requestContext.requestId})`;
          }

          const listProjectsIntent = parsedIntent as any;

          const archived = listProjectsIntent.archived || false;

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
              resourceType,
              count: 10,
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
              true,
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
                workspaceGid,
                userNameOrEmail,
                requestContext.requestId,
              );
              if (userLookupResult && userLookupResult !== 'ambiguous') {
                actualUserGid = userLookupResult;
              } else if (userLookupResult === 'ambiguous') {
                return `Error: User "${userNameOrEmail}" to add as follower is ambiguous. Please provide a unique identifier or GID. (Request ID: ${requestContext.requestId})`;
              } else {
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
            userNameOrEmail || actualUserGid,
            taskNameFromInput || actualTaskGid,
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
              true,
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
            updatedTaskData,
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
            assigneeName,
            dueDate,
            notes,
          } = extractSubtaskCreationDetails(actionDescription);

          if (!subtaskName) {
            return `Error: Subtask name is required to create a subtask. (Request ID: ${requestContext.requestId})`;
          }

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          // Resolve input parameters with conversation context if needed
          const resolvedParentTaskGid = parentGidFromInput;
          const resolvedParentTaskName = parentTaskName;
          const resolvedParentProjectName = parentProjectName;
          let resolvedParentProjectGid: string | undefined;

          // If we have a project name, resolve it to a GID for task lookup
          if (resolvedParentProjectName) {
            try {
              const projectLookupResult = await findProjectGidByName(
                this.client,
                resolvedParentProjectName,
                workspaceGid,
                requestContext.requestId,
              );
              if (
                typeof projectLookupResult === 'string' &&
                projectLookupResult !== 'ambiguous'
              ) {
                resolvedParentProjectGid = projectLookupResult;
              } else if (projectLookupResult === 'ambiguous') {
                return `Error: Project "${resolvedParentProjectName}" is ambiguous - multiple projects found with that name. Please be more specific. (Request ID: ${requestContext.requestId})`;
              } else {
                return `Error: Project "${resolvedParentProjectName}" not found. (Request ID: ${requestContext.requestId})`;
              }
            } catch (error) {
              return `Error: Failed to resolve project "${resolvedParentProjectName}": ${error} (Request ID: ${requestContext.requestId})`;
            }
          }

          // If no parent task info provided, try to infer from conversation context
          if (!resolvedParentTaskGid && !resolvedParentTaskName) {
            // This would be enhanced with conversation memory lookup
            // For now, provide a helpful error message
            return `Error: Could not identify the parent task for the subtask. Please specify:\n- The parent task name (e.g., "add subtask to task 'test5'")\n- Or provide more context about which task should be the parent\n(Request ID: ${requestContext.requestId})`;
          }

          let actualParentTaskGid = resolvedParentTaskGid;
          if (!actualParentTaskGid && resolvedParentTaskName) {
            const parentTaskLookup = await findTaskGidByName(
              this.client,
              resolvedParentTaskName,
              workspaceGid,
              resolvedParentProjectGid, // Now using the resolved project GID, not name
              true,
              requestContext.requestId,
            );
            if (parentTaskLookup.type === 'found') {
              actualParentTaskGid = parentTaskLookup.gid;
            } else if (parentTaskLookup.type === 'ambiguous') {
              return `Error: Parent task "${resolvedParentTaskName}" is ambiguous: ${parentTaskLookup.message} (Request ID: ${requestContext.requestId})`;
            } else {
              return `Error: Parent task "${resolvedParentTaskName}" not found in project "${resolvedParentProjectName}". (Request ID: ${requestContext.requestId})`;
            }
          }

          if (!actualParentTaskGid) {
            return `Error: Could not identify the parent task to add a subtask to. Please provide a parent task GID or a clear name. (Request ID: ${requestContext.requestId})`;
          }

          // Prepare subtask creation parameters
          const subtaskParams: CreateTaskParams = {
            name: subtaskName,
            workspace: workspaceGid,
            parent: actualParentTaskGid,
          };

          // Handle notes if provided
          if (notes) {
            subtaskParams.notes = notes;
          }

          // Handle assignee if provided
          let assigneeGid: string | undefined;
          let resolvedAssigneeName: string | undefined;
          if (assigneeName) {
            if (assigneeName.toLowerCase() === 'me') {
              // Get current user
              const currentUser = await getUsersMe(
                this.client,
                requestContext.requestId,
              );
              assigneeGid = currentUser.gid;
              resolvedAssigneeName = currentUser.name;
            } else {
              // Lookup user by name/email
              const userGidResult = await findUserGidByEmailOrName(
                this.client,
                workspaceGid,
                assigneeName,
                requestContext.requestId,
              );
              if (userGidResult && userGidResult !== 'ambiguous') {
                assigneeGid = userGidResult;
                resolvedAssigneeName = assigneeName;
              } else if (userGidResult === 'ambiguous') {
                return `Error: User "${assigneeName}" is ambiguous. Please provide a more specific name or email. (Request ID: ${requestContext.requestId})`;
              } else {
                return `Error: Could not find user "${assigneeName}". Please provide a valid Asana username or email. (Request ID: ${requestContext.requestId})`;
              }
            }
            subtaskParams.assignee = assigneeGid;
          }

          // Handle due date if provided
          if (dueDate) {
            const parsedDate = parseDateTime(dueDate);
            if (parsedDate.success) {
              // For subtask creation, we can only use due_on (date only)
              // If the parsed date has time components, we'll use the date part
              if (parsedDate.formattedForAsana.due_on) {
                subtaskParams.due_on = parsedDate.formattedForAsana.due_on;
              } else if (parsedDate.formattedForAsana.due_at) {
                // Extract date part from ISO string for due_on
                const isoDate = parsedDate.formattedForAsana.due_at;
                subtaskParams.due_on = isoDate.split('T')[0]; // Extract YYYY-MM-DD part
              }
            } else {
              return `Error: Could not parse due date "${dueDate}". Please use formats like "tomorrow", "monday", "2024-12-25". (Request ID: ${requestContext.requestId})`;
            }
          }

          const createdSubtask = await createTask(
            this.client,
            subtaskParams,
            requestContext.requestId,
          );

          // Format the response with subtask-specific information
          let responseMessage = `Successfully created subtask: [${createdSubtask.name}](${createdSubtask.permalink_url}) (GID: ${createdSubtask.gid})\n`;
          responseMessage += `- Parent task: ${resolvedParentTaskName || actualParentTaskGid}\n`;
          responseMessage += `- Project: ${resolvedParentProjectName}\n`;
          if (resolvedAssigneeName) {
            responseMessage += `- Assignee: ${resolvedAssigneeName}\n`;
          }
          if (notes) {
            responseMessage += `- Description: ${notes}\n`;
          }
          if (dueDate && subtaskParams.due_on) {
            responseMessage += `- Due on: ${subtaskParams.due_on}\n`;
          }
          responseMessage += `\n📋 Note: Task visibility inherits from project "${resolvedParentProjectName}" settings.\n`;
          responseMessage += `(Request ID: ${requestContext.requestId})`;

          return responseMessage;
        }

        case AsanaOperationType.LIST_SUBTASKS: {
          const {
            gid: parentGidFromInput,
            name: parentTaskNameFromInput,
            projectName: parentProjectContext,
          } = extractTaskIdentifier(actionDescription);

          const workspaceGid = getWorkspaceGid();
          if (!workspaceGid) {
            return `Error: Default Asana workspace GID is not configured. (Request ID: ${requestContext.requestId})`;
          }

          let actualParentTaskGid = parentGidFromInput;
          let resolvedParentTaskName = parentTaskNameFromInput;

          if (!actualParentTaskGid && parentTaskNameFromInput) {
            const parentTaskLookup = await findTaskGidByName(
              this.client,
              parentTaskNameFromInput,
              workspaceGid,
              parentProjectContext,
              true,
              requestContext.requestId,
            );
            if (parentTaskLookup.type === 'found') {
              actualParentTaskGid = parentTaskLookup.gid;
              resolvedParentTaskName = parentTaskLookup.name;
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
            undefined,
            requestContext.requestId,
          );

          const parentTaskIdentifier =
            resolvedParentTaskName || actualParentTaskGid;
          const listTitle = `Subtasks for parent task "${parentTaskIdentifier}"`;

          if (subtasksData.length === 0) {
            return `${listTitle}: None found. (Request ID: ${requestContext.requestId})`;
          }
          const formattedSubtaskList = formatTaskList(
            subtasksData,
            {},
            requestContext,
          );
          return `${listTitle}:\n${formattedSubtaskList.substring(formattedSubtaskList.indexOf(':\n') + 2)}`;
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

          let actualDependentTaskGid = dependentGidFromInput;
          if (!actualDependentTaskGid && dependentTaskName) {
            const dependentTaskLookup = await findTaskGidByName(
              this.client,
              dependentTaskName,
              workspaceGid,
              projectContext,
              true,
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

          let actualDependencyTaskGid = dependencyGidFromInput;
          if (!actualDependencyTaskGid && dependencyTaskName) {
            const dependencyTaskLookup = await findTaskGidByName(
              this.client,
              dependencyTaskName,
              workspaceGid,
              projectContext,
              true,
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
            undefined,
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
              true,
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

        case AsanaOperationType.DELETE_TASK: {
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
          let actualTaskName = taskNameFromInput;

          if (!actualTaskGid && taskNameFromInput) {
            const taskLookup = await findTaskGidByName(
              this.client,
              taskNameFromInput,
              workspaceGid,
              projectContext,
              true,
              requestContext.requestId,
            );
            if (taskLookup.type === 'found') {
              actualTaskGid = taskLookup.gid;
              actualTaskName = taskLookup.name;
            } else if (taskLookup.type === 'ambiguous') {
              return `Error: Task to delete is ambiguous: ${taskLookup.message} (Request ID: ${requestContext.requestId})`;
            } else {
              return `Error: Task named "${taskNameFromInput}"${projectContext ? ` in project "${projectContext}"` : ''} not found to delete. (Request ID: ${requestContext.requestId})`;
            }
          }

          if (!actualTaskGid) {
            return `Error: Could not identify the task to delete. Please provide a task GID or clear name. (Request ID: ${requestContext.requestId})`;
          }

          try {
            const success = await deleteTask(
              this.client,
              actualTaskGid,
              requestContext.requestId,
            );

            if (success) {
              return `Successfully deleted task "${actualTaskName || actualTaskGid}"${projectContext ? ` in project "${projectContext}"` : ''}. The task has been moved to the trash and can be recovered within a limited time. (Request ID: ${requestContext.requestId})`;
            } else {
              return `Failed to delete task "${actualTaskName || actualTaskGid}". (Request ID: ${requestContext.requestId})`;
            }
          } catch (error) {
            console.error(
              `[AsanaTool] [${requestContext.requestId}] Task deletion failed:`,
              error,
            );
            return `Error deleting task: ${error instanceof Error ? error.message : 'Unknown error'}. (Request ID: ${requestContext.requestId})`;
          }
        }

        case AsanaOperationType.UNKNOWN:
        default: {
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
      if (error instanceof AsanaIntegrationError) {
        console.error(
          `[AsanaTool] [${requestContext.requestId}] ${error.toLogString()}`,
        );
        return error.toUserFriendlyMessage();
      }

      return logAndFormatError(
        error,
        'Asana operation',
        requestContext.requestId,
      );
    }
  }
}

export const asanaTool = new AsanaTool();
