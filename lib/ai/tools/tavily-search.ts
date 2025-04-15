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
    'Performs a web search using the Tavily API, identifies the most relevant result based on score, extracts its main content, and returns that content. Use this for current events, general knowledge questions, or topics not likely covered by internal documents.',
  parameters: tavilySearchParametersSchema,

  execute: async (params) => {
    const { query, search_depth, max_results } = params;

    console.log(`Tool 'tavilySearch' called with query: ${query}`);

    const webhookUrl = process.env.N8N_TAVILY_SEARCH_WEBHOOK_URL;
    const authHeader = process.env.N8N_TAVILY_SEARCH_AUTH_HEADER;
    const authToken = process.env.N8N_TAVILY_SEARCH_AUTH_TOKEN;
    const tavilyApiKey = process.env.TAVILY_API_KEY;

    if (!webhookUrl || !authHeader || !authToken || !tavilyApiKey) {
      console.error(
        'Configuration error: Missing Tavily search N8N webhook URL, auth details, or Tavily API key.',
      );
      return {
        success: false,
        error: 'Web search service is not configured correctly.',
      };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      headers[authHeader] = authToken;

      const body = JSON.stringify({
        query: query,
        api_key: tavilyApiKey,
        search_depth: search_depth,
        max_results: max_results,
        include_answer: false,
        include_images: false,
      });

      console.log(`Calling N8N Tavily webhook at: ${webhookUrl}`);

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
        return {
          success: false,
          error: `Web search failed: ${response.statusText || 'Network error'}`,
        };
      }

      const result = await response.json();

      // Process the search results
      if (Array.isArray(result) && result.length > 0) {
        const firstResult = result[0];

        // Check if we have results
        if (firstResult.results && firstResult.results.length > 0) {
          const searchResults = firstResult.results.map((result: any) => ({
            title: result.title || 'No title available',
            url: result.url || '',
            content: result.raw_content || 'No content available',
          }));

          // Format the response in a more readable way
          const formattedResponse = {
            success: true,
            results: searchResults,
            summary: `Found ${searchResults.length} relevant results for your query.`,
            sources: searchResults.map((r: any) => r.url).join('\n'),
          };

          console.log('Successfully processed search results');
          return formattedResponse;
        }
      }

      // If no results found
      return {
        success: true,
        results: [],
        summary: 'No relevant results found for your query.',
        sources: [],
      };
    } catch (error) {
      console.error('Error executing tavilySearch tool fetch:', error);
      return {
        success: false,
        error: `Failed to execute web search: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
