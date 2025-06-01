/**
 * Conversational Memory Module
 *
 * Handles storage and retrieval of conversational memory using Supabase for
 * maintaining context awareness across long conversations.
 */

import { supabase } from '@/lib/db/client';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { ConversationalMemorySnippet } from '@/lib/contextUtils';

// Initialize embeddings (using the same model as other tools for consistency)
const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Retrieves relevant conversational memory snippets for a given chat and query.
 *
 * @param chatId - The chat ID to filter memory by
 * @param queryText - The current user query to find similar past conversations
 * @param maxResults - Maximum number of snippets to return (default: 5)
 * @returns Array of conversational memory snippets ordered by relevance
 */
export async function retrieveConversationalMemory(
  chatId: string,
  queryText: string,
  maxResults = 5,
): Promise<ConversationalMemorySnippet[]> {
  try {
    console.log(
      `[ConversationalMemory] Retrieving memory for chatId=${chatId}, query="${queryText.substring(0, 100)}..."`,
    );

    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        '[ConversationalMemory] OpenAI API key not configured, skipping memory retrieval',
      );
      return [];
    }

    // Generate embedding for the current query
    const queryEmbedding = await embeddings.embedQuery(queryText);

    // Call the Supabase RPC function to find similar conversational memory
    // Format embedding as vector literal for Supabase
    const { data, error } = await supabase.rpc('match_conversational_history', {
      query_embedding: `[${queryEmbedding.join(',')}]`,
      match_chat_id: chatId,
      match_count: maxResults,
    });

    if (error) {
      console.error('[ConversationalMemory] Error retrieving memory:', error);
      return [];
    }

    if (!data || data.length === 0) {
      console.log(
        `[ConversationalMemory] No memory found for chatId=${chatId}`,
      );
      return [];
    }

    console.log(
      `[ConversationalMemory] Retrieved ${data.length} memory snippets for chatId=${chatId}`,
    );

    // Map the database results to ConversationalMemorySnippet format
    return data.map((item: any) => ({
      id: item.id,
      content: item.content,
      source_type: item.source_type as 'turn' | 'summary',
      created_at: item.created_at,
      similarity: item.similarity,
    }));
  } catch (error) {
    console.error(
      '[ConversationalMemory] Error retrieving conversational memory:',
      error,
    );
    return [];
  }
}

/**
 * Stores a new conversational turn in memory.
 *
 * @param chatId - The chat ID this memory belongs to
 * @param userMessage - The user's message content
 * @param aiResponse - The AI's response content
 * @param sourceType - Type of memory: 'turn' for individual exchanges, 'summary' for summaries
 * @returns Promise<boolean> indicating success/failure
 */
export async function storeConversationalMemory(
  chatId: string,
  userMessage: string,
  aiResponse: string,
  sourceType: 'turn' | 'summary' = 'turn',
): Promise<boolean> {
  try {
    console.log(
      `[ConversationalMemory] Storing ${sourceType} for chatId=${chatId}`,
    );

    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        '[ConversationalMemory] OpenAI API key not configured, skipping memory storage',
      );
      return false;
    }

    // Format the content as a turn
    const content = `User: ${userMessage}\nAI: ${aiResponse}`;

    // Generate embedding for the content
    const contentEmbedding = await embeddings.embedQuery(content);

    // Insert into the conversational_memory table
    // Note: The embedding is stored as a vector type in Supabase
    const { error } = await supabase.from('conversational_memory').insert({
      chat_id: chatId,
      content: content,
      embedding: `[${contentEmbedding.join(',')}]`, // Format as vector literal for Supabase
      source_type: sourceType,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[ConversationalMemory] Error storing memory:', error);
      return false;
    }

    console.log(
      `[ConversationalMemory] Successfully stored ${sourceType} for chatId=${chatId}`,
    );
    return true;
  } catch (error) {
    console.error(
      '[ConversationalMemory] Error storing conversational memory:',
      error,
    );
    return false;
  }
}

/**
 * Gets the count of stored conversational turns for a chat.
 * Used to determine when summarization should be triggered.
 *
 * @param chatId - The chat ID to count turns for
 * @param sourceType - Type to count ('turn' for individual exchanges, 'summary' for summaries)
 * @returns Promise<number> count of stored items
 */
