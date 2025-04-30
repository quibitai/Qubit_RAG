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
    console.log(`${logContext} Auth check complete. User ID: ${userId}`);

    if (!userId) {
      console.error(
        `${logContext} CRITICAL: User not authenticated. Aborting.`,
      );
      return { success: false, error: 'User not authenticated.' };
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
          console.log(`${logContext} Inserting user message ${userMessage.id}`);
          await tx.insert(messageTable).values(userMessage);

          console.log(
            `${logContext} Inserting assistant message ${assistantMessage.id}`,
          );
          await tx.insert(messageTable).values(assistantMessage);
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
              .values([userMessage, assistantMessage])
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
          const delay = 100 * attempts; // Increasing delay with each attempt
          console.log(`${logContext} Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Check if we succeeded after retries
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
    console.log(`${logContext} Auth check complete. User ID: ${userId}`);

    if (!userId) {
      console.error(
        `${logContext} CRITICAL: User not authenticated or userId missing. Aborting.`,
      );
      return { success: false, error: 'User not authenticated.' };
    }

    // Generate a meaningful title based on the first user message
    let title = `Chat ${chatId.slice(0, 8)}`;
    try {
      if (
        userMessage.parts &&
        Array.isArray(userMessage.parts) &&
        userMessage.parts.length > 0
      ) {
        const userContent = userMessage.parts.find(
          (part) =>
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'text' &&
            'text' in part,
        );

        if (
          userContent &&
          typeof userContent === 'object' &&
          'text' in userContent
        ) {
          // Only attempt to generate title if there's actual text content
          const userText = userContent.text as string;
          if (userText && userText.trim().length > 0) {
            console.log(
              `${logContext} Generating title from user message: "${userText.substring(0, 50)}..."`,
            );
            try {
              title = await generateTitleFromUserMessage({
                message: {
                  id: userMessage.id,
                  role: 'user',
                  content: userText,
                },
              });
              console.log(`${logContext} Generated title: "${title}"`);
            } catch (titleError) {
              console.error(
                `${logContext} Failed to generate title, using fallback:`,
                titleError,
              );
              // Continue with fallback title
            }
          }
        }
      }
    } catch (parseError) {
      console.error(
        `${logContext} Error parsing user message for title generation:`,
        parseError,
      );
      // Continue with the default title
    }

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
      // Chat exists but messages might not, so we'll try to insert just the messages
      try {
        // Insert messages directly outside transaction since chat exists
        await db
          .insert(messageTable)
          .values([userMessage, assistantMessage])
          .onConflictDoNothing({ target: messageTable.id });

        console.log(
          `${logContext} Successfully inserted messages for existing chat ${chatId}`,
        );
        return { success: true, chatId };
      } catch (messageError: any) {
        console.error(
          `${logContext} Failed to insert messages for existing chat:`,
          messageError,
        );
        // Return success anyway since chat exists, client can retry message insertion separately
        return {
          success: true,
          chatId,
          warning:
            'Chat exists but failed to save messages. UI may need refresh.',
        };
      }
    }

    // Create new chat and messages in a transaction with retry logic
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(
        `${logContext} Transaction attempt ${attempts}/${maxAttempts} for chat ${chatId}`,
      );

      try {
        // Wrap both inserts in one transaction
        await db.transaction(async (tx) => {
          // 1) Create the Chat row with better error handling
          console.log(
            `${logContext} Attempting to insert chat row for ${chatId}`,
          );

          await tx.insert(chat).values({
            id: chatId,
            userId: userId,
            title: title,
            createdAt: new Date(),
            visibility: 'private',
          });

          console.log(
            `${logContext} Successfully inserted chat row for ${chatId}`,
          );

          // 2) Insert both messages with better error handling
          console.log(
            `${logContext} Inserting message rows for ${chatId}. UserMsg ID: ${userMessage.id}, AssistantMsg ID: ${assistantMessage.id}`,
          );

          await tx.insert(messageTable).values([userMessage, assistantMessage]);

          console.log(
            `${logContext} Successfully inserted message rows for ${chatId}`,
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
          // Unique constraint violation
          console.warn(
            `${logContext} Chat ${chatId} already exists (race condition). Attempting to handle.`,
          );

          try {
            // Try to just insert the messages since chat exists
            await db
              .insert(messageTable)
              .values([userMessage, assistantMessage])
              .onConflictDoNothing({ target: messageTable.id });

            console.log(
              `${logContext} Successfully inserted messages for existing chat ${chatId}`,
            );

            // Set lastError to null to indicate success
            lastError = null;
            break;
          } catch (messageError: any) {
            console.error(
              `${logContext} Failed to insert messages for existing chat:`,
              messageError,
            );
            lastError = messageError;
            // Continue to next retry
          }
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
        error: `Failed to save chat and messages after ${maxAttempts} attempts: ${lastError.message}`,
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
      error: `Failed to save chat and messages: ${error.message || 'Unknown error'}`,
      code: error.code,
    };
  }
}
