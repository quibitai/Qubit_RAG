'use server';

console.log('[actions.ts] loaded by Next.js');

import { generateText, type Message } from 'ai';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db/client';
import { chat, message as messageTable, type Chat } from '@/lib/db/schema';
import type { DBMessage } from '@/lib/db/schema';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
  saveChat,
  saveMessages,
  ensureChatExists,
  deleteChatById,
  getChatById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
import { myProvider } from '@/lib/ai/providers';
import { eq, and } from 'drizzle-orm';
import { unstable_serialize } from 'next/navigation';
import { mutate } from 'react-query';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: Message;
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel('title-model'),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  return await updateChatVisiblityById({ chatId, visibility });
}

/**
 * Creates a new chat and saves the first user message to the database
 */
export async function createNewChatAndSaveFirstMessage(formData: FormData) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      console.error('[Server Action] createNewChat: User not authenticated.');
      return { success: false, error: 'User not authenticated.' };
    }

    const chatId = formData.get('chatId') as string;
    const messageId = formData.get('messageId') as string;
    const input = formData.get('input') as string;

    if (!chatId || !messageId || !input) {
      console.error('[Server Action] createNewChat: Missing required fields.', {
        chatId,
        messageId,
        input,
      });
      return { success: false, error: 'Missing required fields.' };
    }

    // Format the user message for database storage
    const userMessage: DBMessage = {
      id: messageId,
      chatId: chatId,
      role: 'user',
      parts: [{ type: 'text', text: input }],
      attachments: [],
      createdAt: new Date(),
    };

    // Generate title from the user message
    const title = await generateTitleFromUserMessage({
      message: {
        id: userMessage.id,
        role: 'user',
        content: input,
      },
    });

    console.log(`[Server Action] Generated title: ${title} for chat ${chatId}`);

    // Save Chat Metadata
    console.log(
      `[Server Action] Attempting to save chat ${chatId} for user ${userId}`,
    );
    await db.insert(chat).values({
      id: chatId,
      createdAt: new Date(),
      userId: userId,
      title,
    });

    // Save the First User Message
    console.log(
      `[Server Action] Saving first message in chat ${chatId}`,
      JSON.stringify(userMessage, null, 2),
    );
    await db.insert(messageTable).values(userMessage);

    revalidatePath('/chat/[id]');
    return { success: true };
  } catch (error) {
    console.error(`[Server Action] createNewChat FAILED:`, error);
    return { success: false, error: 'Failed to create new chat.' };
  }
}

/**
 * Creates a new chat and saves the initial messages to the database
 * (Modified to only save the chat metadata and not the messages, as they are now handled by the Brain API)
 */
