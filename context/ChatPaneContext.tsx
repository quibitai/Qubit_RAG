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

export interface ChatPaneContextType {
  chatState: UseChatHelpers;
  isPaneOpen: boolean;
  togglePane: () => void;
  activeBitContextId: string | null;
  setActiveBitContextId: (id: string | null) => void;
  activeDocId: string | null;
  setActiveDocId: (id: string | null) => void;
  submitMessage: (options?: {
    message?: any;
    data?: Record<string, any>;
  }) => Promise<string | null | undefined>;
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
  console.log('[CLIENT] Server action check in ChatPaneContext:', {
    isFunction: typeof saveSubsequentMessages === 'function',
    hasServerRef:
      typeof saveSubsequentMessages === 'object' &&
      (saveSubsequentMessages as any)?.__$SERVER_REFERENCE,
    serverActionId: (saveSubsequentMessages as any).__next_action_id,
  });

  // Initialize with localStorage value if available (client-side only)
  const [isPaneOpen, setIsPaneOpen] = useState<boolean>(true);
  const [activeBitContextId, setActiveBitContextId] = useState<string | null>(
    DEFAULT_CHAT_MODEL,
  );
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
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

  // Initialize from localStorage after component mounts (client-side)
  useEffect(() => {
    try {
      const storedPaneState = localStorage.getItem('chat-pane-open');
      if (storedPaneState !== null) {
        setIsPaneOpen(storedPaneState === 'true');
      }

      const storedBitId = localStorage.getItem('chat-active-bit');
      if (storedBitId) {
        setActiveBitContextId(storedBitId);
      }

      const storedDocId = localStorage.getItem('chat-active-doc');
      if (storedDocId) {
        setActiveDocId(storedDocId);
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
    }
  }, []);

  const baseState = useChat({
    api: '/api/brain',
    body: {
      // Always identify as Quibit orchestrator
      selectedChatModel: 'chat-model-reasoning',
      // Include the active context information
      activeBitContextId,
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
        activeBitContextId,
        activeDocId,
      });

      // Prepare the body with context information
      const bodyPayload = {
        // Always identify as Quibit to the backend
        selectedChatModel: 'chat-model-reasoning',
        // Include the active context information
        activeBitContextId,
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
    [baseState.handleSubmit, activeBitContextId, activeDocId],
  );

  // Reset the chatPersistedRef when starting a new chat
  useEffect(() => {
    if (baseState.messages.length === 0) {
      chatPersistedRef.current = false;
    }
  }, [baseState.messages.length]);

  const togglePane = useCallback(() => {
    setIsPaneOpen((prev) => {
      const newState = !prev;
      try {
        localStorage.setItem('chat-pane-open', String(newState));
      } catch (error) {
        console.error('Error saving to localStorage:', error);
      }
      return newState;
    });
  }, []);

  // Store context in localStorage when it changes
  useEffect(() => {
    try {
      if (activeBitContextId) {
        localStorage.setItem('chat-active-bit', activeBitContextId);
      }

      if (activeDocId) {
        localStorage.setItem('chat-active-doc', activeDocId);
      } else {
        localStorage.removeItem('chat-active-doc');
      }
    } catch (error) {
      console.error('Error saving context to localStorage:', error);
    }
  }, [activeBitContextId, activeDocId]);

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
      togglePane,
      activeBitContextId,
      setActiveBitContextId,
      activeDocId,
      setActiveDocId,
      submitMessage,
    }),
    [
      chatState,
      isPaneOpen,
      togglePane,
      activeBitContextId,
      activeDocId,
      submitMessage,
    ],
  );

  return (
    <ChatPaneContext.Provider value={contextValue}>
      {children}
    </ChatPaneContext.Provider>
  );
};
