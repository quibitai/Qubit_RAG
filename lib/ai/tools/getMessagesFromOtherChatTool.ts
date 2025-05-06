import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { sql } from '@/lib/db/client';

// Define types
type MessageResult = {
  id: string;
  role: string;
  parts: any[];
  createdAt: string;
};

// Make TypeScript aware of our custom global property
declare global {
  var CURRENT_REQUEST_BODY: {
    referencedChatId?: string | null;
    referencedGlobalPaneChatId?: string | null;
    currentActiveSpecialistId?: string | null;
    isFromGlobalPane?: boolean;
  } | null;
}

// Map of specialist IDs and their variations
const SPECIALIST_ID_MAP: Record<string, string[]> = {
  'echo-tango-specialist': ['echo tango', 'echo-tango', 'echo_tango'],
  // Add other specialists here in the future
};

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
      .describe(
        'The ID of the chat thread to fetch messages from. Can be a UUID or a specialist identifier like "echo-tango-specialist" or the string "main" to use the referenced chat ID.',
      ),
    messageCount: z
      .number()
      .int()
      .positive()
      .optional()
      .default(10) // Increased from 5 to 10 for better context
      .describe('Number of recent messages to retrieve.'),
  }),
  func: async ({ targetChatId, messageCount = 10 }, runManager?: any) => {
    try {
      console.log(
        `[getMessagesFromOtherChatTool] Fetching messages from chat ID/specialist ${targetChatId}`,
      );

      // Access the request context if available (to get referencedChatId from global pane requests)
      let referencedChatId: string | null = null;
      let referencedGlobalPaneChatId: string | null = null;
      let currentActiveSpecialistId: string | null = null;
      let isFromGlobalPane: boolean = false;

      // Try to extract reference information from the request body if available
      if (
        global.CURRENT_REQUEST_BODY &&
        typeof global.CURRENT_REQUEST_BODY === 'object'
      ) {
        referencedChatId = global.CURRENT_REQUEST_BODY.referencedChatId || null;
        referencedGlobalPaneChatId =
          global.CURRENT_REQUEST_BODY.referencedGlobalPaneChatId || null;
        currentActiveSpecialistId =
          global.CURRENT_REQUEST_BODY.currentActiveSpecialistId || null;
        isFromGlobalPane =
          global.CURRENT_REQUEST_BODY.isFromGlobalPane || false;

        if (referencedChatId) {
          console.log(
            `[getMessagesFromOtherChatTool] Found referencedChatId in global context: ${referencedChatId}`,
          );
        }

        if (referencedGlobalPaneChatId) {
          console.log(
            `[getMessagesFromOtherChatTool] Found referencedGlobalPaneChatId in global context: ${referencedGlobalPaneChatId}`,
          );
        }

        if (currentActiveSpecialistId) {
          console.log(
            `[getMessagesFromOtherChatTool] Found currentActiveSpecialistId in global context: ${currentActiveSpecialistId}`,
          );
        }

        console.log(
          `[getMessagesFromOtherChatTool] Request is from ${isFromGlobalPane ? 'Global Pane' : 'Main UI'}`,
        );
      }

      // Handle special case for 'main' to use referencedChatId directly
      if (targetChatId === 'main' && referencedChatId) {
        targetChatId = referencedChatId;
        console.log(
          `[getMessagesFromOtherChatTool] Using referencedChatId: ${targetChatId}`,
        );
      }

      // Handle special case for 'global' or 'global-pane' to use referencedGlobalPaneChatId
      if (
        (targetChatId === 'global' ||
          targetChatId === 'global-pane' ||
          targetChatId === 'orchestrator') &&
        referencedGlobalPaneChatId
      ) {
        targetChatId = referencedGlobalPaneChatId;
        console.log(
          `[getMessagesFromOtherChatTool] Using referencedGlobalPaneChatId: ${targetChatId}`,
        );
      }

      // Handle special case for specialist IDs
      if (
        targetChatId === 'echo-tango-specialist' ||
        targetChatId === 'echo-tango' ||
        targetChatId.toLowerCase().includes('echo tango')
      ) {
        console.log(
          `[getMessagesFromOtherChatTool] Detected Echo Tango specialist reference`,
        );

        // If we're requesting Echo Tango content but we're already in Echo Tango context,
        // we should focus on fetching messages from the UI rather than the global pane
        if (
          currentActiveSpecialistId === 'echo-tango-specialist' &&
          referencedChatId
        ) {
          targetChatId = referencedChatId;
          console.log(
            `[getMessagesFromOtherChatTool] Using UI chat ID for Echo Tango: ${targetChatId}`,
          );
        }
      }

      // Check if the targetChatId is a UUID or a specialist identifier
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          targetChatId,
        );

      let messagesResult: MessageResult[] = [];

      if (isUuid) {
        // If it's a valid UUID, query directly by chatId
        console.log(
          `[getMessagesFromOtherChatTool] Querying by UUID: ${targetChatId}`,
        );
        messagesResult = (await sql`
          SELECT id, role, parts, "createdAt"
          FROM "Message_v2"
          WHERE "chatId" = ${targetChatId}
          ORDER BY "createdAt" DESC
          LIMIT ${messageCount}
        `) as unknown as MessageResult[];
      } else {
        // Determine if this is a specialist reference
        let specialistKeywords: string[] = [];
        let isSpecialistQuery = false;

        // Check against our specialist ID map
        for (const [specialistId, variations] of Object.entries(
          SPECIALIST_ID_MAP,
        )) {
          if (
            targetChatId === specialistId ||
            variations.some((v) => targetChatId.toLowerCase().includes(v))
          ) {
            specialistKeywords = variations;
            isSpecialistQuery = true;
            console.log(
              `[getMessagesFromOtherChatTool] Identified specialist query for: ${specialistId}`,
            );
            break;
          }
        }

        if (referencedChatId) {
          // If we have a referenced chat ID, use that first
          console.log(
            `[getMessagesFromOtherChatTool] Using referenced chat ID with specialist: ${referencedChatId}`,
          );

          // We'll execute separate queries for each keyword and combine results in JS
          let allMessages: MessageResult[] = [];

          // First check for messages with the targetChatId term
          const targetIdResult = (await sql`
            SELECT id, role, parts, "createdAt"
            FROM "Message_v2"
            WHERE "chatId" = ${referencedChatId}
              AND parts::text ILIKE ${`%${targetChatId}%`}
            ORDER BY "createdAt" DESC
            LIMIT 50
          `) as unknown as MessageResult[];

          allMessages = [...targetIdResult];

          // Then check for each specialist keyword
          for (const keyword of specialistKeywords) {
            const keywordResult = (await sql`
              SELECT id, role, parts, "createdAt"
              FROM "Message_v2"
              WHERE "chatId" = ${referencedChatId}
                AND parts::text ILIKE ${`%${keyword}%`}
              ORDER BY "createdAt" DESC
              LIMIT 50
            `) as unknown as MessageResult[];

            // Add unique results
            for (const msg of keywordResult) {
              if (!allMessages.some((m) => m.id === msg.id)) {
                allMessages.push(msg);
              }
            }
          }

          // Sort by createdAt and limit
          allMessages.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );

          // Limit to requested message count
          messagesResult = allMessages.slice(0, messageCount);
        } else {
          // As a last resort, try to find messages that mention the specialist
          console.log(
            `[getMessagesFromOtherChatTool] Searching for content that mentions: ${targetChatId}`,
          );

          // For the second problematic SQL query, also use separate queries
          if (isSpecialistQuery && specialistKeywords.length > 0) {
            // Similar approach for when we don't have a specific chatId reference
            let allMessages: MessageResult[] = [];

            // First check for messages with the targetChatId term
            const targetIdResult = (await sql`
              SELECT id, role, parts, "createdAt"
              FROM "Message_v2"
              WHERE parts::text ILIKE ${`%${targetChatId}%`}
              ORDER BY "createdAt" DESC
              LIMIT 50
            `) as unknown as MessageResult[];

            allMessages = [...targetIdResult];

            // Then check for each specialist keyword
            for (const keyword of specialistKeywords) {
              const keywordResult = (await sql`
                SELECT id, role, parts, "createdAt"
                FROM "Message_v2"
                WHERE parts::text ILIKE ${`%${keyword}%`}
                ORDER BY "createdAt" DESC
                LIMIT 50
              `) as unknown as MessageResult[];

              // Add unique results
              for (const msg of keywordResult) {
                if (!allMessages.some((m) => m.id === msg.id)) {
                  allMessages.push(msg);
                }
              }
            }

            // Sort by createdAt and limit
            allMessages.sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );

            // Limit to requested message count
            messagesResult = allMessages.slice(0, messageCount);
          } else {
            // Generic search with just the target ID
            messagesResult = (await sql`
              SELECT id, role, parts, "createdAt"
              FROM "Message_v2"
              WHERE parts::text ILIKE ${`%${targetChatId}%`}
              ORDER BY "createdAt" DESC
              LIMIT ${messageCount}
            `) as unknown as MessageResult[];
          }
        }

        // If no results from search, return a helpful message
        if (!messagesResult || messagesResult.length === 0) {
          return `I couldn't find any messages related to ${targetChatId}. Please check the chat history in the main UI panel to see what was discussed.`;
        }
      }

      if (!messagesResult || messagesResult.length === 0) {
        // If we're using a referenced chat but found no messages
        if (referencedChatId) {
          return `I couldn't find any messages in the referenced chat ${referencedChatId}. It might be a new conversation or the messages haven't been saved yet.`;
        }
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
              // Clean up any garbled text (fix for issue where Echo Tango messages get duplicated/malformed)
              let cleanContent = part.text;

              // Fix common duplicated phrase pattern "Echo Tango! \"Something\"Echo Tango!"
              cleanContent = cleanContent.replace(
                /(Echo Tango!.*?)(Echo Tango!)/s,
                '$1',
              );

              // Fix other formatting issues that might occur
              cleanContent = cleanContent.replace(/\s+/g, ' ').trim();

              messageContent += cleanContent;
            }
          }
        }

        return {
          role: msg.role,
          content: messageContent,
          timestamp: new Date(msg.createdAt).toISOString(),
          id: msg.id,
        };
      });

      // Deduplicate messages with similar content (prevents duplicate responses)
      const uniqueMessages: Array<{
        role: string;
        content: string;
        timestamp: string;
        id: string;
      }> = [];
      const contentHashes = new Set<string>();

      for (const msg of formattedMessages) {
        // Create a simple hash of the content to detect near-duplicates
        const contentSample = msg.content
          .substring(0, 100)
          .toLowerCase()
          .trim();

        // Skip if we've seen very similar content before
        if (contentHashes.has(contentSample)) {
          continue;
        }

        contentHashes.add(contentSample);
        uniqueMessages.push(msg);
      }

      // Sort by timestamp ascending to show conversation flow
      uniqueMessages.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      // Format as a conversation for the LLM
      const conversationText = uniqueMessages
        .map(
          (msg) =>
            `${msg.role === 'user' ? 'User' : 'Assistant'} (${new Date(msg.timestamp).toLocaleTimeString()}): ${msg.content}`,
        )
        .join('\n\n');

      // Create a more descriptive source identifier based on the type of lookup
      let sourceDescription: string;
      if (isUuid) {
        sourceDescription = `chat ${targetChatId}`;
      } else if (referencedChatId) {
        sourceDescription = `the main UI conversation (${referencedChatId})`;
      } else {
        sourceDescription = `conversations mentioning ${targetChatId}`;
      }

      // Add a note about most recent message for clarity
      let result = `Recent messages from ${sourceDescription}:\n\n${conversationText}`;

      // If looking for most recent message specifically, add a clear indicator
      if (
        targetChatId.toLowerCase().includes('most recent') ||
        targetChatId.toLowerCase().includes('latest')
      ) {
        const mostRecent = uniqueMessages[uniqueMessages.length - 1];
        if (mostRecent && mostRecent.role === 'assistant') {
          result += `\n\n[MOST RECENT MESSAGE FROM ECHO TANGO: "${mostRecent.content.substring(0, 150)}${mostRecent.content.length > 150 ? '...' : ''}"]`;
        }
      }

      return result;
    } catch (error: any) {
      console.error(`[getMessagesFromOtherChatTool] Error:`, error);
      return `Error fetching messages: ${error.message || 'Unknown error'}. Please try again with the main UI conversation or provide a valid chat UUID.`;
    }
  },
});
