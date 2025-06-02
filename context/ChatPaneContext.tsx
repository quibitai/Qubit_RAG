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
import { useChat } from '@ai-sdk/react';
import type { UseChatHelpers } from '@ai-sdk/react';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { createChatAndSaveFirstMessages } from '@/app/(chat)/actions';
import type { ChatPaneState, ChatSummary } from '@/lib/types';
import { useSession } from 'next-auth/react';
import {
  GLOBAL_ORCHESTRATOR_CONTEXT_ID,
  CHAT_BIT_CONTEXT_ID,
  ECHO_TANGO_SPECIALIST_ID,
  CHAT_BIT_GENERAL_CONTEXT_ID,
} from '@/lib/constants';

// Reduced logging

import type { DBMessage } from '@/lib/db/schema';
import { useDocumentState } from './DocumentContext';

type MessageOptions = {
  message?: string;
  data?: Record<string, any>;
};

export interface ChatPaneContextType {
  chatState: Omit<UseChatHelpers, 'handleSubmit'> & {
    handleSubmit: (options?: MessageOptions) => Promise<void>;
  };
  isPaneOpen: boolean;
  setIsPaneOpen: (isOpen: boolean) => void;
  currentActiveSpecialistId: string | null;
  setCurrentActiveSpecialistId: (id: string | null) => void;
  activeDocId: string | null;
  setActiveDocId: (id: string | null) => void;
  submitMessage: (options?: MessageOptions) => Promise<void>;
  streamedContentMap: Record<string, string>;
  lastStreamUpdateTs: number;
  mainUiChatId: string | null;
  setMainUiChatId: (id: string | null) => void;
  globalPaneChatId: string | null;
  setGlobalPaneChatId: (id: string | null) => void;
  ensureValidChatId: (chatId: string | null) => void;
  sidebarChats: ChatSummary[];
  isLoadingSidebarChats: boolean;
  globalChats: ChatSummary[];
  isLoadingGlobalChats: boolean;
  loadGlobalChats: (forceRefresh?: boolean) => Promise<void>;
  refreshHistory: () => void;
  specialistGroupedChats: Array<{
    id: string;
    name: string;
    description: string;
    chats: ChatSummary[];
  }>;
  isNewChat: boolean;
  setIsNewChat: (isNew: boolean) => void;
  isCurrentChatCommitted: boolean;
  sidebarDataRevision: number;
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
  // Get session status from NextAuth
  const { data: session, status: sessionStatus } = useSession();

  // Reduced session logging

  // Debug: Check if server action is correctly identified
  // Only log once during development
  const hasLoggedServerActionCheck = useRef(false);

  // Removed verbose server action logging

  // Use a single chatPaneState object to hold state
  // This prevents cascading re-renders when multiple states change
  const [chatPaneState, setChatPaneState] = useState<ChatPaneState>(() => {
    // Reduced logging
    return {
      isPaneOpen: true,
      currentActiveSpecialistId: ECHO_TANGO_SPECIALIST_ID,
      activeDocId: null,
      mainUiChatId: generateUUID(),
      globalPaneChatId: generateUUID(),
      isNewChat: true,
    };
  });

  // Track if the current chat is committed (first message sent, specialist locked)
  const [isCurrentChatCommitted, setIsCurrentChatCommitted] = useState(false);

  // Use refs to always have the latest value for isCurrentChatCommitted and setIsCurrentChatCommitted
  const isCurrentChatCommittedRef = useRef(isCurrentChatCommitted);
  useEffect(() => {
    isCurrentChatCommittedRef.current = isCurrentChatCommitted;
  }, [isCurrentChatCommitted]);

  const setIsCurrentChatCommittedRef = useRef(setIsCurrentChatCommitted);
  useEffect(() => {
    setIsCurrentChatCommittedRef.current = setIsCurrentChatCommitted;
  }, [setIsCurrentChatCommitted]);

  // Create individual state setters with useCallback to prevent recreation
  const setIsPaneOpen = useCallback((isOpen: boolean) => {
    setChatPaneState((prev) => ({ ...prev, isPaneOpen: isOpen }));
  }, []);

