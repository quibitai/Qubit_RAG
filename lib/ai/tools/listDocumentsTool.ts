/**
 * List Documents Tool for Langchain (Supabase Version)
 *
 * Queries the document_metadata table in Supabase to retrieve a list
 * of documents available in the knowledge base.
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
  console.error('Missing Supabase URL or Key for listDocumentsTool.');
  // Tool execution will fail if client is created with empty credentials
}

// Create Supabase client with fallback to empty strings (will fail on API calls)
const supabase = createClient(supabaseUrl, supabaseKey);

// Define the input schema for the listDocuments tool
const listDocumentsSchema = z.object({});

/**
 * Langchain tool for listing available documents in the knowledge base
 *
 * This tool allows an AI agent to retrieve a list of documents available
 * for reference in the knowledge base by querying the Supabase document_metadata table.
 */
export const listDocumentsTool = new DynamicStructuredTool({
  name: 'listDocuments',
  description:
    'Lists documents available in the knowledge base by querying the database\'s document_metadata table. Returns a numbered list of documents, each showing "Index. Title (ID: unique_file_id)". The unique_file_id is essential and MUST be used as input for other tools like getFileContents.',
  schema: listDocumentsSchema,
  func: async () => {
    // Verify Supabase credentials are available
    if (!supabaseUrl || !supabaseKey) {
      return 'Error: Supabase credentials are not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.';
    }

    console.log(
      "[listDocumentsTool] Fetching document list from Supabase table 'document_metadata'.",
    );
    try {
      const { data, error } = await supabase
        .from('document_metadata')
        .select('file_id, file_title')
        .order('file_title', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return 'No documents found.';

      const documentList = data
        .map(
          (doc, index) =>
            // Ensure this format clearly shows the ID
            `${index + 1}. ${doc.file_title || 'Untitled'} (ID: ${doc.file_id})`,
        )
        .join('\n');

      const response = `Found ${data.length} documents:\n${documentList}`;
      console.log('[listDocumentsTool] Successfully retrieved document list.');
      return response;
    } catch (error: any) {
      console.error(`Error in listDocuments tool (Supabase): ${error.message}`);
      return `Failed to list documents from database: ${error.message}`;
    }
  },
});
