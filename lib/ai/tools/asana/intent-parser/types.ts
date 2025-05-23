/**
 * Types for intent parsing in the Asana integration
 */

import type { RequestContext } from '../types';

/**
 * Supported Asana operation types
 */
export enum AsanaOperationType {
  // User operations
  GET_USER_ME = 'GET_USER_ME',

  // Task operations
  CREATE_TASK = 'CREATE_TASK',
  UPDATE_TASK = 'UPDATE_TASK',
  GET_TASK_DETAILS = 'GET_TASK_DETAILS',
  LIST_TASKS = 'LIST_TASKS',
  COMPLETE_TASK = 'COMPLETE_TASK',

  // Project operations
  CREATE_PROJECT = 'CREATE_PROJECT',
  UPDATE_PROJECT = 'updateProject',
  LIST_PROJECTS = 'LIST_PROJECTS',

  // Search operations
  SEARCH_ASANA = 'SEARCH_ASANA',

  // Task status operations (Epic 3.1)
  MARK_TASK_INCOMPLETE = 'MARK_TASK_INCOMPLETE',

  // Follower operations (Epic 3.1)
  ADD_FOLLOWER_TO_TASK = 'ADD_FOLLOWER_TO_TASK',
  REMOVE_FOLLOWER_FROM_TASK = 'REMOVE_FOLLOWER_FROM_TASK',

  // Due Date operations (Epic 3.1)
  SET_TASK_DUE_DATE = 'SET_TASK_DUE_DATE',

  // Subtask operations (Epic 3.1)
  ADD_SUBTASK = 'ADD_SUBTASK',
  LIST_SUBTASKS = 'LIST_SUBTASKS',

  // Dependency operations (Epic 3.1)
  ADD_TASK_DEPENDENCY = 'ADD_TASK_DEPENDENCY',
  REMOVE_TASK_DEPENDENCY = 'REMOVE_TASK_DEPENDENCY',

  // Unknown/fallback
  UNKNOWN = 'unknown',
}

/**
 * Base interface for parsed intent data
 */
export interface ParsedIntentBase {
  operationType: AsanaOperationType;
  requestContext: RequestContext;
  rawInput: string;
}

/**
 * Interface for parsed user info intent
 */
export interface ParsedUserMeIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.GET_USER_ME;
}

/**
 * Interface for parsed create task intent
 */
export interface ParsedCreateTaskIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.CREATE_TASK;
  taskName: string;
  taskNotes?: string;
  projectName?: string;
  dueDate?: string;
  assigneeName?: string;
}

/**
 * Interface for parsed update task intent
 */
export interface ParsedUpdateTaskIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.UPDATE_TASK;
  taskIdentifier: {
    name?: string;
    gid?: string;
  };
  updateFields: {
    name?: string;
    notes?: string;
    dueDate?: string;
    completed?: boolean;
  };
  projectName?: string;
}

/**
 * Interface for parsed get task details intent
 */
export interface ParsedGetTaskDetailsIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.GET_TASK_DETAILS;
  taskIdentifier: {
    name?: string;
    gid?: string;
  };
  projectName?: string;
}

/**
 * Interface for parsed list tasks intent
 */
export interface ParsedListTasksIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.LIST_TASKS;
  projectName?: string;
  assignedToMe?: boolean;
  completed?: boolean;
}

/**
 * Interface for parsed complete task intent
 */
export interface ParsedCompleteTaskIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.COMPLETE_TASK;
  taskGid?: string;
  taskName?: string;
  projectName?: string; // For context if taskName is used
}

/**
 * Interface for parsed mark task incomplete intent
 */
export interface ParsedMarkTaskIncompleteIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.MARK_TASK_INCOMPLETE;
  taskGid?: string;
  taskName?: string;
  projectName?: string; // For context if taskName is used
}

/**
 * Interface for parsed create project intent
 */
export interface ParsedCreateProjectIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.CREATE_PROJECT;
  projectName: string;
  teamName?: string;
  teamGid?: string;
  notes?: string;
}

/**
 * Interface for parsed update project intent
 */
export interface ParsedUpdateProjectIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.UPDATE_PROJECT;
  projectIdentifier: {
    name?: string;
    gid?: string;
  };
  updateFields: {
    name?: string;
    notes?: string;
  };
}

/**
 * Interface for parsed list projects intent
 */
