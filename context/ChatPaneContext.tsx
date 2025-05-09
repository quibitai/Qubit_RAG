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
} from '@/lib/constants';

console.log('[ChatPaneContext] actions:', {
  createChatAndSaveFirstMessages,
});

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
  loadGlobalChats: () => Promise<void>;
  refreshHistory: () => void;
  specialistGroupedChats: Array<{
    id: string;
    name: string;
    description: string;
    chats: ChatSummary[];
  }>;
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

  console.log(`[ChatPaneContext] NextAuth Session status: ${sessionStatus}`, {
    isAuthenticated: sessionStatus === 'authenticated',
    hasUserId: !!session?.user?.id,
  });

  // Debug: Check if server action is correctly identified
  // Only log once during development
  const hasLoggedServerActionCheck = useRef(false);

  useEffect(() => {
    if (!hasLoggedServerActionCheck.current) {
      console.log('[CLIENT] Server action check in ChatPaneContext:', {
        isFunction: typeof createChatAndSaveFirstMessages === 'function',
        hasServerRef:
          typeof createChatAndSaveFirstMessages === 'object' &&
          (createChatAndSaveFirstMessages as any)?.__$SERVER_REFERENCE,
        serverActionId: (createChatAndSaveFirstMessages as any)
          .__next_action_id,
      });
      hasLoggedServerActionCheck.current = true;
    }
  }, []);

  // Use a single chatPaneState object to hold state
  // This prevents cascading re-renders when multiple states change
  const [chatPaneState, setChatPaneState] = useState<ChatPaneState>(() => {
    // Initialize with default values
    return {
      isPaneOpen: true,
      currentActiveSpecialistId: null,
      activeDocId: null,
      mainUiChatId: generateUUID(),
      globalPaneChatId: generateUUID(),
    };
  });

  // Create individual state setters with useCallback to prevent recreation
  const setIsPaneOpen = useCallback((isOpen: boolean) => {
    setChatPaneState((prev) => ({ ...prev, isPaneOpen: isOpen }));
  }, []);

  const setCurrentActiveSpecialistId = useCallback((id: string | null) => {
    console.log(
      '[ChatPaneContext] setCurrentActiveSpecialistId called with:',
      id,
    );
    setChatPaneState((prev) => ({ ...prev, currentActiveSpecialistId: id }));
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
  } = chatPaneState;

  // State for chat history
  const [sidebarChats, setSidebarChats] = useState<ChatSummary[]>([]);
  const [_isLoadingSidebarChats, setIsLoadingSidebarChats] = useState(false);
  const isLoadingSidebarChats = _isLoadingSidebarChats;

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
    console.log(
      `[ChatPaneContext] Generated new chat ID: ${newChatId} (replacing invalid ${chatId})`,
    );

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
    console.log(
      `[ChatPaneContext] Would apply update to document ${docId}:`,
      `${content.substring(0, 50)}...`,
    );
    // In a complete implementation, this would call into DocumentContext
  }, []);

  // Add loadAllSpecialistChats function
  const loadAllSpecialistChats = useCallback(async () => {
    console.log('[ChatPaneContext] Loading chats for ALL specialists');

    // Check authentication status from NextAuth
    if (sessionStatus !== 'authenticated') {
      console.error(
        '[ChatPaneContext] loadAllSpecialistChats - NOT AUTHENTICATED via NextAuth, skipping fetch',
      );
      return;
    }

    try {
      // Create the correct URL for fetching all specialist chats
      const finalUrl = `/api/history?type=all-specialists&limit=20`;
      console.log(
        `[ChatPaneContext] Fetching all specialist chats: ${finalUrl}`,
      );

      const response = await fetch(finalUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch specialist chats: ${response.status} - ${response.statusText}`,
        );
      }

      const data = await response.json();
      console.log(
        `[ChatPaneContext] Received specialist groupings: ${data.specialists?.length || 0}`,
      );

      // Set sidebar chats - combine all specialist chats for now to maintain compatibility
      // Later we'll modify the sidebar component to handle the grouped structure
      const allChats = data.specialists?.flatMap((s: any) => s.chats) || [];
      setSidebarChats(allChats);

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
  }, [sessionStatus, setIsLoadingSidebarChats]);

  // Add loadGlobalChats function after loadAllSpecialistChats function
  const loadGlobalChats = useCallback(async () => {
    console.log('[ChatPaneContext] Loading global orchestrator chats');

    // Check authentication status from NextAuth
    if (sessionStatus !== 'authenticated') {
      console.error(
        '[ChatPaneContext] loadGlobalChats - NOT AUTHENTICATED via NextAuth, skipping fetch',
      );
      return;
    }

    try {
      setIsLoadingGlobalChats(true);

      // Create the correct URL for fetching global chats
      const finalUrl = `/api/history?type=global&limit=20&bitContextId=${GLOBAL_ORCHESTRATOR_CONTEXT_ID}`;
      console.log(`[ChatPaneContext] Fetching global chats: ${finalUrl}`);

      const response = await fetch(finalUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch global chats: ${response.status} - ${response.statusText}`,
        );
      }

      const data = await response.json();
      console.log(
        `[ChatPaneContext] Received global chats: ${data.chats?.length || 0}`,
      );

      // Set global chats
      setGlobalChats(data.chats || []);
      setIsLoadingGlobalChats(false);
    } catch (error) {
      console.error('[ChatPaneContext] Error fetching global chats:', error);
      setIsLoadingGlobalChats(false);
    }
  }, [sessionStatus, setIsLoadingGlobalChats, GLOBAL_ORCHESTRATOR_CONTEXT_ID]);

  // Update the refreshHistory function to also call loadGlobalChats
  const refreshHistory = useCallback(() => {
    console.log('[ChatPaneContext] Manually refreshing chat history lists');

    // Use loadAllSpecialistChats to refresh specialist chats
    loadAllSpecialistChats();

    // Load global chats
    loadGlobalChats();
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
        console.log(
          `[ChatPaneContext] Loading from localStorage - current-active-specialist: "${storedSpecialistId || 'null'}"`,
        );

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

        console.log(
          `[ChatPaneContext] Client ID from session: ${clientId || 'undefined'}`,
        );

        if (clientId === 'echo-tango' && !effectiveSpecialistId) {
          console.log(
            '[ChatPaneContext] Detected Echo Tango client - setting specialist ID to echo-tango-specialist',
          );
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
          };

          console.log(
            `[ChatPaneContext] Setting initial state from localStorage:`,
            {
              isPaneOpen: newState.isPaneOpen,
              currentActiveSpecialistId: newState.currentActiveSpecialistId,
              activeDocId: newState.activeDocId,
              mainUiChatId: `${newState.mainUiChatId?.substring(0, 8) || 'null'}`,
              globalPaneChatId: `${newState.globalPaneChatId?.substring(0, 8) || 'null'}`,
            },
          );

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

      // Only log in development for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log('[ChatPaneContext] Saved state to localStorage:', {
          isPaneOpen,
          currentActiveSpecialistId,
          activeDocId,
          mainUiChatId,
          globalPaneChatId,
        });
      }
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
  // Add initial loading of global chats
  useEffect(() => {
    // Check if chats have been loaded before
    const shouldLoadChats =
      sessionStatus === 'authenticated' &&
      globalChats.length === 0 &&
      !isLoadingGlobalChats;

    if (shouldLoadChats) {
      console.log('[ChatPaneContext] Initial loading of global chats');
      loadGlobalChats();
    }
  }, [
    sessionStatus,
    globalChats.length,
    isLoadingGlobalChats,
    loadGlobalChats,
  ]);

  const baseState = useChat({
    id: mainUiChatId || undefined, // Convert null to undefined for useChat
    api: '/api/brain',
    body: {
      // Always identify as Quibit orchestrator
      selectedChatModel: 'global-orchestrator',
      // Include only the active specialist ID and active doc ID
      activeBitContextId: currentActiveSpecialistId,
      currentActiveSpecialistId: currentActiveSpecialistId, // Include both for compatibility
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
      // Use data from options to determine if this is for main UI or global pane
      const isFromGlobalPane = options?.data?.isFromGlobalPane === true;

      // Use the appropriate chat ID based on source
      const chatId = isFromGlobalPane ? globalPaneChatId : mainUiChatId;

      // Determine the correct bitContextId for the backend
      let backendBitContextId = CHAT_BIT_CONTEXT_ID; // Default for main chat UI
      if (isFromGlobalPane) {
        backendBitContextId = GLOBAL_ORCHESTRATOR_CONTEXT_ID;
      } else if (currentActiveSpecialistId) {
        // If specialists have their own distinct history and bitContextId, use it:
        backendBitContextId = currentActiveSpecialistId;
        // No longer forcing to CHAT_BIT_CONTEXT_ID - we want specialists to have their own context
      }

      console.log('[ChatPaneContext] Submitting message with context:', {
        currentActiveSpecialistId,
        activeDocId,
        chatId,
        isFromGlobalPane,
        resolvedBackendBitContextId: backendBitContextId, // Log the resolved ID
      });

      // Prepare the body with context information
      const bodyPayload = {
        // Always identify as Quibit to the backend
        selectedChatModel: 'global-orchestrator',
        // Use the resolved ID instead of currentActiveSpecialistId directly
        activeBitContextId: backendBitContextId,
        currentActiveSpecialistId: currentActiveSpecialistId, // Keep for compatibility
        activeDocId,
        // Ensure a valid chatId is always sent
        id: chatId,
        // For global pane messages, also include the main UI chat ID as reference
        ...(isFromGlobalPane && { referencedChatId: mainUiChatId }),
        // Include any other data from options?.data
        ...(options?.data || {}),
      };

      console.log(
        '[ChatPaneContext] Sending request to /api/brain with body:',
        bodyPayload,
      );

      // Call the original handleSubmit with our enhanced body
      return baseState.handleSubmit(options?.message, {
        body: bodyPayload,
      });
    },
    [
      baseState.handleSubmit,
      currentActiveSpecialistId,
      activeDocId,
      mainUiChatId,
      globalPaneChatId,
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

              // Replace toast with console log
              console.log(
                `[ChatPaneContext] AI is updating document: ${targetDocId}`,
              );
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

  // Return memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
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

      // New properties for chat history management
      sidebarChats,
      isLoadingSidebarChats,
      globalChats,
      isLoadingGlobalChats,
      loadGlobalChats,

      // Add the new refresh function
      refreshHistory,

      // New properties for specialist grouped chats
      specialistGroupedChats,
    }),
    [
      baseState,
      submitMessage,
      isPaneOpen,
      setIsPaneOpen,
      currentActiveSpecialistId,
      setCurrentActiveSpecialistId,
      activeDocId,
      setActiveDocId,
      streamedContentMap,
      lastStreamUpdateTs,
      mainUiChatId,
      setMainUiChatId,
      globalPaneChatId,
      setGlobalPaneChatId,
      ensureValidChatId,

      // New dependencies
      sidebarChats,
      isLoadingSidebarChats,
      globalChats,
      isLoadingGlobalChats,
      loadGlobalChats,

      // Add the new refresh function
      refreshHistory,

      // New properties for specialist grouped chats
      specialistGroupedChats,
    ],
  );

  return (
    <ChatPaneContext.Provider value={contextValue}>
      {children}
    </ChatPaneContext.Provider>
  );
};
