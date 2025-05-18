/**
 * Types for intent parsing in the Asana integration
 */

import type { RequestContext } from '../types';

/**
 * Supported Asana operation types
 */
export enum AsanaOperationType {
  // User operations
  GET_USER_INFO = 'getUserInfo',

  // Task operations
  CREATE_TASK = 'createTask',
  UPDATE_TASK = 'updateTask',
  GET_TASK_DETAILS = 'getTaskDetails',
  LIST_TASKS = 'listTasks',
  COMPLETE_TASK = 'completeTask',

  // Project operations
  CREATE_PROJECT = 'createProject',
  UPDATE_PROJECT = 'updateProject',
  LIST_PROJECTS = 'listProjects',

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
export interface ParsedUserInfoIntent extends ParsedIntentBase {
  operationType: AsanaOperationType.GET_USER_INFO;
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
  taskIdentifier: {
    name?: string;
    gid?: string;
  };
  projectName?: string;
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
  | ParsedUserInfoIntent
  | ParsedCreateTaskIntent
  | ParsedUpdateTaskIntent
  | ParsedGetTaskDetailsIntent
  | ParsedListTasksIntent
  | ParsedCompleteTaskIntent
  | ParsedCreateProjectIntent
  | ParsedUpdateProjectIntent
  | ParsedListProjectsIntent
  | ParsedUnknownIntent;
