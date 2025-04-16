import { tool } from 'ai';
import { z } from 'zod';

export const searchInternalKnowledgeBase = tool({
  description:
    'Performs semantic search across the internal knowledge base to find contextually relevant information from stored documents. This tool is optimized for retrieving specific facts, details, or explanations that match the search query from all available documents. Use this when you need precise information on a topic rather than the full content of a particular document. Results include relevant content snippets with their source information.',
  parameters: z.object({
    query: z
      .string()
      .describe(
        'The specific question or topic to search for in the knowledge base.',
      ),
  }),
  execute: async ({ query }: { query: string }) => {
    console.log(
      `Tool 'searchInternalKnowledgeBase' called with query: ${query}`,
    );

    // Get environment variables for n8n integration
    const webhookUrl = process.env.N8N_RAG_TOOL_WEBHOOK_URL;
    const authHeader = process.env.N8N_RAG_TOOL_AUTH_HEADER;
    const authToken = process.env.N8N_RAG_TOOL_AUTH_TOKEN;

    if (!webhookUrl || !authHeader || !authToken) {
      console.error('Missing n8n configuration environment variables');
      return {
        success: false,
        error:
          'Internal knowledge base search service is not configured correctly.',
      };
    }

    console.log(`Attempting to fetch n8n webhook at URL: ${webhookUrl}`);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      headers[authHeader] = authToken;

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ query: query }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `n8n webhook call failed with status ${response.status}: ${errorBody}`,
        );
        throw new Error(`n8n webhook call failed: ${response.statusText}`);
      }

      const resultJson = await response.json();
      console.log('Received search result:', JSON.stringify(resultJson));

      // Check if the response is directly in the expected format with success, results, summary fields
      if (
        resultJson &&
        typeof resultJson === 'object' &&
        'success' in resultJson
      ) {
        // The response is already in the expected format, just return it
        return resultJson;
      }

      // Legacy format handling - Process resultJson to extract the most useful context for the LLM
      const firstResult = Array.isArray(resultJson)
        ? resultJson[0]
        : resultJson;

      // Check if we have search results using optional chaining
      if (firstResult?.results?.length > 0) {
        const searchResults = firstResult.results.map((result: any) => ({
          title: result.title || 'No title available',
          url: result.url || '',
          content: result.raw_content || 'No content available',
        }));

        // Format the response in a more readable way
        return {
          success: true,
          results: searchResults,
          summary: `Found ${searchResults.length} relevant results for your query.`,
          sources: searchResults.map((r: any) => r.url).join('\n'),
        };
      }

      // If no results found or unable to parse
      return {
        success: true,
        results: [],
        summary:
          'No relevant results found in the knowledge base for your query.',
        sources: [],
      };
    } catch (error) {
      console.error('Error executing searchInternalKnowledgeBase tool:', error);
      return {
        success: false,
        error: `Failed to fetch from knowledge base: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
