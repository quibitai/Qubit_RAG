/**
 * AI Tools Index
 *
 * This file exports all available AI tools for use in the agent system.
 */

import { getFileContentsTool } from './getFileContentsTool';
import { listDocumentsTool } from './listDocumentsTool';
import { searchInternalKnowledgeBase } from './search-internal-knowledge-base';
import { getWeatherTool } from './get-weather';

// Export all available tools
export const availableTools = [
  listDocumentsTool,
  getFileContentsTool,
  searchInternalKnowledgeBase,
  getWeatherTool,
];

export {
  getFileContentsTool,
  listDocumentsTool,
  searchInternalKnowledgeBase,
  getWeatherTool,
};
