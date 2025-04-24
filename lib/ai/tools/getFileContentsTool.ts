/**
 * Get File Contents Tool for Langchain
 *
 * This tool retrieves the full text content of a document
 * from the Supabase 'documents' table using its ID.
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
  console.error('Missing Supabase URL or Key for getFileContentsTool.');
}

// Create Supabase client with fallback to empty strings (will fail on API calls)
const supabase = createClient(supabaseUrl, supabaseKey);

// Define the input schema - requires a document_id parameter
const getFileContentsSchema = z.object({
  document_id: z
    .string()
    .describe(
      'The unique identifier of the document to retrieve as shown in the listDocuments tool results',
    ),
});

/**
 * Langchain tool for retrieving the full text content of a document from Supabase.
 * This tool is used when the agent needs to access the complete content of a document.
 */
export const getFileContentsTool = new DynamicStructuredTool({
  name: 'getFileContents',
  description:
    'Retrieves the full text content of a document using its ID. Use this when you need to read or analyze the complete content of a specific document.',
  schema: getFileContentsSchema,
  func: async ({ document_id }) => {
    console.log(
      `[getFileContentsTool] Retrieving content for document ID: ${document_id}`,
    );

    // Verify Supabase credentials are available
    if (!supabaseUrl || !supabaseKey) {
      return 'Error: Supabase credentials are not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.';
    }

    try {
      // Directly query the documents table based on the document ID
      const { data, error } = await supabase
        .from('documents')
        .select('content, id, metadata')
        .eq('id', document_id)
        .limit(1)
        .single();

      if (error) {
        console.error('Supabase query error in getFileContentsTool:', error);

        // If the document was not found, try querying by file_id in the metadata
        if (error.code === 'PGRST116') {
          console.log(
            `[getFileContentsTool] Document not found by ID, trying file_id in metadata`,
          );

          const { data: dataByFileId, error: fileIdError } = await supabase
            .from('documents')
            .select('content, id, metadata')
            .contains('metadata', { file_id: document_id })
            .limit(1)
            .single();

          if (fileIdError) {
            console.error('Supabase file_id query error:', fileIdError);
            throw new Error(
              `Document not found with ID or file_id: ${document_id}`,
            );
          }

          if (dataByFileId?.content) {
            console.log(
              `[getFileContentsTool] Successfully found document by file_id: ${document_id}`,
            );
            return typeof dataByFileId.content === 'string'
              ? dataByFileId.content
              : JSON.stringify(dataByFileId.content);
          }
        }

        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!data || !data.content) {
        console.log(
          `[getFileContentsTool] No content found for document ID: ${document_id}`,
        );
        return `No content found for document ID: ${document_id}. Please verify the document exists using the listDocuments tool.`;
      }

      console.log(
        `[getFileContentsTool] Successfully retrieved content for document ID: ${document_id}`,
      );

      // Return the content, handling both string and object formats
      return typeof data.content === 'string'
        ? data.content
        : JSON.stringify(data.content);
    } catch (error: any) {
      console.error(`Error in getFileContents tool: ${error.message}`);
      return `Failed to retrieve document content: ${error.message}`;
    }
  },
});
