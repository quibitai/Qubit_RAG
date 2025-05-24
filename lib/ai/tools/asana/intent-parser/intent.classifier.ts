/**
 * Intent classifier for Asana operations
 */

import { AsanaOperationType } from './types';

/**
 * Check if the input is a confirmation response
 */
function isConfirmationResponse(input: string): boolean {
  const confirmationPatterns = [
    /^(?:yes|yep|yeah|confirm|confirmed|ok|okay|sure|proceed|go ahead|do it)$/i,
    /^(?:yes|yep|yeah|confirm|confirmed|ok|okay|sure|proceed|go ahead|do it)[.,!]*$/i,
  ];

  return confirmationPatterns.some((pattern) => pattern.test(input.trim()));
}

/**
 * Check if the input is selecting a project by name or GID
 */
function isProjectSelectionResponse(input: string): boolean {
  const lowerInput = input.toLowerCase().trim();

  // Check for project GID (16+ digit number)
  if (/^\d{16,}$/.test(input.trim())) {
    return true;
  }

  // Check for explicit project selection patterns
  if (
    lowerInput.startsWith('echo tango') ||
    lowerInput === 'echo tango' ||
    lowerInput.includes('project:') ||
    lowerInput.includes('use project') ||
    lowerInput.includes('select project')
  ) {
    return true;
  }

  // Check if input matches a numbered option from a project list (e.g., "3", "option 3")
  if (/^(?:option\s+)?\d+$/i.test(lowerInput)) {
    return true;
  }

  return false;
}

/**
 * Check if the input is about assignment ("assign it to me", etc.)
 */
function isAssignmentResponse(input: string): boolean {
  const lowerInput = input.toLowerCase().trim();

  return (
    lowerInput.includes('assign it to me') ||
    lowerInput.includes('assign to me') ||
    lowerInput === 'assign it to me' ||
    lowerInput === 'assign to me' ||
    lowerInput === 'me'
  );
}

/**
 * Check if input contains specific project identification
 */
function containsSpecificProject(input: string): boolean {
  const lowerInput = input.toLowerCase();

  // Look for quoted project names or specific project identifiers
  return (
    /['"]([^'"]+)['"]/.test(input) ||
    /echo\s+tango/i.test(input) ||
    /project\s*[:=]\s*(\w+)/i.test(input) ||
    /^\d{16,}$/.test(input.trim())
  );
}

