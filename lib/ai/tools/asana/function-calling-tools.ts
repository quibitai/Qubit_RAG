/**
 * LLM Function Calling Tools for Asana
 *
 * This implements the proper LLM function calling approach with structured schemas
 * for each operation, replacing regex-based intent parsing.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  ModernAsanaTool,
  type ToolExecutionContext,
} from './modern-asana-tool';
import { AsanaApiClient } from './api-client/client';
import { ASANA_PAT } from './config';
import {
  analyzeAsanaError,
  formatUserFriendlyError,
  type UserFriendlyErrorResult,
} from './recovery/userFriendlyErrorHandler';
import { AsanaIntegrationError } from './utils/errorHandler';

// Generate a simple request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Create execution context
function createContext(userIntent?: string): ToolExecutionContext {
  return {
    sessionId: generateRequestId(),
    requestId: generateRequestId(),
    userIntent,
    conversationContext: {},
  };
}

// Format response helper
function formatResponse(result: any): string {
  if (result.enhanced) {
    let response = '';

    if (result.enhanced.summary) {
      response += `${result.enhanced.summary}\n\n`;
    }

    if (result.enhanced.formattedData) {
      response += `${result.enhanced.formattedData}\n\n`;
    } else if (result.data) {
      response += `Result: ${JSON.stringify(result.data, null, 2)}\n\n`;
    }

    if (result.enhanced.suggestions?.length > 0) {
      response += `💡 Suggestions:\n`;
      result.enhanced.suggestions.forEach(
        (suggestion: string, index: number) => {
          response += `${index + 1}. ${suggestion}\n`;
        },
      );
      response += '\n';
    }

    if (result.enhanced.relatedActions?.length > 0) {
      response += `🔗 Related Actions:\n`;
      result.enhanced.relatedActions.forEach(
        (action: string, index: number) => {
          response += `${index + 1}. ${action}\n`;
        },
      );
      response += '\n';
    }

    response += `⚡ Executed in ${result.metadata.duration}ms`;
    if (result.metadata.errorRecoveryUsed) {
      response += ` (with error recovery)`;
    }
    if (result.metadata.semanticResolutionUsed) {
      response += ` (with semantic resolution)`;
    }

    return response.trim();
  } else {
    let response =
      typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data, null, 2);
    response += `\n\n⚡ Executed in ${result.metadata.duration}ms`;
    return response;
  }
}

// Enhanced error handling helper
function handleToolError(
  error: any,
  operation: string,
  parameters: Record<string, any>,
): string {
  if (error instanceof AsanaIntegrationError) {
    const analysis = analyzeAsanaError(error, operation, parameters);
    if (analysis.isUserError) {
      return formatUserFriendlyError(analysis);
    }
  }

  // Fallback to generic error message
  return `Error ${operation}: ${error instanceof Error ? error.message : 'Unknown error'}`;
}

/**
 * Create all Asana function calling tools
 */
