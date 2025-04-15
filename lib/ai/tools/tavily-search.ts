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
    // Destructure parameters with defaults handled by Zod schema
    const { query, search_depth, max_results } = params;

    console.log(`Tool 'tavilySearch' called with query: ${query}`);

    // Fetch configuration from environment variables
    const webhookUrl = process.env.N8N_TAVILY_SEARCH_WEBHOOK_URL;
    const authHeader = process.env.N8N_TAVILY_SEARCH_AUTH_HEADER;
    const authToken = process.env.N8N_TAVILY_SEARCH_AUTH_TOKEN;
    const tavilyApiKey = process.env.TAVILY_API_KEY;

    // Basic validation
    if (!webhookUrl || !authHeader || !authToken || !tavilyApiKey) {
      console.error(
        'Configuration error: Missing Tavily search N8N webhook URL, auth details, or Tavily API key.',
      );
      return {
        success: false,
        error: 'Web search/extraction service is not configured correctly.',
      };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      headers[authHeader] = authToken;

      // Body for the revised n8n workflow (doesn't need include_raw_content)
      const body = JSON.stringify({
        query: query,
        api_key: tavilyApiKey, // Pass the API key securely from backend
        search_depth: search_depth,
        max_results: max_results,
        // include_raw_content is no longer sent here as extraction happens in n8n
        include_answer: false, // Control Tavily's own answer generation if needed
        include_images: false, // Control Tavily's image inclusion if needed
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
          error: `Web search/extraction failed: ${response.statusText || 'Network error'}`,
        };
      }

      const result = await response.json();

      // Check for errors returned explicitly by the n8n workflow's error path
      if (result?.success === false) {
        console.error('N8N workflow indicated failure:', result.error);
        return {
          success: false,
          error:
            result.error ||
            'An error occurred during the web search/extraction workflow.',
        };
      }

      console.log('Received successful response from N8N Tavily webhook.');
      return {
        success: true,
        extracted_content: result.extracted_content,
        source_url: result.source_url,
      };
    } catch (error) {
      console.error('Error executing tavilySearch tool fetch:', error);
      return {
        success: false,
        error: `Failed to execute web search/extraction tool: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
