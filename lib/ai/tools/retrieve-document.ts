import { tool } from 'ai';
import { z } from 'zod';

export const retrieveDocument = tool({
  description:
    'Retrieve the full text content of a specific document using its file ID or exact file name. Best suited for text-based documents like PDFs or TXT files.',
  parameters: z.object({
    file_id: z
      .string()
      .describe(
        'The unique file ID (e.g., "1_-WkbRZBgX780...") of the document to retrieve, or the exact file name (e.g., "EXAMPLE_Brand_Marketing_Overview.pdf")',
      ),
  }),
  execute: async ({ file_id }: { file_id: string }) => {
    console.log(`Tool 'retrieveDocument' called with input: ${file_id}`);

    // Check if this looks like a file name rather than an ID
    const isLikelyFileName =
      file_id.includes('.') || !file_id.includes('-') || file_id.length < 20;

    // If it looks like a file name, try to get the document list first
    if (isLikelyFileName) {
      console.log(
        `Input appears to be a file name rather than an ID: ${file_id}`,
      );

      // First, try to get the document list to find the ID
      const listWebhookUrl = process.env.N8N_LIST_DOCS_TOOL_WEBHOOK_URL;
      const listAuthHeader = process.env.N8N_LIST_DOCS_TOOL_AUTH_HEADER;
      const listAuthToken = process.env.N8N_LIST_DOCS_TOOL_AUTH_TOKEN;

      if (listWebhookUrl && listAuthHeader && listAuthToken) {
        try {
          console.log(
            `Attempting to get document list to find ID for filename: ${file_id}`,
          );

          const listHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          listHeaders[listAuthHeader] = listAuthToken;

          const listResponse = await fetch(listWebhookUrl, {
            method: 'POST',
            headers: listHeaders,
          });

          if (listResponse.ok) {
            const documentList = await listResponse.json();
            console.log(`Retrieved document list, searching for: ${file_id}`);

            // Parse the document list to find the ID for the given filename
            if (Array.isArray(documentList)) {
              // Try to find the exact document match
              const matchedDoc = documentList.find(
                (doc: any) =>
                  doc?.title &&
                  doc.title.toLowerCase() === file_id.toLowerCase(),
              );

              // If no exact match, look for partial matches
              if (!matchedDoc) {
                const partialMatch = documentList.find(
                  (doc: any) =>
                    doc?.title?.toLowerCase().includes(file_id.toLowerCase()),
                );

                if (partialMatch?.id) {
                  console.log(
                    `Found partial match for "${file_id}": ${partialMatch?.title} with ID: ${partialMatch?.id}`,
                  );
                  file_id = partialMatch?.id;
                }
              } else if (matchedDoc?.id) {
                console.log(
                  `Found exact match for "${file_id}" with ID: ${matchedDoc?.id}`,
                );
                file_id = matchedDoc?.id;
              }
            }
          }
        } catch (listError) {
          console.error(`Error getting document list: ${listError}`);
          // Continue with the original file_id
        }
      }
    }

    // Use environment variables specific to the Get Contents tool
    const webhookUrl = process.env.N8N_GET_CONTENTS_TOOL_WEBHOOK_URL;
    const authHeader = process.env.N8N_GET_CONTENTS_TOOL_AUTH_HEADER;
    const authToken = process.env.N8N_GET_CONTENTS_TOOL_AUTH_TOKEN;

    console.log('--- ENV Check inside retrieveDocument ---');
    console.log('Webhook URL read:', webhookUrl);
    console.log('Auth Header Name read:', authHeader);
    console.log('Auth Token read:', authToken);
    console.log('--- End ENV Check ---');

    if (!webhookUrl || !authHeader || !authToken) {
      console.error(
        'Missing retrieve document webhook configuration environment variables',
      );
      return {
        success: false,
        error: 'Document retrieval service is not configured correctly.',
      };
    }

    console.log(
      `Attempting to fetch document content from n8n webhook at URL: ${webhookUrl}`,
    );

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      headers[authHeader] = authToken;

      console.log('Sending headers:', headers);
      console.log(`Sending file_id in request body: ${file_id}`);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ file_id }), // Send file_id in the body
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `Document retrieval failed with status ${response.status}: ${errorBody}`,
        );
        return {
          success: false,
          error: `Failed to retrieve document (${response.statusText})`,
        };
      }

      const result = await response.json(); // result is likely: [{"document_text": "..."}]

      // Check if the result is an array and get the first item
      const firstItem = Array.isArray(result) ? result[0] : result;
      const documentText =
        firstItem?.document_text || firstItem?.content || firstItem; // Try different possible response formats

      if (
        documentText === null ||
        documentText === undefined ||
        documentText === ''
      ) {
        console.log(
          `Document content not found or empty for file_id: ${file_id}`,
        );
        return {
          success: false,
          content: 'Content not found for the provided file ID.',
        };
      }

      console.log(`Retrieved document content successfully.`);

      // Return just the content string for the LLM
      return documentText;
    } catch (error) {
      console.error('Error executing retrieveDocument tool:', error);
      return {
        success: false, // Indicate failure
        error: `Failed to execute document retrieval tool: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
