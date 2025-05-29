/**
 * AI Tools Index
 *
 * This file exports all available AI tools for use in the agent system.
 */

import { getFileContentsTool } from './getFileContentsTool';
import { listDocumentsTool } from './listDocumentsTool';
import { searchInternalKnowledgeBase } from './search-internal-knowledge-base';
import { getWeatherTool } from './get-weather';
import { createDocumentTool } from './create-document';
import { requestSuggestionsTool } from './request-suggestions';
import { updateDocumentTool } from './update-document';
import { tavilySearchTool } from './tavily-search';
import { getMessagesFromOtherChatTool } from './getMessagesFromOtherChatTool';
import { googleCalendarTool } from './googleCalendarTool';
import { createAsanaFunctionCallingTools } from './asana/function-calling-tools'; // Modern LLM function calling tools

// Create Asana tool instances with proper function calling
const asanaTools = createAsanaFunctionCallingTools();

// Export all available tools
export const availableTools = [
  listDocumentsTool,
  getFileContentsTool,
  searchInternalKnowledgeBase,
  getWeatherTool,
  createDocumentTool,
  requestSuggestionsTool,
  updateDocumentTool,
  tavilySearchTool,
  getMessagesFromOtherChatTool,
  googleCalendarTool,
  ...asanaTools, // Modern Asana tools with LLM function calling, semantic resolution, error recovery
];

export {
  getFileContentsTool,
  listDocumentsTool,
  searchInternalKnowledgeBase,
  getWeatherTool,
  createDocumentTool,
  requestSuggestionsTool,
  updateDocumentTool,
  tavilySearchTool,
  getMessagesFromOtherChatTool,
  googleCalendarTool,
  asanaTools, // Modern Asana function calling tools
};
