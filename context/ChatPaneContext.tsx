'use client';

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type FC,
} from 'react';
import { useRouter } from 'next/navigation';
import { useChat, type UseChatHelpers } from '@ai-sdk/react';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import type { Attachment, Message } from 'ai';
import { generateUUID } from '@/lib/utils';
import {
  saveSubsequentMessages,
  createChatAndSaveFirstMessages,
} from '@/app/(chat)/actions';

console.log('[ChatPaneContext] actions:', {
  createChatAndSaveFirstMessages,
  saveSubsequentMessages,
});

import type { DBMessage } from '@/lib/db/schema';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from '@/components/sidebar-history';
import type { ChatRequestOptions } from 'ai';
import { useDocumentState } from './DocumentContext';
import { toast } from 'sonner';

export interface ChatPaneContextType {
  chatState: Omit<UseChatHelpers, 'handleSubmit'> & {
    handleSubmit: (options?: {
      message?: any;
      data?: Record<string, any>;
    }) => Promise<any>;
  };
  isPaneOpen: boolean;
  setIsPaneOpen: (isOpen: boolean) => void;
  currentActiveSpecialistId: string | null;
  setCurrentActiveSpecialistId: (id: string | null) => void;
  activeDocId: string | null;
  setActiveDocId: (id: string | null) => void;
  submitMessage: (options?: {
    message?: any;
    data?: Record<string, any>;
  }) => Promise<any>;
  streamedContentMap: Record<string, string>;
  lastStreamUpdateTs: number;
}

export const ChatPaneContext = createContext<ChatPaneContextType | undefined>(
  undefined,
);

export const useChatPane = (): ChatPaneContextType => {
  const context = useContext(ChatPaneContext);

  if (!context) {
    throw new Error('useChatPane must be used within a ChatPaneProvider');
  }

  return context;
};