export function createAsanaFunctionCallingTools(
  apiKey?: string,
): DynamicStructuredTool[] {
  const client = new AsanaApiClient(apiKey || ASANA_PAT);
  const modernTool = new ModernAsanaTool(client, {
    enableWorkflows: true,
    enableSemanticResolution: true,
    enableErrorRecovery: true,
    enableResponseEnhancement: true,
  });

  return [
    // ===== TASK OPERATIONS =====

    new DynamicStructuredTool({
      name: 'asana_create_task',
      description: 'Create a new task in Asana with specified details',
      schema: z.object({
        name: z.string().describe('The name/title of the task'),
        notes: z.string().optional().describe('Task description or notes'),
        projects: z
          .array(z.string())
          .optional()
          .describe('Project names or GIDs to add the task to'),
        assignee: z
          .string()
          .optional()
          .describe('User name or GID to assign the task to'),
        due_date: z
          .string()
          .optional()
          .describe('Due date in YYYY-MM-DD format'),
        parent: z
          .string()
          .optional()
          .describe('Parent task name or GID for subtasks'),
      }),
      func: async ({ name, notes, projects, assignee, due_date, parent }) => {
        const context = createContext(`Create task: ${name}`);

        const parameters = {
          name,
          notes,
          projects: projects?.map((project: string) =>
            /^\d{16,19}$/.test(project) ? project : `@${project}`,
          ),
          assignee: assignee
            ? /^\d{16,19}$/.test(assignee)
              ? assignee
              : `@${assignee}`
            : undefined,
          due_on: due_date,
          parent: parent
            ? /^\d{16,19}$/.test(parent)
              ? parent
              : `@${parent}`
            : undefined,
        };

        try {
          const result = await modernTool.createTask(parameters, context);
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'creating task', parameters);
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'asana_list_tasks',
      description:
        "List tasks from Asana. IMPORTANT: You **MUST** provide either a 'project' OR an 'assignee' to filter by. If both are provided, 'project' will take priority. This tool cannot list all tasks from all projects/assignees at once.",
      schema: z
        .object({
          project: z
            .string()
            .optional()
            .describe(
              'Project name or GID to filter tasks by. Use this if you know the project.',
            ),
          assignee: z
            .string()
            .optional()
            .describe(
              'User name, email, or GID to filter tasks by. Use this if you know the assignee AND no project is specified.',
            ),
          completed_since: z
            .string()
            .optional()
            .describe(
              'ISO date (YYYY-MM-DD) to get tasks completed since. Can be combined with project or assignee.',
            ),
          include_completed: z
            .boolean()
            .optional()
            .default(false)
            .describe(
              'Whether to include completed tasks. Defaults to false. Can be combined with project or assignee.',
            ),
        })
        .refine((data) => data.project || data.assignee, {
          message:
            "To list Asana tasks, you must provide either a 'project' or an 'assignee'.",
        }),
      func: async ({
        project,
        assignee,
        completed_since,
        include_completed,
      }) => {
        const context = createContext('List tasks');

        // Asana API constraint: Must specify exactly one of project, tag, section, user task list, or assignee + workspace
        // Priority: project > assignee
        const parameters: any = {
          completed_since,
          opt_fields: include_completed
            ? ['completed', 'completed_at']
            : undefined,
        };

        if (project) {
          // If project is specified, use only project filter
          parameters.project = /^\d{16,19}$/.test(project)
            ? project
            : `@${project}`;
        } else if (assignee) {
          // If only assignee is specified, use assignee filter
          parameters.assignee = /^\d{16,19}$/.test(assignee)
            ? assignee
            : `@${assignee}`;
        }
        // If neither is specified, list all tasks (no filter)

        try {
          const result = await modernTool.listTasks(parameters, context);
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'listing tasks', parameters);
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'asana_update_task',
      description: 'Update an existing task in Asana',
      schema: z.object({
        task_id: z.string().describe('Task name or GID to update'),
        notes: z.string().optional().describe('New task notes/description'),
        completed: z
          .boolean()
          .optional()
          .describe('Mark task as completed or incomplete'),
        due_date: z
          .string()
          .optional()
          .describe('New due date in YYYY-MM-DD format'),
        due_time: z.string().optional().describe('Due time in ISO format'),
      }),
      func: async ({ task_id, notes, completed, due_date, due_time }) => {
        const context = createContext(`Update task: ${task_id}`);

        const updates = {
          notes,
          completed,
          due_on: due_date,
          due_at: due_time,
        };

        try {
          // Only add @ prefix if task_id is not already a GID (numeric string)
          const taskReference = /^\d{16,19}$/.test(task_id)
            ? task_id
            : `@${task_id}`;
          const result = await modernTool.updateTask(
            taskReference,
            updates,
            context,
          );
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'updating task', {
            task_id,
            notes,
            completed,
            due_date,
            due_time,
          });
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'asana_get_task_details',
      description: 'Get detailed information about a specific task',
      schema: z.object({
        task_id: z.string().describe('Task name or GID to get details for'),
        include_fields: z
          .array(z.string())
          .optional()
          .describe('Specific fields to include in response'),
      }),
      func: async ({ task_id, include_fields }) => {
        const context = createContext(`Get task details: ${task_id}`);

        try {
          // Only add @ prefix if task_id is not already a GID (numeric string)
          const taskReference = /^\d{16,19}$/.test(task_id)
            ? task_id
            : `@${task_id}`;
          const result = await modernTool.getTaskDetails(
            taskReference,
            context,
            include_fields,
          );
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'getting task details', {
            task_id,
            include_fields,
          });
        }
      },
    }),

    // ===== PROJECT OPERATIONS =====

    new DynamicStructuredTool({
      name: 'asana_create_project',
      description: 'Create a new project in Asana',
      schema: z.object({
        name: z.string().describe('The name of the project'),
        notes: z.string().optional().describe('Project description or notes'),
        team: z
          .string()
          .optional()
          .describe('Team name or GID to add the project to'),
        public: z
          .boolean()
          .optional()
          .describe('Whether the project should be public'),
        color: z
          .string()
          .optional()
          .describe('Project color (e.g., "light-green", "dark-blue")'),
      }),
      func: async ({ name, notes, team, public: isPublic, color }) => {
        const context = createContext(`Create project: ${name}`);
        const parameters = {
          name,
          notes,
          team,
          public: isPublic,
          color,
        };

        try {
          const result = await modernTool.createProject(parameters, context);
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'creating project', parameters);
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'asana_list_projects',
      description:
        'List and discover projects from Asana workspace with optional filtering. Use this to find projects by name, list all projects, or discover available projects in Asana.',
      schema: z.object({
        team: z
          .string()
          .optional()
          .describe('Team name or GID to filter projects by'),
        archived: z
          .boolean()
          .optional()
          .describe('Whether to include archived projects'),
        include_fields: z
          .array(z.string())
          .optional()
          .describe('Specific fields to include in response'),
      }),
      func: async ({ team, archived, include_fields }) => {
        const context = createContext('List projects');
        const parameters = {
          team,
          archived,
          opt_fields: include_fields,
        };

        try {
          const result = await modernTool.listProjects(parameters, context);
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'listing projects', parameters);
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'asana_get_project_details',
      description:
        'Get detailed information about a specific Asana project including description, status, milestones, tasks, and overview. Use this when users ask for project details, project overview, project information, or project status from Asana.',
      schema: z.object({
        project_id: z
          .string()
          .describe('Project name or GID to get details for'),
        include_fields: z
          .array(z.string())
          .optional()
          .describe('Specific fields to include in response'),
      }),
      func: async ({ project_id, include_fields }) => {
        const context = createContext(`Get project details: ${project_id}`);

        try {
          const result = await modernTool.getProjectDetails(
            project_id,
            context,
            include_fields,
          );
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'getting project details', {
            project_id,
            include_fields,
          });
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'asana_list_project_tasks',
      description:
        'List all tasks in a specific Asana project. Use this for project overviews and task breakdowns.',
      schema: z.object({
        project: z.string().describe('Project name or GID to list tasks from'),
        include_completed: z
          .boolean()
          .optional()
          .describe('Whether to include completed tasks'),
      }),
      func: async ({ project, include_completed }) => {
        const context = createContext(`List tasks in project: ${project}`);

        const parameters = {
          project: /^\d{16,19}$/.test(project) ? project : `@${project}`,
          opt_fields: include_completed
            ? ['completed', 'completed_at']
            : undefined,
        };

        try {
          const result = await modernTool.listTasks(parameters, context);
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'listing project tasks', parameters);
        }
      },
    }),

    // ===== USER OPERATIONS =====

    new DynamicStructuredTool({
      name: 'asana_list_users',
      description: 'List users/members in the Asana workspace',
      schema: z.object({
        workspace_id: z
          .string()
          .optional()
          .describe('Workspace GID (uses default if not provided)'),
      }),
      func: async ({ workspace_id }) => {
        const context = createContext('List users');

        try {
          const result = await modernTool.listUsers(context, workspace_id);
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'listing users', { workspace_id });
        }
      },
    }),

    // ===== SEARCH & RESOLUTION =====

    new DynamicStructuredTool({
      name: 'asana_search_entity',
      description:
        'Search for tasks, projects, or users using semantic matching',
      schema: z.object({
        query: z
          .string()
          .describe('Search query (name, partial name, or description)'),
        entity_type: z
          .enum(['task', 'project', 'user', 'auto'])
          .describe('Type of entity to search for'),
      }),
      func: async ({ query, entity_type }) => {
        const context = createContext(`Search for ${entity_type}: ${query}`);

        try {
          const result = await modernTool.resolveEntity(
            query,
            entity_type,
            context,
          );
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'searching entities', {
            query,
            entity_type,
          });
        }
      },
    }),

    // ===== WORKFLOW OPERATIONS =====

    new DynamicStructuredTool({
      name: 'asana_suggest_workflows',
      description: 'Get workflow suggestions for complex Asana operations',
      schema: z.object({
        user_intent: z
          .string()
          .describe('Description of what you want to accomplish'),
      }),
      func: async ({ user_intent }) => {
        const context = createContext(user_intent);

        try {
          const result = await modernTool.suggestWorkflows(
            user_intent,
            context,
          );
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'suggesting workflows', {
            user_intent,
          });
        }
      },
    }),

    new DynamicStructuredTool({
      name: 'asana_execute_workflow',
      description: 'Execute a multi-step workflow in Asana',
      schema: z.object({
        workflow_id: z.string().describe('ID of the workflow to execute'),
        parameters: z
          .record(z.any())
          .describe('Parameters for the workflow execution'),
      }),
      func: async ({ workflow_id, parameters }) => {
        const context = createContext(`Execute workflow: ${workflow_id}`);

        try {
          const result = await modernTool.executeWorkflow(
            workflow_id,
            parameters,
            context,
          );
          return formatResponse(result);
        } catch (error) {
          return handleToolError(error, 'executing workflow', {
            workflow_id,
            parameters,
          });
        }
      },
    }),
  ];
}
