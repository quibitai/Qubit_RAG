/**
 * Search Internal Knowledge Base Tool (Supabase Vector Search Version)
 *
 * Performs semantic search using embeddings and calls the match_documents Supabase function.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai'; // Using OpenAI for embeddings

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Missing Supabase URL or Key for searchInternalKnowledgeBase tool.',
  );
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Embeddings Model (Consider making this a shared instance)
// Ensure OPENAI_API_KEY is set in your environment
if (!process.env.OPENAI_API_KEY) {
  console.error(
    "Missing OPENAI_API_KEY for searchInternalKnowledgeBase tool's embedding generation.",
  );
}
const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small', // Or your preferred embedding model
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Tool response type definition
 */
type SearchResponse = {
  success: boolean;
  results?: Array<{
    title: string;
    similarity: number;
    content: string;
    metadata?: Record<string, any>;
  }>;
  error?: string;
  metadata?: Record<string, any>;
};

export const searchInternalKnowledgeBase = new DynamicStructuredTool({
  name: 'searchInternalKnowledgeBase',
  description: `Search the internal knowledge base for documents, examples, templates, client research, case studies, and other relevant content. Use immediately when users request research, examples, or need information from internal documents. Essential for finding relevant examples and templates.`,
  schema: z.object({
    query: z
      .string()
      .describe('The question or topic to semantically search for.'),
    match_count: z
      .number()
      .int()
      .positive()
      .optional()
      .default(5)
      .describe('Max number of results to return.'),
    filter: z
      .record(z.unknown())
      .optional()
      .describe(
        'Optional JSONB filter for metadata (e.g., {"file_title": "Specific Title"}).',
      ),
  }),
  func: async ({ query, match_count = 5, filter = {} }): Promise<string> => {
    console.log(
      `[searchInternalKnowledgeBase] Searching "${query}" (k=${match_count}, filter=${JSON.stringify(filter)})`,
    );

    if (!supabaseUrl || !supabaseKey) {
      return JSON.stringify({
        success: false,
        error: 'Supabase credentials are not configured.',
        metadata: { reason: 'configuration_error' },
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return JSON.stringify({
        success: false,
        error: 'OpenAI API key is not configured for embeddings.',
        metadata: { reason: 'configuration_error' },
      });
    }

    try {
      // 1) generate embedding
      const queryEmbedding = await embeddings.embedQuery(query);

      // 2) call RPC
      const { data: docs, error: rpcError } = await supabase.rpc(
        'match_documents',
        {
          query_embedding: queryEmbedding,
          match_count,
          filter,
        },
      );

      if (rpcError) {
        console.error('[searchInternalKnowledgeBase] RPC error', rpcError);
        return JSON.stringify({
          success: false,
          error: `Error during vector search: ${rpcError.message}`,
          metadata: {
            errorType: 'rpc_error',
            code: rpcError.code,
            details: rpcError.details,
          },
        });
      }

      // 3) format results
      if (!Array.isArray(docs) || docs.length === 0) {
        return JSON.stringify({
          success: true,
          results: [],
          metadata: {
            query,
            matchCount: match_count,
            filter: Object.keys(filter).length ? filter : undefined,
          },
        });
      }

      // Format the results as structured data
      const formattedResults = docs.map((d: any) => {
        const title = d.metadata?.file_title || 'Unknown';
        const similarity = d.similarity ?? 0;
        const content = d.content || '';

        return {
          title,
          similarity,
          content: content.slice(0, 500) + (content.length > 500 ? '...' : ''),
          metadata: d.metadata || {},
        };
      });

      const response = {
        success: true,
        results: formattedResults,
        metadata: {
          query,
          matchCount: match_count,
          resultCount: formattedResults.length,
          filter: Object.keys(filter).length ? filter : undefined,
        },
      };

      console.log(
        `[searchInternalKnowledgeBase] Returning ${formattedResults.length} results as JSON string`,
      );
      return JSON.stringify(response);
    } catch (err: any) {
      console.error('[searchInternalKnowledgeBase] Unexpected error:', err);
      return JSON.stringify({
        success: false,
        error: `Unexpected error during search: ${err.message}`,
        metadata: {
          errorType: err.name || 'Unknown',
          query,
        },
      });
    }
  },
});
