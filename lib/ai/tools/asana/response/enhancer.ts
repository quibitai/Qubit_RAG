/**
 * Response Enhancer
 *
 * Provides rich formatting, actionable suggestions, and intelligent follow-up
 * recommendations for Asana operations and workflow results.
 */

import type { WorkflowExecution } from '../workflows/orchestrator';

export interface EnhancedResponse {
  /** Primary response message */
  message: string;
  /** Rich formatted content */
  formatted: {
    /** Markdown-formatted response */
    markdown: string;
    /** Plain text summary */
    summary: string;
    /** Key highlights */
    highlights: string[];
  };
  /** Actionable suggestions */
  suggestions: ActionableSuggestion[];
  /** Follow-up recommendations */
  followUps: FollowUpRecommendation[];
  /** Context for future operations */
  context: ResponseContext;
}

export interface ActionableSuggestion {
  /** Suggestion type */
  type:
    | 'workflow'
    | 'operation'
    | 'optimization'
    | 'collaboration'
    | 'project_management';
  /** Suggestion title */
  title: string;
  /** Detailed description */
  description: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Suggested action */
  action?: {
    /** Operation to perform */
    operation: string;
    /** Parameters for the operation */
    parameters: Record<string, any>;
  };
}

export interface FollowUpRecommendation {
  /** Recommendation category */
  category:
    | 'next_steps'
    | 'related_tasks'
    | 'team_coordination'
    | 'project_management';
  /** Recommendation text */
  text: string;
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
  /** Time sensitivity */
  timing: 'immediate' | 'soon' | 'later';
}

export interface ResponseContext {
  /** Operation that was performed */
  operation: string;
  /** Entities created or modified */
  entities: {
    type: 'task' | 'project' | 'user';
    gid: string;
    name: string;
    url?: string;
  }[];
  /** Success indicators */
  success: boolean;
  /** Performance metrics */
  metrics?: {
    duration: number;
    stepsCompleted: number;
    totalSteps: number;
  };
}

export class ResponseEnhancer {
  /**
   * Enhance a simple operation response
   */
  enhanceOperationResponse(
    operation: string,
    result: any,
    context: Record<string, any> = {},
  ): EnhancedResponse {
    const baseMessage = this.generateBaseMessage(operation, result);
    const formatted = this.formatOperationResult(operation, result);
    const suggestions = this.generateOperationSuggestions(
      operation,
      result,
      context,
    );
    const followUps = this.generateOperationFollowUps(operation, result);
    const responseContext = this.buildResponseContext(operation, result);

    return {
      message: baseMessage,
      formatted,
      suggestions,
      followUps,
      context: responseContext,
    };
  }

  /**
   * Enhance a workflow execution response
   */
  enhanceWorkflowResponse(
    execution: WorkflowExecution,
    context: Record<string, any> = {},
  ): EnhancedResponse {
    const baseMessage = this.generateWorkflowMessage(execution);
    const formatted = this.formatWorkflowResult(execution);
    const suggestions = this.generateWorkflowSuggestions(execution, context);
    const followUps = this.generateWorkflowFollowUps(execution);
    const responseContext = this.buildWorkflowContext(execution);

    return {
      message: baseMessage,
      formatted,
      suggestions,
      followUps,
      context: responseContext,
    };
  }

  /**
   * Enhance an error response with recovery suggestions
   */
  enhanceErrorResponse(
    operation: string,
    error: Error,
    context: Record<string, any> = {},
  ): EnhancedResponse {
    const baseMessage = this.generateErrorMessage(operation, error);
    const formatted = this.formatErrorResult(operation, error);
    const suggestions = this.generateErrorSuggestions(
      operation,
      error,
      context,
    );
    const followUps = this.generateErrorFollowUps(operation, error);
    const responseContext = this.buildErrorContext(operation, error);

    return {
      message: baseMessage,
      formatted,
      suggestions,
      followUps,
      context: responseContext,
    };
  }

  // Private methods for message generation

