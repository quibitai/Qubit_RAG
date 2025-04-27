/**
 * Get File Contents Tool for Langchain
 *
 * This tool retrieves the full text content of a document
 * from the Supabase 'documents' table using its ID.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Tool response type definition
 */
type FileContentsResponse = {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: Record<string, any>;
};

export const getFileContentsTool = new DynamicStructuredTool({
  name: 'getFileContents',
  description: `
    Retrieves the full text of a document by its metadata ID.
    Calls the get_aggregated_document_content RPC, which aggregates all chunks
    from the documents table where metadata->>'file_id' = the provided ID.
  `,
  schema: z.object({
    document_id: z
      .string()
      .describe(
        'The metadata ID of the document as returned by listDocuments.',
      ),
  }),
  func: async ({ document_id }): Promise<string> => {
    console.log(
      `[getFileContentsTool] Fetching content for document_id=${document_id}`,
    );

    if (!supabaseUrl || !supabaseKey) {
      return 'Supabase credentials are not configured.';
    }

    try {
      // 1) First, try treating document_id as the real file_id
      let { data, error } = await supabase.rpc(
        'get_aggregated_document_content',
        { p_file_id: document_id },
      );

      // 2) If no content was returned (empty array) or the call errored, then try title lookup:
      if (error || !Array.isArray(data) || data.length === 0) {
        if (error) {
          console.warn(
            '[getFileContentsTool] RPC error on raw ID, falling back to title lookup:',
            error,
          );
        } else {
          console.log(
            '[getFileContentsTool] No data for raw ID, falling back to title lookup',
          );
        }

        // Look up metadata.id by fuzzy title match
        const { data: metaList, error: metaErr } = await supabase
          .from('document_metadata')
          .select('id, title')
          .ilike('title', `%${document_id.replace(/\s+/g, '%')}%`)
          .limit(1);

        if (metaErr) {
          console.error('[getFileContentsTool] Title lookup error:', metaErr);
          return `Error looking up document by title: ${metaErr.message}`;
        }
        if (!metaList || metaList.length === 0) {
          return `No document found matching "${document_id}".`;
        }
        const fileId = metaList[0].id;
        console.log(
          `[getFileContentsTool] Fuzzy matched "${metaList[0].title}" → ${fileId}`,
        );

        // Retry RPC using the matched ID
        ({ data, error } = await supabase.rpc(
          'get_aggregated_document_content',
          { p_file_id: fileId },
        ));
        if (error) {
          console.error(
            '[getFileContentsTool] RPC error on matched ID:',
            error,
          );
          return `Error fetching content for "${metaList[0].title}": ${error.message}`;
        }
      }

      console.log('[getFileContentsTool] RPC returned:', { data, error });

      // data is now either from step 1 or 2
      const text =
        Array.isArray(data) && data.length > 0
          ? (data[0] as any).document_text
          : null;

      if (!text) {
        return 'No content found for that document.';
      }

      // Log the type and length of the content being returned
      console.log(
        `[getFileContentsTool] Returning string content (length: ${text.length}) for document_id ${document_id}`,
      );
      return text; // Return the text string directly
    } catch (err: any) {
      console.error('[getFileContentsTool] Unexpected error:', err);
      return `Error fetching file content for document_id ${document_id}: ${err.message}`;
    }
  },
});