export const ChatPaneProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // Debug: Check if server action is correctly identified
  // Only log once during development
  const hasLoggedServerActionCheck = useRef(false);

  useEffect(() => {
    if (!hasLoggedServerActionCheck.current) {
      console.log('[CLIENT] Server action check in ChatPaneContext:', {
        isFunction: typeof saveSubsequentMessages === 'function',
        hasServerRef:
          typeof saveSubsequentMessages === 'object' &&
          (saveSubsequentMessages as any)?.__$SERVER_REFERENCE,
        serverActionId: (saveSubsequentMessages as any).__next_action_id,
      });
      hasLoggedServerActionCheck.current = true;
    }
  }, []);

  // Initialize with static value - no toggle functionality
  const [isPaneOpen, setIsPaneOpen] = useState<boolean>(true);
  const [currentActiveSpecialistId, setCurrentActiveSpecialistId] = useState<
    string | null
  >(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [streamedContentMap, setStreamedContentMap] = useState<
    Record<string, string>
  >({});
  const [lastStreamUpdateTs, setLastStreamUpdateTs] = useState<number>(0);
  const router = useRouter();

  // Track if the current chat has been persisted to avoid duplicate saves
  const chatPersistedRef = useRef<boolean>(false);

  // Ref to hold the last user message
  const lastUserMsgRef = useRef<{
    id: string;
    chatId: string;
    role: string;
    parts: Array<{ type: string; text: string }>;
    attachments: Array<any>;
    createdAt: Date;
  } | null>(null);

  // Get the document context for applying AI-driven updates
  const { applyStreamedUpdate } = useDocumentState();

  // Initialize from localStorage after component mounts (client-side)
  useEffect(() => {
    try {
      // Use RAF to defer state updates to prevent React cycle violations
      requestAnimationFrame(() => {
        const storedPaneState = localStorage.getItem('chat-pane-open');
        if (storedPaneState !== null) {
          setIsPaneOpen(storedPaneState === 'true');
        }

        const storedSpecialistId = localStorage.getItem(
          'chat-active-specialist',
        );
        if (storedSpecialistId) {
          setCurrentActiveSpecialistId(storedSpecialistId);
        }

        const storedDocId = localStorage.getItem('chat-active-doc');
        if (storedDocId) {
          setActiveDocId(storedDocId);
        }
      });
    } catch (error) {
      console.error('Error accessing localStorage:', error);
    }
  }, []);

  // Save currentActiveSpecialistId to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        'chat-active-specialist',
        currentActiveSpecialistId || '',
      );
    } catch (error) {
      console.error(
        'Error saving currentActiveSpecialistId to localStorage:',
        error,
      );
    }
  }, [currentActiveSpecialistId]);

  const baseState = useChat({
    api: '/api/brain',
    body: {
      // Always identify as Quibit orchestrator
      selectedChatModel: 'global-orchestrator',
      // Include the active context information
      activeBitContextId: currentActiveSpecialistId,
      activeDocId,
    },
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    onFinish: async (message) => {
      // 1) Filter out non-final chunks
      if (
        (message as any).finish_reason !== 'stop' ||
        !message.content?.trim()
      ) {
        console.log('[ChatPaneContext] skipping non-final or empty chunk');
        return;
      }

      console.log(
        '[ChatPaneContext] message finished but persistence handled by Chat component',
        {
          messageId: message.id,
          role: message.role,
          contentLength:
            typeof message.content === 'string'
              ? message.content.length
              : 'N/A',
        },
      );

      // Only reset the user message ref
      lastUserMsgRef.current = null;
    },
  });

  // Create custom submitMessage function to ensure context is always included
  const submitMessage = useCallback(
    async (options?: {
      message?: any;
      data?: Record<string, any>;
    }) => {
      console.log('[ChatPaneContext] Submitting message with context:', {
        currentActiveSpecialistId,
        activeDocId,
      });

      // Prepare the body with context information
      const bodyPayload = {
        // Always identify as Quibit to the backend
        selectedChatModel: 'global-orchestrator',
        // Include the active context information
        activeBitContextId: currentActiveSpecialistId,
        activeDocId,
        // Include any other data from options?.data
        ...(options?.data || {}),
      };

      console.log('[ChatPaneContext] Sending request with body:', bodyPayload);

      // Call the original handleSubmit with our enhanced body
      return baseState.handleSubmit(options?.message, {
        body: bodyPayload,
      });
    },
    [baseState.handleSubmit, currentActiveSpecialistId, activeDocId],
  );

  // Reset the chatPersistedRef when starting a new chat
  useEffect(() => {
    if (baseState.messages.length === 0) {
      chatPersistedRef.current = false;
    }
  }, [baseState.messages.length]);

  // Combine baseState with our custom submit function
  const chatState = useMemo(
    () => ({
      ...baseState,
      // Override the handleSubmit with our custom function
      handleSubmit: submitMessage,
    }),
    [baseState, submitMessage],
  );

  const contextValue = useMemo(
    () => ({
      chatState,
      isPaneOpen,
      setIsPaneOpen,
      currentActiveSpecialistId,
      setCurrentActiveSpecialistId,
      activeDocId,
      setActiveDocId,
      submitMessage,
      streamedContentMap,
      lastStreamUpdateTs,
    }),
    [
      chatState,
      isPaneOpen,
      setIsPaneOpen,
      currentActiveSpecialistId,
      activeDocId,
      submitMessage,
      streamedContentMap,
      lastStreamUpdateTs,
    ],
  );

  // Add a useEffect to detect document updates in chat messages
  useEffect(() => {
    const currentActiveDocId = activeDocId;

    // Skip if no active document
    if (!currentActiveDocId) return;

    // Process messages for document updates
    const processDocumentUpdates = () => {
      baseState.messages.forEach((message) => {
        if (message.data && typeof message.data === 'object') {
          const data = message.data as any;

          // Check for document updates
          if (
            data.type === 'document-update-delta' &&
            data.docId &&
            data.content
          ) {
            console.log(
              `[ChatPaneContext] Detected document update for ${data.docId}`,
            );

            // Only apply if it matches the active document or explicitly targeting a document
            if (
              data.docId === currentActiveDocId ||
              data.docId.startsWith('doc-')
            ) {
              // Extract the actual document ID if in format doc-{id}
              const targetDocId = data.docId.startsWith('doc-')
                ? data.docId.substring(4)
                : data.docId;

              // Apply the update to document state - use setTimeout to defer state update
              setTimeout(() => {
                applyStreamedUpdate(data.content, targetDocId);
              }, 0);

              // Show toast notification - but only once per update batch
              toast?.info('AI is updating your document...');
            }
          }
        }
      });
    };

    // Use requestAnimationFrame to schedule the state update for the next frame
    requestAnimationFrame(processDocumentUpdates);
  }, [baseState.messages, activeDocId, applyStreamedUpdate]);

  // Clear stale data when activeDocId changes
  useEffect(() => {
    if (activeDocId && Object.keys(streamedContentMap).length > 0) {
      // Use requestAnimationFrame to prevent state updates during render
      requestAnimationFrame(() => {
        // Keep only the current document's content, remove old entries
        setStreamedContentMap((prevMap) => {
          const newMap: Record<string, string> = {};
          if (activeDocId && prevMap[activeDocId]) {
            newMap[activeDocId] = prevMap[activeDocId];
          }
          return newMap;
        });
      });
    }
  }, [activeDocId, streamedContentMap]);

  return (
    <ChatPaneContext.Provider value={contextValue}>
      {children}
    </ChatPaneContext.Provider>
  );
};
