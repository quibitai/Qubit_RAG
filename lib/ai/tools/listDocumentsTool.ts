/**
 * List Documents Tool for Langchain
 *
 * Wraps the listDocumentsLogic function into a Langchain DynamicStructuredTool
 * for use within a Langchain agent.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { listDocumentsLogic } from './googleDrive';

// Define the input schema for the listDocuments tool
const listDocumentsSchema = z.object({
  folderId: z
    .string()
    .optional()
    .describe(
      'The ID of the Google Drive folder to list files from. Defaults to the primary knowledge base folder if omitted.',
    ),
});

/**
 * Langchain tool for listing available documents in a Google Drive folder
 *
 * This tool allows an AI agent to retrieve a list of documents available
 * for reference in the knowledge base.
 */
export const listDocumentsTool = new DynamicStructuredTool({
  name: 'listDocuments',
  description:
    'Lists documents available in the primary knowledge base Google Drive folder. Use this when you need to see what documents are available for reference.',
  schema: listDocumentsSchema,
  func: async ({ folderId }) => {
    try {
      // Use the provided folderId or let the logic function use the default
      const result = await listDocumentsLogic(folderId);

      // Agents expect string results from tools
      return JSON.stringify(result.documents);
    } catch (error: any) {
      console.error(`Error in listDocuments tool: ${error.message}`);
      return `Failed to list documents: ${error.message}`;
    }
  },
});
