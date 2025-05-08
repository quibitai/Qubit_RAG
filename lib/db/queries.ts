import 'server-only';

import { genSaltSync, hashSync } from 'bcrypt-ts';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  message,
  vote,
  type DBMessage,
  type Chat,
  clients,
  type Client,
} from './schema';
import type { ArtifactKind } from '@/components/artifact';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

/**
 * Client configuration type returned by getClientConfig
 */
export type ClientConfig = {
  id: string;
  name: string;
  customInstructions?: string | null;
  enabledBits?: string[] | null;
  configJson?: {
    enabledBits?: string[];
    specialistPrompts?: Record<string, string>;
    // Add any other expected top-level keys from your config_json
  } | null;
};

/**
 * Fetch client configuration based on client ID
 * @param clientId The client ID to fetch configuration for
 * @returns ClientConfig object or null if not found
 */
export async function getClientConfig(
  clientId: string,
): Promise<ClientConfig | null> {
  try {
    console.log(
      `[DB:getClientConfig] Fetching config for clientId: ${clientId}`,
    );
    const result = await db
      .select({
        id: clients.id,
        name: clients.name,
        customInstructions: clients.customInstructions,
        enabledBits: clients.enabledBits,
        configJsonRaw: clients.config_json, // Fetch the JSONB column
      })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (result.length === 0) {
      console.warn(
        `[DB:getClientConfig] No configuration found for clientId: ${clientId}`,
      );
      return null;
    }

    const dbClient = result[0];
    let parsedConfigJson: ClientConfig['configJson'] = null;

    if (dbClient.configJsonRaw) {
      // Drizzle might already parse JSONB, but if it's a string, explicitly parse.
      if (typeof dbClient.configJsonRaw === 'string') {
        try {
          parsedConfigJson = JSON.parse(dbClient.configJsonRaw);
        } catch (e) {
          console.error(
            `[DB:getClientConfig] Failed to parse config_json string for client ${clientId}:`,
            e,
          );
          // Set to null or an empty object depending on desired error handling
          parsedConfigJson = null;
        }
      } else {
        // If Drizzle already parsed it (common for JSONB)
        parsedConfigJson = dbClient.configJsonRaw as ClientConfig['configJson'];
      }
    }

    console.log(
      `[DB:getClientConfig] Raw customInstructions:`,
      dbClient.customInstructions,
    );
    console.log(`[DB:getClientConfig] Parsed configJson:`, parsedConfigJson);

    const clientConfigData: ClientConfig = {
      id: dbClient.id,
      name: dbClient.name,
      customInstructions: dbClient.customInstructions,
      enabledBits: dbClient.enabledBits as string[] | null,
      configJson: parsedConfigJson,
    };

    console.log(
      `[DB:getClientConfig] Found config for ${clientId}:`,
      clientConfigData,
    );

    return clientConfigData;
  } catch (error) {
    console.error(
      `[DB:getClientConfig] Error fetching config for clientId ${clientId}:`,
      error,
    );
    return null; // Return null on error
  }
}

export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error('Failed to get user from database');
    throw error;
  }
}

