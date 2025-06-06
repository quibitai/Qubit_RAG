/**
 * Common types used throughout the application
 */

/**
 * Represents a summary of a chat for display in the sidebar
 */
export interface ChatSummary {
  id: string; // Chat ID
  title: string | null; // Chat title (can be null if not generated yet)
  lastMessageTimestamp?: string | Date; // Timestamp of the last message
  lastMessageSnippet?: string; // A short snippet of the last message
  bitContextId?: string | null; // Identifier for the "Bit" or specialist this chat belongs to
  isGlobal?: boolean; // Flag to differentiate global/orchestrator chats
  unreadCount?: number; // Number of unread messages (optional)
  createdAt?: string | Date; // When the chat was created
  updatedAt?: string | Date; // When the chat was last updated
  visibility?: 'private' | 'public' | 'shared'; // Chat visibility setting
  pinnedStatus?: boolean; // Whether the chat is pinned
}

/**
 * Types related to chat messages
 */
export interface MessageAttachment {
  name: string;
  url: string;
  contentType: string;
  metadata?: Record<string, any>;
}

export interface MessagePart {
  type: 'text' | 'image' | 'file' | 'code' | 'tool-call' | 'tool-result';
  text?: string;
  language?: string; // For code parts
  image?: string; // For image parts (URL or base64)
  file?: MessageAttachment;
  toolName?: string; // For tool calls/results
  toolInput?: any; // For tool calls
  toolResult?: any; // For tool results
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts?: MessagePart[];
  attachments?: MessageAttachment[];
  createdAt: Date;
  clientId?: string;
}

/**
 * Groups of chats organized by date
 */
export interface GroupedChats {
  today: ChatSummary[];
  yesterday: ChatSummary[];
  lastWeek: ChatSummary[];
  lastMonth: ChatSummary[];
  older: ChatSummary[];
}

/**
 * Chat history pagination response
 */
export interface ChatHistory {
  chats: Array<ChatSummary>;
  hasMore: boolean;
}

/**
 * Document history pagination response
 */
export interface DocumentHistory {
  documents: Array<DocumentSummary>;
  hasMore: boolean;
}

/**
 * Document summary for display in the sidebar
 */
export interface DocumentSummary {
  id: string;
  title: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
  kind?: 'text' | 'code' | 'image' | 'sheet';
}

/**
 * Sidebar expanded state by section
 */
export interface ExpandedSections {
  today: boolean;
  yesterday: boolean;
  lastWeek: boolean;
  lastMonth: boolean;
  older: boolean;
}

/**
 * Chat specialists/contexts
 */
export interface ChatSpecialist {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  isDefault?: boolean;
}

/**
 * Chat pane state
 */
export interface ChatPaneState {
  isPaneOpen: boolean;
  currentActiveSpecialistId: string | null;
  activeDocId: string | null;
  mainUiChatId: string | null;
  globalPaneChatId: string | null;
  isNewChat: boolean; // Tracks if the current chat is new (no messages persisted yet)
}

import type { DataStreamWriter } from 'ai';
import type { Session } from 'next-auth';

// Extend the DataStreamWriter interface to include the appendData method
declare module 'ai' {
  interface DataStreamWriter {
    /**
     * Appends data to the stream and adds it to the client's data array.
     * Use this for artifact-related events that need to be visible in the UI.
     */
    appendData(data: any): Promise<void>;
  }
}

export interface DocumentStreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (fullContent: string) => void;
}

export interface CreateDocumentCallbackProps {
  id: string;
  title: string;
  dataStream: DataStreamWriter;
  session: Session;
  initialContentPrompt?: string;
  streamCallbacks?: DocumentStreamCallbacks; // Make it optional
}

export interface UIMessage {
  type: 'artifact';
  componentName: 'document';
  id: string;
  props: {
    documentId: string;
    title: string;
    kind?: 'text' | 'code' | 'image' | 'sheet';
    eventType:
      | 'artifact-start'
      | 'artifact-chunk'
      | 'artifact-end'
      | 'artifact-error';
    status?: 'streaming' | 'complete';
    contentChunk?: string;
    contentLength?: number;
    error?: string;
  };
}

// Export any other custom types here

// Global context types for artifact streaming
export interface ArtifactContextGlobal {
  dataStream?: DataStreamWriter;
  session?: Session | null;
  handlers?: any;
  toolInvocationsTracker?: Array<{
    type: 'tool-invocation';
    toolInvocation: {
      toolName: string;
      toolCallId: string;
      state: 'call' | 'result';
      args?: any;
      result?: any;
    };
  }>;
  cleanupTimeout?: NodeJS.Timeout;
}

// Extend global namespace to include our custom properties
declare global {
  var CREATE_DOCUMENT_CONTEXT: ArtifactContextGlobal | undefined;
}
