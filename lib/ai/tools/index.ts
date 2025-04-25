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

// Export all available tools
export const availableTools = [
  listDocumentsTool,
  getFileContentsTool,
  searchInternalKnowledgeBase,
  getWeatherTool,
  createDocumentTool,
];

export {
  getFileContentsTool,
  listDocumentsTool,
  searchInternalKnowledgeBase,
  getWeatherTool,
  createDocumentTool,
};
