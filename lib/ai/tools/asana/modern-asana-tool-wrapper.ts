/**
 * LangChain Tool Wrapper for Modern Asana Tool
 *
 * This wrapper makes the ModernAsanaTool compatible with LangChain's Tool interface
 * while preserving all advanced features like workflow orchestration, semantic resolution,
 * and intelligent error recovery.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  ModernAsanaTool,
  type ToolExecutionContext,
} from './modern-asana-tool';
import { AsanaApiClient } from './api-client/client';
import { ASANA_PAT } from './config';

// Generate a simple request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create the modern Asana tool wrapper
 */
export function createModernAsanaToolWrapper(
  apiKey?: string,
): DynamicStructuredTool {
  const client = new AsanaApiClient(apiKey || ASANA_PAT);
  const modernTool = new ModernAsanaTool(client, {
    enableWorkflows: true,
    enableSemanticResolution: true,
    enableErrorRecovery: true,
    enableResponseEnhancement: true,
  });

  return new DynamicStructuredTool({
    name: 'asana',
    description:
      'Advanced Asana tool with AI-powered capabilities including workflow orchestration, ' +
      'semantic entity resolution, and intelligent error recovery. ' +
      'Use this for ANY Asana-related tasks such as creating, listing, updating, or completing ' +
      'Asana tasks and projects. Supports natural language input and provides enhanced responses ' +
      'with suggestions and context. ' +
      'Input should be a natural language description like: ' +
      '"Create a new task called Review design mockups in the Marketing project" ' +
      'or "List all my incomplete tasks in the Development project"',

    schema: z.object({
      action_description: z
        .string()
        .describe(
          'Natural language description of the Asana operation to perform',
        ),
    }),

    func: async ({ action_description }): Promise<string> => {
      // Create execution context
      const context: ToolExecutionContext = {
        sessionId: generateRequestId(),
        requestId: generateRequestId(),
        userIntent: action_description,
        conversationContext: {},
      };

      try {
        // Parse the intent and route to appropriate method
        const intent = parseIntent(action_description);

        let result: any;
        switch (intent.operation) {
          case 'create_task':
            result = await modernTool.createTask(intent.parameters, context);
            break;
          case 'list_tasks':
            result = await modernTool.listTasks(intent.parameters, context);
            break;
          case 'update_task':
            result = await modernTool.updateTask(
              intent.parameters.taskGid,
              intent.parameters.updates,
              context,
            );
            break;
          case 'get_task_details':
            result = await modernTool.getTaskDetails(
              intent.parameters.taskGid,
              context,
            );
            break;
          case 'create_project':
            result = await modernTool.createProject(intent.parameters, context);
            break;
          case 'list_projects':
            result = await modernTool.listProjects(intent.parameters, context);
            break;
          case 'get_project_details':
            result = await modernTool.getProjectDetails(
              intent.parameters.projectGid,
              context,
            );
            break;
          case 'list_users':
            result = await modernTool.listUsers(context);
            break;
          case 'resolve_entity':
            result = await modernTool.resolveEntity(
              intent.parameters.query,
              intent.parameters.entityType,
              context,
            );
            break;
          case 'suggest_workflows':
            result = await modernTool.suggestWorkflows(
              action_description,
              context,
            );
            break;
          case 'execute_workflow':
            result = await modernTool.executeWorkflow(
              intent.parameters.workflowId,
              intent.parameters.parameters,
              context,
            );
            break;
          default:
            // Try workflow suggestion for unrecognized intents
            result = await modernTool.suggestWorkflows(
              action_description,
              context,
            );
        }

        // Format response
        if (result.enhanced) {
          return formatEnhancedResponse(result);
        } else {
          return formatBasicResponse(result);
        }
      } catch (error) {
        const requestId = context.requestId;
        console.error(
          `[ModernAsanaToolWrapper] Error executing operation:`,
          error,
        );
        return `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}. (Request ID: ${requestId})`;
      }
    },
  });
}

/**
 * Parse natural language intent into operation and parameters
 */
