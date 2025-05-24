/**
 * Intent parser main module
 * Coordinates intent classification and entity extraction
 */

import { AsanaOperationType } from './types';
import type { ParsedIntent } from './types';
import { classifyIntent } from './intent.classifier';
import * as entityExtractor from './entity.extractor';
import { generateRequestId } from '../types';
import { extractNamesFromInput } from '../utils/gidUtils';

/**
 * Parse the user's natural language input to determine intent and extract entities
 *
 * @param input The natural language description of the desired Asana operation
 * @returns Parsed intent with classified operation type and extracted entities
 */
export function parseIntent(input: string): ParsedIntent {
  // Generate request context for tracking
  const requestContext = {
    requestId: generateRequestId(),
    startTime: Date.now(),
  };

  // Classify the operation type
  const operationType = classifyIntent(input);

  console.log(
    `[Asana Tool] [${requestContext.requestId}] Classified intent: ${operationType}`,
  );

  // Parse specific entities based on the operation type
  switch (operationType) {
    case AsanaOperationType.GET_USER_ME: {
      return {
        operationType,
        requestContext,
        rawInput: input,
      };
    }

    case AsanaOperationType.GET_USER_DETAILS: {
      // Extract user identifier from the input
      const userNameMatch =
        input.match(
          /(?:show|get|find|lookup).*(?:profile|details|info).*(?:for|of|about)\s+["']?([^"']+)["']?/i,
        ) ||
        input.match(/["']?([^"']+)["']?(?:'s)?\s+(?:profile|details|info)/i);

      const emailMatch = input.match(
        /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/,
      );
      const gidMatch = input.match(/\b(\d{16,})\b/);

      const userIdentifier = {
        name: userNameMatch ? userNameMatch[1].trim() : undefined,
        email: emailMatch ? emailMatch[1] : undefined,
        gid: gidMatch ? gidMatch[1] : undefined,
      };

      return {
        operationType,
        requestContext,
        rawInput: input,
        userIdentifier,
      };
    }

    case AsanaOperationType.LIST_WORKSPACE_USERS: {
      // Extract workspace name if specified
      const workspaceNameMatch = input.match(
        /(?:workspace|organization|team)\s+["']?([^"']+)["']?/i,
      );
      const workspaceGidMatch = input.match(/workspace[:\s]+(\d{16,})/i);

      return {
        operationType,
        requestContext,
        rawInput: input,
        workspaceName: workspaceNameMatch
          ? workspaceNameMatch[1].trim()
          : undefined,
        workspaceGid: workspaceGidMatch ? workspaceGidMatch[1] : undefined,
      };
    }

    case AsanaOperationType.CREATE_TASK: {
      const { taskName, taskNotes, projectName, dueDate, assigneeName } =
        entityExtractor.extractTaskParameters(input);

      // Check if this is a confirmation or context response
      const isConfirmation =
        /^(?:yes|yep|yeah|confirm|confirmed|ok|okay|sure|proceed|go ahead|do it)[.,!]*$/i.test(
          input.trim(),
        );
      const isProjectSelection =
        input.toLowerCase().trim().startsWith('echo tango') ||
        /^\d{16,}$/.test(input.trim()) ||
        input.toLowerCase().includes('project:');
      const isAssignmentResponse =
        input.toLowerCase().includes('assign') &&
        input.toLowerCase().includes('me');

      // If it's a confirmation or selection, we can proceed with less validation
      if (isConfirmation || isProjectSelection || isAssignmentResponse) {
        let resolvedProjectName = projectName;
        let resolvedAssigneeName = assigneeName;
        let resolvedDueDate = dueDate;

        // For project selection responses
        if (isProjectSelection && !projectName) {
          if (input.toLowerCase().trim().startsWith('echo tango')) {
            resolvedProjectName = 'Echo Tango';
          }
        }

        // For assignment responses
        if (isAssignmentResponse && !assigneeName) {
          resolvedAssigneeName = 'me';
        }

        // Try to extract due date if mentioned in context responses
        if (!dueDate) {
          const dueDateMatch = input.match(
            /(?:due|deadline)\s+(?:is\s+|on\s+)?(?:tomorrow|today|next\s+\w+)/i,
          );
          if (dueDateMatch) {
            resolvedDueDate = dueDateMatch[0];
          }
        }

        return {
          operationType,
          requestContext,
          rawInput: input,
          taskName: taskName,
          taskNotes: taskNotes,
          projectName: resolvedProjectName,
          dueDate: resolvedDueDate,
          assigneeName: resolvedAssigneeName,
          confirmationNeeded: false,
          confirmedProjectName: resolvedProjectName,
          confirmedAssigneeName: resolvedAssigneeName,
        };
      }

      if (!taskName) {
        return {
          operationType: AsanaOperationType.UNKNOWN,
          requestContext,
          rawInput: input,
          errorMessage:
            'Could not determine task name. Please specify a task name to create.',
          possibleOperations: [AsanaOperationType.CREATE_TASK],
        };
      }

      return {
        operationType,
        requestContext,
        rawInput: input,
        taskName,
        taskNotes,
        projectName,
        dueDate,
        assigneeName,
      };
    }

    case AsanaOperationType.UPDATE_TASK: {
      const taskIdentifier = entityExtractor.extractTaskIdentifier(input);
      const updateFields = entityExtractor.extractTaskUpdateFields(input);

      if (
        (!taskIdentifier.name && !taskIdentifier.gid) ||
        (!updateFields.name &&
          !updateFields.notes &&
          !updateFields.dueDate &&
          updateFields.completed === undefined)
      ) {
        return {
          operationType: AsanaOperationType.UNKNOWN,
          requestContext,
          rawInput: input,
          errorMessage:
            'Could not determine which task to update or what changes to make.',
          possibleOperations: [AsanaOperationType.UPDATE_TASK],
        };
      }

      return {
        operationType,
        requestContext,
        rawInput: input,
        taskIdentifier,
        updateFields,
        projectName: taskIdentifier.projectName,
      };
    }

    case AsanaOperationType.DELETE_TASK: {
      const taskIdentifier = entityExtractor.extractTaskIdentifier(input);

      if (!taskIdentifier.name && !taskIdentifier.gid) {
        return {
          operationType: AsanaOperationType.UNKNOWN,
          requestContext,
          rawInput: input,
          errorMessage: 'Could not determine which task to delete.',
          possibleOperations: [AsanaOperationType.DELETE_TASK],
        };
      }

      return {
        operationType,
        requestContext,
        rawInput: input,
        taskIdentifier,
        projectName: taskIdentifier.projectName,
      };
    }

    case AsanaOperationType.GET_TASK_DETAILS: {
      const taskIdentifier = entityExtractor.extractTaskIdentifier(input);

      if (!taskIdentifier.name && !taskIdentifier.gid) {
        return {
          operationType: AsanaOperationType.UNKNOWN,
          requestContext,
          rawInput: input,
          errorMessage: 'Could not determine which task to get details for.',
          possibleOperations: [AsanaOperationType.GET_TASK_DETAILS],
        };
      }

      return {
        operationType,
        requestContext,
        rawInput: input,
        taskIdentifier,
        projectName: taskIdentifier.projectName,
      };
    }

    case AsanaOperationType.LIST_TASKS: {
      const { projectName } = extractNamesFromInput(input);
      const assignedToMe = entityExtractor.isMyTasksRequest(input);

      // Extract assignee information for other users' tasks
      let assigneeName: string | undefined;
      let assigneeEmail: string | undefined;

      // Pattern 1: "andy's tasks", "john's tasks"
      const possessiveMatch = input.match(/(\w+)['']s\s+tasks/i);
      if (possessiveMatch) {
        assigneeName = possessiveMatch[1];
      }

      // Pattern 2: "tasks assigned to Andy Lemoine", "tasks for Andy"
      const assignedToMatch = input.match(
        /(?:tasks?\s+(?:assigned\s+to|for)|(?:assigned\s+to|for)\s+tasks?)\s+([^,]+?)(?:\s+\(|$)/i,
      );
      if (assignedToMatch) {
        const assigneeText = assignedToMatch[1].trim();
        // Check if it's an email
        if (assigneeText.includes('@')) {
          assigneeEmail = assigneeText;
        } else {
          assigneeName = assigneeText;
        }
      }

      // Pattern 3: "show/list Andy Lemoine's tasks"
      const showUserTasksMatch = input.match(
        /(?:show|list)\s+([^']+?)['']s\s+tasks/i,
      );
      if (showUserTasksMatch) {
        assigneeName = showUserTasksMatch[1].trim();
      }

      // Check if user wants completed or incomplete tasks
      let completed: boolean | undefined = undefined;
      if (input.toLowerCase().includes('completed')) {
        completed = true;
      } else if (
        input.toLowerCase().includes('incomplete') ||
        input.toLowerCase().includes('not completed') ||
        input.toLowerCase().includes('open')
      ) {
        completed = false;
      }

      return {
        operationType,
        requestContext,
        rawInput: input,
        projectName,
        assignedToMe,
        assigneeName,
        assigneeEmail,
        completed,
      };
    }

    case AsanaOperationType.COMPLETE_TASK: {
      const taskIdentifier = entityExtractor.extractTaskIdentifier(input);

      if (!taskIdentifier.name && !taskIdentifier.gid) {
        return {
          operationType: AsanaOperationType.UNKNOWN,
          requestContext,
          rawInput: input,
          errorMessage: 'Could not determine which task to mark as complete.',
          possibleOperations: [AsanaOperationType.COMPLETE_TASK],
        };
      }

      return {
        operationType,
        requestContext,
        rawInput: input,
        taskGid: taskIdentifier.gid,
        taskName: taskIdentifier.name,
        projectName: taskIdentifier.projectName,
      };
    }

    case AsanaOperationType.ADD_SUBTASK: {
      const subtaskDetails =
        entityExtractor.extractSubtaskCreationDetails(input);

      if (!subtaskDetails.subtaskName) {
        return {
          operationType: AsanaOperationType.UNKNOWN,
          requestContext,
          rawInput: input,
          errorMessage:
            'Could not determine subtask name. Please specify a name for the subtask.',
          possibleOperations: [AsanaOperationType.ADD_SUBTASK],
        };
      }

      // If no parent task is specified, we'll still return ADD_SUBTASK
      // The main tool will handle context resolution
      return {
        operationType,
        requestContext,
        rawInput: input,
        parentTaskGid: subtaskDetails.parentTaskGid,
        parentTaskName: subtaskDetails.parentTaskName,
        parentProjectName: subtaskDetails.parentProjectName,
        subtaskName: subtaskDetails.subtaskName,
        assigneeName: subtaskDetails.assigneeName,
        dueDate: subtaskDetails.dueDate,
        notes: subtaskDetails.notes,
      };
    }

    case AsanaOperationType.CREATE_PROJECT: {
      const { projectName, teamName, notes } =
        entityExtractor.extractProjectParameters(input);

      if (!projectName) {
        return {
          operationType: AsanaOperationType.UNKNOWN,
          requestContext,
          rawInput: input,
          errorMessage:
            'Could not determine project name. Please specify a project name to create.',
          possibleOperations: [AsanaOperationType.CREATE_PROJECT],
        };
      }

      return {
        operationType,
        requestContext,
        rawInput: input,
        projectName,
        teamName,
        notes,
      };
    }

    case AsanaOperationType.UPDATE_PROJECT: {
      const projectIdentifier = entityExtractor.extractProjectIdentifier(input);
      const updateFields = {} as any; // To be implemented with project update fields

      // Extract update fields (similar to task updates)
      // This is a simplified version - could be expanded
      const nameMatch = input.match(
        /(?:rename|change name|new name)\s*['"]([^'"]+)['"]/i,
      );
      if (nameMatch) {
        updateFields.name = nameMatch[1];
      }

      const notesMatch = input.match(
        /(?:change|update|set|new)\s+(?:notes|description)\s*(?:to|as)?\s*['"]([^'"]+)['"]/i,
      );
      if (notesMatch) {
        updateFields.notes = notesMatch[1];
      }

      if (
        (!projectIdentifier.name && !projectIdentifier.gid) ||
        (!updateFields.name && !updateFields.notes)
      ) {
        return {
          operationType: AsanaOperationType.UNKNOWN,
          requestContext,
          rawInput: input,
          errorMessage:
            'Could not determine which project to update or what changes to make.',
          possibleOperations: [AsanaOperationType.UPDATE_PROJECT],
        };
      }

      return {
        operationType,
        requestContext,
        rawInput: input,
        projectIdentifier,
        updateFields,
      };
    }

    case AsanaOperationType.LIST_PROJECTS: {
      const { projectName, teamName } =
        entityExtractor.extractProjectParameters(input);

      // Check if user wants archived projects
      const archived = input.toLowerCase().includes('archived')
        ? true
        : undefined;

      return {
        operationType,
        requestContext,
        rawInput: input,
        teamName,
        archived,
      };
    }

    case AsanaOperationType.UNKNOWN:
    default:
      return {
        operationType: AsanaOperationType.UNKNOWN,
        requestContext,
        rawInput: input,
        errorMessage:
          'Unable to determine what Asana operation you want to perform. Please try rephrasing your request.',
      };
  }
}

export * from './types';
