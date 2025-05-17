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
  n8nMcpGateway: `Use this tool ONLY for Google Calendar related tasks and operations. This tool is now dedicated to calendar management. For any calendar-related requests, provide a clear natural language description of what you need.`,
  asana: `DEPRECATED - Do not use this tool. Use 'nativeAsana' instead for all Asana operations.`,
  nativeAsana: `IMPORTANT: Use this tool for ALL Asana-related tasks and operations, such as creating, listing, or updating tasks and projects. This tool provides a direct connection to the Asana API. Provide a clear, natural language description of what you need (e.g., "List all my incomplete tasks in Asana").`,

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
