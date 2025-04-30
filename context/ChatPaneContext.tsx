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
  activeBitId: string | null;
  setActiveBitId: (id: string | null) => void;
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
  const [activeBitId, setActiveBitId] = useState<string | null>(
    DEFAULT_CHAT_MODEL,
  );
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
        setActiveBitId(storedBitId);
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
    }
  }, []);

  const chatState = useChat({
    api: '/api/brain',
    body: { selectedChatModel: activeBitId },
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

  // Reset the chatPersistedRef when starting a new chat
  useEffect(() => {
    if (chatState.messages.length === 0) {
      chatPersistedRef.current = false;
    }
  }, [chatState.messages.length]);

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

  // Store activeBitId in localStorage when it changes
  useEffect(() => {
    try {
      if (activeBitId) {
        localStorage.setItem('chat-active-bit', activeBitId);
      }
    } catch (error) {
      console.error('Error saving bit ID to localStorage:', error);
    }
  }, [activeBitId]);

  const contextValue = useMemo(
    () => ({
      chatState,
      isPaneOpen,
      togglePane,
      activeBitId,
      setActiveBitId,
    }),
    [chatState, isPaneOpen, togglePane, activeBitId],
  );

  return (
    <ChatPaneContext.Provider value={contextValue}>
      {children}
    </ChatPaneContext.Provider>
  );
};
