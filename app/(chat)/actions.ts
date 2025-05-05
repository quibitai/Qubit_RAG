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
 * Saves subsequent messages (user + assistant pairs) to the database
 */
export async function saveSubsequentMessages(params: {
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
  const logContext = '[Server Action - saveSubsequentMessages]';
  const { chatId, userMessage, assistantMessage } = params;
  console.log(`${logContext} Starting for chat ID: ${chatId}`);

  try {
    const session = await auth();
    const userId = session?.user?.id;
    const clientId = session?.user?.clientId;

    console.log(
      `${logContext} Auth check complete. User ID: ${userId}, Client ID: ${clientId}`,
    );

    if (!userId) {
      console.error(
        `${logContext} CRITICAL: User not authenticated. Aborting.`,
      );
      return { success: false, error: 'User not authenticated.' };
    }

    if (!clientId) {
      console.error(
        `${logContext} CRITICAL: Client ID missing from user session. Aborting.`,
      );
      return { success: false, error: 'User session invalid.' };
    }

    // First, verify the chat exists and belongs to the user
    const chatResult = await db
      .select({
        id: chat.id,
        userId: chat.userId,
      })
      .from(chat)
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .limit(1);

    if (chatResult.length === 0) {
      console.error(
        `${logContext} Chat ${chatId} not found or doesn't belong to user ${userId}`,
      );
      return {
        success: false,
        error: 'Chat not found or you do not have permission to modify it.',
      };
    }

    console.log(
      `${logContext} Verified chat ${chatId} belongs to user ${userId}`,
    );

    // Add clientId to message objects
    const userMessageWithClientId = {
      ...userMessage,
      clientId,
    };

    const assistantMessageWithClientId = {
      ...assistantMessage,
      clientId,
    };

    console.log(`${logContext} Added clientId ${clientId} to message objects`);

    // Ensure dates are proper Date objects
    const userMessageWithDate = {
      ...userMessageWithClientId,
      createdAt:
        userMessageWithClientId.createdAt instanceof Date
          ? userMessageWithClientId.createdAt
          : new Date(userMessageWithClientId.createdAt),
    };

    const assistantMessageWithDate = {
      ...assistantMessageWithClientId,
      createdAt:
        assistantMessageWithClientId.createdAt instanceof Date
          ? assistantMessageWithClientId.createdAt
          : new Date(assistantMessageWithClientId.createdAt),
    };

    console.log(
      `${logContext} Converted dates to Date objects for message insertion`,
    );

    // Use a retry mechanism for message insertion
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(
        `${logContext} Message insertion attempt ${attempts}/${maxAttempts} for chat ${chatId}`,
      );

      try {
        // Wrap in transaction to ensure both messages are saved or none
        await db.transaction(async (tx) => {
          console.log(
            `${logContext} Inserting user message ${userMessageWithDate.id}`,
          );
          await tx.insert(messageTable).values(userMessageWithDate);

          console.log(
            `${logContext} Inserting assistant message ${assistantMessageWithDate.id}`,
          );
          await tx.insert(messageTable).values(assistantMessageWithDate);
        });

        console.log(
          `${logContext} Both messages saved successfully for chat ${chatId}`,
        );

        // Success - break out of retry loop
        break;
      } catch (error: any) {
        lastError = error;
        console.error(
          `${logContext} Message insertion failed (attempt ${attempts}/${maxAttempts}):`,
          error,
        );

        // Handle different error types
        if (error.code === '23505') {
          // Unique constraint violation
          console.warn(
            `${logContext} Message ID conflict, likely duplicate. Attempting to handle.`,
          );

          try {
            // Try inserting with conflict handling
            await db
              .insert(messageTable)
              .values([userMessageWithDate, assistantMessageWithDate])
              .onConflictDoNothing({ target: messageTable.id });

            console.log(
              `${logContext} Inserted messages with conflict handling for chat ${chatId}`,
            );

            // Set lastError to null to indicate success
            lastError = null;
            break;
          } catch (conflictError: any) {
            console.error(
              `${logContext} Failed to handle message conflict:`,
              conflictError,
            );
            lastError = conflictError;
          }
        } else if (error.code === '23503') {
          // Foreign key constraint violation
          console.error(
            `${logContext} Foreign key violation. Chat ${chatId} may not exist.`,
          );
          return {
            success: false,
            error: 'Chat not found in database. Messages cannot be saved.',
            code: error.code,
          };
        }

        // Add a short delay before retrying to reduce race conditions
        if (attempts < maxAttempts) {
          const delay = Math.min(100 * Math.pow(2, attempts), 2000); // Exponential backoff up to 2s
          console.log(`${logContext} Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Check if all attempts failed
    if (lastError) {
      console.error(
        `${logContext} All ${maxAttempts} attempts failed:`,
        lastError,
      );
      return {
        success: false,
        error: `Failed to save messages after ${maxAttempts} attempts: ${lastError.message || 'Unknown error'}`,
        code: lastError.code,
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error(`${logContext} Unexpected error:`, error);
    return {
      success: false,
      error: `Failed to save messages: ${error.message || 'Unknown error'}`,
      code: error.code,
    };
  }
}

export async function createChat(
  chatId: string,
  firstUserMessageContent: string,
): Promise<{ success: boolean; error?: string; title?: string }> {
  const logContext = '[Server Action - createChat SIMPLIFIED]';
  console.log(`${logContext} Attempting to create chat ${chatId}`);
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    console.error(`${logContext} User not authenticated.`);
    return { success: false, error: 'User not authenticated.' };
  }

  if (!chatId) {
    console.error(`${logContext} Missing chatId.`);
    return { success: false, error: 'Missing chatId for chat creation.' };
  }

  // --- Use a placeholder title for now ---
  const placeholderTitle = `Chat ${chatId.substring(0, 8)}`;
  console.log(`${logContext} Using placeholder title: "${placeholderTitle}"`);

  try {
    // --- Perform the insert ---
    console.log(`${logContext} Executing db.insert for chat ${chatId}...`);
    await db.insert(chat).values({
      id: chatId,
      userId: userId,
      title: placeholderTitle,
      createdAt: new Date(),
      visibility: 'private',
    });

    // --- Log IMMEDIATELY after await ---
    console.log(
      `${logContext} *** db.insert for ${chatId} supposedly COMPLETE ***`,
    );
    return { success: true, title: placeholderTitle };
  } catch (error: any) {
    if (error.code === '23505') {
      // Unique constraint violation
      console.warn(
        `${logContext} Chat ${chatId} already exists (race condition). Returning success.`,
      );
      // In a race condition, the chat exists, so treat as success. Fetch title if needed.
      try {
        const existingChat = await db
          .select({ title: chat.title })
          .from(chat)
          .where(eq(chat.id, chatId))
          .limit(1);
        return {
          success: true,
          title: existingChat[0]?.title || placeholderTitle,
        };
      } catch (fetchError) {
        console.error(
          `${logContext} Failed to fetch existing title after unique constraint error:`,
          fetchError,
        );
        return { success: true, title: placeholderTitle };
      }
    } else {
      // Handle other database errors
      console.error(
        `${logContext} FAILED to create chat ${chatId} during insert:`,
        error,
      );
      return {
        success: false,
        error: `Failed to create chat: ${error.message}`,
      };
    }
  }
}

// New function to create chat and save first messages in a single transaction
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