  const setCurrentActiveSpecialistId = useCallback((id: string | null) => {
    // Reduced logging
    setChatPaneState((prev) => {
      if (prev.isNewChat) {
        // Reduced logging
        return {
          ...prev,
          currentActiveSpecialistId: id,
        };
      } else {
        // Reduced logging
        return prev;
      }
    });
  }, []);

  const setActiveDocId = useCallback((id: string | null) => {
    setChatPaneState((prev) => ({ ...prev, activeDocId: id }));
  }, []);

  const setMainUiChatId = useCallback((id: string | null) => {
    setChatPaneState((prev) => ({ ...prev, mainUiChatId: id }));
  }, []);

  const setGlobalPaneChatId = useCallback((id: string | null) => {
    setChatPaneState((prev) => ({ ...prev, globalPaneChatId: id }));
  }, []);

  // Use destructuring for easier access to states for the rest of the component
  const {
    isPaneOpen,
    currentActiveSpecialistId,
    activeDocId,
    mainUiChatId,
    globalPaneChatId,
    isNewChat,
  } = chatPaneState;

  // State for chat history
  const [sidebarChats, setSidebarChats] = useState<ChatSummary[]>([]);
  const [_isLoadingSidebarChats, setIsLoadingSidebarChats] = useState(false);
  const isLoadingSidebarChats = _isLoadingSidebarChats;

  // Add a revision counter to force React to detect data changes
  const [sidebarDataRevision, setSidebarDataRevision] = useState(0);

  // Add state for specialist grouped chats
  const [specialistGroupedChats, setSpecialistGroupedChats] = useState<
    Array<{
      id: string;
      name: string;
      description: string;
      chats: ChatSummary[];
    }>
  >([]);

  // State for global chat history
  const [globalChats, setGlobalChats] = useState<ChatSummary[]>([]);
  const [_isLoadingGlobalChats, setIsLoadingGlobalChats] = useState(false);
  const isLoadingGlobalChats = _isLoadingGlobalChats;

  // For stream content, keep as separate state
  const [streamedContentMap, setStreamedContentMap] = useState<
    Record<string, string>
  >({});
  const [lastStreamUpdateTs, setLastStreamUpdateTs] = useState<number>(0);

  const router = useRouter();

  // Function to ensure we always have a valid UUID for any chat ID
  const ensureValidChatId = useCallback((chatId: string | null) => {
    // Use the provided chatId if it's already a valid UUID
    const validUuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (chatId && validUuidPattern.test(chatId)) {
      return chatId;
    }

    // Generate a new UUID if the provided one is not valid
    const newChatId = generateUUID();
    // Reduced logging

    return newChatId;
  }, []);

  // Create a ref to track the last time loadSidebarChats was called
  const lastSidebarFetchTimeRef = useRef<number>(0);
  const lastContextIdRef = useRef<string | null>(null);

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

  // Mock function for document updates until we properly integrate with DocumentContext
  const applyStreamedUpdate = useCallback((content: string, docId: string) => {
    // Reduced logging
    // In a complete implementation, this would call into DocumentContext
  }, []);

