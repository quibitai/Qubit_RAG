/**
 * Get File Contents Tool (Supabase Version) for Langchain
 *
 * Retrieves the full aggregated text content of a document from the Supabase 'documents' table
 * using its file_id.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (consider centralizing)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Use service role key if direct table/function access requires it
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

// Log warning if missing credentials, but still create client (it will just fail on usage)
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key for getFileContentsTool.');
  // Tool execution will fail if client is created with empty credentials
}

// Create Supabase client with fallback to empty strings (will fail on API calls)
const supabase = createClient(supabaseUrl, supabaseKey);

// Define the input schema - expecting a file_id from listDocumentsTool
const getFileContentsSchema = z.object({
  file_id: z
    .string()
    .describe(
      'The **exact unique file ID** (e.g., "14Q5Nd3u...") obtained from the listDocuments tool. DO NOT use the filename.',
    ),
});

/**
 * Langchain tool for retrieving the full text content of a document stored in Supabase.
 */
export const getFileContentsTool = new DynamicStructuredTool({
  // Ensure the name matches the export and intended use
  name: 'getFileContents',
  description:
    'Retrieves the full text content of a specific document from the database using its **unique file ID**. You MUST provide the exact file ID obtained from the listDocuments tool. Do not provide the filename.',
  schema: getFileContentsSchema,
  func: async ({ file_id }: { file_id: string }) => {
    console.log(
      `[getFileContentsTool] Fetching content for file_id: ${file_id} from Supabase.`,
    );

    if (!file_id || file_id.includes('.')) {
      // Basic check to catch obvious filenames
      return 'Error: An invalid file ID was provided. Please provide the exact unique file ID from listDocuments, not a filename.';
    }

    // Verify Supabase credentials are available
    if (!supabaseUrl || !supabaseKey) {
      return 'Error: Supabase credentials are not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.';
    }

    try {
      // --- Option 1: Call a Supabase Function (Recommended) ---
      // Assumes you have a function like `get_aggregated_document_content` in Supabase
      // that performs: SELECT string_agg(content, ' ') as document_text FROM documents WHERE metadata->>'file_id' = p_file_id GROUP BY metadata->>'file_id';
      // Replace 'get_aggregated_document_content' with your actual function name.
      const { data, error } = await supabase.rpc(
        'get_aggregated_document_content', // <<< YOUR FUNCTION NAME HERE
        { p_file_id: file_id }, // <<< Argument name must match function definition
      );

      if (error) {
        console.error('Supabase RPC error in getFileContentsTool:', error);
        throw new Error(`Database function error: ${error.message}`);
      }

      // The function should ideally return a single object like { document_text: '...' } or null/empty if not found
      const documentText =
        data?.[0]?.document_text ||
        data?.document_text ||
        (typeof data === 'string' ? data : null); // Handle different possible return shapes from rpc

      // --- Option 2: Manual Query & Aggregation (Fallback if no DB function) ---
      /*
      console.log(`[getFileContentsTool] Querying 'documents' table for file_id: ${file_id}`);
      const { data, error } = await supabase
        .from('documents')
        .select('content') // Select only the content field
        .eq('metadata->>file_id', file_id) // Filter by file_id within the JSONB metadata
        // Add .order() here if chunk order matters and is stored

      if (error) {
        console.error('Supabase query error in getFileContentsTool:', error);
        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
         console.log(`[getFileContentsTool] No content chunks found for file_id: ${file_id}`);
         return "Content not found for the specified file ID.";
      }

      // Aggregate the content chunks (assuming order doesn't matter or is handled by query)
      const documentText = data.map(chunk => chunk.content).join(' ');
      console.log(`[getFileContentsTool] Aggregated ${data.length} chunks.`);
      */
      // --- End Option 2 ---

      if (
        documentText === null ||
        documentText === undefined ||
        documentText === ''
      ) {
        console.log(
          `[getFileContentsTool] Document content not found or empty for file_id: ${file_id}`,
        );
        return 'Content not found for the specified file ID.';
      }

      console.log(
        `[getFileContentsTool] Successfully retrieved content for file_id: ${file_id}. Length: ${documentText.length}`,
      );
      // Return the aggregated text content directly as a string
      return documentText;
    } catch (error: any) {
      console.error(
        `Error in getFileContents tool (Supabase): ${error.message}`,
      );
      return `Failed to get document content from database: ${error.message}`;
    }
  },
});
