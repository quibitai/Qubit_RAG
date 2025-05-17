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
import { n8nMcpGatewayTool } from './n8nMcpGatewayTool';
import { asanaTool } from './asanaTool';

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
  n8nMcpGatewayTool,
  asanaTool,
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
  n8nMcpGatewayTool,
  asanaTool,
};
