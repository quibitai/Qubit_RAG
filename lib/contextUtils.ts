import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { DateTime } from 'luxon';
import { z } from 'zod';

/**
 * Configuration options for chat history processing
 */
export interface ChatHistoryOptions {
  /** Maximum number of messages to include in history */
  maxMessages?: number;
  /** Maximum age of messages (in hours) to include */
  maxAgeHours?: number;
  /** Whether to deduplicate similar messages */
  deduplicate?: boolean;
  /** Similarity threshold for deduplication (0-1) */
  similarityThreshold?: number;
  /** Whether to include a context marker with the request time */
  includeRequestMarker?: boolean;
  /** Whether to detect repeated tool queries */
  detectRepeatedQueries?: boolean;
  /** Tags to include when detecting repeated queries */
  repeatedQueryTags?: string[];
  /** Maximum number of conversational memory snippets to retrieve and include */
  maxConversationalSnippetsToKeep?: number;
  /** Maximum number of recent raw messages to keep when combining with conversational memory */
  maxRecentMessagesToKeep?: number;
}

/**
 * Represents a snippet retrieved from conversational memory.
 */
export interface ConversationalMemorySnippet {
  id?: string | number; // ID from the database
  content: string;
  source_type: 'turn' | 'summary';
  created_at?: string | Date | DateTime; // Timestamp from DB
  similarity?: number; // Similarity score from vector search
}

/**
 * Message with metadata for processing
 */
interface ProcessedMessage {
  message: HumanMessage | AIMessage;
  timestamp?: DateTime;
  type: 'human' | 'ai';
  content: string;
  containsToolCall?: boolean;
  toolNames?: string[];
  similarity?: number;
  hash?: string;
}

/**
 * Default options for chat history processing
 */
const DEFAULT_OPTIONS: ChatHistoryOptions = {
  maxMessages: 10,
  maxAgeHours: 24,
  deduplicate: true,
  similarityThreshold: 0.85,
  includeRequestMarker: true,
  detectRepeatedQueries: true,
  repeatedQueryTags: [
    'calendar',
    'schedule',
    'n8n',
    'event',
    'meeting',
    'asana',
    'task',
  ],
  maxConversationalSnippetsToKeep: 3,
  maxRecentMessagesToKeep: 5,
};

/**
 * Get a simple content hash for similarity detection
 * @param content Message content
 * @returns Simple hash for the content
 */
function getContentHash(content: string): string {
  // Get a simplified version of the content for hashing
  return content.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 100);
}

/**
 * Check if a message contains a tool call for any of the specified tools
 * @param content Message content
 * @param toolNames List of tool names to check for
 * @returns Whether the message contains a tool call
 */
function containsToolCall(content: string, toolNames: string[] = []): boolean {
  // Simple check for tool names in the content
  return toolNames.some((tool) =>
    content.toLowerCase().includes(tool.toLowerCase()),
  );
}

/**
 * Calculate similarity between two strings (simple Jaccard similarity)
 * @param a First string
 * @param b Second string
 * @returns Similarity score (0-1)
 */