  // Add loadAllSpecialistChats function with forceRefresh parameter
  const loadAllSpecialistChats = useCallback(
    async (forceRefresh = false) => {
      console.log(
        '[ChatPaneContext] 👥 loadAllSpecialistChats called, forceRefresh:',
        forceRefresh,
      );

      // Check authentication status from NextAuth
      if (sessionStatus !== 'authenticated') {
        console.log(
          '[ChatPaneContext] ⏳ Not authenticated yet, skipping specialist chats load',
        );
        return;
      }

      // Implement debouncing unless forceRefresh is true
      const now = Date.now();
      const minInterval = forceRefresh ? 0 : 3000; // No debouncing when force refreshing

      if (
        !forceRefresh &&
        now - lastSidebarFetchTimeRef.current < minInterval
      ) {
        console.log(
          '[ChatPaneContext] 📦 Debouncing specialist chats fetch, skipping',
        );
        return;
      }

      lastSidebarFetchTimeRef.current = now;

      try {
        setIsLoadingSidebarChats(true);

        // Add timestamp to URL to bust cache when force refreshing
        const timestamp = forceRefresh ? `&_t=${now}` : '';
        const finalUrl = `/api/history?type=all-specialists&limit=20${timestamp}`;

        console.log(
          '[ChatPaneContext] 📡 Fetching specialist chats from:',
          finalUrl,
        );

        const response = await fetch(finalUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            // Add cache-busting header when force refreshing
            ...(forceRefresh && {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            }),
          },
          credentials: 'include',
          cache: forceRefresh ? 'no-store' : 'default', // Use no-store for force refresh
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch specialist chats: ${response.status} - ${response.statusText}`,
          );
        }

        const data = await response.json();
        console.log('[ChatPaneContext] 📥 Received specialist data:', {
          specialistsCount: data.specialists?.length || 0,
          totalChats:
            data.specialists?.reduce(
              (acc: number, s: any) => acc + (s.chats?.length || 0),
              0,
            ) || 0,
        });

        // Set sidebar chats - combine all specialist chats for now to maintain compatibility
        const allChats = data.specialists?.flatMap((s: any) => s.chats) || [];
        setSidebarChats(allChats);
        setSidebarDataRevision((prev) => prev + 1); // Force React to detect changes
        console.log(
          '[ChatPaneContext] ✅ Specialist chats loaded and set:',
          allChats.length,
        );

        // Also store the original grouped data for the new sidebar component
        setSpecialistGroupedChats(data.specialists || []);

        setIsLoadingSidebarChats(false);
      } catch (error) {
        console.error(
          '[ChatPaneContext] Error fetching all specialist chats:',
          error,
        );
        setIsLoadingSidebarChats(false);
      }
    },
    [
      sessionStatus,
      setIsLoadingSidebarChats,
      setSidebarChats,
      setSpecialistGroupedChats,
      setSidebarDataRevision,
    ],
  );

  // Add loadGlobalChats function with forceRefresh parameter
  const loadGlobalChats = useCallback(
    async (forceRefresh = false) => {
      console.log(
        '[ChatPaneContext] 🌐 loadGlobalChats called, forceRefresh:',
        forceRefresh,
      );

      // Check authentication status from NextAuth
      if (sessionStatus !== 'authenticated') {
        console.log(
          '[ChatPaneContext] ⏳ Not authenticated yet, skipping global chats load',
        );
        return;
      }

      // Add debounce to prevent rapid successive calls
      if (_isLoadingGlobalChats && !forceRefresh) {
        console.log(
          '[ChatPaneContext] 📦 Already loading global chats, skipping',
        );
        return;
      }

      try {
        setIsLoadingGlobalChats(true);

        // Add timestamp to URL to bust cache when force refreshing
        const now = Date.now();
        const timestamp = forceRefresh ? `&_t=${now}` : '';
        const finalUrl = `/api/history?type=global&limit=20&bitContextId=${GLOBAL_ORCHESTRATOR_CONTEXT_ID}${timestamp}`;

        console.log(
          '[ChatPaneContext] 📡 Fetching global chats from:',
          finalUrl,
        );

        const response = await fetch(finalUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            // Add cache-busting header when force refreshing
            ...(forceRefresh && {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            }),
          },
          credentials: 'include',
          cache: forceRefresh ? 'no-store' : 'default', // Use no-store for force refresh
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch global chats: ${response.status} - ${response.statusText}`,
          );
        }

        const data = await response.json();
        console.log('[ChatPaneContext] 📥 Received global chat data:', {
          chatsCount: data.chats?.length || 0,
        });

        // Set global chats
        setGlobalChats(data.chats || []);
        console.log(
          '[ChatPaneContext] ✅ Global chats loaded and set:',
          (data.chats || []).length,
        );
        setIsLoadingGlobalChats(false);
      } catch (error) {
        console.error('[ChatPaneContext] Error fetching global chats:', error);
        setIsLoadingGlobalChats(false);
      }
    },
    [
      sessionStatus,
      _isLoadingGlobalChats,
      setIsLoadingGlobalChats,
      setGlobalChats,
    ],
  );

  // Update the refreshHistory function to use the forceRefresh parameter
  const refreshHistory = useCallback(() => {
    console.log('[ChatPaneContext] 🔄 Refreshing chat history...');

    // Use loadAllSpecialistChats to refresh specialist chats with forceRefresh=true
    loadAllSpecialistChats(true);

    // Load global chats with forceRefresh=true
    loadGlobalChats(true);
  }, [loadAllSpecialistChats, loadGlobalChats]);

  // Initialize from localStorage after component mounts (client-side)
  useEffect(() => {
    try {
      // Use a single function to load all localStorage values
      const loadLocalStorageValues = () => {
        const storedPaneState = localStorage.getItem('chat-pane-open');
        const storedSpecialistId = localStorage.getItem(
          'current-active-specialist',
        );
        // Reduced logging

        const storedDocId = localStorage.getItem('chat-active-doc');
        const storedMainUiChatId = localStorage.getItem('main-ui-chat-id');
        const storedGlobalPaneChatId = localStorage.getItem(
          'global-pane-chat-id',
        );

        // Map client ID to specialist ID if needed
        let effectiveSpecialistId = storedSpecialistId;

        // Special handling for client-specific sessions
        // If we have a client session for "echo-tango", map it to the specialist ID
        // Use explicit type assertion for session.user with custom User type that includes clientId
        const clientId = session?.user
          ? (session.user as import('next-auth').User & { clientId?: string })
              ?.clientId || null
          : null;

        // Reduced logging

        // If no specialist ID is set, default to Echo Tango
        if (!effectiveSpecialistId) {
          // Reduced logging
          effectiveSpecialistId = ECHO_TANGO_SPECIALIST_ID;
        }

        // Override with client-specific specialist if available
        if (clientId === 'echo-tango' && !storedSpecialistId) {
          // Reduced logging
          effectiveSpecialistId = 'echo-tango-specialist';
        }

        // Validate UUID format
        const isValidUuid = (id: string | null) => {
          return (
            id &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              id,
            )
          );
        };

        // Create a single state update with all values
        setChatPaneState((prev) => {
          const newState = {
            ...prev,
            isPaneOpen: storedPaneState === 'true' ? true : prev.isPaneOpen,
            currentActiveSpecialistId:
              effectiveSpecialistId || prev.currentActiveSpecialistId,
            activeDocId: storedDocId || prev.activeDocId,
            mainUiChatId: isValidUuid(storedMainUiChatId)
              ? storedMainUiChatId || prev.mainUiChatId
              : prev.mainUiChatId,
            globalPaneChatId: isValidUuid(storedGlobalPaneChatId)
              ? storedGlobalPaneChatId || prev.globalPaneChatId
              : prev.globalPaneChatId,
            isNewChat: true,
          };

          // Reduced logging

          return newState;
        });
      };

      // Use requestAnimationFrame to defer state updates to prevent React cycle violations
      requestAnimationFrame(loadLocalStorageValues);
    } catch (error) {
      console.error('[ChatPaneContext] Error accessing localStorage:', error);
    }
  }, [session]); // Add session as a dependency

  // Combine all localStorage saving effect into a single effect
  useEffect(() => {
    try {
      // Save all state values to localStorage
      localStorage.setItem('chat-pane-open', String(isPaneOpen));
      localStorage.setItem(
        'current-active-specialist',
        currentActiveSpecialistId || '',
      );
      localStorage.setItem('chat-active-doc', activeDocId || '');
      localStorage.setItem('main-ui-chat-id', mainUiChatId || '');
      localStorage.setItem('global-pane-chat-id', globalPaneChatId || '');

      // Reduced localStorage logging
      // Only log significant changes, not every state update
    } catch (error) {
      console.error('Error saving state to localStorage:', error);
    }
  }, [
    isPaneOpen,
    currentActiveSpecialistId,
    activeDocId,
    mainUiChatId,
    globalPaneChatId,
  ]);

  // Add an effect to load global chats on initial render
  // Around line 383, after the localStorage initialization effect
  // Load chat history once when authenticated - using refs to prevent infinite loops
  const hasLoadedInitialChats = useRef(false);

  useEffect(() => {
    if (sessionStatus === 'authenticated' && !hasLoadedInitialChats.current) {
      hasLoadedInitialChats.current = true;

      // Load both global and specialist chats
      loadGlobalChats(true); // Force refresh on initial load
      loadAllSpecialistChats(true); // Force refresh on initial load
    } else if (
      sessionStatus === 'loading' ||
      sessionStatus === 'unauthenticated'
    ) {
      // Reset the flag when session changes
      hasLoadedInitialChats.current = false;
    }
  }, [sessionStatus, loadGlobalChats, loadAllSpecialistChats]); // Add missing dependencies

  // Cleaned-up message watcher: lock dropdown and refresh sidebar on assistant reply
  const prevMessageCount = useRef(0);

  const baseState = useChat({
    id: mainUiChatId || undefined,
    api: '/api/brain',
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onResponse: (response) => {
      // Reduced logging
      // ... existing onResponse logic ...
    },
    // onFinish: handleChatFinish, // disabled—no longer reliable
  });

  // ADD: Debug baseState to check if data is available
  useEffect(() => {
    console.log('[CHATPANE_CONTEXT_DEBUG] baseState changed:', {
      hasData: !!baseState.data,
      dataLength: baseState.data?.length || 0,
      isLoading: baseState.isLoading,
      error: baseState.error,
      messagesCount: baseState.messages.length,
      timestamp: new Date().toISOString(),
    });
  }, [
    baseState.data,
    baseState.isLoading,
    baseState.error,
    baseState.messages,
  ]);

  const { messages, setMessages } = baseState;

  // Function to load initial messages for existing chats
  const loadInitialMessages = useCallback(
    async (chatId: string) => {
      if (!chatId) return;

      try {
        console.log(
          '[ChatPaneContext] Loading initial messages for chat:',
          chatId,
        );

        const response = await fetch(`/api/messages?chatId=${chatId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (!response.ok) {
          console.log(
            '[ChatPaneContext] No initial messages found for chat:',
            chatId,
          );
          return;
        }

        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          console.log(
            '[ChatPaneContext] Setting initial messages:',
            data.messages.length,
          );
          setMessages(data.messages);
        }
      } catch (error) {
        console.error(
          '[ChatPaneContext] Error loading initial messages:',
          error,
        );
      }
    },
    [setMessages],
  );

  // Load initial messages when mainUiChatId changes
  useEffect(() => {
    if (mainUiChatId && mainUiChatId !== 'new') {
      // Only load if we don't already have messages
      if (messages.length === 0) {
        loadInitialMessages(mainUiChatId);
      }
    } else {
      // Clear messages for new chats
      if (messages.length > 0) {
        setMessages([]);
      }
    }
  }, [mainUiChatId, loadInitialMessages, messages.length, setMessages]);

  // Cleaned-up message watcher: lock dropdown and refresh sidebar on assistant reply
  useEffect(() => {
    const currCount = messages.length;
    if (currCount > prevMessageCount.current) {
      const last = messages[currCount - 1];
      if (last && last.role === 'assistant') {
        // Always refresh history when assistant responds (not just the first time)
        console.log(
          '[ChatPaneContext] Assistant message received, refreshing history',
        );
        refreshHistory();

        // Set committed state if not already set
        if (!isCurrentChatCommitted) {
          console.log(
            '[ChatPaneContext] Setting chat as committed after first assistant message',
          );
          setIsCurrentChatCommitted(true);
        }
      }
      prevMessageCount.current = currCount;
    }
  }, [messages, isCurrentChatCommitted, refreshHistory]);

  // Reset watcher and commit flag on chat ID change
  useEffect(() => {
    prevMessageCount.current = 0;

    // Don't immediately reset isCurrentChatCommitted to false
    // Instead, check if this is a truly new chat vs navigation to existing chat
    // We'll let the message-based effect handle setting the committed state

    setIsNewChat(true);

    // Re-apply Echo Tango as default specialist for new chats
    setChatPaneState((prev) => ({
      ...prev,
      currentActiveSpecialistId: ECHO_TANGO_SPECIALIST_ID,
    }));

    console.log(
      '[ChatPaneContext] Reset chat state for new chat ID:',
      mainUiChatId,
    );
  }, [mainUiChatId]);

  // Set chat as committed based on messages (handles both new and existing chats)
  useEffect(() => {
    // For new chats, check if there are any messages
    // For existing chats, this will run after initialMessages are loaded
    const shouldBeCommitted = messages.length > 0;

    if (shouldBeCommitted && !isCurrentChatCommitted) {
      console.log(
        '[ChatPaneContext] Setting chat as committed due to messages present:',
        messages.length,
      );
      setIsCurrentChatCommitted(true);
    } else if (!shouldBeCommitted && isCurrentChatCommitted) {
      // Reset to uncommitted if no messages (new empty chat)
      console.log(
        '[ChatPaneContext] Resetting chat committed state - no messages',
      );
      setIsCurrentChatCommitted(false);
    }
  }, [messages.length, isCurrentChatCommitted]);

  // Reset the chatPersistedRef when starting a new chat
  useEffect(() => {
    if (baseState.messages.length === 0) {
      chatPersistedRef.current = false;
    }
  }, [baseState.messages.length]);

  // Create custom submitMessage function to ensure context is always included
  const submitMessage = useCallback(
    async (options?: { message?: any; data?: Record<string, any> }) => {
      // Use the current specialist ID from destructured state
      const specialistForPayload = currentActiveSpecialistId;
      // Reduced logging
      const bodyPayload = {
        id: mainUiChatId,
        selectedChatModel: 'global-orchestrator',
        activeBitContextId: specialistForPayload, // This sends it to backend
        currentActiveSpecialistId: specialistForPayload, // For prompt loading clarity
        activeDocId,
        isFromGlobalPane: false,
        mainUiChatId: mainUiChatId,
        referencedGlobalPaneChatId: globalPaneChatId,
        ...(options?.data || {}),
      };
      // Reduced logging
      return baseState.handleSubmit(options?.message as any, {
        body: bodyPayload,
      });
    },
    [
      baseState.handleSubmit,
      mainUiChatId,
      currentActiveSpecialistId,
      activeDocId,
      globalPaneChatId,
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
            // Reduced logging

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

              // Reduced logging
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

  // Add setIsNewChat function
  const setIsNewChat = useCallback((isNew: boolean) => {
    // Reduced logging
    setChatPaneState((prev) => ({ ...prev, isNewChat: isNew }));
  }, []);

  // Fix the contextValue to properly structure chatState and include isCurrentChatCommitted
  const contextValue = useMemo(() => {
    return {
      chatState: {
        ...baseState,
        handleSubmit: submitMessage,
      },
      isPaneOpen,
      setIsPaneOpen,
      currentActiveSpecialistId,
      setCurrentActiveSpecialistId,
      activeDocId,
      setActiveDocId,
      submitMessage,
      streamedContentMap,
      lastStreamUpdateTs,
      mainUiChatId,
      setMainUiChatId,
      globalPaneChatId,
      setGlobalPaneChatId,
      ensureValidChatId,
      sidebarChats,
      isLoadingSidebarChats,
      globalChats,
      isLoadingGlobalChats,
      loadGlobalChats,
      refreshHistory,
      specialistGroupedChats,
      isNewChat,
      setIsNewChat,
      isCurrentChatCommitted,
      sidebarDataRevision,
    };
  }, [
    baseState,
    isPaneOpen,
    setIsPaneOpen,
    currentActiveSpecialistId,
    setCurrentActiveSpecialistId,
    activeDocId,
    setActiveDocId,
    submitMessage,
    streamedContentMap,
    lastStreamUpdateTs,
    mainUiChatId,
    setMainUiChatId,
    globalPaneChatId,
    setGlobalPaneChatId,
    ensureValidChatId,
    sidebarChats,
    isLoadingSidebarChats,
    globalChats,
    isLoadingGlobalChats,
    loadGlobalChats,
    refreshHistory,
    specialistGroupedChats,
    isNewChat,
    setIsNewChat,
    isCurrentChatCommitted,
    sidebarDataRevision,
  ]);

  return (
    <ChatPaneContext.Provider value={contextValue}>
      {children}
    </ChatPaneContext.Provider>
  );
};
