/**
 * Workflow Orchestrator
 *
 * Enables intelligent multi-step operations by combining semantic entity resolution,
 * error recovery, context management, and operation coordination for complex workflows.
 */

import {
  intelligentErrorRecovery,
  type ErrorContext,
} from '../recovery/errorRecovery';
import { FallbackHandler } from '../recovery/fallbackHandler';
import { EnhancedEntityResolver } from '../semantic/enhancedEntityResolver';
import { conversationContextManager } from '../context/conversationContext';
import type { AsanaApiClient } from '../api-client/client';
import { createTask } from '../api-client/operations/tasks';
import { createProject } from '../api-client/operations/projects';
import { listWorkspaceUsers } from '../api-client/operations/users';
import { getWorkspaceGid } from '../config';

export interface WorkflowStep {
  id: string;
  operation: string;
  parameters: Record<string, any>;
  dependencies?: string[]; // IDs of steps that must complete first
  optional?: boolean;
  retryable?: boolean;
  description?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  metadata?: Record<string, any>;
}

export interface WorkflowExecution {
  workflowId: string;
  sessionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  startTime: number;
  endTime?: number;
  steps: WorkflowStepResult[];
  context: Record<string, any>;
  errors: WorkflowError[];
}

export interface WorkflowStepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  result?: any;
  error?: Error;
  attempts: number;
}

export interface WorkflowError {
  stepId: string;
  error: Error;
  recoveryAttempted: boolean;
  fallbackUsed: boolean;
  timestamp: number;
}

export interface WorkflowSuggestion {
  workflowId: string;
  name: string;
  description: string;
  confidence: number;
  reasoning: string;
  estimatedDuration: string;
  requiredParameters: string[];
  optionalParameters: string[];
}

export class WorkflowOrchestrator {
  private entityResolver: EnhancedEntityResolver;
  private fallbackHandler: FallbackHandler;
  private activeExecutions: Map<string, WorkflowExecution> = new Map();
  private workflowTemplates: Map<string, WorkflowDefinition> = new Map();

  constructor(private client: AsanaApiClient) {
    this.entityResolver = new EnhancedEntityResolver(client);
    this.fallbackHandler = new FallbackHandler(client);
    this.initializeWorkflowTemplates();
  }