export async function createChatAndSaveFirstMessages(params: {
  chatId: string;
  userMessage: {
    id: string;
    chatId: string;
    role: string;
    parts: unknown[];
    attachments: unknown[];
    createdAt: Date;
  };
  assistantMessage: {
    id: string;
    chatId: string;
    role: string;
    parts: unknown[];
    attachments: unknown[];
    createdAt: Date;
  };
}) {
  const logContext = '[Server Action - createChatAndSaveFirstMessages]';
  const { chatId, userMessage, assistantMessage } = params;

  console.log(`${logContext} Starting for chat ID: ${chatId}`);

  try {
    const session = await auth();
    const userId = session?.user?.id;
    const clientId = session?.user?.clientId as string;

    console.log(
      `${logContext} Auth check complete. User ID: ${userId}, Client ID: ${clientId}`,
    );

    if (!userId) {
      console.error(
        `${logContext} CRITICAL: User not authenticated or userId missing. Aborting.`,
      );
      return { success: false, error: 'User not authenticated.' };
    }

    if (!clientId) {
      console.error(
        `${logContext} CRITICAL: Client ID missing from user session. Aborting.`,
      );
      return { success: false, error: 'User session invalid.' };
    }

    // Generate a meaningful title based on the first user message
    let title = '';
    try {
      // Extract title from user message content
      const userContent =
        userMessage.parts &&
        Array.isArray(userMessage.parts) &&
        userMessage.parts.length > 0 &&
        typeof userMessage.parts[0] === 'object' &&
        userMessage.parts[0] !== null &&
        'type' in userMessage.parts[0] &&
        userMessage.parts[0].type === 'text' &&
        'text' in userMessage.parts[0]
          ? (userMessage.parts[0].text as string)
          : '';

      // Use the first few words of user message as title, or fallback to default
      if (userContent && typeof userContent === 'string') {
        // Use up to first 5 words or 50 characters
        const words = userContent.split(' ');
        title = words.slice(0, 5).join(' ');
        if (title.length > 50) {
          title = title.substring(0, 47) + '...';
        }
      }
    } catch (error) {
      console.error(`${logContext} Error generating title:`, error);
    }

    // Use a fallback title if extraction failed
    if (!title) {
      title = `Chat ${chatId.slice(0, 8)}`;
    }

    console.log(
      `${logContext} Generated title: "${title}" for chat ID: ${chatId}`,
    );

    // First, check if the chat already exists to handle race conditions proactively
    const existingChat = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    const chatExists = existingChat.length > 0;

    if (chatExists) {
      console.log(
        `${logContext} Chat ${chatId} already exists, handling gracefully`,
      );
      // Chat exists, don't need to create it again
      return { success: true, chatId };
    }

    // Create new chat in a transaction with retry logic
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(
        `${logContext} Transaction attempt ${attempts}/${maxAttempts} for chat ${chatId}`,
      );

      try {
        // Create just the chat record, not the messages
        await db.transaction(async (tx) => {
          // Create the Chat row with better error handling
          console.log(
            `${logContext} Attempting to insert chat row for ${chatId}`,
          );

          await tx.insert(chat).values({
            id: chatId,
            userId: userId,
            clientId: clientId,
            title: title,
            createdAt: new Date(),
            visibility: 'private',
          });

          console.log(
            `${logContext} Successfully inserted chat row for ${chatId}`,
          );

          // REMOVED: No longer insert user message, as it's handled by the Brain API
          // This prevents duplicate user message entries
        });

        console.log(
          `${logContext} Transaction committed successfully for chat ${chatId}`,
        );

        // Success - break out of retry loop
        break;
      } catch (error: any) {
        lastError = error;

        // Handle different error types
        if (error.code === '23505') {
          // Unique constraint violation - chat already exists
          console.warn(
            `${logContext} Chat ${chatId} already exists (race condition).`,
          );
          // Set lastError to null to indicate success
          lastError = null;
          break;
        } else {
          console.error(
            `${logContext} Transaction failed (attempt ${attempts}/${maxAttempts}):`,
            error,
          );

          // Add a short delay before retrying to reduce race conditions
          if (attempts < maxAttempts) {
            const delay = 100 * attempts; // Increasing delay with each attempt
            console.log(`${logContext} Waiting ${delay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    }

    // Check if we succeeded after retries
    if (lastError) {
      console.error(
        `${logContext} All ${maxAttempts} transaction attempts failed:`,
        lastError,
      );
      return {
        success: false,
        error: `Failed to create chat after ${maxAttempts} attempts: ${lastError.message}`,
        code: lastError.code,
      };
    }

    // Revalidate paths to update UI
    revalidatePath('/api/history');
    console.log(`${logContext} Revalidated path /api/history`);

    revalidatePath(`/chat/${chatId}`);
    console.log(`${logContext} Revalidated path /chat/${chatId}`);

    return { success: true, chatId };
  } catch (error: any) {
    console.error(`${logContext} Unexpected error:`, error);

    if (error.code) {
      console.error(`${logContext} Error Code: ${error.code}`);
    }
    if (error.message) {
      console.error(`${logContext} Error Message: ${error.message}`);
    }

    return {
      success: false,
      error: `Failed to create chat: ${error.message || 'Unknown error'}`,
      code: error.code,
    };
  }
}

/**
 * Deletes a chat and its related messages and votes by ID
 */
export async function deleteChat(
  chatId: string,
): Promise<{ success: boolean; error?: string }> {
  const logContext = '[Server Action - deleteChat]';
  console.log(`${logContext} Attempting to delete chat ID: ${chatId}`);

  if (!chatId) {
    console.error(`${logContext} No chatId provided.`);
    return { success: false, error: 'Chat ID is required.' };
  }

  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      console.error(`${logContext} User not authenticated.`);
      return { success: false, error: 'User not authenticated.' };
    }

    // Optional but recommended: Verify user owns the chat before deleting
    const chatToDelete = await getChatById({ id: chatId });
    if (!chatToDelete) {
      console.warn(`${logContext} Chat ${chatId} not found.`);
      // Return success=true because the chat is already gone
      return { success: true };
    }
    if (chatToDelete.userId !== userId) {
      console.error(
        `${logContext} User ${userId} does not own chat ${chatId}.`,
      );
      return { success: false, error: 'Permission denied.' };
    }

    console.log(
      `${logContext} Deleting votes, messages, and chat for ID: ${chatId}`,
    );
    // This function already handles deleting related messages and votes
    await deleteChatById({ id: chatId });

    console.log(`${logContext} Successfully deleted chat ID: ${chatId}`);

    // Revalidate paths that show chat history
    revalidatePath('/');
    revalidatePath('/chat'); // Revalidate the base chat path
    revalidatePath('/api/history');

    return { success: true };
  } catch (error: any) {
    console.error(`${logContext} FAILED to delete chat ${chatId}:`, error);
    return {
      success: false,
      error: `Failed to delete chat: ${error.message || 'Unknown error'}`,
    };
  }
}