function calculateSimilarity(a: string, b: string): number {
  // Convert to lowercase and split into words
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  // Calculate Jaccard similarity (intersection / union)
  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Format conversational memory snippets as SystemMessage objects for LLM context
 * @param snippets Array of conversational memory snippets
 * @param maxToInclude Maximum number of snippets to include
 * @returns Array of SystemMessage objects
 */
function formatConversationalMemoryAsMessages(
  snippets: ConversationalMemorySnippet[],
  maxToInclude: number,
): SystemMessage[] {
  if (!snippets || snippets.length === 0) {
    return [];
  }

  // Take the top snippets (they should already be sorted by relevance/similarity)
  const selectedSnippets = snippets.slice(0, maxToInclude);

  return selectedSnippets.map((snippet) => {
    const prefix =
      snippet.source_type === 'summary'
        ? '[Summary of past conversation]'
        : '[From past conversation turn]';

    return new SystemMessage({
      content: `${prefix}: ${snippet.content}`,
    });
  });
}

/**
 * Process chat history to optimize for context and relevance
 * @param messages Array of chat messages
 * @param userQuery Current user query
 * @param retrievedConversationalMemory Array of retrieved conversational memory snippets
 * @param options Configuration options
 * @returns Optimized array of messages
 */
export function processHistory(
  messages: (HumanMessage | AIMessage)[],
  userQuery: string,
  retrievedConversationalMemory: ConversationalMemorySnippet[] = [],
  options: Partial<ChatHistoryOptions> = {},
): (HumanMessage | AIMessage | SystemMessage)[] {
  // Merge options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Skip processing if there are no messages or very few
  if (!messages || messages.length <= 1) {
    // Still include conversational memory even if no recent messages
    if (retrievedConversationalMemory.length > 0) {
      const memoryMessages = formatConversationalMemoryAsMessages(
        retrievedConversationalMemory,
        opts.maxConversationalSnippetsToKeep || 3,
      );
      return [...memoryMessages, ...(messages || [])];
    }
    return messages || [];
  }

  // Extract query characteristics for tool detection
  const queryContainsToolCall = containsToolCall(
    userQuery,
    opts.repeatedQueryTags || [],
  );

  // Process messages with metadata
  const processed: ProcessedMessage[] = messages.map((msg) => {
    const type = msg instanceof HumanMessage ? 'human' : 'ai';
    const content =
      typeof msg.content === 'string' ? msg.content : String(msg.content || '');

    // Extract timestamp if available (from metadata or other sources)
    let timestamp: DateTime | undefined;
    if (msg.additional_kwargs?.created || msg.additional_kwargs?.createdAt) {
      const ts =
        msg.additional_kwargs?.created || msg.additional_kwargs?.createdAt;
      if (typeof ts === 'string') {
        timestamp = DateTime.fromISO(ts);
      }
    }

    // Check for tool calls in the message
    const toolNames = opts.repeatedQueryTags || [];
    const containsTools = containsToolCall(content, toolNames);

    // Calculate hash for similarity comparison
    const hash = getContentHash(content);

    return {
      message: msg,
      timestamp,
      type,
      content,
      containsToolCall: containsTools,
      toolNames: containsTools
        ? toolNames.filter((t) =>
            content.toLowerCase().includes(t.toLowerCase()),
          )
        : [],
      hash,
    };
  });

  // Filter messages by age if we have timestamps
  let filtered = processed;
  if (opts.maxAgeHours) {
    const cutoff = DateTime.now().minus({ hours: opts.maxAgeHours });
    filtered = filtered.filter(
      (msg) => !msg.timestamp || msg.timestamp >= cutoff,
    );
  }

  // Calculate similarity to current query for human messages
  filtered.forEach((msg) => {
    if (msg.type === 'human') {
      msg.similarity = calculateSimilarity(msg.content, userQuery);
    }
  });

  // Deduplicate similar messages if enabled
  if (opts.deduplicate) {
    const hashes = new Set<string>();
    filtered = filtered.filter((msg) => {
      // Always keep messages with high similarity to current query
      if (
        msg.similarity &&
        msg.similarity > (opts.similarityThreshold || 0.85)
      ) {
        return true;
      }

      // Deduplicate by hash
      if (msg.hash && hashes.has(msg.hash)) {
        return false;
      }

      if (msg.hash) {
        hashes.add(msg.hash);
      }
      return true;
    });
  }

  // Handle repeated tool queries
  // The key innovation: detect and explicitly mark similar previous requests
  if (opts.detectRepeatedQueries && queryContainsToolCall) {
    // Find recent similar queries and tag them
    const similarQueries = filtered.filter(
      (msg) =>
        msg.type === 'human' &&
        msg.similarity &&
        msg.similarity > (opts.similarityThreshold || 0.85) &&
        msg.containsToolCall,
    );

    // Add special processing logic for similar queries (add metadata)
    if (similarQueries.length > 0) {
      // Mark the current query as a repeat
      // (This will be done when we return the processed messages)
    }
  }

  // Prepare conversational memory messages
  const memoryMessages = formatConversationalMemoryAsMessages(
    retrievedConversationalMemory,
    opts.maxConversationalSnippetsToKeep || 3,
  );

  // Take a slice of the most recent messages, ensuring we don't exceed limits
  const maxRecentToKeep = opts.maxRecentMessagesToKeep || 5;
  const recentMessages = filtered.slice(-maxRecentToKeep);

  // Combine memory messages with recent messages
  let combinedHistory: (HumanMessage | AIMessage | SystemMessage)[] = [
    ...memoryMessages,
    ...recentMessages.map((item) => item.message),
  ];

  // Apply overall maxMessages limit if specified, but prioritize memory and recent messages
  if (opts.maxMessages && combinedHistory.length > opts.maxMessages) {
    // Keep all memory messages and as many recent messages as possible
    const memoryCount = memoryMessages.length;
    const remainingSlots = Math.max(0, opts.maxMessages - memoryCount);
    const recentToKeep = recentMessages.slice(-remainingSlots);

    combinedHistory = [
      ...memoryMessages,
      ...recentToKeep.map((item) => item.message),
    ];
  }

  // If we detected repeated queries, add a marker for the current query
  if (opts.includeRequestMarker) {
    // Add a timestamp marker to the end of history
    const now = DateTime.now();
    const marker = new AIMessage({
      content: `[SYSTEM NOTE: The following user message is a NEW REQUEST made at ${now.toLocaleString(DateTime.DATETIME_FULL)}. Process it as a completely new query regardless of any similar previous queries.]`,
    });
    combinedHistory.push(marker);
  }

  return combinedHistory;
}

/**
 * Extract tool usage information from a message
 * @param content Message content
 * @returns Information about tool usage in the message
 */
export function extractToolInfo(content: string): {
  containsToolCall: boolean;
  toolName?: string;
  callParams?: any;
} {
  // This is a simplified version - expand based on your actual tool call format
  const toolMatch = content.match(/Using tool:\s*([a-zA-Z0-9_]+)/i);

  if (!toolMatch) {
    return { containsToolCall: false };
  }

  return {
    containsToolCall: true,
    toolName: toolMatch[1],
    // You could add parameter extraction here if needed
  };
}

/**
 * Schema for validating processed history configuration
 */
export const ChatHistoryOptionsSchema = z.object({
  maxMessages: z.number().positive().optional().default(10),
  maxAgeHours: z.number().positive().optional().default(24),
  deduplicate: z.boolean().optional().default(true),
  similarityThreshold: z.number().min(0).max(1).optional().default(0.85),
  includeRequestMarker: z.boolean().optional().default(true),
  detectRepeatedQueries: z.boolean().optional().default(true),
  repeatedQueryTags: z.array(z.string()).optional(),
  maxConversationalSnippetsToKeep: z.number().positive().optional().default(3),
  maxRecentMessagesToKeep: z.number().positive().optional().default(5),
});
