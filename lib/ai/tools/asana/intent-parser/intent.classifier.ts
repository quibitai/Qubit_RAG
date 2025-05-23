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
    /(?:update|edit|modify|change)\s+(?:(?:['"][^'"]+['"])|(?:.*?\b(?:task|to-?do)\b))/i,
    /(?:change|update|modify).+(?:description|notes|details|status).+(?:task|to-?do)/i,
  ],

  [AsanaOperationType.GET_TASK_DETAILS]: [
    /(?:get|show|display|fetch|retrieve).+(?:details|info|information|data).+(?:task|to-?do)/i,
    /(?:details|info|information|data).+(?:about|for|on|of).+(?:task|to-?do)/i,
    /what.+(?:details|info).+(?:task|to-?do)/i,
    /(?:get|show|display|fetch|retrieve).+task.+gid\s*\d{16}/i,
    /(?:get|show|display|fetch|retrieve).+task.+asana\.com\/0\/\d+\/(\d+)/i,
    /task\s*\d{16}/i,
    /task.+asana\.com\/0\/\d+\/(\d+)/i,
  ],

  [AsanaOperationType.LIST_TASKS]: [
    /(?:list|show|display|get|fetch).+(?:tasks|to-?dos)/i,
    /(?:what|which).+(?:tasks|to-?dos)/i,
    /(?:find|search).+(?:tasks|to-?dos)/i,
  ],

  [AsanaOperationType.COMPLETE_TASK]: [
    /(?:complete|finish|done|mark as complete|close).+(?:task|to-?do|item)/i,
    /(?:task|to-?do|item).+(?:complete|finish|done)/i,
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

  // Search operations
  [AsanaOperationType.SEARCH_ASANA]: [
    /(?:search|find|look up|query).+(?:in|on|for).+(?:asana)/i,
    /(?:search|find|look up|query)\s*["']([^"']+)["'](?:\s*(?:in|on|for)\s*asana)?/i, // search "query text" in asana
    /asana\s*(?:search|find|look up|query)\s*["']([^"']+)["']/i, // asana search "query text"
    /^(?:search|find|look up|query)\s+(?!task|project|user|team|portfolio|tag)/i, // General search if no specific object type is mentioned after search keyword
  ],

  // Task status operations (Epic 3.1)
  [AsanaOperationType.MARK_TASK_INCOMPLETE]: [
    /(?:reopen|uncheck|mark as incomplete|uncancel|undone).+(?:task|to-?do|item)/i,
    /(?:task|to-?do|item).+(?:reopen|uncheck|incomplete)/i,
  ],

  // Follower operations (Epic 3.1)
  [AsanaOperationType.ADD_FOLLOWER_TO_TASK]: [
    /(?:add|assign|include).+(?:follower|watcher|subscriber|user|person).+(?:to|on).+(?:task|to-?do|item)/i,
    /follow.+task/i,
    /subscribe.+(?:to).+task/i,
  ],
  [AsanaOperationType.REMOVE_FOLLOWER_FROM_TASK]: [
    /(?:remove|delete|unassign|take off).+(?:follower|watcher|subscriber|user|person).+(?:from).+(?:task|to-?do|item)/i,
    /unfollow.+task/i,
    /unsubscribe.+(?:from).+task/i,
  ],

  // Due Date operations (Epic 3.1)
  [AsanaOperationType.SET_TASK_DUE_DATE]: [
    /(?:set|change|update)\s+.*?\b(?:due date|deadline)\b.*?\s(?:to|for)\s+(?:(?:['"][^'"]+['"])|(?:.*?\b(?:task|to-?do)\b)).*?/i,
    /(?:make|task|to-?do).+(?:due|deadline).+(?:on|by|at)/i,
    /(?:due date|deadline).+(?:for).+(?:task|to-?do).+(?:is|to)/i,
  ],

  // Subtask operations (Epic 3.1)
  [AsanaOperationType.ADD_SUBTASK]: [
    /(?:add|create|make).+(?:sub-?task|child task|item under).+(?:to|for|under|on).+(?:task|item|parent)/i,
    /(?:add|create|make).+(?:sub-?task|child task).+named.+for.+task/i,
  ],

  [AsanaOperationType.LIST_SUBTASKS]: [
    /(?:list|show|get|fetch|display).+(?:sub-?tasks|child tasks|items under|sub-items).+(?:for|of|in|under).+(?:task|item|parent)/i,
    /(?:what|which).+(?:sub-?tasks|child tasks|items under|sub-items).+(?:for|of|in|under).+(?:task|item|parent)/i,
    /(?:sub-?tasks|child tasks|items under|sub-items).+(?:for|of|in|under).+task\s*[\'\"]([^\'\"]+)[\'\"]/i, // subtasks for task \'Parent Task Name\'
    /(?:sub-?tasks|child tasks|items under|sub-items).+(?:for|of|in|under).+task\s*(\d{16,})/i, // subtasks for task 12345...
  ],

  [AsanaOperationType.ADD_TASK_DEPENDENCY]: [
    /(?:make|set|add).+task\s*['"]?([^"']+)['"]?.+dependent\s+on.+task\s*['"]?([^"']+)['"]?/i, // make task A dependent on task B
    /(?:make|set|add).+task\s*(\d{16,}).+dependent\s+on.+task\s*(\d{16,})/i, // make task GID1 dependent on task GID2
    /(?:task\s*['"]?([^"']+)['"]?|task\s*(\d{16,})).+(?:depends on|is blocked by).+(?:task\s*['"]?([^"']+)['"]?|task\s*(\d{16,}))/i, // Task A depends on Task B
    /(?:block|precede).+task\s*['"]?([^"']+)['"]?.+with.+task\s*['"]?([^"']+)['"]?/i, // block task B with task A (A blocks B)
  ],

  [AsanaOperationType.REMOVE_TASK_DEPENDENCY]: [
    /(?:remove|clear|unset|delete).+dependency.+between.+task.+and.+task/i,
    /(?:remove|clear|unset|delete).+dependency.+for.+task\s*['"]?([^"']+)['"]?.+from.+task\s*['"]?([^"']+)['"]?/i,
    /(?:make|set).+task\s*['"]?([^"']+)['"]?.+no longer dependent on.+task\s*['"]?([^"']+)['"]?/i,
    /(?:task\s*['"]?([^"']+)['"]?|task\s*(\d{16,})).+no longer depends on.+/i,
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
