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
    'Performs a web search using the Tavily API to find relevant information from the internet. Use this for current events, general knowledge questions, or topics not likely covered by internal documents.',
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

      // Parse the JSON response
      const result = await response.json();

      console.log(
        'Raw search results:',
        JSON.stringify(result).substring(0, 200) + '...',
      );

      // Handle the array format response from n8n
      if (Array.isArray(result) && result.length > 0) {
        const firstItem = result[0];

        // Check if the item has results
        if (
          firstItem?.results &&
          Array.isArray(firstItem.results) &&
          firstItem.results.length > 0
        ) {
          // Extract relevant content from each result
          const formattedResults = firstItem.results.map((item: any) => {
            let title = 'No title available';
            let url = '';

            // Extract title from URL if not available
            if (item.url) {
              url = item.url;
              if (!title || title === 'No title available') {
                try {
                  const urlObj = new URL(item.url);
                  title = urlObj.hostname + urlObj.pathname;
                } catch (e) {
                  // Keep default title if URL parsing fails
                }
              }
            }

            // Extract content from raw_content
            const content = item.raw_content || 'No content available';

            // Clean up raw content to extract main text
            let cleanedContent = content;
            if (content && typeof content === 'string') {
              // Remove common website navigation elements
              cleanedContent = content
                .replace(/Jump to content[\s\S]*?Main menu/g, '')
                .replace(/Navigation[\s\S]*?Search/g, '')
                .replace(/Toggle the table of contents[\s\S]*?\(/g, '')
                .replace(/\| --- \|[\s\S]*?---/g, '')
                .replace(/Print\/export[\s\S]*?Projects/g, '')
                .replace(/This page was last edited on[\s\S]*?Wikipedia®/g, '')
                .replace(/Privacy policy[\s\S]*?Mobile view/g, '')
                .trim();
            }

            return {
              title: item.title || title,
              url: url,
              content: cleanedContent,
            };
          });

          console.log(
            `Successfully processed ${formattedResults.length} search results`,
          );

          // Format the response in a more readable way for the LLM
          return {
            success: true,
            results: formattedResults,
            summary: `Found ${formattedResults.length} relevant results for your query about "${query}".`,
            sources: formattedResults.map((r: any) => r.url).join('\n'),
          };
        }
      }

      console.log('No relevant search results found');

      // If no results found
      return {
        success: true,
        results: [],
        summary: `No relevant results found for your query about "${query}".`,
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
