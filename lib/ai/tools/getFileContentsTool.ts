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
    'Retrieves the full text content of a document using its unique ID (obtained from listDocuments). Use this when you need to read or analyze the complete content of a specific document.',
  schema: getFileContentsSchema, // Expects { document_id: string }
  func: async ({ document_id }: { document_id: string }) => {
    // Input parameter is document_id (UUID)
    console.log(
      `[getFileContentsTool] Received request for document_metadata ID: ${document_id}`,
    );

    if (!supabaseUrl || !supabaseKey) {
      return 'Error: Supabase credentials are not configured.';
    }
    if (!document_id) {
      return 'Error: No document_id provided.';
    }

    let file_id_to_use: string | null = null;

    try {
      // STEP 1: Look up the file_id (text identifier) using the document_id (UUID)
      console.log(
        `[getFileContentsTool] Looking up file_id for document_metadata id: ${document_id}`,
      );
      const { data: metadata, error: metadataError } = await supabase
        .from('document_metadata')
        .select('file_id') // Select the text file_id column
        .eq('id', document_id) // Filter using the input UUID id
        .maybeSingle(); // Use maybeSingle() in case ID doesn't exist

      if (metadataError) {
        console.error('Supabase metadata lookup error:', metadataError);
        throw new Error(
          `Failed to look up file metadata: ${metadataError.message}`,
        );
      }

      if (!metadata || !metadata.file_id) {
        console.log(
          `[getFileContentsTool] Could not find file_id in document_metadata for id: ${document_id}`,
        );
        // Optional: Fallback - maybe the input *was* the file_id? Unlikely given listDocuments output.
        // file_id_to_use = document_id; // Use this only if you suspect the input might sometimes be the text file_id directly
        // For now, treat as not found if lookup fails:
        return `Error: Could not find matching file_id for the provided document ID: ${document_id}.`;
      }

      file_id_to_use = metadata.file_id;
      console.log(
        `[getFileContentsTool] Found file_id: ${file_id_to_use} for document_id: ${document_id}`,
      );

      // STEP 2: Call the RPC function using the retrieved file_id
      console.log(
        `[getFileContentsTool] Calling RPC 'get_aggregated_document_content' for file_id: ${file_id_to_use}`,
      );
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_aggregated_document_content', // Function name
        { p_file_id: file_id_to_use }, // Argument name matching the function
      );

      if (rpcError) {
        console.error('Supabase RPC error in getFileContentsTool:', rpcError);
        if (
          rpcError.message.includes('function') &&
          rpcError.message.includes('does not exist')
        ) {
          console.error(
            "DATABASE FUNCTION MISSING: Ensure 'get_aggregated_document_content(p_file_id TEXT)' exists in Supabase.",
          );
          return `Error: The required database function 'get_aggregated_document_content' is missing.`;
        }
        throw new Error(`Database function error: ${rpcError.message}`);
      }

      console.log(`[getFileContentsTool] RPC returned data:`, rpcData);

      // Extract the text from RPC result
      const documentText =
        rpcData?.[0]?.document_text ||
        rpcData?.document_text ||
        (typeof rpcData === 'string' ? rpcData : null);

      if (
        documentText === null ||
        documentText === undefined ||
        documentText === ''
      ) {
        console.log(
          `[getFileContentsTool] Content not found or empty via RPC for file_id: ${file_id_to_use}`,
        );
        if (!rpcData || (Array.isArray(rpcData) && rpcData.length === 0)) {
          return `No document content found in the database for File ID: ${file_id_to_use}`;
        } else {
          return `Document content appears empty for File ID: ${file_id_to_use}`;
        }
      }

      console.log(
        `[getFileContentsTool] Successfully retrieved content for File ID: ${file_id_to_use}. Length: ${documentText.length}`,
      );
      return documentText; // Return the aggregated text
    } catch (error: any) {
      console.error(`Error in getFileContents tool: ${error.message}`);
      // Provide a more specific error if it's likely due to missing lookup
      if (
        !file_id_to_use &&
        error.message.includes('Failed to look up file metadata')
      ) {
        return error.message; // Return the specific lookup error
      }
      return `Failed to get document content from database: ${error.message}`;
    }
  },
});