function parseIntent(description: string): {
  operation: string;
  parameters: any;
} {
  const lower = description.toLowerCase();

  // Task operations
  if (
    lower.includes('create') &&
    (lower.includes('task') || lower.includes('todo'))
  ) {
    return {
      operation: 'create_task',
      parameters: extractTaskParameters(description),
    };
  }

  if (lower.includes('list') && lower.includes('task')) {
    return {
      operation: 'list_tasks',
      parameters: extractListParameters(description),
    };
  }

  if (
    (lower.includes('update') ||
      lower.includes('complete') ||
      lower.includes('finish')) &&
    lower.includes('task')
  ) {
    return {
      operation: 'update_task',
      parameters: extractUpdateParameters(description),
    };
  }

  if (
    (lower.includes('show') ||
      lower.includes('get') ||
      lower.includes('details')) &&
    lower.includes('task')
  ) {
    return {
      operation: 'get_task_details',
      parameters: extractTaskDetailsParameters(description),
    };
  }

  // Project operations
  if (lower.includes('create') && lower.includes('project')) {
    return {
      operation: 'create_project',
      parameters: extractProjectParameters(description),
    };
  }

  if (lower.includes('list') && lower.includes('project')) {
    return {
      operation: 'list_projects',
      parameters: extractListParameters(description),
    };
  }

  // Enhanced project details detection - handle natural language requests
  if (
    (lower.includes('show') ||
      lower.includes('get') ||
      lower.includes('details') ||
      lower.includes('overview') ||
      lower.includes('about') ||
      lower.includes('info')) &&
    (lower.includes('project') ||
      // Check if it's asking about a specific project by name
      hasProjectNameReference(description))
  ) {
    return {
      operation: 'get_project_details',
      parameters: extractProjectDetailsParameters(description),
    };
  }

  // User operations
  if (
    lower.includes('list') &&
    (lower.includes('user') ||
      lower.includes('member') ||
      lower.includes('people'))
  ) {
    return {
      operation: 'list_users',
      parameters: {},
    };
  }

  // Entity resolution
  if (
    lower.includes('find') ||
    lower.includes('search') ||
    lower.includes('lookup')
  ) {
    return {
      operation: 'resolve_entity',
      parameters: extractSearchParameters(description),
    };
  }

  // Workflow operations
  if (
    lower.includes('workflow') ||
    lower.includes('automate') ||
    lower.includes('process')
  ) {
    if (lower.includes('execute') || lower.includes('run')) {
      return {
        operation: 'execute_workflow',
        parameters: extractWorkflowParameters(description),
      };
    } else {
      return {
        operation: 'suggest_workflows',
        parameters: { userIntent: description },
      };
    }
  }

  // Default to workflow suggestion for complex requests
  return {
    operation: 'suggest_workflows',
    parameters: { userIntent: description },
  };
}

/**
 * Check if description references a project name from the known projects
 */
function hasProjectNameReference(description: string): boolean {
  const knownProjects = [
    'glf design',
    'glf social media',
    'echo tango',
    'lee michaels',
    'lwcc lance trotti',
    'lcba catch cook',
    'louisiana blue',
    'iconic',
    'twitch',
    'cpra',
  ];

  const lower = description.toLowerCase();
  return knownProjects.some((project) => lower.includes(project));
}

/**
 * Extract task creation parameters from description
 */