// Regex patterns for matching different intents
const INTENT_PATTERNS = {
  // Subtask operations (moved up for better priority over CREATE_TASK)
  [AsanaOperationType.ADD_SUBTASK]: [
    // Original patterns
    /(?:add|create|make).+(?:sub-?task|child task|item under).+(?:to|for|under|on).+(?:task|item|parent)/i,
    /(?:add|create|make).+(?:sub-?task|child task).+named.+for.+task/i,

    // Enhanced subtask patterns - more specific and early detection
    /(?:add|create|make).+(?:subtask|sub-task|child task).+(?:called|named|titled)/i,
    /(?:add|create|make).+(?:subtask|sub-task).+(?:for|to|under)/i,
    /(?:subtask|sub-task|child task).+(?:for|to|under|on)/i,

    // Conversational patterns
    /(?:can you|please).+(?:add|create).+(?:subtask|sub-task|child task)/i,
    /(?:i need|we need).+(?:subtask|sub-task|breakdown)/i,
    /(?:break down|split).+(?:task|item).+(?:into|with)/i,

    // Direct patterns that should catch the user's request
    /add\s+a\s+subtask/i,
    /create\s+a\s+subtask/i,
    /make\s+a\s+subtask/i,
  ],

  [AsanaOperationType.LIST_SUBTASKS]: [
    // Original patterns
    /(?:list|show|get|fetch|display).+(?:sub-?tasks|child tasks|items under|sub-items).+(?:for|of|in|under).+(?:task|item|parent)/i,
    /(?:what|which).+(?:sub-?tasks|child tasks|items under|sub-items).+(?:for|of|in|under).+(?:task|item|parent)/i,
    /(?:sub-?tasks|child tasks|items under|sub-items).+(?:for|of|in|under).+task\s*[\'\"]([^\'\"]+)[\'\"]/i,
    /(?:sub-?tasks|child tasks|items under|sub-items).+(?:for|of|in|under).+task\s*(\d{16,})/i,

    // Conversational patterns
    /(?:can you show|please show).+(?:subtasks|sub-tasks|child tasks)/i,
    /(?:what are|show me).+(?:subtasks|sub-tasks|breakdown)/i,
    /(?:what's under|what's in).+(?:task|item)/i,
  ],

  // Task operations (most common - ordered after subtasks for proper precedence)
  [AsanaOperationType.CREATE_TASK]: [
    // Original patterns
    /(?:create|add|make|new)(?:.+?)(?:task|to-?do)/i,
    /(?:add|create).+(?:to|in|on).+(?:asana)/i,

    // Conversational patterns
    /(?:can you|please|help me).+(?:create|add|make).+(?:task|todo|to-do|item)/i,
    /(?:i need to|let's|we should).+(?:create|add|make).+(?:task|todo|to-do|item)/i,
    /(?:set up|build|generate).+(?:task|todo|to-do|item|action item)/i,

    // Business terminology
    /(?:create|add|make|new).+(?:action item|deliverable|milestone|follow.?up)/i,
    /(?:track|capture|record).+(?:action|item|deliverable|work)/i,

    // Question formats
    /(?:how do i|can i).+(?:create|add|make).+(?:task|todo|item)/i,
    /(?:what's the way to|how to).+(?:create|add).+(?:task|item)/i,

    // Casual/shortened forms
    /(?:add|create|make|new).+(?:todo|item|thing)/i,
    /(?:put|add).+(?:in|on|to).+(?:my|the).+(?:list|board|asana)/i,
  ],

  [AsanaOperationType.LIST_TASKS]: [
    // Original patterns
    /(?:list|show|display|get|fetch).+(?:tasks|to-?dos)/i,
    /(?:what|which).+(?:tasks|to-?dos)/i,
    /(?:find|search).+(?:tasks|to-?dos)/i,

    // Conversational patterns
    /(?:can you|please).+(?:show|list|display).+(?:tasks|todos|items)/i,
    /(?:i want to see|let me see|show me).+(?:tasks|todos|items|work)/i,
    /(?:what do i have|what's on my).+(?:plate|list|agenda|tasks)/i,

    // Question formats
    /(?:what|which).+(?:tasks|todos|items|work).+(?:do i have|are assigned|need to)/i,
    /(?:what's|what are).+(?:my|all|the).+(?:tasks|todos|items|assignments)/i,
    /(?:can you show|could you display).+(?:tasks|work|todos)/i,

    // Business terminology
    /(?:show|list|display).+(?:action items|deliverables|assignments|workload)/i,
    /(?:what's|show me).+(?:my|our).+(?:workload|assignments|action items)/i,

    // User-specific requests
    /(?:show|list|get).+(?:tasks|work|items).+(?:for|assigned to|belonging to).+/i,
    /(?:what's|what are).+(?:[a-zA-Z]+(?:'s)?).+(?:tasks|work|assignments)/i,
  ],

  [AsanaOperationType.UPDATE_TASK]: [
    // Original patterns
    /(?:update|edit|modify|change)\s+(?:(?:['"][^'"]+['"])|(?:.*?\b(?:task|to-?do)\b))/i,
    /(?:change|update|modify).+(?:description|notes|details|status).+(?:task|to-?do)/i,

    // Conversational patterns
    /(?:can you|please|help me).+(?:update|edit|change|modify).+(?:task|item)/i,
    /(?:i need to|let's|we should).+(?:update|edit|change|modify).+(?:task|item)/i,

    // Specific field updates
    /(?:update|change|edit|modify).+(?:task|item).+(?:name|title|description|notes|status)/i,
    /(?:rename|retitle).+(?:task|item)/i,
    /(?:revise|adjust|tweak).+(?:task|item)/i,
  ],

  [AsanaOperationType.DELETE_TASK]: [
    // Basic delete patterns
    /(?:delete|remove|erase).+(?:task|to-?do|item)/i,
    /(?:task|to-?do|item).+(?:delete|remove|erase)/i,

    // Conversational patterns
    /(?:can you|please|help me).+(?:delete|remove|erase).+(?:task|item)/i,
    /(?:i need to|let's|we should).+(?:delete|remove|erase).+(?:task|item)/i,
    /(?:get rid of|throw away|eliminate).+(?:task|item)/i,

    // Casual language
    /(?:trash|bin|ditch).+(?:task|item)/i,
    /(?:cancel|drop).+(?:task|item)/i,

    // Specific formats
    /delete\s+["']?([^"']+)["']?\s+(?:task|item)/i,
    /remove\s+(?:the\s+)?(?:task|item).+(?:named|called)/i,
  ],

  // User operations (frequently used)
  [AsanaOperationType.GET_USER_ME]: [
    // Original patterns
    /(?:my|current|own).+(?:info|profile|details|user)/i,
    /(?:who am i|about me)/i,
    /(?:show|get|display).+(?:my|current).+(?:info|profile|user)/i,

    // Conversational patterns
    /(?:can you show|please show).+(?:my|current).+(?:profile|info|details)/i,
    /(?:what's|what is).+(?:my|current).+(?:profile|info|account)/i,
    /(?:tell me about|show me).+(?:myself|my account|my profile)/i,
  ],

  [AsanaOperationType.LIST_WORKSPACE_USERS]: [
    // Original patterns
    /(?:list|show|display|get|all).+(?:users|members|people|team members?|colleagues).+(?:workspace|organization|team)/i,
    /(?:list|show|display|get|all).+(?:workspace|organization|team).+(?:users|members|people|team members?)/i,
    /(?:who|what).+(?:users|members|people|team members?).+(?:workspace|organization|team)/i,
    /(?:all|show me).+(?:users|members|people|team members?).+(?:my|our|the).+(?:workspace|organization|team)/i,
    /(?:team|workspace|organization).+(?:members?|users|people)/i,

    // Conversational patterns
    /(?:can you show|please show).+(?:who's|who is).+(?:on|in).+(?:team|workspace)/i,
    /(?:i want to see|show me).+(?:team|colleagues|people|members)/i,
    /(?:who's|who is|who are).+(?:on|in).+(?:our|my|the).+(?:team|workspace|organization)/i,

    // Question formats
    /(?:who|what).+(?:people|colleagues|team members).+(?:work here|are available)/i,
    /(?:can you list|could you show).+(?:team|people|members)/i,
  ],

  [AsanaOperationType.GET_USER_DETAILS]: [
    // Original patterns
    /(?:show|get|display|find|lookup).+(?:profile|details|info).*(?:for|of|about)\s+["']?([^"']+)["']?/i,
    /(?:user|person|member)\s+["']?([^"']+)["']?.*(?:profile|details|info)/i,
    /(?:profile|details|info).*(?:for|of|about)\s+["']?([^"']+)["']?/i,
    /["']?([^"']+)["']?(?:'s)?\s+(?:profile|details|info|user)/i,

    // Conversational patterns
    /(?:can you show|please show).+(?:profile|info|details).+(?:for|about).+/i,
    /(?:tell me about|what about|who is).+/i,
    /(?:i want to see|show me).+(?:profile|info|details)/i,
  ],

  [AsanaOperationType.GET_TASK_DETAILS]: [
    // Original patterns
    /(?:get|show|display|fetch|retrieve).+(?:details|info|information|data).+(?:task|to-?do)/i,
    /(?:details|info|information|data).+(?:about|for|on|of).+(?:task|to-?do)/i,
    /what.+(?:details|info).+(?:task|to-?do)/i,
    /(?:get|show|display|fetch|retrieve).+task.+gid\s*\d{16}/i,
    /(?:get|show|display|fetch|retrieve).+task.+asana\.com\/0\/\d+\/(\d+)/i,
    /task\s*\d{16}/i,
    /task.+asana\.com\/0\/\d+\/(\d+)/i,

    // Conversational patterns
    /(?:can you show|please show).+(?:details|info|more).+(?:about|for).+(?:task|item)/i,
    /(?:i want to see|show me).+(?:details|info|more).+(?:about|for).+(?:task|item)/i,
    /(?:tell me about|what about).+(?:task|item)/i,

    // Question formats
    /(?:what's|what is).+(?:this|that).+(?:task|item).+(?:about|doing)/i,
    /(?:more info|additional details).+(?:on|about|for).+(?:task|item)/i,
  ],

  [AsanaOperationType.COMPLETE_TASK]: [
    // Original patterns
    /(?:complete|finish|done|mark as complete|close).+(?:task|to-?do|item)/i,
    /(?:task|to-?do|item).+(?:complete|finish|done)/i,

    // Conversational patterns
    /(?:can you|please).+(?:mark|set).+(?:task|item).+(?:complete|done|finished)/i,
    /(?:i'm done with|finished with|completed).+(?:task|item)/i,
    /(?:mark|set|make).+(?:task|item).+(?:as )?(?:complete|done|finished)/i,

    // Casual language
    /(?:check off|cross off|tick off).+(?:task|item)/i,
    /(?:wrap up|close out).+(?:task|item)/i,
  ],

  // Project operations
  [AsanaOperationType.CREATE_PROJECT]: [
    // Original patterns
    /(?:create|add|make|new).+(?:project)/i,

    // Conversational patterns
    /(?:can you|please|help me).+(?:create|add|make|set up).+(?:project)/i,
    /(?:i need to|let's|we should).+(?:create|start|begin).+(?:project)/i,
    /(?:set up|build|establish|launch).+(?:project)/i,

    // Business terminology
    /(?:create|start|launch|initiate).+(?:new|fresh).+(?:project|initiative|campaign)/i,
    /(?:kick off|begin|start).+(?:project)/i,
  ],

  [AsanaOperationType.LIST_PROJECTS]: [
    // Original patterns
    /(?:list|show|display|get|fetch).+(?:projects)/i,
    /(?:what|which).+(?:projects)/i,
    /(?:find|search).+(?:projects)/i,

    // Conversational patterns
    /(?:can you show|please show).+(?:projects|what projects)/i,
    /(?:i want to see|show me).+(?:projects|what projects)/i,
    /(?:what|which).+(?:projects).+(?:do we have|are available|exist)/i,

    // Question formats
    /(?:what's|what are).+(?:all|our|the).+(?:projects)/i,
    /(?:can you list|could you display).+(?:projects)/i,
  ],

  [AsanaOperationType.UPDATE_PROJECT]: [
    // Original patterns
    /(?:update|edit|modify|change).+(?:project)/i,
    /(?:change|update|modify).+(?:description|notes|details|status).+(?:project)/i,

    // Conversational patterns
    /(?:can you|please).+(?:update|edit|change|modify).+(?:project)/i,
    /(?:i need to|let's).+(?:update|edit|change|modify).+(?:project)/i,
  ],

  // Search operations
  [AsanaOperationType.SEARCH_ASANA]: [
    // Original patterns
    /(?:search|find|look up|query).+(?:in|on|for).+(?:asana)/i,
    /(?:search|find|look up|query)\s*["']([^"']+)["'](?:\s*(?:in|on|for)\s*asana)?/i,
    /asana\s*(?:search|find|look up|query)\s*["']([^"']+)["']/i,
    /^(?:search|find|look up|query)\s+(?!task|project|user|team|portfolio|tag)/i,

    // Conversational patterns
    /(?:can you|please).+(?:search|find|look up).+(?:for|in)/i,
    /(?:i'm looking for|help me find|where is).+/i,
    /(?:i need to find|looking for).+/i,

    // Question formats
    /(?:where can i find|how do i find).+/i,
    /(?:do we have|is there).+/i,
  ],

  // Advanced task operations
  [AsanaOperationType.MARK_TASK_INCOMPLETE]: [
    // Original patterns
    /(?:reopen|uncheck|mark as incomplete|uncancel|undone).+(?:task|to-?do|item)/i,
    /(?:task|to-?do|item).+(?:reopen|uncheck|incomplete)/i,

    // Conversational patterns
    /(?:can you|please).+(?:reopen|uncheck|mark incomplete).+(?:task|item)/i,
    /(?:i need to|we should).+(?:reopen|uncheck).+(?:task|item)/i,
    /(?:not done|still working on|need more time).+(?:task|item)/i,
  ],

  // Follower operations
  [AsanaOperationType.ADD_FOLLOWER_TO_TASK]: [
    // Original patterns
    /(?:add|assign|include).+(?:follower|watcher|subscriber|user|person).+(?:to|on).+(?:task|to-?do|item)/i,
    /follow.+task/i,
    /subscribe.+(?:to).+task/i,

    // Conversational patterns
    /(?:can you|please).+(?:add|include).+(?:as|to be).+(?:follower|watcher)/i,
    /(?:i want|we need).+(?:to follow|following).+(?:task|item)/i,
    /(?:keep|get).+(?:in the loop|updated).+(?:on|about).+(?:task|item)/i,
  ],

  [AsanaOperationType.REMOVE_FOLLOWER_FROM_TASK]: [
    // Original patterns
    /(?:remove|delete|unassign|take off).+(?:follower|watcher|subscriber|user|person).+(?:from).+(?:task|to-?do|item)/i,
    /unfollow.+task/i,
    /unsubscribe.+(?:from).+task/i,

    // Conversational patterns
    /(?:can you|please).+(?:remove|take off).+(?:from|as).+(?:follower|watcher)/i,
    /(?:stop|don't).+(?:following|watching).+(?:task|item)/i,
    /(?:take me off|remove me from).+(?:task|item)/i,
  ],

  // Due date operations
  [AsanaOperationType.SET_TASK_DUE_DATE]: [
    // Original patterns
    /(?:set|change|update)\s+.*?\b(?:due date|deadline)\b.*?\s(?:to|for)\s+(?:(?:['"][^'"]+['"])|(?:.*?\b(?:task|to-?do)\b)).*?/i,
    /(?:make|task|to-?do).+(?:due|deadline).+(?:on|by|at)/i,
    /(?:due date|deadline).+(?:for).+(?:task|to-?do).+(?:is|to)/i,

    // Conversational patterns
    /(?:can you|please).+(?:set|make).+(?:due|deadline).+(?:for|on)/i,
    /(?:i need|we need).+(?:due|deadline).+(?:by|on|for)/i,
    /(?:schedule|plan).+(?:task|item).+(?:for|by|due)/i,
  ],

  // Dependency operations
  [AsanaOperationType.ADD_TASK_DEPENDENCY]: [
    /(?:make|set).+(?:task).+(?:dependent|depend)\s+on.+(?:task)/i,
    /(?:add|create).+(?:dependency|dependence).+(?:from|between).+(?:task).+(?:to|and).+(?:task)/i,
    /(?:block|blocking).+(?:task).+(?:until|on).+(?:task)/i,
    /(?:task).+(?:depends|depend)\s+on.+(?:task)/i,

    // Conversational patterns
    /(?:can you|please).+(?:make|set).+(?:dependent|depend)/i,
    /(?:i need|we need).+(?:dependency|dependence)/i,
    /(?:wait for|hold until).+(?:task|item)/i,
  ],

  [AsanaOperationType.REMOVE_TASK_DEPENDENCY]: [
    /(?:remove|delete|clear).+(?:dependency|dependence).+(?:from|between).+(?:task).+(?:to|and).+(?:task)/i,
    /(?:unblock|stop blocking).+(?:task)/i,
    /(?:make|set).+(?:task).+(?:independent|not depend)/i,

    // Conversational patterns
    /(?:can you|please).+(?:remove|clear).+(?:dependency|dependence)/i,
    /(?:free up|unblock).+(?:task|item)/i,
    /(?:no longer|don't).+(?:depend|block)/i,
  ],

  // Section operations
  [AsanaOperationType.LIST_PROJECT_SECTIONS]: [
    /(?:list|show|get|display).+(?:sections|columns).+(?:for|in|of).+(?:project)/i,
    /(?:what|which).+(?:sections|columns).+(?:in|for).+(?:project)/i,
    /(?:sections|columns).+(?:for|in|of).+(?:project)/i,

    // Conversational patterns
    /(?:can you show|please show).+(?:sections|columns)/i,
    /(?:what are|show me).+(?:sections|columns)/i,
    /(?:how is|what's).+(?:organized|structured)/i,
  ],

  [AsanaOperationType.CREATE_PROJECT_SECTION]: [
    /(?:create|add|make|new).+(?:section|column).+(?:in|for|to).+(?:project)/i,
    /(?:add|create).+(?:section|column).+(?:named|called).+(?:in|for|to).+(?:project)/i,

    // Conversational patterns
    /(?:can you|please).+(?:create|add).+(?:section|column)/i,
    /(?:i need|we need).+(?:section|column)/i,
    /(?:set up|organize).+(?:section|column)/i,
  ],

  [AsanaOperationType.MOVE_TASK_TO_SECTION]: [
    /(?:move|put|place|assign).+(?:task).+(?:to|in|into).+(?:section|column)/i,
    /(?:task).+(?:to|in|into).+(?:section|column)/i,
    /(?:change|update).+(?:task).+(?:section|column)/i,

    // Conversational patterns
    /(?:can you|please).+(?:move|put).+(?:task|item)/i,
    /(?:i want to|we should).+(?:move|place).+(?:task|item)/i,
    /(?:organize|categorize).+(?:task|item)/i,
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

  // Handle confirmations and context-aware responses first
  if (isConfirmationResponse(input)) {
    // This is a confirmation - assume it's continuing the previous CREATE_TASK operation
    return AsanaOperationType.CREATE_TASK;
  }

  // Handle project selection responses (GID, project name, or numbered options)
  if (isProjectSelectionResponse(input)) {
    return AsanaOperationType.CREATE_TASK;
  }

  // Handle assignment responses
  if (isAssignmentResponse(input)) {
    return AsanaOperationType.CREATE_TASK;
  }

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
