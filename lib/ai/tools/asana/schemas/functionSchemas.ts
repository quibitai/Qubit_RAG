/**
 * Modern Function Schemas for Asana Operations
 * Replaces regex-based intent parsing with structured LLM function calling
 */

import { z } from 'zod';

// Base schema for common parameters
const BaseAsanaSchema = z.object({
  workspace_gid: z
    .string()
    .optional()
    .describe('Asana workspace GID (auto-resolved if not provided)'),
});

// Task Operations
export const ListTasksSchema = BaseAsanaSchema.extend({
  project_name: z
    .string()
    .optional()
    .describe('Name of the project to filter tasks by'),
  project_gid: z.string().optional().describe('Asana project GID if known'),
  assignee: z
    .string()
    .optional()
    .describe('Email, name, or "me" for current user'),
  completed: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to include completed tasks'),
  due_date_filter: z
    .enum(['overdue', 'today', 'this_week', 'next_week'])
    .optional()
    .describe('Filter tasks by due date'),
});

export const CreateTaskSchema = BaseAsanaSchema.extend({
  name: z.string().describe('Task name/title'),
  project_name: z.string().optional().describe('Project to add the task to'),
  project_gid: z.string().optional().describe('Asana project GID if known'),
  assignee: z
    .string()
    .optional()
    .describe('Person to assign the task to (email, name, or "me")'),
  due_date: z
    .string()
    .optional()
    .describe('Due date in YYYY-MM-DD format or natural language'),
  notes: z.string().optional().describe('Additional task description or notes'),
  priority: z
    .enum(['low', 'normal', 'high'])
    .optional()
    .describe('Task priority level'),
});

export const UpdateTaskSchema = BaseAsanaSchema.extend({
  task_name: z.string().optional().describe('Name of the task to update'),
  task_gid: z.string().optional().describe('Asana task GID if known'),
  project_name: z
    .string()
    .optional()
    .describe('Project context for task identification'),
  updates: z
    .object({
      name: z.string().optional().describe('New task name'),
      notes: z.string().optional().describe('New task description'),
      due_date: z.string().optional().describe('New due date'),
      completed: z
        .boolean()
        .optional()
        .describe('Mark as completed/incomplete'),
      assignee: z.string().optional().describe('New assignee'),
    })
    .describe('Fields to update'),
});

export const GetTaskDetailsSchema = BaseAsanaSchema.extend({
  task_name: z.string().optional().describe('Name of the task'),
  task_gid: z.string().optional().describe('Asana task GID if known'),
  project_name: z
    .string()
    .optional()
    .describe('Project context for task identification'),
});

export const DeleteTaskSchema = BaseAsanaSchema.extend({
  task_name: z.string().optional().describe('Name of the task to delete'),
  task_gid: z.string().optional().describe('Asana task GID if known'),
  project_name: z
    .string()
    .optional()
    .describe('Project context for task identification'),
});

export const CompleteTaskSchema = BaseAsanaSchema.extend({
  task_name: z.string().optional().describe('Name of the task to complete'),
  task_gid: z.string().optional().describe('Asana task GID if known'),
  project_name: z
    .string()
    .optional()
    .describe('Project context for task identification'),
});

// Subtask Operations
export const AddSubtaskSchema = BaseAsanaSchema.extend({
  parent_task_name: z.string().optional().describe('Name of the parent task'),
  parent_task_gid: z.string().optional().describe('Parent task GID if known'),
  parent_project_name: z
    .string()
    .optional()
    .describe('Project context for parent task'),
  subtask_name: z.string().describe('Name of the subtask to create'),
  assignee: z.string().optional().describe('Person to assign the subtask to'),
  due_date: z.string().optional().describe('Due date for the subtask'),
  notes: z.string().optional().describe('Description for the subtask'),
});

export const ListSubtasksSchema = BaseAsanaSchema.extend({
  parent_task_name: z.string().optional().describe('Name of the parent task'),
  parent_task_gid: z.string().optional().describe('Parent task GID if known'),
  parent_project_name: z
    .string()
    .optional()
    .describe('Project context for parent task'),
});

// Project Operations
export const ListProjectsSchema = BaseAsanaSchema.extend({
  team_name: z.string().optional().describe('Filter by team name'),
  archived: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include archived projects'),
});

export const GetProjectDetailsSchema = BaseAsanaSchema.extend({
  project_name: z.string().optional().describe('Name of the project'),
  project_gid: z.string().optional().describe('Asana project GID if known'),
});

export const CreateProjectSchema = BaseAsanaSchema.extend({
  name: z.string().describe('Project name'),
  team_name: z.string().optional().describe('Team to create the project in'),
  team_gid: z.string().optional().describe('Team GID if known'),
  notes: z.string().optional().describe('Project description'),
  privacy_setting: z
    .enum(['public', 'private'])
    .optional()
    .describe('Project privacy'),
});

// User Operations
export const GetUserDetailsSchema = BaseAsanaSchema.extend({
  user_name: z.string().optional().describe('Name of the user'),
  user_email: z.string().optional().describe('Email of the user'),
  user_gid: z.string().optional().describe('User GID if known'),
});

