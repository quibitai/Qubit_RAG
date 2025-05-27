/**
 * Context Resolver for Phase 2
 * Intelligently resolves contextual references in user messages
 */

import {
  conversationContextManager,
  type ContextReference,
  type ContextResolutionResult,
  type ConversationSession,
} from './conversationContext';

export interface ResolvedParameters {
  original: Record<string, any>;
  resolved: Record<string, any>;
  resolutions: Array<{
    parameter: string;
    originalValue: any;
    resolvedValue: any;
    confidence: number;
    reasoning: string;
  }>;
  overallConfidence: number;
}

/**
 * Enhanced Context Resolver
 * Resolves contextual references in function parameters
 */
export class ContextResolver {
  /**
   * Resolve contextual references in extracted parameters
   */
  async resolveParameters(
    sessionId: string,
    functionName: string,
    parameters: Record<string, any>,
    userMessage: string,
  ): Promise<ResolvedParameters> {
    const session = conversationContextManager.getSession(sessionId);
    const resolved = { ...parameters };
    const resolutions: ResolvedParameters['resolutions'] = [];

    // Detect and resolve contextual references
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        const contextualReference = this.detectContextualReference(
          value,
          userMessage,
        );

        if (contextualReference) {
          const resolution =
            conversationContextManager.resolveContextualReference(
              sessionId,
              contextualReference,
              userMessage,
            );

          if (resolution.resolved && resolution.resolvedValue) {
            // Apply the resolution based on the parameter type
            const resolvedValue = this.applyResolution(
              key,
              resolution,
              functionName,
            );

            if (resolvedValue !== null) {
              resolved[key] = resolvedValue;
              resolutions.push({
                parameter: key,
                originalValue: value,
                resolvedValue,
                confidence: resolution.confidence,
                reasoning: resolution.reasoning,
              });
            }
          }
        }
      }
    }

    // Handle implicit context (when parameters are missing but context exists)
    const implicitResolutions = await this.resolveImplicitContext(
      session,
      functionName,
      resolved,
      userMessage,
    );

    resolutions.push(...implicitResolutions);

    // Calculate overall confidence
    const overallConfidence =
      resolutions.length > 0
        ? resolutions.reduce((sum, r) => sum + r.confidence, 0) /
          resolutions.length
        : 1.0;

    return {
      original: parameters,
      resolved,
      resolutions,
      overallConfidence,
    };
  }

  /**
   * Detect contextual references in parameter values
   */
  private detectContextualReference(
    value: string,
    context: string,
  ): ContextReference | null {
    const lowerValue = value.toLowerCase();
    const lowerContext = context.toLowerCase();

    // Task references
    if (lowerValue.includes('that task') || lowerValue.includes('this task')) {
      return {
        type: 'task',
        reference: value,
        context: context,
      };
    }

    if (
      lowerValue.includes('just created') ||
      lowerValue.includes('last created')
    ) {
      return {
        type: 'task',
        reference: value,
        context: context,
      };
    }

    // Project references
    if (
      lowerValue.includes('that project') ||
      lowerValue.includes('this project')
    ) {
      return {
        type: 'project',
        reference: value,
        context: context,
      };
    }

    if (
      lowerValue.includes('same project') ||
      lowerValue.includes('current project')
    ) {
      return {
        type: 'project',
        reference: value,
        context: context,
      };
    }

    // User references
    if (lowerValue.includes('me') || lowerValue.includes('myself')) {
      return {
        type: 'user',
        reference: value,
        context: context,
      };
    }

    // Check for implicit references in the broader context
    if (
      lowerContext.includes('that') ||
      lowerContext.includes('this') ||
      lowerContext.includes('it')
    ) {
      // Try to determine what "that" refers to based on context
      if (lowerContext.includes('task')) {
        return {
          type: 'task',
          reference: 'that task',
          context: context,
        };
      }

      if (lowerContext.includes('project')) {
        return {
          type: 'project',
          reference: 'that project',
          context: context,
        };
      }
    }

    return null;
  }

  /**
   * Apply resolution to parameter based on its type and function
   */
  private applyResolution(
    parameterKey: string,
    resolution: ContextResolutionResult,
    functionName: string,
  ): any {
    const resolvedValue = resolution.resolvedValue;

    switch (parameterKey) {
      case 'task_gid':
      case 'parent_task_gid':
        return resolvedValue.gid;

      case 'task_name':
        return resolvedValue.name;

      case 'project_gid':
        return resolvedValue.gid;

      case 'project_name':
        return resolvedValue.name;

      case 'assignee':
      case 'assignee_gid':
        return resolvedValue.gid || resolvedValue.name;

      case 'user_gid':
        return resolvedValue.gid;

      case 'user_name':
        return resolvedValue.name;

      default:
        // For unknown parameters, try to use the most appropriate field
        if (resolvedValue.gid) {
          return resolvedValue.gid;
        }
        if (resolvedValue.name) {
          return resolvedValue.name;
        }
        return resolvedValue;
    }
  }

  /**
   * Resolve implicit context when parameters are missing
   */
  private async resolveImplicitContext(
    session: ConversationSession,
    functionName: string,
    parameters: Record<string, any>,
    userMessage: string,
  ): Promise<
    Array<{
      parameter: string;
      originalValue: any;
      resolvedValue: any;
      confidence: number;
      reasoning: string;
    }>
  > {
    const resolutions: Array<{
      parameter: string;
      originalValue: any;
      resolvedValue: any;
      confidence: number;
      reasoning: string;
    }> = [];

    // If no project specified but we have recent project context
    if (!parameters.project_gid && !parameters.project_name) {
      const recentProject = Array.from(session.projects.values()).sort(
        (a, b) => b.lastMentioned - a.lastMentioned,
      )[0];

      if (recentProject && this.shouldInferProject(functionName, userMessage)) {
        resolutions.push({
          parameter: 'project_gid',
          originalValue: undefined,
          resolvedValue: recentProject.gid,
          confidence: 0.7,
          reasoning: `Inferred project from recent context: "${recentProject.name}"`,
        });

        parameters.project_gid = recentProject.gid;
        parameters.project_name = recentProject.name;
      }
    }

    // If no assignee specified but message implies "me"
    if (!parameters.assignee && !parameters.assignee_gid) {
      if (this.impliesCurrentUser(userMessage)) {
        const currentUser = Array.from(session.users.values()).find(
          (u) => u.relationship === 'self',
        );

        if (currentUser) {
          resolutions.push({
            parameter: 'assignee',
            originalValue: undefined,
            resolvedValue: 'me',
            confidence: 0.8,
            reasoning: 'Inferred current user as assignee from message context',
          });

          parameters.assignee = 'me';
        }
      }
    }

    // If creating a subtask but no parent specified
    if (functionName === 'add_subtask' && !parameters.parent_task_gid) {
      const recentTask = Array.from(session.tasks.values()).sort(
        (a, b) => b.lastMentioned - a.lastMentioned,
      )[0];

      if (recentTask) {
        resolutions.push({
          parameter: 'parent_task_gid',
          originalValue: undefined,
          resolvedValue: recentTask.gid,
          confidence: 0.9,
          reasoning: `Inferred parent task from recent context: "${recentTask.name}"`,
        });

        parameters.parent_task_gid = recentTask.gid;
      }
    }

    return resolutions;
  }

  /**
   * Determine if we should infer project context for this function
   */
  private shouldInferProject(
    functionName: string,
    userMessage: string,
  ): boolean {
    const projectRelevantFunctions = [
      'create_task',
      'list_tasks',
      'list_project_sections',
      'create_project_section',
    ];

    if (!projectRelevantFunctions.includes(functionName)) {
      return false;
    }

    // Don't infer if user explicitly mentioned a different project
    const lowerMessage = userMessage.toLowerCase();
    if (
      lowerMessage.includes('in project') ||
      lowerMessage.includes('for project')
    ) {
      return false;
    }

    return true;
  }

  /**
   * Determine if the message implies the current user
   */
  private impliesCurrentUser(userMessage: string): boolean {
    const lowerMessage = userMessage.toLowerCase();

    const currentUserIndicators = [
      'my tasks',
      'for me',
      'assign to me',
      'i need',
      'i want',
      'help me',
      'show me',
    ];

    return currentUserIndicators.some((indicator) =>
      lowerMessage.includes(indicator),
    );
  }

  /**
   * Get context summary for debugging
   */
  getContextSummary(sessionId: string): {
    session: {
      messageCount: number;
      taskCount: number;
      projectCount: number;
      userCount: number;
    };
    recentTasks: Array<{ gid: string; name: string; operation: string }>;
    recentProjects: Array<{ gid: string; name: string }>;
    recentUsers: Array<{ gid: string; name: string; relationship: string }>;
  } {
    const session = conversationContextManager.getSession(sessionId);

    const recentTasks = Array.from(session.tasks.values())
      .sort((a, b) => b.lastMentioned - a.lastMentioned)
      .slice(0, 3)
      .map((t) => ({ gid: t.gid, name: t.name, operation: t.operation }));

    const recentProjects = Array.from(session.projects.values())
      .sort((a, b) => b.lastMentioned - a.lastMentioned)
      .slice(0, 3)
      .map((p) => ({ gid: p.gid, name: p.name }));

    const recentUsers = Array.from(session.users.values())
      .sort((a, b) => b.lastMentioned - a.lastMentioned)
      .slice(0, 3)
      .map((u) => ({ gid: u.gid, name: u.name, relationship: u.relationship }));

    return {
      session: {
        messageCount: session.messageCount,
        taskCount: session.tasks.size,
        projectCount: session.projects.size,
        userCount: session.users.size,
      },
      recentTasks,
      recentProjects,
      recentUsers,
    };
  }
}

// Export singleton instance
export const contextResolver = new ContextResolver();
