/**
 * List Documents Tool for Langchain
 *
 * This tool retrieves a list of available documents from Supabase
 * for the agent to reference when answering user queries.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

// Log warning if missing credentials, but still create client (it will just fail on usage)
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key for listDocumentsTool.');
}

// Create Supabase client with fallback to empty strings (will fail on API calls)
const supabase = createClient(supabaseUrl, supabaseKey);

// Define the input schema - empty object since this tool doesn't require parameters
const listDocumentsSchema = z.object({});

/**
 * Langchain tool for retrieving a list of available documents from the Supabase database.
 * This helps the agent know what documents are available to reference.
 */
export const listDocumentsTool = new DynamicStructuredTool({
  name: 'listDocuments',
  description:
    'Lists all available documents in the knowledge base. Use this to discover what documents exist before requesting specific content. Provides the File ID needed for getFileContents.',
  schema: listDocumentsSchema,
  func: async () => {
    console.log('[listDocumentsTool] Fetching document list from Supabase');

    // Verify Supabase credentials are available
    if (!supabaseUrl || !supabaseKey) {
      return 'Error: Supabase credentials are not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.';
    }

    try {
      // Query the document_metadata table to get a list of all available documents
      const { data, error } = await supabase
        .from('document_metadata')
        .select('file_id, title, url, created_at, schema') // Changed 'id' to 'file_id'
        .order('title'); // Order by title for readability

      if (error) {
        console.error('Supabase query error in listDocumentsTool:', error);
        // Add specific check for column existence based on previous errors
        if (
          error.message.includes('column') &&
          error.message.includes('does not exist')
        ) {
          console.error(
            "VERIFY COLUMN NAMES: Ensure 'document_metadata' table has 'file_id' and 'title' columns.",
          );
        }
        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!data || data.length === 0) {
        console.log('[listDocumentsTool] No documents found in the database');
        return 'No documents found in the knowledge base.';
      }

      console.log(
        `[listDocumentsTool] Successfully retrieved ${data.length} documents`,
      );

      // Format the list of documents for the agent
      const documentList = data.map((doc) => ({
        file_id: doc.file_id, // Changed from 'id' to 'file_id'
        title: doc.title,
        url: doc.url,
        created_at: doc.created_at,
        schema: doc.schema,
      }));

      // Return formatted document list with clear instructions for the agent
      return JSON.stringify({
        available_documents: documentList,
        total_count: documentList.length,
        usage_instructions:
          "To retrieve the full content of a specific document, use the getFileContents tool with the document's file_id.",
      });
    } catch (error: any) {
      console.error(`Error in listDocuments tool: ${error.message}`);
      return `Failed to get document list from database: ${error.message}`;
    }
  },
});