export interface ParsedListProjectsIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.LIST_PROJECTS;
  teamName?: string;
  archived?: boolean;
}

/**
 * Interface for parsed search Asana intent
 */
export interface ParsedSearchAsanaIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.SEARCH_ASANA;
  query: string;
  resourceType?: 'task' | 'project' | 'user' | 'portfolio' | 'tag'; // Optional filter by type
}

/**
 * Interface for parsed add follower to task intent
 */
export interface ParsedAddFollowerToTaskIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.ADD_FOLLOWER_TO_TASK;
  taskGid?: string;
  taskName?: string;
  projectName?: string; // For context if taskName is used
  userGid?: string; // GID of the user to add as follower
  userNameOrEmail?: string; // Name or email of the user to add as follower (e.g., "me", "John Doe", "john.doe@example.com")
}

/**
 * Interface for parsed remove follower from task intent
 */
export interface ParsedRemoveFollowerFromTaskIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.REMOVE_FOLLOWER_FROM_TASK;
  taskGid?: string;
  taskName?: string;
  projectName?: string; // For context if taskName is used
  userGid?: string; // GID of the user to remove as follower
  userNameOrEmail?: string; // Name or email of the user to remove as follower
}

/**
 * Interface for parsed set task due date intent
 */
export interface ParsedSetTaskDueDateIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.SET_TASK_DUE_DATE;
  taskGid?: string;
  taskName?: string;
  projectName?: string; // For context if taskName is used
  dueDateExpression: string; // Raw date/time expression like "tomorrow", "next Friday at 5pm", "2023-12-31"
}

/**
 * Interface for parsed add subtask intent
 */
export interface ParsedAddSubtaskIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.ADD_SUBTASK;
  parentTaskGid?: string;
  parentTaskName?: string;
  parentProjectName?: string; // For context if parentTaskName is used
  subtaskName: string;
  // Potentially other fields for the subtask itself, like notes, assignee, due_date
  // For now, keeping it simple with just the name.
}

/**
 * Interface for parsed list subtasks intent
 */
export interface ParsedListSubtasksIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.LIST_SUBTASKS;
  parentTaskGid?: string;
  parentTaskName?: string;
  parentProjectName?: string; // For context if parentTaskName is used
}

/**
 * Interface for parsed add task dependency intent
 */
export interface ParsedAddTaskDependencyIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.ADD_TASK_DEPENDENCY;
  taskGid?: string; // The task that will depend on another
  taskName?: string;
  taskProjectName?: string; // Context for taskName
  dependencyTaskGid?: string; // The task that must be completed first
  dependencyTaskName?: string;
  dependencyTaskProjectName?: string; // Context for dependencyTaskName
  dependencyType?: 'depend_on' | 'blocking'; // Asana uses "depend_on" for the task being blocked, "blocking" for the task that blocks
}

/**
 * Interface for parsed remove task dependency intent
 */
export interface ParsedRemoveTaskDependencyIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.REMOVE_TASK_DEPENDENCY;
  taskGid?: string;
  taskName?: string;
  taskProjectName?: string;
  dependencyTaskGid?: string;
  dependencyTaskName?: string;
  dependencyTaskProjectName?: string;
}

/**
 * Interface for parsed unknown intent
 */
export interface ParsedUnknownIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.UNKNOWN;
  possibleOperations?: AsanaOperationType[];
  errorMessage?: string;
}

/**
 * Union type for all parsed intents
 */
export type ParsedIntent =
  | ParsedUserMeIntent
  | ParsedCreateTaskIntent
  | ParsedUpdateTaskIntent
  | ParsedGetTaskDetailsIntent
  | ParsedListTasksIntent
  | ParsedCompleteTaskIntent
  | ParsedMarkTaskIncompleteIntent
  | ParsedAddFollowerToTaskIntent
  | ParsedRemoveFollowerFromTaskIntent
  | ParsedSetTaskDueDateIntent
  | ParsedAddSubtaskIntent
  | ParsedListSubtasksIntent
  | ParsedAddTaskDependencyIntent
  | ParsedRemoveTaskDependencyIntent
  | ParsedCreateProjectIntent
  | ParsedUpdateProjectIntent
  | ParsedListProjectsIntent
  | ParsedSearchAsanaIntent
  | ParsedUnknownIntent;