  private generateBaseMessage(operation: string, result: any): string {
    switch (operation) {
      case 'create_task':
        return `✅ Successfully created task "${result.name}"`;
      case 'create_project':
        return `🎯 Successfully created project "${result.name}"`;
      case 'update_task':
        return `📝 Successfully updated task "${result.name}"`;
      case 'list_tasks':
        return `📋 Found ${result.length} task(s)`;
      case 'list_projects':
        return `📁 Found ${result.length} project(s)`;
      default:
        return `✅ Operation "${operation}" completed successfully`;
    }
  }

  private generateWorkflowMessage(execution: WorkflowExecution): string {
    const completedSteps = execution.steps.filter(
      (s) => s.status === 'completed',
    ).length;
    const totalSteps = execution.steps.length;

    if (execution.status === 'completed') {
      return `🚀 Workflow "${execution.workflowId}" completed successfully (${completedSteps}/${totalSteps} steps)`;
    } else if (execution.status === 'partial') {
      return `⚠️ Workflow "${execution.workflowId}" partially completed (${completedSteps}/${totalSteps} steps)`;
    } else {
      return `❌ Workflow "${execution.workflowId}" failed (${completedSteps}/${totalSteps} steps completed)`;
    }
  }

  private generateErrorMessage(operation: string, error: Error): string {
    return `❌ Failed to execute "${operation}": ${error.message}`;
  }

  // Private methods for formatting

  private formatOperationResult(
    operation: string,
    result: any,
  ): EnhancedResponse['formatted'] {
    const highlights: string[] = [];
    let markdown = '';
    let summary = '';

    switch (operation) {
      case 'create_task':
        highlights.push(`Task ID: ${result.gid}`, `Name: ${result.name}`);
        if (result.permalink_url)
          highlights.push(`URL: ${result.permalink_url}`);

        markdown = `### ✅ Task Created\n\n**${result.name}**\n\n`;
        if (result.notes) markdown += `*${result.notes}*\n\n`;
        if (result.permalink_url)
          markdown += `[View in Asana](${result.permalink_url})\n\n`;
        markdown += `**Task ID:** \`${result.gid}\``;

        summary = `Created task "${result.name}" (ID: ${result.gid})`;
        break;

      case 'create_project':
        highlights.push(`Project ID: ${result.gid}`, `Name: ${result.name}`);
        if (result.permalink_url)
          highlights.push(`URL: ${result.permalink_url}`);

        markdown = `### 🎯 Project Created\n\n**${result.name}**\n\n`;
        if (result.notes) markdown += `*${result.notes}*\n\n`;
        if (result.permalink_url)
          markdown += `[View in Asana](${result.permalink_url})\n\n`;
        markdown += `**Project ID:** \`${result.gid}\``;

        summary = `Created project "${result.name}" (ID: ${result.gid})`;
        break;

      case 'list_tasks':
        highlights.push(`Found ${result.length} tasks`);

        markdown = `### 📋 Tasks Found (${result.length})\n\n`;
        if (result.length > 0) {
          markdown += result
            .slice(0, 5)
            .map((task: any) => `- **${task.name}** (${task.gid})`)
            .join('\n');
          if (result.length > 5) {
            markdown += `\n- *...and ${result.length - 5} more*`;
          }
        }

        summary = `Found ${result.length} tasks`;
        break;

      default:
        highlights.push('Operation completed');
        markdown = `### ✅ Operation Completed\n\n${operation}`;
        summary = `Completed ${operation}`;
    }

    return { markdown, summary, highlights };
  }