export async function getConversationalMemoryCount(
  chatId: string,
  sourceType: 'turn' | 'summary' = 'turn',
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('conversational_memory')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', chatId)
      .eq('source_type', sourceType);

    if (error) {
      console.error('[ConversationalMemory] Error counting memory:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error(
      '[ConversationalMemory] Error counting conversational memory:',
      error,
    );
    return 0;
  }
}

/**
 * Retrieves recent unsummarized turns for summarization.
 *
 * @param chatId - The chat ID to retrieve turns for
 * @param limit - Maximum number of recent turns to retrieve
 * @returns Promise<ConversationalMemorySnippet[]> array of recent turns
 */
export async function getRecentTurnsForSummarization(
  chatId: string,
  limit = 7,
): Promise<ConversationalMemorySnippet[]> {
  try {
    const { data, error } = await supabase
      .from('conversational_memory')
      .select('*')
      .eq('chat_id', chatId)
      .eq('source_type', 'turn')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(
        '[ConversationalMemory] Error retrieving recent turns:',
        error,
      );
      return [];
    }

    if (!data) {
      return [];
    }

    return data.map((item) => ({
      id: item.id,
      content: item.content,
      source_type: item.source_type as 'turn' | 'summary',
      created_at: item.created_at,
    }));
  } catch (error) {
    console.error(
      '[ConversationalMemory] Error retrieving recent turns:',
      error,
    );
    return [];
  }
}

/**
 * Placeholder for future summarization functionality.
 * This will be called when the number of stored turns exceeds a threshold.
 *
 * @param chatId - The chat ID to summarize
 * @param turns - Array of turns to summarize
 * @returns Promise<boolean> indicating success/failure
 */
export async function summarizeAndStoreConversation(
  chatId: string,
  turns: ConversationalMemorySnippet[],
): Promise<boolean> {
  // TODO: Implement summarization logic using LLM
  // For now, this is a placeholder that returns false to indicate not implemented
  console.log(
    `[ConversationalMemory] Summarization not yet implemented for chatId=${chatId}, ${turns.length} turns`,
  );
  return false;
}

/**
 * DEBUG: Temporary function to check what's actually in the conversational memory table
 * for a specific chat ID without vector similarity search
 */
export async function debugConversationalMemoryForChat(
  chatId: string,
): Promise<void> {
  try {
    console.log(
      `[ConversationalMemory DEBUG] Checking all memory entries for chatId=${chatId}`,
    );

    // Get all entries for this chat ID
    const { data, error } = await supabase
      .from('conversational_memory')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(
        '[ConversationalMemory DEBUG] Error querying memory:',
        error,
      );
      return;
    }

    if (!data || data.length === 0) {
      console.log(
        `[ConversationalMemory DEBUG] No entries found for chatId=${chatId}`,
      );
      return;
    }

    console.log(
      `[ConversationalMemory DEBUG] Found ${data.length} entries for chatId=${chatId}:`,
    );
    data.forEach((item, index) => {
      console.log(`  Entry ${index + 1}:`);
      console.log(`    - ID: ${item.id}`);
      console.log(`    - Chat ID: ${item.chat_id}`);
      console.log(`    - Content: "${item.content.substring(0, 200)}..."`);
      console.log(`    - Source Type: ${item.source_type}`);
      console.log(`    - Created: ${item.created_at}`);
    });

    // Also check if there are entries from other chats that might be mixed up
    const { data: allData, error: allError } = await supabase
      .from('conversational_memory')
      .select('chat_id, content, created_at')
      .neq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!allError && allData && allData.length > 0) {
      console.log(
        `[ConversationalMemory DEBUG] Sample of other chats in memory:`,
      );
      allData.forEach((item, index) => {
        console.log(
          `  Other chat ${index + 1}: ${item.chat_id} - "${item.content.substring(0, 100)}..."`,
        );
      });
    }
  } catch (error) {
    console.error(
      '[ConversationalMemory DEBUG] Error in debug function:',
      error,
    );
  }
}
