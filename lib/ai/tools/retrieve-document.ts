import { tool } from 'ai';
import { z } from 'zod';

export const retrieveDocument = tool({
  description: 'Retrieve the full text content of a specific document using its file ID. Best suited for text-based documents like PDFs or TXT files.',
  parameters: z.object({
    file_id: z.string().describe('The unique file ID (e.g., "1_-WkbRZBgX780...") of the document to retrieve'),
  }),
  execute: async ({ file_id }: { file_id: string }) => {
    console.log(`Tool 'retrieveDocument' called with file_id: ${file_id}`);

    // Use environment variables specific to the Get Contents tool
    // Commenting out env var reads to use hardcoded values instead
    const webhookUrl = process.env.N8N_GET_CONTENTS_TOOL_WEBHOOK_URL;
    const authHeader = process.env.N8N_GET_CONTENTS_TOOL_AUTH_HEADER;
    const authToken = process.env.N8N_GET_CONTENTS_TOOL_AUTH_TOKEN;

    // --- Use hardcoded values for testing, REMEMBER TO REMOVE LATER ---
    // const webhookUrl = 'https://quibit.app.n8n.cloud/webhook/03fc54d6-3bc5-408f-a35f-e51a12403ff2';
    // const authHeader = 'getfilecontents';
    // const authToken = 'PhF7N8ae8Yw$f!';
    // ---

    // --- Keep console logs for now ---
    console.log("--- ENV Check inside retrieveDocument ---");
    console.log("Webhook URL read:", webhookUrl);
    console.log("Auth Header Name read:", authHeader);
    console.log("Auth Token read:", authToken);
    console.log("--- End ENV Check ---");

    if (!webhookUrl || !authHeader || !authToken) {
      console.error("Missing retrieve document webhook configuration environment variables");
      return { success: false, error: "Document retrieval service is not configured correctly." };
    }

    console.log(`Attempting to fetch document content from n8n webhook at URL: ${webhookUrl}`);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // Use environment variables OR hardcoded values for testing
      headers[authHeader] = authToken; // Using variables read from env
      // OR: headers['getfilecontents'] = 'PhF7N8ae8Yw$f!'; // Using hardcoded

      console.log("Sending headers:", headers); // Log the headers actually being sent

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ file_id }), // Send file_id in the body
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Document retrieval failed with status ${response.status}: ${errorBody}`);
        return { success: false, error: `Failed to retrieve document (${response.statusText})` };
      }

      const result = await response.json(); // result is likely: [{"document_text": "..."}]

      // --- MODIFICATION START ---
      // Check if the result is an array and get the first item
      const firstItem = Array.isArray(result) ? result[0] : null;
      const documentText = firstItem?.document_text; // Use optional chaining ?. to safely access document_text
      // --- MODIFICATION END ---

      if (documentText === null || documentText === undefined || documentText === "") { // Also check for empty string
          console.log(`Document content not found or empty for file_id: ${file_id}`);
          return { success: false, content: "Content not found for the provided file ID." };
      }

      console.log(`Retrieved document content successfully.`);

      // Return just the content string for the LLM
      return documentText;

    } catch (error) {
      console.error("Error executing retrieveDocument tool:", error);
      return {
         success: false, // Indicate failure
         error: `Failed to execute document retrieval tool: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}); 