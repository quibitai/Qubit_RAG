import { db } from '@/lib/db';
import { chat, message } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { retryWithBackoff } from '@/lib/utils';

/**
 * Repository for chat-related database operations
 * Provides a clean abstraction over database access for chat functionality
 */
export class ChatRepository {
  /**
   * Create a new chat with initial messages
   *
   * @param chatData The chat data to create
   * @param messageData Array of messages to create with the chat
   * @returns Object containing success status and chat ID
   */
  async createChat(
    chatData: {
      id: string;
      userId: string;
      title: string;
      createdAt: Date;
      visibility?: 'public' | 'private';
    },
    messageData: Array<{
      id: string;
      chatId: string;
      role: string;
      content: string;
      createdAt: Date;
      parts?: any[];
      attachments?: any[];
    }>,
  ) {
    try {
      // Execute as a transaction to ensure atomicity
      const result = await db.transaction(async (tx) => {
        console.log(
          `[ChatRepository] Creating chat ${chatData.id} for user ${chatData.userId}`,
        );

        // Insert chat record with required fields
        await tx.insert(chat).values({
          id: chatData.id,
          userId: chatData.userId,
          title: chatData.title,
          createdAt: chatData.createdAt,
          visibility: chatData.visibility || 'private',
        });

        // Insert message records with all required fields
        if (messageData.length > 0) {
          // Ensure each message has the required attachments field
          const messagesWithAttachments = messageData.map((msg) => ({
            ...msg,
            parts: msg.parts || [{ type: 'text', text: msg.content }],
            attachments: msg.attachments || [],
          }));

          await tx.insert(message).values(messagesWithAttachments);
        }

        return { success: true, chatId: chatData.id };
      });

      // Verify chat creation with retries
      await this.verifyChat(chatData.id);

      return result;
    } catch (error) {
      console.error(
        `[ChatRepository] Error creating chat ${chatData.id}:`,
        error,
      );
      return {
        success: false,
        chatId: chatData.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find a chat by ID with optional retry mechanism
   *
   * @param chatId The chat ID to find
   * @param options Options for the findById operation
   * @returns The chat or null if not found
   */
  async findById(
    chatId: string,
    options: {
      withRetry?: boolean;
      maxRetries?: number;
      baseDelay?: number;
    } = {},
  ) {
    const { withRetry = false, maxRetries = 3, baseDelay = 300 } = options;

    if (withRetry) {
      return await retryWithBackoff(
        () =>
          db.query.chat.findFirst({
            where: eq(chat.id, chatId),
            with: {
              messages: {
                orderBy: (messages: any, { asc }: any) => [
                  asc(messages.createdAt),
                ],
              },
            },
          }),
        maxRetries,
        baseDelay,
        (result) => result !== null,
      );
    }

    return await db.query.chat.findFirst({
      where: eq(chat.id, chatId),
      with: {
        messages: {
          orderBy: (messages: any, { asc }: any) => [asc(messages.createdAt)],
        },
      },
    });
  }

  /**
   * Verify a chat exists with retry mechanism
   *
   * @param chatId The chat ID to verify
   * @returns True if verified, false otherwise
   */
  async verifyChat(chatId: string): Promise<boolean> {
    const result = await retryWithBackoff(
      () => db.query.chat.findFirst({ where: eq(chat.id, chatId) }),
      3,
      300,
      (result) => result !== null,
    );

    return result !== null;
  }

  /**
   * Add messages to an existing chat
   *
   * @param chatId The chat ID to add messages to
   * @param messageData Array of messages to add
   * @returns Object containing success status
   */
  async addMessages(
    chatId: string,
    messageData: Array<{
      id: string;
      chatId: string;
      role: string;
      content: string;
      createdAt: Date;
      parts?: any[];
      attachments?: any[];
    }>,
  ) {
    try {
      if (messageData.length === 0) {
        return { success: true, chatId };
      }

      // Ensure each message has required fields
      const messagesWithAllFields = messageData.map((msg) => ({
        ...msg,
        parts: msg.parts || [{ type: 'text', text: msg.content }],
        attachments: msg.attachments || [],
      }));

      await db.insert(message).values(messagesWithAllFields);
      return { success: true, chatId };
    } catch (error) {
      console.error(
        `[ChatRepository] Error adding messages to chat ${chatId}:`,
        error,
      );
      return {
        success: false,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