  private formatWorkflowResult(
    execution: WorkflowExecution,
  ): EnhancedResponse['formatted'] {
    const completedSteps = execution.steps.filter(
      (s) => s.status === 'completed',
    );
    const failedSteps = execution.steps.filter((s) => s.status === 'failed');

    const highlights = [
      `Status: ${execution.status}`,
      `Steps: ${completedSteps.length}/${execution.steps.length}`,
    ];

    if (execution.endTime) {
      const duration = execution.endTime - execution.startTime;
      highlights.push(`Duration: ${Math.round(duration / 1000)}s`);
    }

    let markdown = `### 🚀 Workflow: ${execution.workflowId}\n\n`;
    markdown += `**Status:** ${execution.status}\n`;
    markdown += `**Progress:** ${completedSteps.length}/${execution.steps.length} steps\n\n`;

    if (completedSteps.length > 0) {
      markdown += `#### ✅ Completed Steps\n`;
      completedSteps.forEach((step) => {
        const stepDef = execution.steps.find((s) => s.stepId === step.stepId);
        markdown += `- ${step.stepId}`;
        if (step.result?.name) markdown += `: ${step.result.name}`;
        markdown += '\n';
      });
      markdown += '\n';
    }

    if (failedSteps.length > 0) {
      markdown += `#### ❌ Failed Steps\n`;
      failedSteps.forEach((step) => {
        markdown += `- ${step.stepId}: ${step.error?.message || 'Unknown error'}\n`;
      });
    }

    const summary = `Workflow ${execution.workflowId} ${execution.status} (${completedSteps.length}/${execution.steps.length} steps)`;

    return { markdown, summary, highlights };
  }

  private formatErrorResult(
    operation: string,
    error: Error,
  ): EnhancedResponse['formatted'] {
    const highlights = [`Error: ${error.message}`, `Operation: ${operation}`];

    const markdown = `### ❌ Operation Failed\n\n**Operation:** ${operation}\n**Error:** ${error.message}`;
    const summary = `Failed to execute ${operation}: ${error.message}`;

    return { markdown, summary, highlights };
  }

  // Private methods for suggestions

  private generateOperationSuggestions(
    operation: string,
    result: any,
    context: Record<string, any>,
  ): ActionableSuggestion[] {
    const suggestions: ActionableSuggestion[] = [];

    switch (operation) {
      case 'create_task':
        suggestions.push({
          type: 'operation',
          title: 'Add task details',
          description: 'Consider adding due date, assignee, or subtasks',
          confidence: 0.7,
          action: {
            operation: 'update_task',
            parameters: { task_gid: result.gid },
          },
        });

        if (!result.assignee) {
          suggestions.push({
            type: 'collaboration',
            title: 'Assign task',
            description: 'Assign this task to a team member',
            confidence: 0.8,
          });
        }
        break;

      case 'create_project':
        suggestions.push({
          type: 'workflow',
          title: 'Set up project structure',
          description: 'Create initial tasks and organize the project',
          confidence: 0.9,
          action: {
            operation: 'workflow_execute',
            parameters: {
              workflow_id: 'project_setup',
              project_id: result.gid,
            },
          },
        });
        break;

      case 'list_tasks':
        if (Array.isArray(result) && result.length > 10) {
          suggestions.push({
            type: 'optimization',
            title: 'Filter tasks',
            description: 'Use filters to narrow down the task list',
            confidence: 0.6,
          });
        }
        break;
    }

    return suggestions;
  }

  private generateWorkflowSuggestions(
    execution: WorkflowExecution,
    context: Record<string, any>,
  ): ActionableSuggestion[] {
    const suggestions: ActionableSuggestion[] = [];

    if (execution.status === 'completed') {
      switch (execution.workflowId) {
        case 'project_setup':
          suggestions.push({
            type: 'workflow',
            title: 'Set up team onboarding',
            description: 'Create onboarding workflows for team members',
            confidence: 0.7,
            action: {
              operation: 'workflow_suggest',
              parameters: { intent: 'team onboarding' },
            },
          });
          break;

        case 'sprint_setup':
          suggestions.push({
            type: 'project_management',
            title: 'Plan sprint tasks',
            description: 'Add specific tasks and estimates to the sprint',
            confidence: 0.8,
          });
          break;
      }
    } else if (execution.status === 'partial') {
      suggestions.push({
        type: 'operation',
        title: 'Retry failed steps',
        description: 'Attempt to complete the remaining workflow steps',
        confidence: 0.6,
        action: {
          operation: 'workflow_retry',
          parameters: {
            workflow_id: execution.workflowId,
            session_id: execution.sessionId,
          },
        },
      });
    }

    return suggestions;
  }

