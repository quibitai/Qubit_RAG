// lib/ai/prompts/tools/index.ts
import { knowledgeToolInstructions } from './knowledge';
import { webSearchToolInstructions } from './web-search';
import { dataAnalysisToolInstructions } from './data-analysis';
import { documentToolInstructions } from './documents';
// Import instructions for other tools as they are created

/**
 * Maps tool names (or categories) to their specific instruction snippets.
 * Ensure tool names here match the names used in SpecialistConfig.defaultTools
 * and the actual tool definitions in lib/ai/tools/index.ts
 */
const toolInstructionMap: Record<string, string> = {
  // Knowledge Base Tools
  searchInternalKnowledgeBase: knowledgeToolInstructions,
  getFileContents: knowledgeToolInstructions,
  listDocuments: knowledgeToolInstructions,

  // Web Search Tools
  tavilySearch: webSearchToolInstructions,

  // Data Analysis Tools
  queryDocumentRows: dataAnalysisToolInstructions,

  // Document Management Tools
  createDocument: documentToolInstructions,
  updateDocument: documentToolInstructions,

  // Integration Tools
  googleCalendar: `Use this tool ONLY for Google Calendar related tasks and operations. This tool is now dedicated to calendar management. For any calendar-related requests, provide a clear natural language description of what you need.`,

  // Asana Function Calling Tools
  asana_get_project_details: `Use this tool to get detailed information about a specific Asana project including description, status, milestones, and tasks. Use when users ask for project details, project overview, or project information. Provide the project name or GID as project_id.`,
  asana_list_projects: `Use this tool to list and discover projects in the Asana workspace. Use when users want to see available projects or find a project by name. Can filter by team or include archived projects.`,
  asana_create_task: `Use this tool to create new tasks in Asana. Provide task name, optional description, project, assignee, and due date. The tool handles semantic resolution of project and user names.`,
  asana_list_tasks: `Use this tool to list tasks from Asana with optional filtering by project, assignee, or completion status. Use when users want to see their tasks or tasks in a specific project.`,
  asana_update_task: `Use this tool to update existing tasks in Asana, such as marking them complete, changing due dates, or updating descriptions. Provide the task name or GID.`,
  asana_get_task_details: `Use this tool to get detailed information about a specific task including description, status, assignee, and project. Provide the task name or GID.`,
  asana_create_project: `Use this tool to create new projects in Asana. Provide project name, optional description, team, and other project settings.`,
  asana_list_users: `Use this tool to list users/members in the Asana workspace. Use when you need to find user information or see who's available for task assignment.`,
  asana_search_entity: `Use this tool to search for tasks, projects, or users using semantic matching. Use when you need to find entities by partial names or descriptions.`,

  // Other tools
  getMessagesFromOtherChat: `When retrieving messages from other chats, summarize the key points relevant to the user's current query. Note the source chat (e.g., "In the Echo Tango chat...").`,
  getWeather: `When providing weather information, state the location and key conditions (temperature, precipitation).`,
  requestSuggestions: `When suggestions are requested, confirm the request and mention that suggestions will appear in the document interface.`,

  // Add mappings for any other tools as needed
};

/**
 * Gathers unique instruction snippets for a given list of tool IDs.
 * This is used to provide context-relevant tool guidance within the main system prompt.
 * @param toolIds - Array of tool names available in the current context.
 * @returns A single string containing relevant, unique instructions, or an empty string if none apply.
 */
export function getToolPromptInstructions(toolIds: string[] = []): string {
  const relevantInstructions = new Set<string>();
  for (const toolId of toolIds) {
    const instruction = toolInstructionMap[toolId];
    if (instruction) {
      // Add the trimmed instruction to avoid extra whitespace issues
      relevantInstructions.add(instruction.trim());
    } else {
      console.warn(
        `[ToolInstructions] No specific instruction found for tool: ${toolId}`,
      );
    }
  }
  // Join the unique instructions with double newlines for better separation
  return Array.from(relevantInstructions).join('\n\n');
}
