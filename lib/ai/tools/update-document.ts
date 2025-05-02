import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

const updateDocumentSchema = z.object({
  id: z.string().describe('The ID of the document artifact to update'),
  description: z
    .string()
    .describe('A description of the changes to make to the document.'),
});

export const updateDocumentTool = new DynamicStructuredTool({
  name: 'updateDocument',
  description:
    'Updates the content of the currently active, editable document artifact identified by its ID. Takes the document ID and a description of the requested changes (e.g., "make the first paragraph bold", "summarize the text", "fix typos"). Use this tool for any modifications or content generation related to the document the user is currently editing.',
  schema: updateDocumentSchema,
  func: async ({ id, description }: { id: string; description: string }) => {
    console.log(
      `[updateDocumentTool] Signalling intent to update ID: ${id} with description: "${description}"`,
    );
    // Return arguments needed by the handler, identifying the tool
    // Returning JSON makes it easier for the /api/brain route to parse
    return JSON.stringify({
      tool_name: 'updateDocument', // Identify the tool called
      id: id,
      description: description,
    });
  },
});