function extractTaskParameters(description: string): any {
  const nameMatch =
    description.match(/(?:task|todo)(?:\s+called)?\s+["']([^"']+)["']/i) ||
    description.match(/create\s+["']([^"']+)["']/i);

  const projectMatch = description.match(
    /(?:in|for|to)\s+(?:the\s+)?["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?\s+project/i,
  );

  return {
    name: nameMatch ? nameMatch[1] : 'New Task',
    projects: projectMatch ? [projectMatch[1]] : undefined,
    notes: extractNotes(description),
  };
}

/**
 * Extract project creation parameters from description
 */
function extractProjectParameters(description: string): any {
  const nameMatch =
    description.match(/(?:project)(?:\s+called)?\s+["']([^"']+)["']/i) ||
    description.match(/create\s+["']([^"']+)["']/i);

  return {
    name: nameMatch ? nameMatch[1] : 'New Project',
    notes: extractNotes(description),
  };
}

/**
 * Extract list parameters from description
 */
function extractListParameters(description: string): any {
  const projectMatch = description.match(
    /(?:in|from|for)\s+(?:the\s+)?["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?\s+project/i,
  );

  return {
    project: projectMatch ? projectMatch[1] : undefined,
  };
}

/**
 * Extract update parameters from description
 */
function extractUpdateParameters(description: string): any {
  const taskMatch = description.match(/(?:task|todo)\s+["']([^"']+)["']/i);
  const completed =
    description.toLowerCase().includes('complete') ||
    description.toLowerCase().includes('finish') ||
    description.toLowerCase().includes('done');

  return {
    taskGid: taskMatch ? taskMatch[1] : '',
    updates: {
      completed: completed || undefined,
      notes: extractNotes(description),
    },
  };
}

/**
 * Extract task details parameters from description
 */
function extractTaskDetailsParameters(description: string): any {
  const taskMatch = description.match(/(?:task|todo)\s+["']([^"']+)["']/i);

  return {
    taskGid: taskMatch ? taskMatch[1] : '',
  };
}

/**
 * Extract project details parameters from description
 */
function extractProjectDetailsParameters(description: string): any {
  const lower = description.toLowerCase();

  // Try multiple patterns to extract project name
  let projectName = '';

  // Pattern 1: "project 'name'" or "project name"
  const projectMatch1 = description.match(
    /(?:project)\s+["']?([^"']+?)["']?(?:\s|$)/i,
  );
  if (projectMatch1) {
    projectName = projectMatch1[1].trim();
  }

  // Pattern 2: "overview of name" or "about name"
  const projectMatch2 = description.match(
    /(?:overview|about|info|details)\s+(?:of\s+)?["']?([^"']+?)["']?(?:\s|$)/i,
  );
  if (!projectName && projectMatch2) {
    projectName = projectMatch2[1].trim();
  }

  // Pattern 3: Check against known project names
  if (!projectName) {
    const knownProjects = [
      'GLF: Design',
      'GLF: Social Media',
      'Echo Tango',
      'Lee Michaels',
      'LWCC: Lance Trotti Agent Video',
      'LCBA: Catch & Cook Season 3',
      'Louisiana Blue',
      'Iconic',
      'Twitch',
      'CPRA',
    ];

    for (const project of knownProjects) {
      if (lower.includes(project.toLowerCase())) {
        projectName = project;
        break;
      }
    }
  }

  return {
    projectGid: projectName, // This will be resolved by semantic resolution
  };
}

/**
 * Extract search parameters from description
 */
function extractSearchParameters(description: string): any {
  const queryMatch = description.match(
    /(?:find|search|lookup)\s+["']?([^"']+)["']?/i,
  );

  let entityType = 'auto';
  if (description.toLowerCase().includes('task')) entityType = 'task';
  else if (description.toLowerCase().includes('project'))
    entityType = 'project';
  else if (
    description.toLowerCase().includes('user') ||
    description.toLowerCase().includes('person')
  )
    entityType = 'user';

  return {
    query: queryMatch ? queryMatch[1] : description,
    entityType,
  };
}

/**
 * Extract workflow parameters from description
 */
function extractWorkflowParameters(description: string): any {
  const workflowMatch = description.match(
    /(?:workflow|process)\s+["']([^"']+)["']/i,
  );

  return {
    workflowId: workflowMatch ? workflowMatch[1] : '',
    parameters: {},
  };
}

/**
 * Extract notes from description
 */
function extractNotes(description: string): string | undefined {
  const notesMatch = description.match(
    /(?:with|having)\s+(?:notes?|description)\s+["']([^"']+)["']/i,
  );
  return notesMatch ? notesMatch[1] : undefined;
}

/**
 * Format enhanced response with AI improvements
 */
function formatEnhancedResponse(result: any): string {
  const { data, enhanced, metadata } = result;

  let response = '';

  if (enhanced?.summary) {
    response += `${enhanced.summary}\n\n`;
  }

  if (enhanced?.formattedData) {
    response += `${enhanced.formattedData}\n\n`;
  } else if (data) {
    response += `Result: ${JSON.stringify(data, null, 2)}\n\n`;
  }

  if (enhanced?.suggestions && enhanced.suggestions.length > 0) {
    response += `💡 Suggestions:\n`;
    enhanced.suggestions.forEach((suggestion: string, index: number) => {
      response += `${index + 1}. ${suggestion}\n`;
    });
    response += '\n';
  }

  if (enhanced?.relatedActions && enhanced.relatedActions.length > 0) {
    response += `🔗 Related Actions:\n`;
    enhanced.relatedActions.forEach((action: string, index: number) => {
      response += `${index + 1}. ${action}\n`;
    });
    response += '\n';
  }

  // Add metadata
  response += `⚡ Executed in ${metadata.duration}ms`;
  if (metadata.errorRecoveryUsed) {
    response += ` (with error recovery)`;
  }
  if (metadata.semanticResolutionUsed) {
    response += ` (with semantic resolution)`;
  }

  return response.trim();
}

/**
 * Format basic response without AI enhancements
 */
function formatBasicResponse(result: any): string {
  const { data, metadata } = result;

  let response = '';

  if (data) {
    if (typeof data === 'string') {
      response = data;
    } else {
      response = JSON.stringify(data, null, 2);
    }
  } else {
    response = 'Operation completed successfully.';
  }

  response += `\n\n⚡ Executed in ${metadata.duration}ms`;

  return response;
}