  /**
   * Execute a workflow with intelligent orchestration
   */
  async executeWorkflow(
    workflowId: string,
    parameters: Record<string, any>,
    sessionId: string,
    requestId?: string,
  ): Promise<WorkflowExecution> {
    const workflow = this.workflowTemplates.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const execution: WorkflowExecution = {
      workflowId,
      sessionId,
      status: 'pending',
      startTime: Date.now(),
      steps: workflow.steps.map((step) => ({
        stepId: step.id,
        status: 'pending',
        attempts: 0,
      })),
      context: { ...parameters },
      errors: [],
    };

    this.activeExecutions.set(`${sessionId}:${workflowId}`, execution);

    try {
      execution.status = 'running';
      await this.executeWorkflowSteps(workflow, execution, requestId);

      execution.status = this.determineExecutionStatus(execution);
      execution.endTime = Date.now();

      // Update conversation context with workflow results
      this.updateConversationContext(execution);

      return execution;
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.errors.push({
        stepId: 'workflow',
        error: error as Error,
        recoveryAttempted: false,
        fallbackUsed: false,
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  /**
   * Suggest workflows based on user intent and context
   */
  async suggestWorkflows(
    userIntent: string,
    context: Record<string, any>,
    sessionId: string,
  ): Promise<WorkflowSuggestion[]> {
    const suggestions: WorkflowSuggestion[] = [];
    const lowerIntent = userIntent.toLowerCase();

    // Analyze intent and suggest appropriate workflows
    for (const [id, workflow] of this.workflowTemplates) {
      const confidence = this.calculateWorkflowConfidence(
        workflow,
        lowerIntent,
        context,
      );

      if (confidence > 0.2) {
        // Lowered threshold from 0.3 to 0.2
        const suggestion: WorkflowSuggestion = {
          workflowId: id,
          name: workflow.name,
          description: workflow.description,
          confidence,
          reasoning: this.generateWorkflowReasoning(
            workflow,
            lowerIntent,
            context,
          ),
          estimatedDuration: this.estimateWorkflowDuration(workflow),
          requiredParameters: this.extractRequiredParameters(workflow),
          optionalParameters: this.extractOptionalParameters(workflow),
        };
        suggestions.push(suggestion);
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);
    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  /**
   * Get workflow execution status
   */
  getWorkflowExecution(
    sessionId: string,
    workflowId: string,
  ): WorkflowExecution | undefined {
    return this.activeExecutions.get(`${sessionId}:${workflowId}`);
  }

  /**
   * Cancel a running workflow
   */
  cancelWorkflow(sessionId: string, workflowId: string): boolean {
    const execution = this.activeExecutions.get(`${sessionId}:${workflowId}`);
    if (execution && execution.status === 'running') {
      execution.status = 'failed';
      execution.endTime = Date.now();
      return true;
    }
    return false;
  }

  // Private methods

  private async executeWorkflowSteps(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    requestId?: string,
  ): Promise<void> {
    const completedSteps = new Set<string>();
    const maxIterations = workflow.steps.length * 2; // Prevent infinite loops
    let iterations = 0;

    while (
      completedSteps.size < workflow.steps.length &&
      iterations < maxIterations
    ) {
      iterations++;
      let progressMade = false;

      for (const step of workflow.steps) {
        if (completedSteps.has(step.id)) continue;

        // Check if dependencies are satisfied
        const dependenciesMet =
          step.dependencies?.every((depId) => completedSteps.has(depId)) ??
          true;
        if (!dependenciesMet) continue;

        // Execute the step
        const stepResult = execution.steps.find((s) => s.stepId === step.id);
        if (!stepResult) continue;
        stepResult.status = 'running';
        stepResult.startTime = Date.now();

        try {
          const result = await this.executeWorkflowStep(
            step,
            execution,
            requestId,
          );
          stepResult.result = result;
          stepResult.status = 'completed';
          stepResult.endTime = Date.now();
          completedSteps.add(step.id);
          progressMade = true;

          // Update execution context with step results
          this.updateExecutionContext(execution, step, result);
        } catch (error) {
          stepResult.error = error as Error;
          stepResult.endTime = Date.now();

          if (step.optional) {
            stepResult.status = 'skipped';
            completedSteps.add(step.id);
            progressMade = true;
          } else {
            stepResult.status = 'failed';
            execution.errors.push({
              stepId: step.id,
              error: error as Error,
              recoveryAttempted: false,
              fallbackUsed: false,
              timestamp: Date.now(),
            });

            // Try error recovery if step is retryable
            if (step.retryable && stepResult.attempts < 3) {
              stepResult.attempts++;
              stepResult.status = 'pending';
              continue;
            }

            // If this is a critical step, fail the workflow
            throw error;
          }
        }
      }

      if (!progressMade) {
        throw new Error(
          'Workflow execution stalled - circular dependencies or unresolvable steps',
        );
      }
    }
  }

  private async executeWorkflowStep(
    step: WorkflowStep,
    execution: WorkflowExecution,
    requestId?: string,
  ): Promise<any> {
    // Resolve parameters using semantic entity resolution
    const resolvedParams = await this.resolveStepParameters(step, execution);

    const errorContext: ErrorContext = {
      operation: step.operation,
      parameters: resolvedParams,
      sessionId: execution.sessionId,
      requestId,
      userIntent: `Workflow step: ${step.description || step.operation}`,
    };

    // Execute with error recovery
    const recoveryResult = await intelligentErrorRecovery.executeWithRecovery(
      () =>
        this.performStepOperation(step.operation, resolvedParams, requestId),
      errorContext,
    );

    if (recoveryResult.success) {
      return recoveryResult.data;
    }

    // Try fallback if recovery failed
    if (recoveryResult.error) {
      const fallbackResult = await this.attemptStepFallback(
        step,
        resolvedParams,
        recoveryResult.error,
        requestId,
      );
      if (fallbackResult.success) {
        return fallbackResult.data;
      }
      throw recoveryResult.error;
    }

    throw new Error('Operation failed without specific error');
  }

  private async resolveStepParameters(
    step: WorkflowStep,
    execution: WorkflowExecution,
  ): Promise<Record<string, any>> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(step.parameters)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // Context reference (e.g., "$project_id" refers to execution.context.project_id)
        const contextKey = value.substring(1);
        const contextValue = execution.context[contextKey];

        // Check if the resolved context value needs entity resolution
        if (typeof contextValue === 'string' && contextValue.includes('@')) {
          try {
            const entityResult = await this.entityResolver.resolveAnyEntity(
              contextValue,
              'auto',
              { sessionId: execution.sessionId },
            );
            if (entityResult.result.bestMatch) {
              resolved[key] = entityResult.result.bestMatch.gid;
            } else {
              resolved[key] = contextValue; // Use original if resolution fails
            }
          } catch {
            resolved[key] = contextValue; // Use original if resolution fails
          }
        } else {
          resolved[key] = contextValue;
        }
      } else if (Array.isArray(value)) {
        // Handle arrays (like projects: ['$project_id'])
        const resolvedArray = [];
        for (const item of value) {
          if (typeof item === 'string' && item.startsWith('$')) {
            const contextKey = item.substring(1);
            const contextValue = execution.context[contextKey];
            if (contextValue !== undefined && contextValue !== null) {
              resolvedArray.push(contextValue);
            }
          } else {
            resolvedArray.push(item);
          }
        }
        resolved[key] = resolvedArray;
      } else if (typeof value === 'string' && value.includes('@')) {
        // Entity reference that needs resolution
        try {
          const entityResult = await this.entityResolver.resolveAnyEntity(
            value,
            'auto',
            { sessionId: execution.sessionId },
          );
          if (entityResult.result.bestMatch) {
            resolved[key] = entityResult.result.bestMatch.gid;
          } else {
            resolved[key] = value; // Use original if resolution fails
          }
        } catch {
          resolved[key] = value; // Use original if resolution fails
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private async performStepOperation(
    operation: string,
    parameters: Record<string, any>,
    requestId?: string,
  ): Promise<any> {
    switch (operation) {
      case 'create_task':
        return await createTask(this.client, parameters as any, requestId);

      case 'create_project':
        return await createProject(this.client, parameters as any, requestId);

      case 'list_users': {
        const workspaceGid = getWorkspaceGid();
        if (!workspaceGid) throw new Error('Workspace not configured');
        return await listWorkspaceUsers(this.client, workspaceGid, requestId);
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private async attemptStepFallback(
    step: WorkflowStep,
    parameters: Record<string, any>,
    error: Error,
    requestId?: string,
  ): Promise<{ success: boolean; data?: any }> {
    switch (step.operation) {
      case 'create_task': {
        const taskFallback = await this.fallbackHandler.fallbackCreateTask(
          parameters,
          error,
          requestId,
        );
        return { success: taskFallback.success, data: taskFallback.data };
      }

      default:
        return { success: false };
    }
  }

  private updateExecutionContext(
    execution: WorkflowExecution,
    step: WorkflowStep,
    result: any,
  ): void {
    // Store step results in context for future steps
    if (result?.gid) {
      const contextKey = `${step.operation}_${step.id}_gid`;
      execution.context[contextKey] = result.gid;
    }

    // Store specific context based on operation type
    if (result) {
      switch (step.operation) {
        case 'create_project':
          if (result.gid) execution.context.project_id = result.gid;
          if (result.name) execution.context.project_name = result.name;
          break;

        case 'create_task':
          if (result.gid) execution.context.last_task_id = result.gid;
          if (result.name) execution.context.last_task_name = result.name;
          break;
      }
    }
  }

  private updateConversationContext(execution: WorkflowExecution): void {
    // Add workflow results to conversation context
    const completedSteps = execution.steps.filter(
      (s) => s.status === 'completed',
    );

    // TODO: Implement context manager integration when available
    // for (const step of completedSteps) {
    //   if (step.result) {
    //     conversationContextManager.addEntityContext(
    //       execution.sessionId,
    //       step.result.gid || step.stepId,
    //       step.result.name || `Step ${step.stepId}`,
    //       this.getEntityTypeFromOperation(step.stepId),
    //       step.result,
    //     );
    //   }
    // }

    // TODO: Record the workflow execution when context manager is available
    // conversationContextManager.recordOperation(
    //   execution.sessionId,
    //   'workflow_execution',
    //   {
    //     workflowId: execution.workflowId,
    //     status: execution.status,
    //     duration: (execution.endTime ?? 0) - execution.startTime,
    //     stepsCompleted: completedSteps.length,
    //     totalSteps: execution.steps.length,
    //   },
    // );

    console.log(
      `[WorkflowOrchestrator] Workflow ${execution.workflowId} completed with ${completedSteps.length}/${execution.steps.length} steps`,
    );
  }

  private getEntityTypeFromOperation(
    stepId: string,
  ): 'task' | 'project' | 'user' {
    if (stepId.includes('task')) return 'task';
    if (stepId.includes('project')) return 'project';
    return 'user';
  }

  private determineExecutionStatus(
    execution: WorkflowExecution,
  ): 'completed' | 'partial' | 'failed' {
    const workflow = this.workflowTemplates.get(execution.workflowId);
    if (!workflow) return 'failed';

    const requiredSteps = workflow.steps.filter((step) => !step.optional);
    const optionalSteps = workflow.steps.filter((step) => step.optional);

    const completedSteps = execution.steps.filter(
      (s) => s.status === 'completed',
    );
    const failedSteps = execution.steps.filter((s) => s.status === 'failed');

    // Check if all required steps are completed
    const requiredStepsCompleted = requiredSteps.every((requiredStep) =>
      completedSteps.some((completed) => completed.stepId === requiredStep.id),
    );

    // Check if any required steps failed
    const requiredStepsFailed = requiredSteps.some((requiredStep) =>
      failedSteps.some((failed) => failed.stepId === requiredStep.id),
    );

    if (requiredStepsFailed) return 'failed';
    if (requiredStepsCompleted) return 'completed';
    return 'partial';
  }

  private calculateWorkflowConfidence(
    workflow: WorkflowDefinition,
    intent: string,
    context: Record<string, any>,
  ): number {
    let confidence = 0;
    const lowerIntent = intent.toLowerCase();
    const workflowName = workflow.name.toLowerCase();

    // Check for keyword matches in workflow name
    const keywords = workflowName.split(' ');
    for (const keyword of keywords) {
      if (lowerIntent.includes(keyword)) {
        confidence += 0.2;
      }
    }

    // Check for operation matches
    for (const step of workflow.steps) {
      const operationWords = step.operation.replace('_', ' ').toLowerCase();
      if (lowerIntent.includes(operationWords)) {
        confidence += 0.15;
      }
    }

    // Boost confidence for specific workflow patterns
    if (workflowName.includes('project') && lowerIntent.includes('project')) {
      confidence += 0.3;
    }

    if (workflowName.includes('sprint') && lowerIntent.includes('sprint')) {
      confidence += 0.3;
    }

    if (
      workflowName.includes('onboarding') &&
      (lowerIntent.includes('onboard') || lowerIntent.includes('team'))
    ) {
      confidence += 0.3;
    }

    // Boost confidence if context contains relevant entities
    if (
      context.project_name &&
      workflow.steps.some((s) => s.operation.includes('project'))
    ) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  private generateWorkflowReasoning(
    workflow: WorkflowDefinition,
    intent: string,
    context: Record<string, any>,
  ): string {
    const reasons: string[] = [];

    if (
      intent.includes('project') &&
      workflow.steps.some((s) => s.operation.includes('project'))
    ) {
      reasons.push('involves project operations');
    }

    if (
      intent.includes('task') &&
      workflow.steps.some((s) => s.operation.includes('task'))
    ) {
      reasons.push('includes task management');
    }

    if (
      intent.includes('team') &&
      workflow.steps.some((s) => s.operation.includes('user'))
    ) {
      reasons.push('involves team coordination');
    }

    return reasons.length > 0
      ? `This workflow matches because it ${reasons.join(' and ')}.`
      : 'This workflow may be relevant to your request.';
  }

  private estimateWorkflowDuration(workflow: WorkflowDefinition): string {
    const stepCount = workflow.steps.length;
    if (stepCount <= 2) return '1-2 minutes';
    if (stepCount <= 5) return '2-5 minutes';
    return '5+ minutes';
  }

  private extractRequiredParameters(workflow: WorkflowDefinition): string[] {
    const required = new Set<string>();

    for (const step of workflow.steps) {
      for (const [key, value] of Object.entries(step.parameters)) {
        if (typeof value === 'string' && value.startsWith('$')) {
          const paramName = value.substring(1);
          if (!step.optional) {
            required.add(paramName);
          }
        }
      }
    }

    return Array.from(required);
  }

  private extractOptionalParameters(workflow: WorkflowDefinition): string[] {
    const optional = new Set<string>();

    for (const step of workflow.steps) {
      if (step.optional) {
        for (const [key, value] of Object.entries(step.parameters)) {
          if (typeof value === 'string' && value.startsWith('$')) {
            const paramName = value.substring(1);
            optional.add(paramName);
          }
        }
      }
    }

    return Array.from(optional);
  }

  private initializeWorkflowTemplates(): void {
    // Project Setup Workflow
    this.workflowTemplates.set('project_setup', {
      id: 'project_setup',
      name: 'Project Setup',
      description:
        'Create a new project with initial tasks and team assignments',
      steps: [
        {
          id: 'create_project',
          operation: 'create_project',
          parameters: {
            name: '$project_name',
            notes: '$project_description',
            workspace: '$workspace_id',
          },
          description: 'Create the main project',
        },
        {
          id: 'create_planning_task',
          operation: 'create_task',
          parameters: {
            name: 'Project Planning',
            notes: 'Initial project planning and setup',
            workspace: '$workspace_id',
            projects: ['$project_id'],
          },
          dependencies: ['create_project'],
          description: 'Create initial planning task',
        },
        {
          id: 'create_kickoff_task',
          operation: 'create_task',
          parameters: {
            name: 'Project Kickoff Meeting',
            notes: 'Schedule and conduct project kickoff',
            workspace: '$workspace_id',
            projects: ['$project_id'],
          },
          dependencies: ['create_project'],
          description: 'Create kickoff meeting task',
        },
      ],
    });

    // Sprint Setup Workflow
    this.workflowTemplates.set('sprint_setup', {
      id: 'sprint_setup',
      name: 'Sprint Setup',
      description: 'Set up a new sprint with tasks and assignments',
      steps: [
        {
          id: 'create_sprint_project',
          operation: 'create_project',
          parameters: {
            name: '$sprint_name',
            notes: 'Sprint project for organized task management',
            workspace: '$workspace_id',
          },
          description: 'Create sprint project',
        },
        {
          id: 'create_sprint_planning',
          operation: 'create_task',
          parameters: {
            name: 'Sprint Planning',
            notes: 'Plan and estimate sprint tasks',
            workspace: '$workspace_id',
            projects: ['$project_id'],
            assignee: '$scrum_master',
          },
          dependencies: ['create_sprint_project'],
          description: 'Create sprint planning task',
        },
        {
          id: 'create_daily_standup',
          operation: 'create_task',
          parameters: {
            name: 'Daily Standup Template',
            notes: 'Template for daily standup meetings',
            workspace: '$workspace_id',
            projects: ['$project_id'],
          },
          dependencies: ['create_sprint_project'],
          optional: true,
          description: 'Create standup template',
        },
      ],
    });

    // Team Onboarding Workflow
    this.workflowTemplates.set('team_onboarding', {
      id: 'team_onboarding',
      name: 'Team Member Onboarding',
      description: 'Set up onboarding tasks for new team members',
      steps: [
        {
          id: 'create_onboarding_project',
          operation: 'create_project',
          parameters: {
            name: 'Team Onboarding - $member_name',
            notes: 'Onboarding checklist and tasks for new team member',
            workspace: '$workspace_id',
          },
          description: 'Create onboarding project',
        },
        {
          id: 'create_welcome_task',
          operation: 'create_task',
          parameters: {
            name: 'Welcome & Introduction',
            notes: 'Welcome new team member and provide introduction',
            workspace: '$workspace_id',
            projects: ['$project_id'],
            assignee: '$buddy_assignee',
          },
          dependencies: ['create_onboarding_project'],
          description: 'Create welcome task',
        },
        {
          id: 'create_setup_task',
          operation: 'create_task',
          parameters: {
            name: 'Account & Tool Setup',
            notes: 'Set up accounts, tools, and access permissions',
            workspace: '$workspace_id',
            projects: ['$project_id'],
            assignee: '$it_assignee',
          },
          dependencies: ['create_onboarding_project'],
          description: 'Create setup task',
        },
      ],
    });
  }
}
