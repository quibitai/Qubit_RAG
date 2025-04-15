import { tool } from 'ai';
import { z } from 'zod';

// Define the schema for the parameters the tool accepts
const tavilySearchParametersSchema = z.object({
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
  // Add other optional Tavily /search parameters here if needed (e.g., include_domains)
});

export const tavilySearch = tool({
  description:
    'Performs a web search using the Tavily API to find relevant information from the internet. Use this for current events, general knowledge questions, or topics not covered by internal documents.',
  parameters: tavilySearchParametersSchema,

  execute: async (params) => {
    const { query } = params; // We mainly need the query for logging/error messages now

    console.log(`Tool 'tavilySearch' (via N8N) called with query: ${query}`);

    // --- Get N8N webhook details from environment variables ---
    const webhookUrl = process.env.N8N_TAVILY_SEARCH_WEBHOOK_URL; // Ensure this env var points to your n8n webhook
    const authHeader = process.env.N8N_TAVILY_SEARCH_AUTH_HEADER;
    const authToken = process.env.N8N_TAVILY_SEARCH_AUTH_TOKEN;
    // Note: We don't need the TAVILY_API_KEY here anymore as n8n handles that internally

    if (!webhookUrl || !authHeader || !authToken) {
      console.error(
        'Configuration error: Missing Tavily N8N webhook URL or auth details.',
      );
      // Return an error message string for the LLM
      return `Error: Web search service configuration is incomplete. Cannot perform search.`;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      headers[authHeader] = authToken;

      // The body now just needs the query, as n8n workflow handles the Tavily API call details
      const body = JSON.stringify({
        query: query,
        // You might pass other params if your *n8n workflow* expects them
        // search_depth: search_depth,
        // max_results: max_results,
      });

      console.log(
        `Calling N8N Tavily webhook at: ${webhookUrl} for query: "${query}"`,
      );

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
        body: body,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `N8N Tavily webhook call failed with status ${response.status}: ${errorBody}`,
        );
        // Return an error message string for the LLM
        return `Error: Web search failed (${response.statusText || 'Network error'}).`;
      }

      // --- Process the SIMPLIFIED response from N8N ---
      // We now expect n8n to return: { "summary": "..." }
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
          '------ tavilySearch tool returning to LLM: ------\n',
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
      console.error('Error executing tavilySearch tool fetch:', error);
      // Return an error message string for the LLM
      return `Error: Failed to execute web search: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
