/**
 * Modern Asana Tool - Complete Integration
 *
 * Integrates all advanced features:
 * - Workflow Orchestration
 * - Semantic Entity Resolution
 * - Intelligent Error Recovery
 * - Response Enhancement
 * - Context Management
 */

import type { AsanaApiClient } from './api-client/client';
import { WorkflowOrchestrator } from './workflows/orchestrator';
import { responseEnhancer, type EnhancedResponse } from './response/enhancer';
import { EnhancedEntityResolver } from './semantic/enhancedEntityResolver';
import {
  intelligentErrorRecovery,
  type ErrorContext,
} from './recovery/errorRecovery';

// Import all operations
import {
  createTask,
  listTasks,
  updateTask,
  getTaskDetails,
} from './api-client/operations/tasks';
import {
  createProject,
  listProjects,
  getProjectDetails,
} from './api-client/operations/projects';
import { listWorkspaceUsers, getUsersMe } from './api-client/operations/users';
import { getWorkspaceGid } from './config';

export interface ModernAsanaToolOptions {
  /** Enable workflow orchestration */
  enableWorkflows?: boolean;
  /** Enable semantic entity resolution */
  enableSemanticResolution?: boolean;
  /** Enable intelligent error recovery */
  enableErrorRecovery?: boolean;
  /** Enable response enhancement */
  enableResponseEnhancement?: boolean;
}

export interface ToolExecutionContext {
  sessionId: string;
  requestId?: string;
  userIntent?: string;
  conversationContext?: Record<string, any>;
}

export interface ToolResult {
  /** Raw operation result */
  data: any;
  /** Enhanced response with formatting and suggestions */
  enhanced?: EnhancedResponse;
  /** Execution metadata */
  metadata: {
    operation: string;
    duration: number;
    success: boolean;
    errorRecoveryUsed?: boolean;
    semanticResolutionUsed?: boolean;
    workflowExecuted?: boolean;
  };
}

export class ModernAsanaTool {
  private orchestrator: WorkflowOrchestrator;
  private entityResolver: EnhancedEntityResolver;
  private options: Required<ModernAsanaToolOptions>;

  constructor(
    private client: AsanaApiClient,
    options: ModernAsanaToolOptions = {},
  ) {
    this.options = {
      enableWorkflows: true,
      enableSemanticResolution: true,
      enableErrorRecovery: true,
      enableResponseEnhancement: true,
      ...options,
    };

    this.orchestrator = new WorkflowOrchestrator(client);
    this.entityResolver = new EnhancedEntityResolver(client);
  }

  // ===== WORKFLOW OPERATIONS =====