export const ListWorkspaceUsersSchema = BaseAsanaSchema.extend({
  workspace_name: z.string().optional().describe('Workspace name filter'),
});

// Search Operations
export const SearchAsanaSchema = BaseAsanaSchema.extend({
  query: z.string().describe('Search query'),
  resource_type: z
    .enum(['task', 'project', 'user', 'portfolio', 'tag'])
    .optional()
    .describe('Filter by resource type'),
});

// Advanced Operations
export const AddFollowerSchema = BaseAsanaSchema.extend({
  task_name: z.string().optional().describe('Name of the task'),
  task_gid: z.string().optional().describe('Task GID if known'),
  project_name: z.string().optional().describe('Project context for task'),
  follower: z
    .string()
    .describe('User to add as follower (name, email, or "me")'),
});

export const SetTaskDueDateSchema = BaseAsanaSchema.extend({
  task_name: z.string().optional().describe('Name of the task'),
  task_gid: z.string().optional().describe('Task GID if known'),
  project_name: z.string().optional().describe('Project context for task'),
  due_date: z
    .string()
    .describe('Due date expression (natural language or YYYY-MM-DD)'),
});

// Section Operations
export const ListProjectSectionsSchema = BaseAsanaSchema.extend({
  project_name: z.string().optional().describe('Name of the project'),
  project_gid: z.string().optional().describe('Project GID if known'),
});

export const CreateProjectSectionSchema = BaseAsanaSchema.extend({
  project_name: z.string().optional().describe('Name of the project'),
  project_gid: z.string().optional().describe('Project GID if known'),
  section_name: z.string().describe('Name of the section to create'),
});

export const MoveTaskToSectionSchema = BaseAsanaSchema.extend({
  task_name: z.string().optional().describe('Name of the task'),
  task_gid: z.string().optional().describe('Task GID if known'),
  project_name: z.string().optional().describe('Project context'),
  section_name: z.string().optional().describe('Name of the target section'),
  section_gid: z.string().optional().describe('Section GID if known'),
});

// Function Schema Registry
export const ASANA_FUNCTION_SCHEMAS = {
  list_tasks: {
    name: 'list_tasks',
    description: 'List tasks from Asana with optional filters',
    schema: ListTasksSchema,
  },
  create_task: {
    name: 'create_task',
    description: 'Create a new task in Asana',
    schema: CreateTaskSchema,
  },
  update_task: {
    name: 'update_task',
    description: 'Update an existing task in Asana',
    schema: UpdateTaskSchema,
  },
  get_task_details: {
    name: 'get_task_details',
    description: 'Get detailed information about a specific task',
    schema: GetTaskDetailsSchema,
  },
  delete_task: {
    name: 'delete_task',
    description: 'Delete a task from Asana',
    schema: DeleteTaskSchema,
  },
  complete_task: {
    name: 'complete_task',
    description: 'Mark a task as completed',
    schema: CompleteTaskSchema,
  },
  add_subtask: {
    name: 'add_subtask',
    description: 'Add a subtask to an existing task',
    schema: AddSubtaskSchema,
  },
  list_subtasks: {
    name: 'list_subtasks',
    description: 'List subtasks of a parent task',
    schema: ListSubtasksSchema,
  },
  list_projects: {
    name: 'list_projects',
    description: 'List projects in the workspace',
    schema: ListProjectsSchema,
  },
  get_project_details: {
    name: 'get_project_details',
    description: 'Get detailed information about a specific project',
    schema: GetProjectDetailsSchema,
  },
  create_project: {
    name: 'create_project',
    description: 'Create a new project in Asana',
    schema: CreateProjectSchema,
  },
  get_user_details: {
    name: 'get_user_details',
    description: 'Get information about a specific user',
    schema: GetUserDetailsSchema,
  },
  list_workspace_users: {
    name: 'list_workspace_users',
    description: 'List users in the workspace',
    schema: ListWorkspaceUsersSchema,
  },
  search_asana: {
    name: 'search_asana',
    description: 'Search across Asana for tasks, projects, or users',
    schema: SearchAsanaSchema,
  },
  add_follower: {
    name: 'add_follower',
    description: 'Add a follower to a task',
    schema: AddFollowerSchema,
  },
  set_task_due_date: {
    name: 'set_task_due_date',
    description: 'Set or update the due date of a task',
    schema: SetTaskDueDateSchema,
  },
  list_project_sections: {
    name: 'list_project_sections',
    description: 'List sections in a project',
    schema: ListProjectSectionsSchema,
  },
  create_project_section: {
    name: 'create_project_section',
    description: 'Create a new section in a project',
    schema: CreateProjectSectionSchema,
  },
  move_task_to_section: {
    name: 'move_task_to_section',
    description: 'Move a task to a specific section',
    schema: MoveTaskToSectionSchema,
  },
} as const;

export type AsanaFunctionName = keyof typeof ASANA_FUNCTION_SCHEMAS;
