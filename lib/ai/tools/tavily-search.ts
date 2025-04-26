import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';

// Ensure TAVILY_API_KEY is set in your .env.local file
// The tool will automatically look for process.env.TAVILY_API_KEY

// Create schema for the Tavily search
const tavilySearchSchema = z.object({
  query: z.string().describe('The search query to look up on the web'),
});

/**
 * Tavily Search Tool (Direct Integration)
 *
 * Uses the Tavily Search API to find relevant information on the web.
 * Leverages the TavilySearchResults tool from @langchain/community.
 * Automatically uses the TAVILY_API_KEY environment variable.
 */
export const tavilySearchTool = new DynamicStructuredTool({
  name: 'tavilySearch',
  description:
    'Search the web for real-time information. Useful for questions about current events or general knowledge queries. The search results will include relevant snippets from web pages.',
  schema: tavilySearchSchema,
  func: async ({ query }) => {
    console.log(`[tavilySearchTool] Searching for: "${query}"`);

    // Create an instance of TavilySearchResults
    const tavilySearch = new TavilySearchResults({
      maxResults: 7,
      apiKey: process.env.TAVILY_API_KEY,
    });

    try {
      // Call the Tavily API using the underlying tool
      const result = await tavilySearch.invoke(query);
      console.log(
        `[tavilySearchTool] Successfully received results for query: "${query}"`,
      );
      return result;
    } catch (error) {
      console.error(
        `[tavilySearchTool] Error searching for "${query}":`,
        error,
      );
      return `Error: Failed to search for "${query}". ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// Export with a more descriptive name for consistency with other tools
export const searchWeb = tavilySearchTool;
