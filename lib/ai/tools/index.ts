/**
 * AI Tools Index
 *
 * This file exports all available AI tools for use in the agent system.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// Import all tools
import { createDocumentTool } from './create-document';
import { updateDocumentTool } from './update-document';
import { listDocumentsTool } from './listDocumentsTool';
import { getFileContentsTool } from './getFileContentsTool';
import { queryDocumentRowsTool } from './query-document-rows';
import { searchInternalKnowledgeBase } from './search-internal-knowledge-base';
import { requestSuggestionsTool } from './request-suggestions';
import { getWeatherTool } from './get-weather';
import { tavilySearchTool } from './tavily-search';
import { tavilyExtractTool } from './tavilyExtractTool';
import { googleCalendarTool } from './googleCalendarTool';
import { getMessagesFromOtherChatTool } from './getMessagesFromOtherChatTool';

// Import Asana tools from the asana directory
import { createAsanaFunctionCallingTools } from './asana/function-calling-tools';

// Create Asana tool instances
const asanaTools = createAsanaFunctionCallingTools();

// Create a tool to check for uploaded content before using knowledge base
const checkUploadedContentTool = new DynamicStructuredTool({
  name: 'checkUploadedContent',
  description:
    'Check if recently uploaded document content is available in the current context before using knowledge base tools. Use this when users reference uploaded documents.',
  schema: z.object({
    userQuery: z
      .string()
      .describe('The user query referencing uploaded content'),
  }),
  func: async ({ userQuery }) => {
    // This tool should be used to remind the AI to check context
    return {
      message:
        'IMPORTANT: Before using knowledge base tools, check your context for ### 🔴 UPLOADED DOCUMENT sections. If uploaded content exists, use it directly instead of searching the knowledge base.',
      guidance:
        'Look for content marked with 🔴 in your current conversation context. This indicates recently uploaded documents that should be used for analysis.',
      userQuery: userQuery,
    };
  },
});

// Enhanced wrapper for knowledge base tools to prevent misuse
const createKnowledgeBaseWrapper = (originalTool: any, toolName: string) => {
  return new DynamicStructuredTool({
    name: originalTool.name,
    description: `${originalTool.description} ⚠️ WARNING: Only use this tool if NO uploaded content (🔴 UPLOADED DOCUMENT) is available in the current context.`,
    schema: originalTool.schema,
    func: async (input) => {
      console.log(
        `[${toolName}] Tool called - should check for uploaded content first`,
      );
      return originalTool.func(input);
    },
  });
};

// Wrap knowledge base tools with warnings
const wrappedListDocuments = createKnowledgeBaseWrapper(
  listDocumentsTool,
  'listDocuments',
);
const wrappedGetFileContents = createKnowledgeBaseWrapper(
  getFileContentsTool,
  'getFileContents',
);

// Create recently uploaded content tool
const getRecentlyUploadedContentTool = new DynamicStructuredTool({
  name: 'getRecentlyUploadedContent',
  description:
    'Access recently uploaded document content from the current session. Use this instead of knowledge base tools when users reference uploaded files.',
  schema: z.object({
    query: z.string().describe('Query about the uploaded content'),
  }),
  func: async ({ query }) => {
    return {
      message:
        'Check your current conversation context for sections marked with ### 🔴 UPLOADED DOCUMENT. This content was recently uploaded and should be used for analysis.',
      query: query,
    };
  },
});

export const availableTools = [
  createDocumentTool,
  updateDocumentTool,
  wrappedListDocuments,
  wrappedGetFileContents,
  queryDocumentRowsTool,
  searchInternalKnowledgeBase,
  requestSuggestionsTool,
  getWeatherTool,
  tavilySearchTool,
  tavilyExtractTool,
  googleCalendarTool,
  getMessagesFromOtherChatTool,
  checkUploadedContentTool,
  getRecentlyUploadedContentTool,
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