export async function createUser(
  email: string,
  password: string,
  clientId: string,
) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  try {
    return await db.insert(user).values({
      email,
      password: hash,
      clientId,
    });
  } catch (error) {
    console.error('Failed to create user in database');
    throw error;
  }
}

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  try {
    console.log('[DB] Attempting to save chat:', { id, userId, title });
    const result = await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      clientId: 'default',
    });
    console.log('[DB] Successfully saved chat:', { id, result });
    return result;
  } catch (error) {
    console.error('[DB] Failed to save chat in database:', error);
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    return await db.delete(chat).where(eq(chat.id, id));
  } catch (error) {
    console.error('Failed to delete chat by id from database');
    throw error;
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new Error(`Chat with id ${startingAfter} not found`);
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new Error(`Chat with id ${endingBefore} not found`);
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    console.error('Failed to get chats by user from database');
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    console.log(`[DB:getChatById] Fetching chat with ID: ${id}`);
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    console.log(
      `[DB:getChatById] Result for ${id}: ${selectedChat ? 'Found' : 'Not found'}`,
    );
    if (selectedChat) {
      console.log(
        `[DB:getChatById] Chat details: title=${selectedChat.title}, userId=${selectedChat.userId}, createdAt=${selectedChat.createdAt}`,
      );
    }
    return selectedChat;
  } catch (error) {
    console.error(
      `[DB:getChatById] Failed to get chat with ID ${id} from database:`,
      error,
    );
    throw error;
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  console.log(
    '[saveMessages] Function called. Number of messages received:',
    Array.isArray(messages) ? messages.length : 'Not an array!',
  );
  if (Array.isArray(messages) && messages.length > 0) {
    // Log structure of the first message to check format
    console.log(
      '[saveMessages] Structure of first message:',
      JSON.stringify(messages[0], null, 2),
    );
  } else if (!Array.isArray(messages)) {
    console.error('[saveMessages] Input is not an array:', messages);
  }

  try {
    console.log('[saveMessages] Received messages type:', typeof messages);
    console.log('[saveMessages] Is Array:', Array.isArray(messages));
    try {
      console.log(
        '[saveMessages] Received messages value:',
        JSON.stringify(messages, null, 2),
      );
    } catch (e) {
      console.error('[saveMessages] Could not stringify received messages:', e);
      console.log('[saveMessages] Raw received messages value:', messages);
    }

    // Guard clause to ensure messages is an array
    if (!Array.isArray(messages)) {
      console.error(
        '[saveMessages] FATAL: Input "messages" is not an array. Aborting save operation. Received:',
        messages,
      );
      throw new Error(
        'Invalid input to saveMessages: The "messages" parameter must be an array.',
      );
    }

    console.log('[DB] Attempting to save messages, count:', messages.length);
    console.log('[DB] Message sample:', JSON.stringify(messages[0], null, 2));

    // Validate message format and ensure proper date objects
    for (const msg of messages) {
      // Validate required fields
      if (!msg.id || !msg.chatId || !msg.role) {
        console.error('[DB] Missing required fields:', msg);
        throw new Error('Invalid message format: missing required fields');
      }

      // Validate parts array
      if (!msg.parts || !Array.isArray(msg.parts) || msg.parts.length === 0) {
        console.error('[DB] Invalid message parts:', msg);
        throw new Error('Invalid message format: parts array is required');
      }

      // Validate attachments array
      if (!msg.attachments || !Array.isArray(msg.attachments)) {
        console.error('[DB] Invalid message attachments:', msg);
        throw new Error(
          'Invalid message format: attachments array is required',
        );
      }

      // Ensure createdAt is a valid Date object
      if (msg.createdAt && !(msg.createdAt instanceof Date)) {
        console.log('[DB] Converting createdAt to Date object');
        msg.createdAt = new Date(msg.createdAt);
      }

      // If no createdAt is provided, it will use the database default (NOW())
      if (!msg.createdAt) {
        console.log('[DB] No createdAt provided, will use database default');
      }

      // Ensure clientId is provided
      if (!msg.clientId) {
        console.log('[DB] No clientId provided, using default');
        msg.clientId = 'default';
      }
    }

    console.log('[saveMessages] Preparing to execute db.insert(message)...');
    const result = await db.insert(message).values(messages);
    console.log('[saveMessages] db.insert(message) executed successfully.');

    return result;
  } catch (error: any) {
    console.error('[saveMessages] Error during db.insert(message):', error);
    // Log specific DB error details if available
    if (error.code) {
      console.error(`[saveMessages] DB Error Code: ${error.code}`);
    }
    if (error.message) {
      console.error(`[saveMessages] DB Error Message: ${error.message}`);
    }
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    console.log(
      `[DB:getMessagesByChatId] Fetching messages for chat ID: ${id}`,
    );
    const messages = await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));

    console.log(
      `[DB:getMessagesByChatId] Found ${messages.length} messages for chat ID: ${id}`,
    );
    return messages;
  } catch (error) {
    console.error(
      `[DB:getMessagesByChatId] Failed to get messages for chat ID ${id} from database:`,
      error,
    );
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
      clientId: 'default',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    console.log(`[DB] Saving document ${id} with kind=${kind}`);
    return await db.insert(document).values({
      id,
      title,
      kind,
      content,
      userId,
      createdAt: new Date(),
      clientId: 'default',
    });
  } catch (error) {
    console.error('Failed to save document in database', error);
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)));
  } catch (error) {
    console.error(
      'Failed to delete documents by id after timestamp from database',
    );
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    // Ensure all suggestions have a clientId
    const suggestionsWithClientId = suggestions.map((suggestion) => ({
      ...suggestion,
      clientId: suggestion.clientId || 'default',
    }));

    return await db.insert(suggestion).values(suggestionsWithClientId);
  } catch (error) {
    console.error('Failed to save suggestions in database');
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error(
      'Failed to get suggestions by document version from database',
    );
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    console.error('Failed to get message by id from database');
    throw error;
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    console.error(
      'Failed to delete messages by id after timestamp from database',
    );
    throw error;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat visibility in database');
    throw error;
  }
}

