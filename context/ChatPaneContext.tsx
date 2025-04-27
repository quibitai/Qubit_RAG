'use client';

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  type ReactNode,
  type FC,
} from 'react';
import { useChat, type UseChatHelpers } from '@ai-sdk/react';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';

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
  // Initialize with localStorage value if available (client-side only)
  const [isPaneOpen, setIsPaneOpen] = useState<boolean>(true);
  const [activeBitId, setActiveBitId] = useState<string | null>(
    DEFAULT_CHAT_MODEL,
  );

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
  });

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
