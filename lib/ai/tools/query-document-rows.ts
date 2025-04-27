/**
 * Query Document Rows Tool for Langchain
 *
 * This tool retrieves rows from document_rows table in Supabase
 * for a specific dataset_id.
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
  console.error('Missing Supabase URL or Key for queryDocumentRows tool.');
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Maximum number of rows to return to prevent overwhelming the AI model
const MAX_ROWS_TO_RETURN = 50;

/**
 * Langchain tool for retrieving rows from the document_rows table
 * for a specific dataset_id.
 */
export const queryDocumentRowsTool = new DynamicStructuredTool({
  name: 'queryDocumentRows',
  description:
    'Retrieves structured row data for a specific dataset using its ID. Use this when the user asks a question about specific data within a spreadsheet or dataset.',
  schema: z.object({
    dataset_id: z
      .string()
      .describe('The unique dataset ID of the document to query rows for'),
  }),
  func: async ({ dataset_id }: { dataset_id: string }) => {
    console.log(
      `[queryDocumentRows] Retrieving rows for dataset_id=${dataset_id}`,
    );

    // Verify Supabase credentials are available
    if (!supabaseUrl || !supabaseKey) {
      return JSON.stringify({
        success: false,
        error:
          'Supabase credentials are not configured correctly. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      });
    }

    // Validate dataset_id format
    if (
      !dataset_id ||
      typeof dataset_id !== 'string' ||
      dataset_id.trim() === ''
    ) {
      return JSON.stringify({
        success: false,
        error:
          'Invalid dataset ID provided. Please provide a valid dataset ID.',
      });
    }

    try {
      const { data, error, count } = await supabase
        .from('document_rows')
        .select('*', { count: 'exact' })
        .eq('dataset_id', dataset_id)
        .limit(MAX_ROWS_TO_RETURN);

      if (error) {
        console.error('[queryDocumentRows] Supabase query error:', error);
        return JSON.stringify({
          success: false,
          error: `Database query failed: ${error.message}`,
        });
      }

      if (!data || data.length === 0) {
        console.log('[queryDocumentRows] No rows found for dataset');
        return JSON.stringify({
          success: true,
          rows: [],
          message: 'The dataset exists but contains no rows.',
        });
      }

      const totalRowCount = count || data.length;
      console.log(
        `[queryDocumentRows] Retrieved ${data.length} rows out of ${totalRowCount} total`,
      );

      const truncated = totalRowCount > MAX_ROWS_TO_RETURN;

      // Return the row data
      return JSON.stringify({
        success: true,
        rows: data,
        totalRowCount,
        truncated,
        message: truncated
          ? `Retrieved ${totalRowCount} rows total, showing first ${MAX_ROWS_TO_RETURN} rows. Ask specific questions about the data for better results.`
          : `Successfully retrieved all ${totalRowCount} rows from the dataset.`,
      });
    } catch (err: any) {
      console.error(
        `[queryDocumentRows] Error retrieving rows: ${err.message}`,
      );
      return JSON.stringify({
        success: false,
        error: `Failed to execute document rows query: ${err.message}`,
      });
    }
  },
});
