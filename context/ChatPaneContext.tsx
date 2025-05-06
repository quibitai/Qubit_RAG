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
    }) => Promise<void | string | null | undefined>;
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
  }) => Promise<void | string | null | undefined>;
  streamedContentMap: Record<string, string>;
  lastStreamUpdateTs: number;
  currentChatId: string;
  setCurrentChatId: (id: string) => void;
  ensureValidChatId: () => string;
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
  // Replace both activeBitContextId and activeBitPersona with a single currentActiveSpecialistId
  const [currentActiveSpecialistId, setCurrentActiveSpecialistId] = useState<
    string | null
  >(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [streamedContentMap, setStreamedContentMap] = useState<
    Record<string, string>
  >({});
  const [lastStreamUpdateTs, setLastStreamUpdateTs] = useState<number>(0);

  // Add state for tracking the current chat ID (ensuring it's a valid UUID)
  const [currentChatId, setCurrentChatId] = useState<string>(() => {
    // Generate a valid UUID initially
    return generateUUID();
  });

  const router = useRouter();

  // Function to ensure we always have a valid UUID for the chat ID
  const ensureValidChatId = useCallback(() => {
    // Use the current chatId if it already exists and is a valid UUID
    const validUuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (validUuidPattern.test(currentChatId)) {
      console.log(
        `[ChatPaneContext] Using existing valid chat ID: ${currentChatId}`,
      );
      return currentChatId;
    }

    // Generate a new UUID if the current one is not valid
    const newChatId = generateUUID();
    console.log(`[ChatPaneContext] Generated new chat ID: ${newChatId}`);

    // Update the state
    setCurrentChatId(newChatId);
    return newChatId;
  }, [currentChatId]);

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

        // Load the specialist ID from localStorage
        const storedSpecialistId = localStorage.getItem(
          'current-active-specialist',
        );
        if (storedSpecialistId) {
          setCurrentActiveSpecialistId(storedSpecialistId);
        }

        const storedDocId = localStorage.getItem('chat-active-doc');
        if (storedDocId) {
          setActiveDocId(storedDocId);
        }

        // Load saved chat ID from localStorage if available
        const storedChatId = localStorage.getItem('current-chat-id');
        if (
          storedChatId &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            storedChatId,
          )
        ) {
          console.log(
            `[ChatPaneContext] Restored chat ID from localStorage: ${storedChatId}`,
          );
          setCurrentChatId(storedChatId);
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
        'current-active-specialist',
        currentActiveSpecialistId || '',
      );
      console.log(
        `[ChatPaneContext] Saved currentActiveSpecialistId to localStorage: ${currentActiveSpecialistId}`,
      );
    } catch (error) {
      console.error(
        'Error saving currentActiveSpecialistId to localStorage:',
        error,
      );
    }
  }, [currentActiveSpecialistId]);

  // Save currentChatId to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('current-chat-id', currentChatId);
      console.log(
        `[ChatPaneContext] Saved currentChatId to localStorage: ${currentChatId}`,
      );
    } catch (error) {
      console.error('Error saving currentChatId to localStorage:', error);
    }
  }, [currentChatId]);

  const baseState = useChat({
    id: currentChatId, // Use the shared chatId for consistency across components
    api: '/api/brain',
    body: {
      // Always identify as Quibit orchestrator
      selectedChatModel: 'global-orchestrator',
      // Include only the active specialist ID and active doc ID
      activeBitContextId: currentActiveSpecialistId,
      activeDocId,
    },
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID, // Ensure all messages get a valid UUID
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
      // Ensure we're using a valid UUID for the chat ID
      const validChatId = ensureValidChatId();

      console.log('[ChatPaneContext] Submitting message with context:', {
        currentActiveSpecialistId,
        activeDocId,
        chatId: validChatId,
      });

      // Prepare the body with context information
      const bodyPayload = {
        // Always identify as Quibit to the backend
        selectedChatModel: 'global-orchestrator',
        // Include only currentActiveSpecialistId and activeDocId
        activeBitContextId: currentActiveSpecialistId,
        currentActiveSpecialistId: currentActiveSpecialistId, // Include both for compatibility
        activeDocId,
        // Ensure a valid chatId is always sent
        id: validChatId,
        // Include any other data from options?.data
        ...(options?.data || {}),
      };

      console.log('[ChatPaneContext] Sending request with body:', bodyPayload);

      // Call the original handleSubmit with our enhanced body
      return baseState.handleSubmit(options?.message, {
        body: bodyPayload,
      });
    },
    [
      baseState.handleSubmit,
      currentActiveSpecialistId,
      activeDocId,
      ensureValidChatId,
    ],
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
      currentChatId,
      setCurrentChatId,
      ensureValidChatId,
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
      currentChatId,
      setCurrentChatId,
      ensureValidChatId,
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

  // When loading an existing chat from history, update the currentChatId
  const updateChatIdFromHistory = useCallback((chatId: string) => {
    if (
      chatId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        chatId,
      )
    ) {
      console.log(
        `[ChatPaneContext] Setting current chat ID from history: ${chatId}`,
      );
      setCurrentChatId(chatId);
    }
  }, []);

  return (
    <ChatPaneContext.Provider value={contextValue}>
      {children}
    </ChatPaneContext.Provider>
  );
};
