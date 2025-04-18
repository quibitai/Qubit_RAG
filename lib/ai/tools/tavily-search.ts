import { tool } from 'ai';
import { z } from 'zod';

// Define the schema for the parameters the tool accepts
const serpApiSearchParametersSchema = z.object({
  query: z.string().describe('The search query to perform.'),
  search_depth: z
    .enum(['basic', 'advanced'])
    .optional()
    .default('basic')
    .describe(
      'Depth of search: "basic" for quick results, "advanced" for more comprehensive research.',
    ),
  max_results: z
    .number()
    .optional()
    .default(5)
    .describe(
      'Maximum number of initial search results to fetch before filtering (default 5).',
    ),
  // Add other optional SerpAPI parameters here if needed
});

export const tavilySearch = tool({
  description:
    'Performs a web search using Google Search API (via SerpAPI) to find relevant information from the internet. Use this for current events, general knowledge questions, or topics not covered by internal documents.',
  parameters: serpApiSearchParametersSchema,

  execute: async (params) => {
    const { query } = params; // We mainly need the query for logging/error messages now

    console.log(`Tool 'serpApiSearch' (via N8N) called with query: ${query}`);

    // --- Get N8N webhook details from environment variables ---
    const webhookUrl = process.env.N8N_TAVILY_SEARCH_WEBHOOK_URL;
    const authHeader = process.env.N8N_TAVILY_SEARCH_AUTH_HEADER;
    const authToken = process.env.N8N_TAVILY_SEARCH_AUTH_TOKEN;

    if (!webhookUrl || !authHeader || !authToken) {
      console.error(
        'Configuration error: Missing SerpAPI N8N webhook URL or auth details.',
      );
      // Return an error message string for the LLM
      return `Error: Web search service configuration is incomplete. Cannot perform search.`;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      headers[authHeader] = authToken;

      // Format for N8N agent node - using chatInput as the parameter expected by the agent
      const body = JSON.stringify({
        chatInput: query, // Agent node expects input in {{ $json.chatInput }}
        query: query, // Also include the original parameter for backward compatibility
      });

      console.log(
        `Calling N8N SerpAPI webhook at: ${webhookUrl} for query: "${query}"`,
      );

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
        body: body,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `N8N SerpAPI webhook call failed with status ${response.status}: ${errorBody}`,
        );
        // Return an error message string for the LLM
        return `Error: Web search failed (${response.statusText || 'Network error'}).`;
      }

      // --- Process the SIMPLIFIED response from N8N ---
      // We expect the agent node to return: { "summary": "..." } same as before
      const n8nResult = await response.json();

      // Check if the expected 'summary' field exists and is not empty
      if (
        n8nResult &&
        typeof n8nResult.summary === 'string' &&
        n8nResult.summary.trim() !== '' &&
        !n8nResult.summary.includes('No results found') &&
        !n8nResult.summary.includes('No content extracted')
      ) {
        console.log(
          '------ serpApiSearch tool returning to LLM: ------\n',
          n8nResult.summary,
        );
        // Return the summary string directly
        return n8nResult.summary;
      } else {
        // Handle cases where n8n didn't return a valid summary
        console.log(
          `N8N workflow did not return a valid summary for query "${query}". Response:`,
          n8nResult,
        );
        return `I searched for "${query}" but did not find a relevant summary.`;
      }
    } catch (error) {
      console.error('Error executing serpApiSearch tool fetch:', error);
      // Return an error message string for the LLM
      return `Error: Failed to execute web search: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
