import { tool } from 'ai';
import { z } from 'zod';

export const listDocuments = tool({
  description:
    'List the documents available in the internal knowledge base. Use this when the user asks what documents are available or wants a general overview.',
  parameters: z.object({}), // No parameters needed for this tool
  execute: async () => {
    console.log("Tool 'listDocuments' called.");

    // Get environment variables for the list documents webhook
    const webhookUrl = process.env.N8N_LIST_DOCS_TOOL_WEBHOOK_URL;
    const authHeader = process.env.N8N_LIST_DOCS_TOOL_AUTH_HEADER;
    const authToken = process.env.N8N_LIST_DOCS_TOOL_AUTH_TOKEN;

    if (!webhookUrl || !authHeader || !authToken) {
      console.error(
        'Missing list documents webhook configuration environment variables',
      );
      throw new Error('Document listing service configuration error');
    }

    console.log(
      `Attempting to fetch document list from n8n webhook at URL: ${webhookUrl}`,
    );

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // Add the dynamic authentication header
      headers[authHeader] = authToken;

      // This workflow doesn't require a body, it just triggers the n8n workflow
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `Document listing failed with status ${response.status}: ${errorBody}`,
        );
        throw new Error(`Failed to list documents: ${response.statusText}`);
      }

      const result = await response.json(); // Expects an array of document metadata objects

      // Format the result for the LLM (e.g., a simple list of titles and IDs)
      let formattedList = 'No documents found.';
      if (Array.isArray(result) && result.length > 0) {
        formattedList = `Available documents:\n${result.map((doc) => `- ${doc.title} (ID: ${doc.id})`).join('\n')}`;
      }

      console.log('Retrieved document list.');

      return {
        success: true,
        document_list: formattedList,
      };
    } catch (error) {
      console.error('Error executing listDocuments tool:', error);
      return {
        success: false,
        document_list: null,
        error: `Failed to list documents: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
