/**
 * Get File Contents Tool for Langchain
 *
 * Wraps the getFileContentsLogic function into a Langchain DynamicStructuredTool
 * for use within a Langchain agent.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { getFileContentsLogic } from './googleDrive'; // Ensure this path is correct

// Define the input schema for the getFileContents tool
const getFileContentsSchema = z.object({
  fileId: z
    .string()
    .describe('The ID of the Google Drive file to retrieve content from.'),
});

/**
 * Langchain tool for retrieving the text content of a specific Google Drive file.
 *
 * This tool allows an AI agent to fetch the content of a document when needed.
 */
export const getFileContentsTool = new DynamicStructuredTool({
  name: 'getFileContents',
  description:
    'Retrieves the full text content of a specific file from Google Drive using its file ID. Use this when you need the actual information contained within a document previously identified (e.g., by listDocuments).',
  schema: getFileContentsSchema,
  func: async ({ fileId }) => {
    // Input validation is handled by the Zod schema
    if (!fileId) {
      return 'Error: fileId parameter is required.';
    }
    try {
      console.log(`[getFileContentsTool] Calling logic for fileId: ${fileId}`);
      const result = await getFileContentsLogic(fileId); // [cite: 1]
      // Agents generally expect string results from tools
      // The logic function should return { text: string }
      console.log(
        `[getFileContentsTool] Received content of length: ${result.text.length}`,
      );
      return result.text;
    } catch (error: any) {
      console.error(
        `Error in getFileContents tool for fileId ${fileId}: ${error.message}`,
      );
      // Provide a user-friendly error message back to the agent
      return `Failed to get contents for file ${fileId}: ${error.message}`;
    }
  },
});
