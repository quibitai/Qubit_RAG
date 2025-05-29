/**
 * Modern Asana Tool Implementation
 * Uses LLM function calling instead of regex-based intent parsing
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  LLMFunctionExtractor,
  type ConversationContext,
} from './intent-parser/llmFunctionExtractor';
import {
  ASANA_FUNCTION_SCHEMAS,
  type AsanaFunctionName,
} from './schemas/functionSchemas';
import { createAsanaClient } from './api-client';
import type { AsanaApiClient } from './api-client';
import { getWorkspaceGid } from './config';
import { generateRequestId } from './types';

// Import existing operations
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
  getSubtasks,
  type UpdateTaskParams,
  type CreateTaskParams,
} from './api-client/operations/tasks';
import {
  listProjects,
  findProjectGidByName,
  createProject,
  verifyProjectVisibility,
  getProjectDetails,
} from './api-client/operations/projects';
import {
  getProjectSections,
  createSectionInProject,
  addTaskToSection,
  findSectionGidByName,
} from './api-client/operations/sections';
import { typeaheadSearch } from './api-client/operations/search';

// Import formatters
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
  formatProjectDetails,
  formatProjectCreation,
} from './formatters/responseFormatter';

import { parseDateTime } from './utils/dateTimeParser';
import { taskContextManager } from './context/taskContext';
import {
  conversationContextManager,
  type ConversationMessage,
} from './context/conversationContext';
import { contextResolver } from './context/contextResolver';

// Input schema for the modern tool
const ModernAsanaToolInputSchema = z.object({
  action_description: z
    .string()
    .describe('Natural language description of the Asana operation to perform'),
  session_id: z
    .string()
    .optional()
    .describe('Session ID for conversation context tracking'),
  conversation_context: z
    .object({
      recent_messages: z
        .array(
          z.object({
            role: z.string(),
            content: z.string(),
          }),
        )
        .optional(),
      last_mentioned_project: z
        .object({
          gid: z.string(),
          name: z.string(),
        })
        .optional(),
      last_created_task: z
        .object({
          gid: z.string(),
          name: z.string(),
        })
        .optional(),
    })
    .optional()
    .describe('Conversation context for better understanding'),
});

/**
 * Modern Asana Tool using LLM function calling
 */
export class ModernAsanaTool {
  private client: AsanaApiClient;
  private functionExtractor: LLMFunctionExtractor;

  constructor(apiKey?: string, openaiApiKey?: string) {
    this.client = createAsanaClient(apiKey);
    this.functionExtractor = new LLMFunctionExtractor(openaiApiKey);
  }

