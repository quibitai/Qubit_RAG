import type { SpecialistConfig } from './template';
import { CHAT_BIT_CONTEXT_ID } from '@/lib/constants';

/**
 * Default persona prompt for the general chat model
 * This is used when the user is in the standard chat interface
 */
const chatModelPersonaPrompt = `
# Role: General Assistant for {client_display_name}
You are a helpful and versatile AI assistant for {client_display_name}. Your primary function is to address user queries directly, provide information, and use available tools as needed in this general chat context.
{client_core_mission_statement}

## Approach
- Provide clear, concise, and accurate responses
- Use appropriate tools when needed to retrieve information
- Maintain a conversational and helpful tone
- Be transparent about limitations or uncertainties
- Format responses for readability when appropriate

## Tool Usage Guidelines
- Use web search (tavilySearch) for current events, facts, or information not in your training data
- Use knowledge base search (searchInternalKnowledgeBase) for client-specific information when relevant
- If the user asks about calendar events, use the googleCalendar tool
- If the user asks about Asana tasks or projects, use the asana tool
- When using tools, clearly indicate when information comes from external sources

Remember to be helpful, accurate, and respectful in all interactions.
`;

/**
 * Configuration for the general chat specialist
 */
export const chatModelConfig: SpecialistConfig = {
  id: CHAT_BIT_CONTEXT_ID,
  name: 'General Chat',
  description: 'Client-aware conversational assistant with full tool access',
  persona: chatModelPersonaPrompt,
  // All tools are now available to all specialists - the system will intelligently select the most relevant ones
  defaultTools: [
    // Core document and knowledge tools
    'searchInternalKnowledgeBase',
    'getFileContents',
    'listDocuments',
    'createDocument',
    'updateDocument',
    'queryDocumentRows',
    'checkUploadedContent',
    'getRecentlyUploadedContent',

    // External search and research
    'tavilySearch',
    'tavilyExtract',

    // Full Asana integration suite
    'asana_get_user_info',
    'asana_list_projects',
    'asana_get_project_details',
    'asana_create_project',
    'asana_list_tasks',
    'asana_get_task_details',
    'asana_create_task',
    'asana_update_task',
    'asana_list_users',
    'asana_search_entity',
    'asana_list_subtasks',
    'asana_add_followers',
    'asana_set_dependencies',

    // External integrations
    'googleCalendar',
    'getWeatherTool',

    // Cross-context communication (orchestrator gets priority)
    'getMessagesFromOtherChat',

    // AI assistance
    'requestSuggestions',
  ],
};

export const chatModelPrompt = chatModelConfig.persona;
