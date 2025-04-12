import { tool } from 'ai';
import { z } from 'zod';

export const queryDocumentRows = tool({
  description: 'Retrieves ALL structured row data for a specific spreadsheet document using its file ID. Use this when the user asks a question about specific data within a spreadsheet (e.g., asking for totals, averages, or specific entries). The returned data is an array of all row objects from the spreadsheet.',
  parameters: z.object({
    file_id: z.string().describe('The unique file ID (e.g., "1TJxAzkGh3...") of the spreadsheet document to query'),
  }),
  execute: async ({ file_id }: { file_id: string }) => {
    console.log(`Tool 'queryDocumentRows' called with file_id: ${file_id}`);

    const webhookUrl = process.env.N8N_QUERY_ROWS_TOOL_WEBHOOK_URL;
    const authHeader = process.env.N8N_QUERY_ROWS_TOOL_AUTH_HEADER;
    const authToken = process.env.N8N_QUERY_ROWS_TOOL_AUTH_TOKEN;

    if (!webhookUrl || !authHeader || !authToken) {
      console.error("Missing query document rows webhook configuration environment variables");
      return { 
        success: false, 
        error: "Spreadsheet query service is not configured correctly. Please contact the administrator." 
      };
    }

    // Validate file_id format
    if (!file_id || typeof file_id !== 'string' || file_id.trim() === '') {
      return {
        success: false,
        error: "Invalid file ID provided. Please provide a valid spreadsheet file ID."
      };
    }

    console.log(`Attempting to fetch spreadsheet rows from n8n webhook at URL: ${webhookUrl}`);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      headers[authHeader] = authToken;

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ file_id }), // Send only file_id
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Spreadsheet row query failed with status ${response.status}: ${errorBody}`);
        
        // Provide more user-friendly error messages based on status code
        if (response.status === 404) {
          return { 
            success: false, 
            error: `The spreadsheet with ID "${file_id}" could not be found. Please check if the file ID is correct and if the file exists.` 
          };
        } else if (response.status === 403) {
          return { 
            success: false, 
            error: `Access denied to the spreadsheet with ID "${file_id}". Please check permissions.` 
          };
        } else if (response.status === 400) {
          return { 
            success: false, 
            error: `The provided ID "${file_id}" does not appear to be a valid spreadsheet. Please provide a valid spreadsheet file ID.` 
          };
        }
        
        return { 
          success: false, 
          error: `Failed to query spreadsheet rows: ${response.statusText || "Unknown error"}` 
        };
      }

      const result = await response.json(); // Expects an array: [{"row_data": {...}}, ...] or error object

      // Check if n8n returned an error object (from the Set node path)
      if (Array.isArray(result) && result[0]?.success === false && result[0]?.error) {
          console.error("n8n workflow returned an error:", result[0].error);
          return { 
            success: false, 
            error: `${result[0].error}` 
          };
      }

      // Expecting an array of objects like [{"row_data": {...}}, ...]
      if (!Array.isArray(result)) {
          console.error("Unexpected response format from n8n:", result);
          return { 
            success: false, 
            error: "Received unexpected data format from spreadsheet query service. The file may not be a valid spreadsheet." 
          };
      }

      // Handle the case when the result is an empty array
      if (result.length === 0) {
        return {
          success: true,
          rows: [],
          message: "The spreadsheet exists but contains no data rows."
        };
      }

      console.log(`Retrieved ${result.length} rows successfully.`);

      // Return the array of row objects for the LLM to process
      return { 
        success: true, 
        rows: result,
        message: `Successfully retrieved ${result.length} rows from the spreadsheet.`
      };

    } catch (error) {
      console.error("Error executing queryDocumentRows tool:", error);
      return {
         success: false,
         error: `Failed to execute spreadsheet query tool: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}); 