  /**
   * Create the DynamicStructuredTool instance
   */
  createTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'modernAsana',
      description:
        'Modern Asana integration with intelligent natural language understanding. ' +
        'Use this for ANY Asana-related tasks such as creating, listing, updating, or completing tasks and projects. ' +
        'Supports contextual references like "that project" or "the task I just created". ' +
        'Examples: "Create a task to review designs in Marketing project", "Show me my overdue tasks", "Add a subtask to finish the report"',
      schema: ModernAsanaToolInputSchema,
      func: async ({
        action_description,
        session_id,
        conversation_context,
      }) => {
        return await this.handleRequest(
          action_description,
          session_id,
          conversation_context,
        );
      },
    });
  }

  /**
   * Main request handler
   */
  private async handleRequest(
    actionDescription: string,
    sessionId?: string,
    conversationContext?: any,
  ): Promise<string> {
    const requestId = generateRequestId();
    const effectiveSessionId =
      sessionId || `session_${Math.floor(Date.now() / (60 * 60 * 1000))}`; // 1-hour sessions

    console.log(
      `[ModernAsanaTool] [${requestId}] Processing: "${actionDescription}" (Session: ${effectiveSessionId})`,
    );

    try {
      // Add user message to conversation context
      conversationContextManager.addMessage(
        effectiveSessionId,
        'user',
        actionDescription,
        {
          entities: this.extractEntitiesFromMessage(actionDescription),
        },
      );

      // Quick pre-filter for non-Asana requests
      if (!this.functionExtractor.isLikelyAsanaRequest(actionDescription)) {
        const response =
          "This doesn't appear to be an Asana-related request. I can help with Asana tasks, projects, and workspace management.";

        // Add assistant response to context
        conversationContextManager.addMessage(
          effectiveSessionId,
          'assistant',
          response,
        );

        return response;
      }

      // Get enhanced conversation context
      const enhancedContext =
        conversationContextManager.getConversationContext(effectiveSessionId);

      // Merge with provided context (for backward compatibility)
      const mergedContext = {
        ...enhancedContext,
        ...conversationContext,
      };

      // Extract function call using LLM with enhanced context
      const extractedCall = await this.functionExtractor.extractFunctionCall(
        actionDescription,
        mergedContext,
      );

      if (!extractedCall.functionName) {
        const response =
          extractedCall.reasoning ||
          "I couldn't identify a specific Asana operation from your request. Could you try rephrasing? " +
            "For example: 'list my tasks', 'create a task called X', or 'show project details for Y'.";

        // Add assistant response to context
        conversationContextManager.addMessage(
          effectiveSessionId,
          'assistant',
          response,
        );

        return response;
      }

      console.log(
        `[ModernAsanaTool] [${requestId}] Extracted function: ${extractedCall.functionName} (confidence: ${extractedCall.confidence})`,
      );

      // Resolve contextual references in parameters
      const resolvedParams = await contextResolver.resolveParameters(
        effectiveSessionId,
        extractedCall.functionName,
        extractedCall.parameters,
        actionDescription,
      );

      console.log(
        `[ModernAsanaTool] [${requestId}] Context resolutions:`,
        resolvedParams.resolutions.map(
          (r) =>
            `${r.parameter}: ${r.originalValue} -> ${r.resolvedValue} (${r.confidence})`,
        ),
      );

      // Execute the function with resolved parameters
      const result = await this.executeFunction(
        extractedCall.functionName,
        resolvedParams.resolved,
        requestId,
        effectiveSessionId,
      );

      // Add assistant response to context
      conversationContextManager.addMessage(
        effectiveSessionId,
        'assistant',
        result,
        {
          functionCall: extractedCall.functionName,
          parameters: resolvedParams.resolved,
        },
      );

      // Record the operation
      conversationContextManager.addOperation(effectiveSessionId, {
        type: extractedCall.functionName,
        parameters: resolvedParams.resolved,
        result,
        success: true,
      });

      // Update context based on the operation
      this.updateEnhancedContext(
        effectiveSessionId,
        extractedCall.functionName,
        resolvedParams.resolved,
        result,
        requestId,
      );

      return result;
    } catch (error) {
      console.error(`[ModernAsanaTool] [${requestId}] Error:`, error);
      return `I encountered an error processing your Asana request: ${error instanceof Error ? error.message : 'Unknown error'}. Please try rephrasing your request.`;
    }
  }

  /**
   * Execute the extracted function
   */
  private async executeFunction(
    functionName: AsanaFunctionName,
    parameters: any,
    requestId: string,
    sessionId?: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error(
        'Asana workspace is not configured. Please set ASANA_DEFAULT_WORKSPACE_GID.',
      );
    }

    // Resolve parameters (entity resolution, context references, etc.)
    const resolvedParams = await this.resolveParameters(parameters, requestId);

    switch (functionName) {
      case 'list_tasks':
        return await this.handleListTasks(resolvedParams, requestId);

      case 'create_task':
        return await this.handleCreateTask(resolvedParams, requestId);

      case 'update_task':
        return await this.handleUpdateTask(resolvedParams, requestId);

      case 'get_task_details':
        return await this.handleGetTaskDetails(resolvedParams, requestId);

      case 'delete_task':
        return await this.handleDeleteTask(resolvedParams, requestId);

      case 'complete_task':
        return await this.handleCompleteTask(resolvedParams, requestId);

      case 'add_subtask':
        return await this.handleAddSubtask(resolvedParams, requestId);

      case 'list_subtasks':
        return await this.handleListSubtasks(resolvedParams, requestId);

      case 'list_projects':
        return await this.handleListProjects(resolvedParams, requestId);

      case 'get_project_details':
        return await this.handleGetProjectDetails(resolvedParams, requestId);

      case 'create_project':
        return await this.handleCreateProject(resolvedParams, requestId);

      case 'get_user_details':
        return await this.handleGetUserDetails(resolvedParams, requestId);

      case 'list_workspace_users':
        return await this.handleListWorkspaceUsers(resolvedParams, requestId);

      case 'search_asana':
        return await this.handleSearchAsana(resolvedParams, requestId);

      case 'add_follower':
        return await this.handleAddFollower(resolvedParams, requestId);

      case 'set_task_due_date':
        return await this.handleSetTaskDueDate(resolvedParams, requestId);

      case 'list_project_sections':
        return await this.handleListProjectSections(resolvedParams, requestId);

      case 'create_project_section':
        return await this.handleCreateProjectSection(resolvedParams, requestId);

      case 'move_task_to_section':
        return await this.handleMoveTaskToSection(resolvedParams, requestId);

      default:
        throw new Error(
          `Function ${functionName} is not yet implemented in the modern tool`,
        );
    }
  }

  /**
   * Resolve parameters (entity resolution, context references, etc.)
   */
  private async resolveParameters(
    parameters: any,
    requestId: string,
  ): Promise<any> {
    const resolved = { ...parameters };
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    // Resolve project references
    if (resolved.project_name && !resolved.project_gid) {
      try {
        const projectGid = await findProjectGidByName(
          this.client,
          resolved.project_name,
          workspaceGid,
          requestId,
        );
        if (projectGid) {
          resolved.project_gid = projectGid;
        }
      } catch (error) {
        console.warn(
          `[ModernAsanaTool] [${requestId}] Could not resolve project: ${resolved.project_name}`,
        );
      }
    }

    // Resolve user references
    if (resolved.assignee && resolved.assignee !== 'me') {
      try {
        const userGid = await findUserGidByEmailOrName(
          this.client,
          resolved.assignee,
          workspaceGid,
          requestId,
        );
        if (userGid) {
          resolved.assignee_gid = userGid;
        }
      } catch (error) {
        console.warn(
          `[ModernAsanaTool] [${requestId}] Could not resolve user: ${resolved.assignee}`,
        );
      }
    }

    // Parse natural language dates
    if (resolved.due_date) {
      try {
        const parsedDate = parseDateTime(resolved.due_date);
        if (parsedDate.success && parsedDate.formattedForAsana.due_on) {
          resolved.due_date_parsed = parsedDate.formattedForAsana.due_on;
        }
      } catch (error) {
        console.warn(
          `[ModernAsanaTool] [${requestId}] Could not parse date: ${resolved.due_date}`,
        );
      }
    }

    return resolved;
  }

  /**
   * Handle list tasks operation
   */
  private async handleListTasks(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    const filters: any = { workspace: workspaceGid };

    if (params.project_gid) {
      filters.project = params.project_gid;
    }

    if (params.assignee === 'me') {
      filters.assignee = params.assignee;
    } else if (params.assignee_gid) {
      filters.assignee = params.assignee_gid;
    }

    if (!params.completed) {
      filters.completed_since = 'now';
    }

    const tasks = await listTasks(this.client, filters, requestId);
    return formatTaskList(tasks, {}, { requestId, startTime: Date.now() });
  }

  /**
   * Handle create task operation
   */
  private async handleCreateTask(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    const createParams: CreateTaskParams = {
      name: params.name,
      workspace: workspaceGid,
    };

    if (params.project_gid) {
      createParams.projects = [params.project_gid];
    }

    if (params.assignee === 'me') {
      const currentUser = await getUsersMe(this.client, requestId);
      createParams.assignee = currentUser.gid;
    } else if (params.assignee_gid) {
      createParams.assignee = params.assignee_gid;
    }

    if (params.due_date_parsed) {
      createParams.due_on = params.due_date_parsed;
    }

    if (params.notes) {
      createParams.notes = params.notes;
    }

    const task = await createTask(this.client, createParams, requestId);

    // Update context
    const sessionId = taskContextManager.getSessionId(requestId);
    taskContextManager.addTaskContext(
      sessionId,
      task.gid,
      task.name,
      'CREATE',
      params.project_gid,
      params.project_name,
    );

    return formatTaskCreation(task, {}, { requestId, startTime: Date.now() });
  }

  /**
   * Handle get project details operation
   */
  private async handleGetProjectDetails(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let projectGid = params.project_gid;

    if (!projectGid && params.project_name) {
      projectGid = await findProjectGidByName(
        this.client,
        params.project_name,
        workspaceGid,
        requestId,
      );
    }

    if (!projectGid) {
      throw new Error(
        `Could not find project: ${params.project_name || 'unknown'}`,
      );
    }

    const project = await getProjectDetails(this.client, projectGid, requestId);

    // Store project details in params for context tracking
    params.project_gid = project.gid;
    params.project_name = project.name;

    return formatProjectDetails(project, { requestId, startTime: Date.now() });
  }

  // Add more operation handlers as needed...
  private async handleUpdateTask(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let taskGid = params.task_gid;

    if (!taskGid && params.task_name) {
      const findResult = await findTaskGidByName(
        this.client,
        params.task_name,
        workspaceGid,
        undefined, // projectGid
        false, // includeCompleted
        requestId,
      );

      if (findResult.type === 'found') {
        taskGid = findResult.gid;
      } else if (findResult.type === 'ambiguous') {
        throw new Error(findResult.message);
      }
    }

    if (!taskGid) {
      throw new Error(`Could not find task: ${params.task_name || 'unknown'}`);
    }

    const updateParams: UpdateTaskParams = {};

    if (params.notes !== undefined) {
      updateParams.notes = params.notes;
    }

    if (params.completed !== undefined) {
      updateParams.completed = params.completed;
    }

    if (params.due_date_parsed) {
      updateParams.due_on = params.due_date_parsed;
    }

    const updatedTask = await updateTask(
      this.client,
      taskGid,
      updateParams,
      requestId,
    );
    return formatTaskUpdate(updatedTask, updateParams, {
      requestId,
      startTime: Date.now(),
    });
  }

  private async handleGetTaskDetails(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let taskGid = params.task_gid;

    if (!taskGid && params.task_name) {
      const findResult = await findTaskGidByName(
        this.client,
        params.task_name,
        workspaceGid,
        undefined, // projectGid
        false, // includeCompleted
        requestId,
      );

      if (findResult.type === 'found') {
        taskGid = findResult.gid;
      } else if (findResult.type === 'ambiguous') {
        throw new Error(findResult.message);
      }
    }

    if (!taskGid) {
      throw new Error(`Could not find task: ${params.task_name || 'unknown'}`);
    }

    const task = await getTaskDetails(
      this.client,
      taskGid,
      undefined,
      requestId,
    );
    return formatTaskDetails(task, { requestId, startTime: Date.now() });
  }

  private async handleDeleteTask(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let taskGid = params.task_gid;

    if (!taskGid && params.task_name) {
      const findResult = await findTaskGidByName(
        this.client,
        params.task_name,
        workspaceGid,
        undefined, // projectGid
        false, // includeCompleted
        requestId,
      );

      if (findResult.type === 'found') {
        taskGid = findResult.gid;
      } else if (findResult.type === 'ambiguous') {
        throw new Error(findResult.message);
      }
    }

    if (!taskGid) {
      throw new Error(`Could not find task: ${params.task_name || 'unknown'}`);
    }

    const success = await deleteTask(this.client, taskGid, requestId);

    if (success) {
      return `Successfully deleted task "${params.task_name || taskGid}" (Request ID: ${requestId})`;
    } else {
      throw new Error(`Failed to delete task "${params.task_name || taskGid}"`);
    }
  }

  private async handleCompleteTask(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let taskGid = params.task_gid;

    if (!taskGid && params.task_name) {
      const findResult = await findTaskGidByName(
        this.client,
        params.task_name,
        workspaceGid,
        undefined, // projectGid
        false, // includeCompleted
        requestId,
      );

      if (findResult.type === 'found') {
        taskGid = findResult.gid;
      } else if (findResult.type === 'ambiguous') {
        throw new Error(findResult.message);
      }
    }

    if (!taskGid) {
      throw new Error(`Could not find task: ${params.task_name || 'unknown'}`);
    }

    const updateParams: UpdateTaskParams = {
      completed: true,
    };

    const updatedTask = await updateTask(
      this.client,
      taskGid,
      updateParams,
      requestId,
    );
    return formatTaskUpdate(updatedTask, updateParams, {
      requestId,
      startTime: Date.now(),
    });
  }

  private async handleAddSubtask(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let parentTaskGid = params.parent_task_gid;

    // Resolve parent task if needed
    if (!parentTaskGid && params.parent_task_name) {
      const findResult = await findTaskGidByName(
        this.client,
        params.parent_task_name,
        workspaceGid,
        undefined, // projectGid
        false, // includeCompleted
        requestId,
      );

      if (findResult.type === 'found') {
        parentTaskGid = findResult.gid;
      } else if (findResult.type === 'ambiguous') {
        throw new Error(findResult.message);
      }
    }

    if (!parentTaskGid) {
      throw new Error(
        `Could not find parent task: ${params.parent_task_name || 'unknown'}`,
      );
    }

    // Create subtask parameters
    const createParams: CreateTaskParams = {
      name: params.subtask_name,
      workspace: workspaceGid,
      parent: parentTaskGid,
    };

    if (params.notes) {
      createParams.notes = params.notes;
    }

    if (params.assignee === 'me') {
      const currentUser = await getUsersMe(this.client, requestId);
      createParams.assignee = currentUser.gid;
    } else if (params.assignee_gid) {
      createParams.assignee = params.assignee_gid;
    }

    if (params.due_date_parsed) {
      createParams.due_on = params.due_date_parsed;
    }

    const subtask = await createTask(this.client, createParams, requestId);

    // Update context
    const sessionId = taskContextManager.getSessionId(requestId);
    taskContextManager.addTaskContext(
      sessionId,
      subtask.gid,
      subtask.name,
      'CREATE',
      undefined, // projectGid
      undefined, // projectName
    );

    return formatTaskCreation(
      subtask,
      { projectName: `Subtask of ${params.parent_task_name}` },
      { requestId, startTime: Date.now() },
    );
  }

  private async handleListSubtasks(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let parentTaskGid = params.parent_task_gid;

    if (!parentTaskGid && params.parent_task_name) {
      const findResult = await findTaskGidByName(
        this.client,
        params.parent_task_name,
        workspaceGid,
        undefined, // projectGid
        false, // includeCompleted
        requestId,
      );

      if (findResult.type === 'found') {
        parentTaskGid = findResult.gid;
      } else if (findResult.type === 'ambiguous') {
        throw new Error(findResult.message);
      }
    }

    if (!parentTaskGid) {
      throw new Error(
        `Could not find parent task: ${params.parent_task_name || 'unknown'}`,
      );
    }

    const subtasks = await getSubtasks(
      this.client,
      parentTaskGid,
      undefined,
      requestId,
    );
    return formatTaskList(
      subtasks,
      {
        customDescription: `subtasks of "${params.parent_task_name || parentTaskGid}"`,
      },
      { requestId, startTime: Date.now() },
    );
  }

  private async handleListProjects(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    const projects = await listProjects(
      this.client,
      workspaceGid,
      false,
      requestId,
    );
    return formatProjectList(
      projects,
      {},
      { requestId, startTime: Date.now() },
    );
  }

  private async handleCreateProject(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    const projectParams = {
      name: params.name,
      workspace: workspaceGid,
      notes: params.notes,
      privacy_setting: params.privacy_setting || 'public_to_workspace',
    };

    const project = await createProject(this.client, projectParams, requestId);

    // Update context
    const sessionId = taskContextManager.getSessionId(requestId);
    taskContextManager.addProjectContext(project.gid, project.name);

    return formatProjectCreation(project, { requestId, startTime: Date.now() });
  }

  private async handleGetUserDetails(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let userGid = params.user_gid;

    // Handle "me" case
    if (params.user_identifier === 'me' || params.user_name === 'me') {
      const currentUser = await getUsersMe(this.client, requestId);
      return formatUserDetails(currentUser, {
        requestId,
        startTime: Date.now(),
      });
    }

    // Resolve user by name or email if needed
    if (!userGid && (params.user_name || params.user_email)) {
      const identifier = params.user_name || params.user_email;
      userGid = await findUserGidByEmailOrName(
        this.client,
        identifier,
        workspaceGid,
        requestId,
      );
    }

    if (!userGid) {
      throw new Error(
        `Could not find user: ${params.user_name || params.user_email || 'unknown'}`,
      );
    }

    const user = await getUserDetails(this.client, userGid, requestId);
    return formatUserDetails(user, { requestId, startTime: Date.now() });
  }

  private async handleListWorkspaceUsers(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    const users = await listWorkspaceUsers(
      this.client,
      workspaceGid,
      requestId,
    );
    return formatWorkspaceUsersList(
      users,
      { name: 'Current Workspace', gid: workspaceGid },
      { requestId, startTime: Date.now() },
    );
  }

  private async handleSearchAsana(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    const searchResults = await typeaheadSearch(
      this.client,
      {
        workspaceGid,
        query: params.query,
        resourceType: params.resource_type, // 'task', 'project', 'user', or undefined for all
      },
      requestId,
    );

    return formatSearchResults(
      searchResults,
      params.query,
      params.resource_type,
      { requestId, startTime: Date.now() },
    );
  }

  private async handleAddFollower(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let taskGid = params.task_gid;
    let userGid = params.user_gid;

    // Resolve task if needed
    if (!taskGid && params.task_name) {
      const findResult = await findTaskGidByName(
        this.client,
        params.task_name,
        workspaceGid,
        undefined, // projectGid
        false, // includeCompleted
        requestId,
      );

      if (findResult.type === 'found') {
        taskGid = findResult.gid;
      } else if (findResult.type === 'ambiguous') {
        throw new Error(findResult.message);
      }
    }

    // Resolve user if needed
    if (!userGid && params.user_identifier) {
      if (params.user_identifier === 'me') {
        const currentUser = await getUsersMe(this.client, requestId);
        userGid = currentUser.gid;
      } else {
        userGid = await findUserGidByEmailOrName(
          this.client,
          params.user_identifier,
          workspaceGid,
          requestId,
        );
      }
    }

    if (!taskGid) {
      throw new Error(`Could not find task: ${params.task_name || 'unknown'}`);
    }

    if (!userGid) {
      throw new Error(
        `Could not find user: ${params.user_identifier || 'unknown'}`,
      );
    }

    const updatedTask = await addFollowerToTask(
      this.client,
      taskGid,
      userGid,
      requestId,
    );
    return formatAddFollowerResponse(
      updatedTask,
      params.user_identifier,
      params.task_name || taskGid,
      { requestId, startTime: Date.now() },
    );
  }

  private async handleSetTaskDueDate(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let taskGid = params.task_gid;

    // Resolve task if needed
    if (!taskGid && params.task_name) {
      const findResult = await findTaskGidByName(
        this.client,
        params.task_name,
        workspaceGid,
        undefined, // projectGid
        false, // includeCompleted
        requestId,
      );

      if (findResult.type === 'found') {
        taskGid = findResult.gid;
      } else if (findResult.type === 'ambiguous') {
        throw new Error(findResult.message);
      }
    }

    if (!taskGid) {
      throw new Error(`Could not find task: ${params.task_name || 'unknown'}`);
    }

    const updateParams: UpdateTaskParams = {};

    if (params.due_date_parsed) {
      updateParams.due_on = params.due_date_parsed;
    } else if (params.due_date) {
      // Try to parse the date if not already parsed
      const parsedDate = parseDateTime(params.due_date);
      if (parsedDate.success && parsedDate.formattedForAsana.due_on) {
        updateParams.due_on = parsedDate.formattedForAsana.due_on;
      } else {
        throw new Error(`Could not parse due date: ${params.due_date}`);
      }
    }

    const updatedTask = await updateTask(
      this.client,
      taskGid,
      updateParams,
      requestId,
    );
    return formatTaskUpdate(updatedTask, updateParams, {
      requestId,
      startTime: Date.now(),
    });
  }

  private async handleListProjectSections(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let projectGid = params.project_gid;

    // Resolve project if needed
    if (!projectGid && params.project_name) {
      projectGid = await findProjectGidByName(
        this.client,
        params.project_name,
        workspaceGid,
        requestId,
      );
    }

    if (!projectGid) {
      throw new Error(
        `Could not find project: ${params.project_name || 'unknown'}`,
      );
    }

    const sections = await getProjectSections(
      this.client,
      projectGid,
      undefined,
      requestId,
    );
    return formatSectionList(
      sections,
      { projectName: params.project_name, projectGid },
      { requestId, startTime: Date.now() },
    );
  }

  private async handleCreateProjectSection(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let projectGid = params.project_gid;

    // Resolve project if needed
    if (!projectGid && params.project_name) {
      projectGid = await findProjectGidByName(
        this.client,
        params.project_name,
        workspaceGid,
        requestId,
      );
    }

    if (!projectGid) {
      throw new Error(
        `Could not find project: ${params.project_name || 'unknown'}`,
      );
    }

    const sectionParams = {
      name: params.section_name,
      projectGid,
    };

    const section = await createSectionInProject(
      this.client,
      sectionParams,
      requestId,
    );
    return formatSectionCreation(
      section,
      { projectName: params.project_name, projectGid },
      { requestId, startTime: Date.now() },
    );
  }

  private async handleMoveTaskToSection(
    params: any,
    requestId: string,
  ): Promise<string> {
    const workspaceGid = getWorkspaceGid();
    if (!workspaceGid) {
      throw new Error('Workspace GID not configured');
    }

    let taskGid = params.task_gid;
    let sectionGid = params.section_gid;
    let projectGid = params.project_gid;

    // Resolve task if needed
    if (!taskGid && params.task_name) {
      const findResult = await findTaskGidByName(
        this.client,
        params.task_name,
        workspaceGid,
        projectGid, // Use project context if available
        false, // includeCompleted
        requestId,
      );

      if (findResult.type === 'found') {
        taskGid = findResult.gid;
      } else if (findResult.type === 'ambiguous') {
        throw new Error(findResult.message);
      }
    }

    // Resolve project if needed (for section lookup)
    if (!projectGid && params.project_name) {
      projectGid = await findProjectGidByName(
        this.client,
        params.project_name,
        workspaceGid,
        requestId,
      );
    }

    // Resolve section if needed
    if (!sectionGid && params.section_name && projectGid) {
      sectionGid = await findSectionGidByName(
        this.client,
        params.section_name,
        projectGid,
        requestId,
      );

      if (sectionGid === 'ambiguous') {
        throw new Error(
          `Multiple sections found with name "${params.section_name}"`,
        );
      }
    }

    if (!taskGid) {
      throw new Error(`Could not find task: ${params.task_name || 'unknown'}`);
    }

    if (!sectionGid) {
      throw new Error(
        `Could not find section: ${params.section_name || 'unknown'}`,
      );
    }

    const updatedTask = await addTaskToSection(
      this.client,
      sectionGid,
      taskGid,
      requestId,
    );
    return formatTaskMoveToSection(
      updatedTask,
      {
        taskName: params.task_name,
        taskGid,
        sectionName: params.section_name,
        sectionGid,
        projectName: params.project_name,
      },
      { requestId, startTime: Date.now() },
    );
  }

  /**
   * Update context based on the operation performed
   */
  private updateContext(
    functionName: AsanaFunctionName,
    parameters: any,
    result: string,
    requestId: string,
  ): void {
    const sessionId = taskContextManager.getSessionId(requestId);

    switch (functionName) {
      case 'create_task': {
        // Extract task info from result if available
        const taskMatch = result.match(/Created task "([^"]+)" \((\d+)\)/);
        if (taskMatch) {
          taskContextManager.addTaskContext(
            sessionId,
            taskMatch[2],
            taskMatch[1],
            'CREATE',
            parameters.project_gid,
            parameters.project_name,
          );
        }
        break;
      }

      case 'get_project_details':
      case 'list_tasks':
        if (parameters.project_name && parameters.project_gid) {
          // Update project context
          // Could extend taskContextManager to handle projects
        }
        break;
    }
  }

  /**
   * Extract entities from user message for context tracking
   */
  private extractEntitiesFromMessage(message: string): {
    tasks?: string[];
    projects?: string[];
    users?: string[];
  } {
    const entities: {
      tasks?: string[];
      projects?: string[];
      users?: string[];
    } = {};

    // Simple entity extraction - could be enhanced with NLP
    const taskMatches = message.match(
      /task[s]?\s+(?:called|named)\s+"([^"]+)"/gi,
    );
    if (taskMatches) {
      entities.tasks = taskMatches.map((match) =>
        match.replace(/task[s]?\s+(?:called|named)\s+"/gi, '').replace('"', ''),
      );
    }

    const projectMatches = message.match(
      /project[s]?\s+(?:called|named)\s+"([^"]+)"/gi,
    );
    if (projectMatches) {
      entities.projects = projectMatches.map((match) =>
        match
          .replace(/project[s]?\s+(?:called|named)\s+"/gi, '')
          .replace('"', ''),
      );
    }

    return entities;
  }

  /**
   * Update enhanced context based on the operation performed
   */
  private updateEnhancedContext(
    sessionId: string,
    functionName: AsanaFunctionName,
    parameters: any,
    result: string,
    requestId: string,
  ): void {
    switch (functionName) {
      case 'create_task': {
        // Extract task info from result if available
        const taskMatch = result.match(/Created task "([^"]+)" \((\d+)\)/);
        if (taskMatch) {
          conversationContextManager.addTaskContext(sessionId, {
            gid: taskMatch[2],
            name: taskMatch[1],
            projectGid: parameters.project_gid,
            projectName: parameters.project_name,
            assigneeGid: parameters.assignee_gid,
            assigneeName: parameters.assignee,
            dueDate: parameters.due_date,
            completed: false,
            operation: 'CREATE',
          });
        }
        break;
      }

      case 'get_project_details':
      case 'list_tasks':
        if (parameters.project_name && parameters.project_gid) {
          conversationContextManager.addProjectContext(sessionId, {
            gid: parameters.project_gid,
            name: parameters.project_name,
          });
        }
        break;

      case 'list_projects':
        // Could extract project info from result
        break;

      case 'get_user_details':
        if (parameters.user_gid && parameters.user_name) {
          conversationContextManager.addUserContext(sessionId, {
            gid: parameters.user_gid,
            name: parameters.user_name,
            relationship:
              parameters.user_gid === 'me' ? 'self' : 'collaborator',
          });
        }
        break;
    }

    // Also update legacy context for backward compatibility
    this.updateContext(functionName, parameters, result, requestId);
  }
}

// Export factory function for easy integration
export function createModernAsanaTool(
  apiKey?: string,
  openaiApiKey?: string,
): DynamicStructuredTool {
  const modernTool = new ModernAsanaTool(apiKey, openaiApiKey);
  return modernTool.createTool();
}
