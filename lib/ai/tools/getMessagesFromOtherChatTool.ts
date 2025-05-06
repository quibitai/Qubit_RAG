import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { sql } from '@/lib/db/client';

/**
 * Tool for fetching messages from another chat thread
 *
 * This tool allows the Orchestrator to access messages from other ongoing conversations,
 * particularly useful when the user asks about what was said in the main UI chat.
 */
export const getMessagesFromOtherChatTool = new DynamicStructuredTool({
  name: 'getMessagesFromOtherChat',
  description:
    'Fetches the most recent messages from a specified conversation thread (chatId). Use this to get context from other ongoing or past conversations, especially from specialist Bits.',
  schema: z.object({
    targetChatId: z
      .string()
      .uuid()
      .describe('The UUID of the chat thread to fetch messages from.'),
    messageCount: z
      .number()
      .int()
      .positive()
      .optional()
      .default(5)
      .describe('Number of recent messages to retrieve.'),
  }),
  func: async ({ targetChatId, messageCount = 5 }) => {
    try {
      console.log(
        `[getMessagesFromOtherChatTool] Fetching messages from chat ID ${targetChatId}`,
      );

      // Fetch messages directly with SQL
      // This assumes RLS is properly configured to only allow access to authorized messages
      const messagesResult = await sql`
        SELECT id, role, parts, "createdAt"
        FROM "Message_v2"
        WHERE "chatId" = ${targetChatId}
        ORDER BY "createdAt" ASC
        LIMIT ${messageCount}
      `;

      if (!messagesResult || messagesResult.length === 0) {
        return `No messages found for chat ID ${targetChatId}.`;
      }

      console.log(
        `[getMessagesFromOtherChatTool] Found ${messagesResult.length} messages`,
      );

      // Format the messages for the LLM
      const formattedMessages = messagesResult.map((msg) => {
        const parts = msg.parts || [];
        let messageContent = '';

        // Extract text from parts
        if (Array.isArray(parts) && parts.length > 0) {
          for (const part of parts) {
            if (part.type === 'text' && part.text) {
              messageContent += part.text;
            }
          }
        }

        return {
          role: msg.role,
          content: messageContent,
          timestamp: new Date(msg.createdAt).toISOString(),
        };
      });

      // Format as a conversation for the LLM
      const conversationText = formattedMessages
        .map(
          (msg) =>
            `${msg.role === 'user' ? 'User' : 'Assistant'} (${new Date(msg.timestamp).toLocaleTimeString()}): ${msg.content}`,
        )
        .join('\n\n');

      return `Recent messages from chat ${targetChatId}:\n\n${conversationText}`;
    } catch (error: any) {
      console.error(`[getMessagesFromOtherChatTool] Error:`, error);
      return `Error fetching messages from chat ${targetChatId}: ${error.message || 'Unknown error'}`;
    }
  },
});