  private generateErrorSuggestions(
    operation: string,
    error: Error,
    context: Record<string, any>,
  ): ActionableSuggestion[] {
    const suggestions: ActionableSuggestion[] = [];

    if (error.message.includes('not found')) {
      suggestions.push({
        type: 'operation',
        title: 'Search for entity',
        description: 'Try searching for the entity with a different name or ID',
        confidence: 0.8,
      });
    }

    if (
      error.message.includes('permission') ||
      error.message.includes('access')
    ) {
      suggestions.push({
        type: 'collaboration',
        title: 'Check permissions',
        description:
          'Verify you have the necessary permissions for this operation',
        confidence: 0.9,
      });
    }

    if (error.message.toLowerCase().includes('rate limit')) {
      suggestions.push({
        type: 'optimization',
        title: 'Retry later',
        description: 'Wait a moment and try the operation again',
        confidence: 0.7,
      });
    }

    return suggestions;
  }

  // Private methods for follow-ups

  private generateOperationFollowUps(
    operation: string,
    result: any,
  ): FollowUpRecommendation[] {
    const followUps: FollowUpRecommendation[] = [];

    switch (operation) {
      case 'create_task':
        followUps.push({
          category: 'next_steps',
          text: 'Set a due date and assign the task to a team member',
          priority: 'medium',
          timing: 'soon',
        });
        break;

      case 'create_project':
        followUps.push({
          category: 'project_management',
          text: 'Create initial tasks and set up project structure',
          priority: 'high',
          timing: 'immediate',
        });
        break;
    }

    return followUps;
  }

  private generateWorkflowFollowUps(
    execution: WorkflowExecution,
  ): FollowUpRecommendation[] {
    const followUps: FollowUpRecommendation[] = [];

    if (execution.status === 'completed') {
      followUps.push({
        category: 'team_coordination',
        text: 'Notify team members about the new workflow completion',
        priority: 'medium',
        timing: 'soon',
      });
    }

    return followUps;
  }

  private generateErrorFollowUps(
    operation: string,
    error: Error,
  ): FollowUpRecommendation[] {
    return [
      {
        category: 'next_steps',
        text: 'Review the error details and try alternative approaches',
        priority: 'high',
        timing: 'immediate',
      },
    ];
  }

  // Private methods for context building

  private buildResponseContext(
    operation: string,
    result: any,
  ): ResponseContext {
    const entities: ResponseContext['entities'] = [];

    if (result?.gid && result?.name) {
      let type: 'task' | 'project' | 'user' = 'task';
      if (operation.includes('project')) type = 'project';
      if (operation.includes('user')) type = 'user';

      entities.push({
        type,
        gid: result.gid,
        name: result.name,
        url: result.permalink_url,
      });
    }

    return {
      operation,
      entities,
      success: true,
    };
  }

  private buildWorkflowContext(execution: WorkflowExecution): ResponseContext {
    const entities: ResponseContext['entities'] = [];

    // Extract entities from completed steps
    execution.steps
      .filter((step) => step.status === 'completed' && step.result?.gid)
      .forEach((step) => {
        let type: 'task' | 'project' | 'user' = 'task';
        if (step.stepId.includes('project')) type = 'project';
        if (step.stepId.includes('user')) type = 'user';

        entities.push({
          type,
          gid: step.result.gid,
          name: step.result.name || step.stepId,
          url: step.result.permalink_url,
        });
      });

    const metrics = execution.endTime
      ? {
          duration: execution.endTime - execution.startTime,
          stepsCompleted: execution.steps.filter(
            (s) => s.status === 'completed',
          ).length,
          totalSteps: execution.steps.length,
        }
      : undefined;

    return {
      operation: `workflow:${execution.workflowId}`,
      entities,
      success: execution.status === 'completed',
      metrics,
    };
  }

  private buildErrorContext(operation: string, error: Error): ResponseContext {
    return {
      operation,
      entities: [],
      success: false,
    };
  }
}

// Export singleton instance
export const responseEnhancer = new ResponseEnhancer();