export async function ensureChatExists({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}) {
  try {
    console.log('[DB DEBUG] ========== Chat Existence Check ==========');
    console.log('[DB DEBUG] Checking chat existence for:', { chatId, userId });

    // First try to find the chat
    console.log('[DB DEBUG] Executing SELECT query...');
    const existingChat = await db
      .select({
        id: chat.id,
        userId: chat.userId,
        createdAt: chat.createdAt,
      })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    console.log('[DB DEBUG] SELECT query result:', existingChat);

    if (existingChat.length === 0) {
      console.log('[DB DEBUG] Chat not found, initiating creation process');
      try {
        console.log('[DB DEBUG] Executing INSERT query...');
        const insertResult = await db.insert(chat).values({
          id: chatId,
          createdAt: new Date(),
          userId: userId,
          title: 'New Chat', // Default title, can be updated later
          clientId: 'default',
        });
        console.log('[DB DEBUG] INSERT query result:', insertResult);
        console.log('[DB DEBUG] Successfully created chat');
        return true;
      } catch (insertError: any) {
        // Handle potential race condition where chat was created by another request
        if (insertError.code === '23505') {
          // Unique constraint violation
          console.log(
            '[DB DEBUG] Chat creation failed due to unique constraint - chat likely exists from concurrent request',
          );
          return true;
        }
        console.error(
          '[DB DEBUG] Chat creation failed with unexpected error:',
          insertError,
        );
        throw insertError;
      }
    } else {
      console.log('[DB DEBUG] Chat found in database:', {
        id: existingChat[0].id,
        userId: existingChat[0].userId,
        createdAt: existingChat[0].createdAt,
      });
      return true;
    }
  } catch (error) {
    console.error(
      '[DB DEBUG] Unexpected error during chat existence check:',
      error,
    );
    throw error;
  } finally {
    console.log('[DB DEBUG] ========== End Chat Existence Check ==========');
  }
}

export async function getDocumentsByUserId({
  id,
  limit = 10,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit?: number;
  startingAfter?: string | null;
  endingBefore?: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<unknown>) =>
      db
        .select()
        .from(document)
        .where(
          whereCondition
            ? and(whereCondition, eq(document.userId, id))
            : eq(document.userId, id),
        )
        .orderBy(desc(document.createdAt))
        .limit(extendedLimit);

    let docs: (typeof document.$inferSelect)[] = [];

    if (startingAfter) {
      const afterDocument = await db
        .select()
        .from(document)
        .where(eq(document.id, startingAfter))
        .limit(1);

      if (afterDocument.length > 0) {
        docs = await query(lt(document.createdAt, afterDocument[0].createdAt));
      } else {
        docs = await query();
      }
    } else if (endingBefore) {
      const beforeDocument = await db
        .select()
        .from(document)
        .where(eq(document.id, endingBefore))
        .limit(1);

      if (beforeDocument.length > 0) {
        docs = await query(gt(document.createdAt, beforeDocument[0].createdAt));
      } else {
        docs = await query();
      }
    } else {
      docs = await query();
    }

    const hasMore = docs.length > limit;

    if (hasMore) {
      docs.pop();
    }

    return {
      documents: docs,
      hasMore,
    };
  } catch (error) {
    console.error('Failed to get documents by user id from database');
    throw error;
  }
}
