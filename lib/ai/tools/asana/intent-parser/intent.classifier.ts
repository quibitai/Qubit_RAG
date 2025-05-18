/**
 * Intent classifier for Asana operations
 */

import { AsanaOperationType } from './types';

// Regex patterns for matching different intents
const INTENT_PATTERNS = {
  // User info patterns
  [AsanaOperationType.GET_USER_ME]: [
    /(?:get|show|display|who).+(?:user|me|my).+(?:info|information|details|profile)/i,
    /who am i/i,
    /my (?:user|asana) (?:info|information|details|profile)/i,
  ],

  // Task operations
  [AsanaOperationType.CREATE_TASK]: [
    /(?:create|add|make|new)(?:.+?)(?:task|to-?do)/i,
    /(?:add|create).+(?:to|in|on).+(?:asana)/i,
  ],

  [AsanaOperationType.UPDATE_TASK]: [
    /(?:update|edit|modify|change).+(?:task|to-?do)/i,
    /(?:change|update|modify).+(?:description|notes|details|status).+(?:task|to-?do)/i,
  ],

  [AsanaOperationType.GET_TASK_DETAILS]: [
    /(?:get|show|display|fetch).+(?:details|info|information).+(?:task|to-?do)/i,
    /(?:details|info|information).+(?:about|for|on).+(?:task|to-?do)/i,
    /what.+(?:details|info).+(?:task|to-?do)/i,
  ],

  [AsanaOperationType.LIST_TASKS]: [
    /(?:list|show|display|get|fetch).+(?:tasks|to-?dos)/i,
    /(?:what|which).+(?:tasks|to-?dos)/i,
    /(?:find|search).+(?:tasks|to-?dos)/i,
  ],

  [AsanaOperationType.COMPLETE_TASK]: [
    /(?:complete|finish|mark.+done|mark.+complete|check.+off|close).+(?:task|to-?do)/i,
    /(?:mark|set).+(?:task|to-?do).+(?:as|to).+(?:complete|done|finished)/i,
  ],

  // Project operations
  [AsanaOperationType.CREATE_PROJECT]: [
    /(?:create|add|make|new).+(?:project)/i,
  ],

  [AsanaOperationType.UPDATE_PROJECT]: [
    /(?:update|edit|modify|change).+(?:project)/i,
    /(?:change|update|modify).+(?:description|notes|details|status).+(?:project)/i,
  ],

  [AsanaOperationType.LIST_PROJECTS]: [
    /(?:list|show|display|get|fetch).+(?:projects)/i,
    /(?:what|which).+(?:projects)/i,
    /(?:find|search).+(?:projects)/i,
  ],
};

/**
 * Classify the intent from a natural language input
 *
 * @param input Natural language input describing the desired Asana operation
 * @returns The classified operation type
 */
export function classifyIntent(input: string): AsanaOperationType {
  if (!input) {
    return AsanaOperationType.UNKNOWN;
  }

  const lowerInput = input.toLowerCase();

  // Check for each intent pattern
  for (const [operationType, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerInput)) {
        return operationType as AsanaOperationType;
      }
    }
  }

  // Handle tasks vs projects disambiguation
  if (
    lowerInput.includes('task') ||
    lowerInput.includes('to-do') ||
    lowerInput.includes('todo')
  ) {
    if (lowerInput.match(/(?:create|add|make|new)/i)) {
      return AsanaOperationType.CREATE_TASK;
    } else if (lowerInput.match(/(?:update|edit|modify|change)/i)) {
      return AsanaOperationType.UPDATE_TASK;
    } else if (lowerInput.match(/(?:detail|info|about)/i)) {
      return AsanaOperationType.GET_TASK_DETAILS;
    } else if (lowerInput.match(/(?:list|show|get|all)/i)) {
      return AsanaOperationType.LIST_TASKS;
    } else if (lowerInput.match(/(?:complete|done|finish)/i)) {
      return AsanaOperationType.COMPLETE_TASK;
    }
  } else if (lowerInput.includes('project')) {
    if (lowerInput.match(/(?:create|add|make|new)/i)) {
      return AsanaOperationType.CREATE_PROJECT;
    } else if (lowerInput.match(/(?:update|edit|modify|change)/i)) {
      return AsanaOperationType.UPDATE_PROJECT;
    } else if (lowerInput.match(/(?:list|show|get|all)/i)) {
      return AsanaOperationType.LIST_PROJECTS;
    }
  }

  return AsanaOperationType.UNKNOWN;
}