  /**
   * Execute a multi-step workflow
   */
  async executeWorkflow(
    workflowId: string,
    parameters: Record<string, any>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      if (!this.options.enableWorkflows) {
        throw new Error('Workflow orchestration is disabled');
      }

      const execution = await this.orchestrator.executeWorkflow(
        workflowId,
        parameters,
        context.sessionId,
        context.requestId,
      );

      const duration = Date.now() - startTime;
      const enhanced = this.options.enableResponseEnhancement
        ? responseEnhancer.enhanceWorkflowResponse(
            execution,
            context.conversationContext,
          )
        : undefined;

      return {
        data: execution,
        enhanced,
        metadata: {
          operation: `workflow:${workflowId}`,
          duration,
          success: execution.status === 'completed',
          workflowExecuted: true,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const enhanced = this.options.enableResponseEnhancement
        ? responseEnhancer.enhanceErrorResponse(
            `workflow:${workflowId}`,
            error as Error,
            context.conversationContext,
          )
        : undefined;

      return {
        data: null,
        enhanced,
        metadata: {
          operation: `workflow:${workflowId}`,
          duration,
          success: false,
          workflowExecuted: true,
        },
      };
    }
  }

  /**
   * Suggest workflows based on user intent
   */
  async suggestWorkflows(
    userIntent: string,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      if (!this.options.enableWorkflows) {
        throw new Error('Workflow orchestration is disabled');
      }

      const suggestions = await this.orchestrator.suggestWorkflows(
        userIntent,
        context.conversationContext || {},
        context.sessionId,
      );

      const duration = Date.now() - startTime;

      return {
        data: suggestions,
        metadata: {
          operation: 'workflow_suggest',
          duration,
          success: true,
          workflowExecuted: false,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const enhanced = this.options.enableResponseEnhancement
        ? responseEnhancer.enhanceErrorResponse(
            'workflow_suggest',
            error as Error,
            context.conversationContext,
          )
        : undefined;

      return {
        data: null,
        enhanced,
        metadata: {
          operation: 'workflow_suggest',
          duration,
          success: false,
        },
      };
    }
  }

  // ===== TASK OPERATIONS =====

  /**
   * Create a new task with intelligent features
   */
  async createTask(
    parameters: {
      name: string;
      workspace?: string;
      notes?: string;
      projects?: string[];
      assignee?: string;
      due_on?: string;
      parent?: string;
    },
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    return this.executeOperation(
      'create_task',
      async () => {
        // Resolve semantic references
        const resolvedParams = await this.resolveParameters(
          parameters,
          context,
        );

        // Ensure workspace is set
        if (!resolvedParams.workspace) {
          resolvedParams.workspace = getWorkspaceGid();
          if (!resolvedParams.workspace) {
            throw new Error('Workspace not configured');
          }
        }

        return await createTask(
          this.client,
          resolvedParams as any,
          context.requestId,
        );
      },
      context,
    );
  }

  /**
   * List tasks with intelligent filtering
   */
  async listTasks(
    parameters: {
      workspace?: string;
      project?: string;
      assignee?: string;
      completed_since?: string;
      opt_fields?: string[];
    },
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    return this.executeOperation(
      'list_tasks',
      async () => {
        const resolvedParams = await this.resolveParameters(
          parameters,
          context,
        );

        if (!resolvedParams.workspace && !resolvedParams.project) {
          resolvedParams.workspace = getWorkspaceGid();
          if (!resolvedParams.workspace) {
            throw new Error('Workspace not configured');
          }
        }

        return await listTasks(
          this.client,
          resolvedParams as any,
          context.requestId,
        );
      },
      context,
    );
  }

  /**
   * Update a task with semantic resolution
   */
  async updateTask(
    taskGid: string,
    updates: {
      notes?: string;
      completed?: boolean;
      due_on?: string;
      due_at?: string;
    },
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    return this.executeOperation(
      'update_task',
      async () => {
        // Resolve task GID if it's a semantic reference
        const resolvedTaskGid = await this.resolveEntityReference(
          taskGid,
          'task',
          context,
        );
        return await updateTask(
          this.client,
          resolvedTaskGid,
          updates,
          context.requestId,
        );
      },
      context,
    );
  }

  /**
   * Get task details
   */
  async getTaskDetails(
    taskGid: string,
    context: ToolExecutionContext,
    opt_fields?: string[],
  ): Promise<ToolResult> {
    return this.executeOperation(
      'get_task',
      async () => {
        const resolvedTaskGid = await this.resolveEntityReference(
          taskGid,
          'task',
          context,
        );
        return await getTaskDetails(
          this.client,
          resolvedTaskGid,
          opt_fields,
          context.requestId,
        );
      },
      context,
    );
  }

  // ===== PROJECT OPERATIONS =====

  /**
   * Create a new project
   */
  async createProject(
    parameters: {
      name: string;
      workspace?: string;
      notes?: string;
      team?: string;
      public?: boolean;
      color?: string;
    },
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    return this.executeOperation(
      'create_project',
      async () => {
        const resolvedParams = await this.resolveParameters(
          parameters,
          context,
        );

        if (!resolvedParams.workspace) {
          resolvedParams.workspace = getWorkspaceGid();
          if (!resolvedParams.workspace) {
            throw new Error('Workspace not configured');
          }
        }

        return await createProject(
          this.client,
          resolvedParams as any,
          context.requestId,
        );
      },
      context,
    );
  }

  /**
   * List projects
   */
  async listProjects(
    parameters: {
      workspace?: string;
      team?: string;
      archived?: boolean;
      opt_fields?: string[];
    },
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    return this.executeOperation(
      'list_projects',
      async () => {
        const resolvedParams = await this.resolveParameters(
          parameters,
          context,
        );

        if (!resolvedParams.workspace) {
          resolvedParams.workspace = getWorkspaceGid();
          if (!resolvedParams.workspace) {
            throw new Error('Workspace not configured');
          }
        }

        return await listProjects(
          this.client,
          resolvedParams.workspace,
          resolvedParams.archived || false,
          context.requestId,
        );
      },
      context,
    );
  }

  /**
   * Get project details
   */
  async getProjectDetails(
    projectGid: string,
    context: ToolExecutionContext,
    opt_fields?: string[],
  ): Promise<ToolResult> {
    return this.executeOperation(
      'get_project',
      async () => {
        const resolvedProjectGid = await this.resolveEntityReference(
          projectGid,
          'project',
          context,
        );
        return await getProjectDetails(
          this.client,
          resolvedProjectGid,
          context.requestId,
        );
      },
      context,
    );
  }

  // ===== USER OPERATIONS =====

  /**
   * List workspace users
   */
  async listUsers(
    context: ToolExecutionContext,
    workspaceGid?: string,
  ): Promise<ToolResult> {
    return this.executeOperation(
      'list_users',
      async () => {
        const workspace = workspaceGid || getWorkspaceGid();
        if (!workspace) {
          throw new Error('Workspace not configured');
        }

        return await listWorkspaceUsers(
          this.client,
          workspace,
          context.requestId,
        );
      },
      context,
    );
  }

  // ===== SEMANTIC RESOLUTION =====

  /**
   * Resolve entity references (e.g., "@john.doe" -> user GID)
   */
  async resolveEntity(
    query: string,
    entityType: 'task' | 'project' | 'user' | 'auto',
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      if (!this.options.enableSemanticResolution) {
        throw new Error('Semantic entity resolution is disabled');
      }

      const result = await this.entityResolver.resolveAnyEntity(
        query,
        entityType,
        { sessionId: context.sessionId },
      );

      const duration = Date.now() - startTime;

      return {
        data: result,
        metadata: {
          operation: 'resolve_entity',
          duration,
          success: true,
          semanticResolutionUsed: true,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const enhanced = this.options.enableResponseEnhancement
        ? responseEnhancer.enhanceErrorResponse(
            'resolve_entity',
            error as Error,
            context.conversationContext,
          )
        : undefined;

      return {
        data: null,
        enhanced,
        metadata: {
          operation: 'resolve_entity',
          duration,
          success: false,
          semanticResolutionUsed: true,
        },
      };
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Execute an operation with all intelligent features
   */
  private async executeOperation<T>(
    operation: string,
    operationFn: () => Promise<T>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    let errorRecoveryUsed = false;

    try {
      let result: T;

      if (this.options.enableErrorRecovery) {
        const errorContext: ErrorContext = {
          operation,
          parameters: {},
          sessionId: context.sessionId,
          requestId: context.requestId,
          userIntent: context.userIntent || `Execute ${operation}`,
        };

        const recoveryResult =
          await intelligentErrorRecovery.executeWithRecovery(
            operationFn,
            errorContext,
          );

        if (recoveryResult.success && recoveryResult.data !== undefined) {
          result = recoveryResult.data;
          errorRecoveryUsed = recoveryResult.attemptCount > 1;
        } else {
          throw recoveryResult.error || new Error('Operation failed');
        }
      } else {
        result = await operationFn();
      }

      const duration = Date.now() - startTime;
      const enhanced = this.options.enableResponseEnhancement
        ? responseEnhancer.enhanceOperationResponse(
            operation,
            result,
            context.conversationContext,
          )
        : undefined;

      return {
        data: result,
        enhanced,
        metadata: {
          operation,
          duration,
          success: true,
          errorRecoveryUsed,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const enhanced = this.options.enableResponseEnhancement
        ? responseEnhancer.enhanceErrorResponse(
            operation,
            error as Error,
            context.conversationContext,
          )
        : undefined;

      return {
        data: null,
        enhanced,
        metadata: {
          operation,
          duration,
          success: false,
          errorRecoveryUsed,
        },
      };
    }
  }

  /**
   * Resolve parameters with semantic entity resolution
   */
  private async resolveParameters(
    parameters: Record<string, any>,
    context: ToolExecutionContext,
  ): Promise<Record<string, any>> {
    if (!this.options.enableSemanticResolution) {
      return parameters;
    }

    const resolved = { ...parameters };
    let assigneeResolvedByMeLogic = false;

    // Handle special case: assignee "me" or "@me" needs to be resolved to current user GID
    if (resolved.assignee === 'me' || resolved.assignee === '@me') {
      try {
        const currentUser = await getUsersMe(this.client, context.requestId);
        resolved.assignee = currentUser.gid;
        assigneeResolvedByMeLogic = true; // Mark that assignee was handled
      } catch (error) {
        console.error(
          '[ModernAsanaTool] Failed to resolve "me" assignee:',
          error,
        );
        // Keep original "me" or "@me" as fallback if resolution fails,
        // allowing the generic resolver to potentially handle it or fail gracefully.
      }
    }

    for (const [key, value] of Object.entries(parameters)) {
      // If this is the assignee key and we've already resolved it via "me" logic, skip generic @ resolution for it.
      if (key === 'assignee' && assigneeResolvedByMeLogic) {
        continue;
      }

      if (typeof value === 'string' && value.includes('@')) {
        try {
          const entityResult = await this.entityResolver.resolveAnyEntity(
            value,
            'auto',
            { sessionId: context.sessionId },
          );
          if (entityResult.result.bestMatch) {
            resolved[key] = entityResult.result.bestMatch.gid;
          }
        } catch {
          // Keep original value if resolution fails
        }
      } else if (Array.isArray(value)) {
        const resolvedArray = [];
        for (const item of value) {
          let itemProcessed = false;
          if (
            typeof item === 'string' &&
            (item === 'me' || item === '@me') &&
            key === 'assignee'
          ) {
            // Handle "me" or "@me" in assignee arrays
            try {
              const currentUser = await getUsersMe(
                this.client,
                context.requestId,
              );
              resolvedArray.push(currentUser.gid);
              itemProcessed = true;
            } catch {
              resolvedArray.push(item); // Fallback to original item
              itemProcessed = true; // Still mark as processed to avoid generic @ resolution
            }
          }

          if (
            !itemProcessed &&
            typeof item === 'string' &&
            item.includes('@')
          ) {
            try {
              const entityResult = await this.entityResolver.resolveAnyEntity(
                item,
                'auto',
                { sessionId: context.sessionId },
              );
              if (entityResult.result.bestMatch) {
                resolvedArray.push(entityResult.result.bestMatch.gid);
              } else {
                resolvedArray.push(item);
              }
            } catch {
              resolvedArray.push(item);
            }
          } else if (!itemProcessed) {
            // Only push if not processed by "me" or "@" logic
            resolvedArray.push(item);
          }
        }
        resolved[key] = resolvedArray;
      }
    }
    return resolved;
  }

  /**
   * Resolve a single entity reference
   */
  private async resolveEntityReference(
    reference: string,
    entityType: 'task' | 'project' | 'user',
    context: ToolExecutionContext,
  ): Promise<string> {
    if (!this.options.enableSemanticResolution || !reference.includes('@')) {
      return reference;
    }

    try {
      const entityResult = await this.entityResolver.resolveAnyEntity(
        reference,
        entityType,
        { sessionId: context.sessionId },
      );
      return entityResult.result.bestMatch?.gid || reference;
    } catch {
      return reference;
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Get workflow execution status
   */
  getWorkflowExecution(workflowId: string, context: ToolExecutionContext) {
    if (!this.options.enableWorkflows) {
      return null;
    }
    return this.orchestrator.getWorkflowExecution(
      context.sessionId,
      workflowId,
    );
  }

  /**
   * Cancel a running workflow
   */
  cancelWorkflow(workflowId: string, context: ToolExecutionContext): boolean {
    if (!this.options.enableWorkflows) {
      return false;
    }
    return this.orchestrator.cancelWorkflow(context.sessionId, workflowId);
  }

  /**
   * Get tool configuration
   */
  getConfiguration(): Required<ModernAsanaToolOptions> {
    return { ...this.options };
  }

  /**
   * Update tool configuration
   */
  updateConfiguration(updates: Partial<ModernAsanaToolOptions>): void {
    this.options = { ...this.options, ...updates };
  }
}

// Export singleton factory
export function createModernAsanaTool(
  client: AsanaApiClient,
  options?: ModernAsanaToolOptions,
): ModernAsanaTool {
  return new ModernAsanaTool(client, options);
}
