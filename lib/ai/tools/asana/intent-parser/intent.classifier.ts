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

    // Outstanding/incomplete task patterns (high priority)
    /(?:show|list|get|display).+(?:outstanding|incomplete|open|pending|active).+(?:tasks|items|work)/i,
    /(?:outstanding|incomplete|open|pending|active).+(?:tasks|items|work).+(?:for|in|on)/i,
    /(?:what|which).+(?:outstanding|incomplete|open|pending|active).+(?:tasks|items|work)/i,

    // Project-specific task patterns
    /(?:show|list|get|display).+(?:tasks|items|work).+(?:for|in|on).+(?:project|that project)/i,
    /(?:tasks|items|work).+(?:for|in|on).+(?:project|that project)/i,

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
    /(?:what's|what are).+(?:[a-zA-Z]+(?:(?:'s)?)).+(?:tasks|work|assignments)/i,
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

  // Project operations - GET_PROJECT_DETAILS is now here, before user operations
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

  [AsanaOperationType.GET_PROJECT_DETAILS]: [
    // High-priority specific patterns for project details
    /(?:show|get|display|fetch|retrieve|give me).*(?:details|info|information|data|status).*(?:for|of|about|on)\s+(?:the\s+)?(?:project\s+)?["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?(?:\s+project)?(?:\s+on\s+asana)?/i,
    /(?:project\s+)?details.*(?:for|of|about|on)\s+(?:the\s+)?(?:project\s+)?["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?/i,
    /(?:what\s+(?:is|are)|tell me about).*(?:the\s+)?(?:project\s+)?["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?(?:\s+project)?/i,
    /(?:status|info|information|data).*(?:for|of|about|on)\s+(?:the\s+)?(?:project\s+)?["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?(?:\s+project)?/i,
    // Specific format: "project details for X" or "details for project X"
    /project\s+details\s+for\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?/i,
    /details\s+for\s+(?:the\s+)?project\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?/i,
    // Handle "show me the details of the X project"
    /(?:show|get|display|fetch|retrieve|give me).*(?:details|info|information|data|status).*(?:of|about)\s+(?:the\s+)?["']?([^"'\s]+(?:\s+[^"'\s]+)*)["']?\s+project/i,
  ],

  [AsanaOperationType.LIST_PROJECTS]: [
    // Original patterns
    /(?:list|show|display|get|fetch).+(?:projects)/i,
    /(?:what|which).+(?:projects)/i,
    /(?:find|search).+(?:projects)/i,

    // Conversational patterns
    /(?:can you|please).+(?:show|list|display).+(?:projects)/i,
    /(?:i want to see|let me see|show me).+(?:projects)/i,
    /(?:what projects|show all projects)/i,
  ],

  [AsanaOperationType.UPDATE_PROJECT]: [
    // Original patterns
    /(?:update|edit|modify|change).+(?:project)/i,
    /(?:change|update|modify).+(?:project).+(?:name|description|status|owner|team)/i,

    // Conversational patterns
    /(?:can you|please|help me).+(?:update|edit|change|modify).+(?:project)/i,
    /(?:i need to|let's|we should).+(?:update|edit|change|modify).+(?:project)/i,
  ],

  // Section Operations
  [AsanaOperationType.LIST_PROJECT_SECTIONS]: [
    /(?:list|show|get|fetch|display).+(?:sections|columns|stages).+(?:in|for|of|within).+project/i,
    /(?:what|which).+(?:sections|columns|stages).+(?:in|for|of|within).+project/i,
    /(?:sections|columns|stages).+(?:for|of|in|within).+project/i,
  ],

  [AsanaOperationType.CREATE_PROJECT_SECTION]: [
    /(?:create|add|make|new).+(?:section|column|stage).+(?:in|for|to).+project/i,
    /(?:add|create|make).+(?:section|column|stage).+(?:called|named|titled)/i,
  ],

  [AsanaOperationType.MOVE_TASK_TO_SECTION]: [
    /(?:move|transfer|send|put).+task.+(?:to|into|under).+(?:section|column|stage)/i,
    /(?:change|update|set).+task.+(?:section|column|stage).+to/i,
  ],

  // User operations (frequently used, placed after more specific project/task operations)
  [AsanaOperationType.GET_USER_ME]: [
    // Original patterns
    /(?:who am i|my profile|my details|my user info)/i,
    /(?:get|show|display|fetch).+(?:my|current).+(?:user|profile|details|info)/i,
    /(?:what is|what's).+(?:my|current).+(?:user id|email|name)/i,
  ],

  [AsanaOperationType.GET_USER_DETAILS]: [
    // Specific user detail patterns - must explicitly mention "user", "person", "member" or be an email
    /(?:show|get|display|find|lookup)\s+(?:user|person|member|profile)\s+(?:details|info|data).*(?:for|of|about)\s+["']?([^"']+)["']?/i,
    /(?:user|person|member)\s+["']?([^"']+)["']?.*(?:profile|details|info|data)/i,
    /(?:profile|details|info|data).*(?:for|of|about)\s+(?:user|person|member)\s+["']?([^"']+)["']?/i,

    // Email-specific patterns (clearly a user lookup)
    /(?:show|get|display|find|lookup).+(?:profile|details|info|data).*(?:for|of|about)\s+([\w.\-]+@[\w.\-]+\.[a-zA-Z]{2,})/i,

    // Conversational patterns - must explicitly mention user/person/member
    /(?:can you show|please show|what is|what's|tell me).*(?:profile|details|info|data).*(?:for|of|about)\s+(?:user|person|member)\s+["']?([^"']+)["']?/i,

    // "Who is" patterns - but only if not followed by project-related context
    /(?:who is|find user|look up user)\s+["']?([^"']+)["']?(?!\s+(?:project|task|lead|manager|owner|responsible))/i,

    // Direct user reference with possessive
    /["']?([^"']+)["']?(?:'s|s')\s+(?:profile|details|info|user\s+(?:profile|details|info))/i,
  ],

  [AsanaOperationType.LIST_WORKSPACE_USERS]: [
    /(?:list|show|get|fetch|display).+(?:all|every|the).+(?:users|people|members|team members).+(?:in|on|for|within).+(?:workspace|organization|team)/i,
    /(?:what|who).+(?:users|people|members|team members).+(?:in|on|for|within).+(?:workspace|organization|team)/i,
    /(?:users|people|members|team members).+(?:in|on|for|within).+(?:workspace|organization|team)/i,
  ],

  // Search operations (general, can be lower priority)
  [AsanaOperationType.SEARCH_ASANA]: [
    // Original patterns
    /(?:search|find|look up|locate).+(?:in|on|within).+(?:asana)/i,
    /(?:search|find|look up|locate).+(?:for)/i,

    // Conversational patterns
    /(?:can you|please|help me).+(?:search|find|look for|locate)/i,
    /(?:i need to|let's|we should).+(?:search|find|look for)/i,
  ],

  // Task completion/status operations (medium priority)
  [AsanaOperationType.COMPLETE_TASK]: [
    // Original patterns
    /(?:complete|finish|done|mark as complete|close).+(?:task|to-?do|item)/i,
    /(?:task|to-?do|item).+(?:complete|finish|done)/i,

    // Conversational patterns
    /(?:can you|please).+(?:complete|finish|close|mark).+(?:task|item)/i,
    /(?:i want to|let's).+(?:complete|finish|close).+(?:task|item)/i,
  ],

  [AsanaOperationType.MARK_TASK_INCOMPLETE]: [
    // Original patterns
    /(?:reopen|mark as incomplete|uncheck|undo complete|set to incomplete).+(?:task|to-?do|item)/i,
    /(?:task|to-?do|item).+(?:reopen|mark as incomplete|uncheck)/i,

    // Conversational patterns
    /(?:can you|please).+(?:reopen|uncheck|mark as incomplete).+(?:task|item)/i,
    /(?:i want to|let's).+(?:reopen|uncheck|mark as incomplete).+(?:task|item)/i,
  ],

  // Follower operations
  [AsanaOperationType.ADD_FOLLOWER_TO_TASK]: [
    /(?:add|include|assign).+(?:follower|watcher|subscriber).+(?:to|for).+task/i,
    /(?:follow|watch|subscribe to).+task/i,
  ],

  [AsanaOperationType.REMOVE_FOLLOWER_FROM_TASK]: [
    /(?:remove|unassign|delete).+(?:follower|watcher|subscriber).+(?:from|on).+task/i,
    /(?:unfollow|unwatch|unsubscribe from).+task/i,
  ],

  // Due date operations
  [AsanaOperationType.SET_TASK_DUE_DATE]: [
    /(?:set|change|update).+(?:due date|deadline|due by|due on).+(?:for|to).+task/i,
    /(?:task|item).+(?:due date|deadline).+(?:to|is|set to)/i,
  ],

  // Dependency Operations
  [AsanaOperationType.ADD_TASK_DEPENDENCY]: [
    /(?:add|create|make|set).+(?:dependency|blocking task|predecessor).+(?:for|on|to).+task/i,
    /(?:task|item).+(?:depends on|is blocked by|requires).+task/i,
  ],

  [AsanaOperationType.REMOVE_TASK_DEPENDENCY]: [
    /(?:remove|delete|clear).+(?:dependency|blocking task|predecessor).+(?:for|on|from).+task/i,
    /(?:task|item).+(?:no longer depends on|is no longer blocked by)/i,
  ],

  // Fallback / Unknown (this is not a pattern, but a placeholder for the logic in classifyIntent)
  // [AsanaOperationType.UNKNOWN]: [],
};

// Order of intent checking. More specific intents should come before more generic ones.
// This is CRITICAL for correct intent classification.
const INTENT_CHECK_ORDER: AsanaOperationType[] = [
  // HIGHEST PRIORITY: Specific detail operations that could be confused with other operations
  AsanaOperationType.GET_PROJECT_DETAILS, // Must be first to avoid confusion with user details
  AsanaOperationType.GET_TASK_DETAILS,

  // Specific task modifications
  AsanaOperationType.ADD_SUBTASK,
  AsanaOperationType.LIST_SUBTASKS,

  // LIST_TASKS must come before COMPLETE_TASK to avoid misclassification
  AsanaOperationType.LIST_TASKS,

  AsanaOperationType.COMPLETE_TASK,
  AsanaOperationType.MARK_TASK_INCOMPLETE,
  AsanaOperationType.SET_TASK_DUE_DATE,
  AsanaOperationType.ADD_FOLLOWER_TO_TASK,
  AsanaOperationType.REMOVE_FOLLOWER_FROM_TASK,
  AsanaOperationType.ADD_TASK_DEPENDENCY,
  AsanaOperationType.REMOVE_TASK_DEPENDENCY,
  AsanaOperationType.MOVE_TASK_TO_SECTION, // Section-related task op
  AsanaOperationType.UPDATE_TASK, // General update
  AsanaOperationType.DELETE_TASK,

  // Project section operations (before general project CRUD to catch specifics)
  AsanaOperationType.CREATE_PROJECT_SECTION,
  AsanaOperationType.LIST_PROJECT_SECTIONS,

  // Core CRUD for tasks and projects
  AsanaOperationType.CREATE_TASK,

  AsanaOperationType.CREATE_PROJECT,
  AsanaOperationType.LIST_PROJECTS,
  AsanaOperationType.UPDATE_PROJECT,

  // User operations (can be broad, so check after specifics)
  AsanaOperationType.GET_USER_ME,
  AsanaOperationType.GET_USER_DETAILS, // Now safely after GET_PROJECT_DETAILS
  AsanaOperationType.LIST_WORKSPACE_USERS,

  // General search (broadest)
  AsanaOperationType.SEARCH_ASANA,
];

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

  // Check for each intent pattern in priority order
  for (const operationType of INTENT_CHECK_ORDER) {
    const patterns =
      INTENT_PATTERNS[operationType as keyof typeof INTENT_PATTERNS];
    if (patterns) {
      for (const pattern of patterns) {
        if (pattern.test(lowerInput)) {
          return operationType;
        }
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
