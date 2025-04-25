import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

// Define the schema for the tool's input
const tavilyExtractSchema = z.object({
  urls: z
    .array(
      z
        .string()
        .url()
        .describe('A list of valid URLs to extract content from.'),
    )
    .describe('An array of URLs from which to extract content.'),
  // Optional: Add other parameters from Tavily Extract API if needed
  // extract_depth: z.enum(['basic', 'advanced']).optional().default('basic'),
});

/**
 * A Langchain tool to extract content from web pages using the Tavily Extract API.
 */
export const tavilyExtractTool = new DynamicStructuredTool({
  name: 'extractWebContent',
  description:
    'Extracts the main content from a list of web page URLs using the Tavily API. Returns the extracted content for each successful URL and lists any URLs that failed.',
  schema: tavilyExtractSchema,
  func: async ({ urls }) => {
    console.log(
      `[tavilyExtractTool] Attempting to extract content from URLs: ${urls.join(', ')}`,
    );

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      console.error(
        '[tavilyExtractTool] Missing TAVILY_API_KEY environment variable.',
      );
      return 'Error: Tavily API key is not configured. Cannot extract web content.';
    }

    const endpoint = 'https://api.tavily.com/extract';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: urls,
          // Optional: Add other parameters here if included in schema
          // extract_depth: 'basic',
        }),
      });

      if (!response.ok) {
        let errorBody = `HTTP error ${response.status}`;
        try {
          const errorJson = await response.json();
          errorBody += `: ${JSON.stringify(errorJson)}`;
        } catch (e) {
          // Ignore if error body is not JSON
        }
        console.error(`[tavilyExtractTool] API call failed: ${errorBody}`);
        return `Error: Failed to extract content from Tavily API (${errorBody})`;
      }

      const data = await response.json();
      console.log(
        `[tavilyExtractTool] Successfully received response from Tavily Extract.`,
      );

      // Format the response for the agent - stringified JSON includes successes and failures
      return JSON.stringify({
        extracted_results: data.results,
        failed_urls: data.failed_results,
      });
    } catch (error) {
      console.error('[tavilyExtractTool] Error executing fetch:', error);
      return `Error: Failed to execute web content extraction: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
