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

console.log('[ChatPaneContext] actions:', {
  createChatAndSaveFirstMessages,
});

import type { DBMessage } from '@/lib/db/schema';
import { useDocumentState } from './DocumentContext';
import { toast } from 'sonner';

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
  mainUiChatId: string;
  setMainUiChatId: (id: string) => void;
  globalPaneChatId: string;
  setGlobalPaneChatId: (id: string) => void;
  ensureValidChatId: (chatId: string) => string;

  // New properties for chat history management
  sidebarChats: ChatSummary[];
  isLoadingSidebarChats: boolean;
  loadSidebarChats: (bitContextId?: string | null) => Promise<void>;

  globalChats: ChatSummary[];
  isLoadingGlobalChats: boolean;
  loadGlobalChats: () => Promise<void>;
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

  const setMainUiChatId = useCallback((id: string) => {
    setChatPaneState((prev) => ({ ...prev, mainUiChatId: id }));
  }, []);

  const setGlobalPaneChatId = useCallback((id: string) => {
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

  // New state for chat history management
  const [sidebarChats, setSidebarChats] = useState<ChatSummary[]>([]);
  const [_isLoadingSidebarChats, _setIsLoadingSidebarChats] =
    useState<boolean>(false);
  const [globalChats, setGlobalChats] = useState<ChatSummary[]>([]);
  const [isLoadingGlobalChats, setIsLoadingGlobalChats] =
    useState<boolean>(false);

  // For stream content, keep as separate state
  const [streamedContentMap, setStreamedContentMap] = useState<
    Record<string, string>
  >({});
  const [lastStreamUpdateTs, setLastStreamUpdateTs] = useState<number>(0);

  const router = useRouter();

  // Function to ensure we always have a valid UUID for any chat ID
  const ensureValidChatId = useCallback((chatId: string) => {
    // Use the provided chatId if it's already a valid UUID
    const validUuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (validUuidPattern.test(chatId)) {
      return chatId;
    }

    // Generate a new UUID if the provided one is not valid
    const newChatId = generateUUID();
    console.log(
      `[ChatPaneContext] Generated new chat ID: ${newChatId} (replacing invalid ${chatId})`,
    );

    return newChatId;
  }, []);

  // Create a wrapped version that logs changes
  const setIsLoadingSidebarChats = useCallback((loading: boolean) => {
    console.log(`[DEBUG] setIsLoadingSidebarChats changing to: ${loading}`);
    _setIsLoadingSidebarChats(loading);
  }, []);

  // Expose the state through a renamed variable
  const isLoadingSidebarChats = _isLoadingSidebarChats;

  // Add a ref to track the last time loadSidebarChats was called
  const lastSidebarFetchTimeRef = useRef<number>(0);
  const lastContextIdRef = useRef<string | null>(null);

  // Add placeholder functions for loading chat history
  const loadSidebarChats = useCallback(
    async (bitContextId?: string | null) => {
      // IMPLEMENT DEBOUNCING - Check if we called this function recently (in last 5 seconds)
      const now = Date.now();
      const minInterval = 5000; // 5 seconds minimum between calls

      // Don't debounce if the context ID has changed
      const safeContextId: string | null = bitContextId ?? null;
      const contextIdChanged = lastContextIdRef.current !== safeContextId;
      lastContextIdRef.current = safeContextId;

      if (
        !contextIdChanged &&
        now - lastSidebarFetchTimeRef.current < minInterval
      ) {
        console.log(
          `[ChatPaneContext] loadSidebarChats - Called too frequently, last call was ${now - lastSidebarFetchTimeRef.current}ms ago. Skipping this fetch.`,
        );
        return;
      }

      // Update the timestamp ref for this call
      lastSidebarFetchTimeRef.current = now;

      // Avoid fetching if already loading
      if (isLoadingSidebarChats) {
        console.log(
          '[ChatPaneContext] loadSidebarChats - Already loading, skipping fetch',
        );
        return;
      }

      // Check authentication status from NextAuth
      console.log(
        `[ChatPaneContext] loadSidebarChats - Authentication status from NextAuth: ${sessionStatus}`,
      );

      if (sessionStatus !== 'authenticated') {
        console.error(
          '[ChatPaneContext] loadSidebarChats - NOT AUTHENTICATED via NextAuth, skipping fetch',
        );
        setIsLoadingSidebarChats(false);
        return;
      }

      setIsLoadingSidebarChats(true);
      console.log(
        `[ChatPaneContext] loadSidebarChats - Fetching sidebar chats for bitContextId: ${bitContextId || 'null'}`,
      );

      // Add unmissable log statement
      const sidebarContextId = bitContextId || 'chat-model';
      console.error(
        `!!! ATTEMPTING SIDEBAR FETCH !!! Type: sidebar, ContextID: ${sidebarContextId}, Timestamp: ${new Date().toISOString()}`,
      );

      try {
        // Create the correct URL for sidebar chat history
        const finalUrlForSidebar = `/api/history?type=sidebar&contextId=${sidebarContextId}&limit=20`;
        console.error(
          `[LOAD_SIDEBAR_CHATS] >>> FINAL FETCH URL for Sidebar: ${finalUrlForSidebar}, Timestamp: ${new Date().toISOString()}`,
        );

        // Make the fetch request directly with explicit headers
        const response = await fetch(finalUrlForSidebar, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          // Include credentials
          credentials: 'include',
        });

        if (!response.ok) {
          console.error(
            `[ChatPaneContext] loadSidebarChats - Fetch failed with status: ${response.status}, statusText: ${response.statusText}`,
          );
          throw new Error(
            `Failed to fetch sidebar chats: ${response.status} - ${response.statusText}`,
          );
        }

        const data = await response.json();
        console.log(
          `[ChatPaneContext] loadSidebarChats - Received ${data.chats?.length || 0} chats`,
        );

        // Update state with the fetched data
        setSidebarChats(data.chats || []);
        setIsLoadingSidebarChats(false);
      } catch (error) {
        console.error(
          '[ChatPaneContext] loadSidebarChats - Error fetching sidebar chats:',
          error,
        );
        setIsLoadingSidebarChats(false);
      }
    },
    [
      isLoadingSidebarChats,
      sessionStatus,
      setIsLoadingSidebarChats,
      setSidebarChats,
    ],
  );

  const loadGlobalChats = useCallback(async () => {
    // Avoid fetching if already loading
    if (isLoadingGlobalChats) {
      console.log(
        '[ChatPaneContext] loadGlobalChats - Already loading, skipping fetch',
      );
      return;
    }

    // Check authentication status from NextAuth
    console.log(
      `[ChatPaneContext] loadGlobalChats - Authentication status from NextAuth: ${sessionStatus}`,
    );

    if (sessionStatus !== 'authenticated') {
      console.error(
        '[ChatPaneContext] loadGlobalChats - NOT AUTHENTICATED via NextAuth, skipping fetch',
      );
      // Don't clear global chats if not authenticated - just keep previous state
      setIsLoadingGlobalChats(false);
      return;
    }

    // Check if there's a cached result that's not too old
    const cachedTime = localStorage.getItem('global-chats-timestamp');
    const cachedData = localStorage.getItem('global-chats-data');
    const now = Date.now();

    // Only use cache if it's less than 60 seconds old
    if (
      cachedTime &&
      cachedData &&
      now - Number.parseInt(cachedTime, 10) < 60000
    ) {
      try {
        const parsedData = JSON.parse(cachedData);
        console.log(
          `[ChatPaneContext] Using cached global chats from ${new Date(Number.parseInt(cachedTime, 10)).toISOString()} (${parsedData.length} chats)`,
        );
        setGlobalChats(parsedData);
        return;
      } catch (e) {
        console.error(
          '[ChatPaneContext] Error parsing cached global chats:',
          e,
        );
        // Continue with fetch if cache parsing fails
      }
    }

    setIsLoadingGlobalChats(true);
    console.log('[ChatPaneContext] Fetching global chats');

    try {
      // Log the exact URL being used for global chat fetch
      const globalChatUrl = `/api/history?type=global&limit=50`;
      console.error(
        `[LOAD_GLOBAL_CHATS] >>> FINAL FETCH URL for Global: ${globalChatUrl}, Timestamp: ${new Date().toISOString()}`,
      );

      const response = await fetch(globalChatUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        // Handle authentication redirects specifically
        if (response.status === 307 || response.status === 401) {
          console.error(
            '[ChatPaneContext] Authentication required for history API',
          );
          setIsLoadingGlobalChats(false);
          return;
        }

        throw new Error(`Failed to fetch global chats: ${response.statusText}`);
      }

      const data = await response.json();
      const chats: ChatSummary[] = data.chats || [];
      console.log(
        `[ChatPaneContext] Received ${chats.length} global chats. Has more: ${data.hasMore}`,
      );

      // Cache the results and timestamp
      try {
        localStorage.setItem('global-chats-data', JSON.stringify(chats));
        localStorage.setItem('global-chats-timestamp', now.toString());
      } catch (e) {
        console.error('[ChatPaneContext] Error caching global chats:', e);
      }

      setGlobalChats(chats);
    } catch (error) {
      console.error('[ChatPaneContext] Failed to load global chats:', error);
      // Don't clear chats on error to maintain UI stability
      toast.error('Failed to load global chats');
    } finally {
      setIsLoadingGlobalChats(false);
    }
  }, [
    isLoadingGlobalChats,
    sessionStatus,
    setGlobalChats,
    setIsLoadingGlobalChats,
  ]);

  // Initialize chat history when provider mounts
  useEffect(() => {
    console.log(
      '[ChatPaneContext] Provider mounted. Triggering initial loadGlobalChats.',
    );
    loadGlobalChats();
    // If sidebar should load initially too (e.g., for default bit), call it here
    // loadSidebarChats(activeBitContextId); // Pass initial context if available
  }, [loadGlobalChats]); // Only depends on the stable load function

  // Load sidebar chats when the active specialist changes
  useEffect(() => {
    // Skip if session is not ready yet
    if (sessionStatus === 'loading') {
      console.log(
        '[ChatPaneContext] Session still loading, deferring sidebar fetch',
      );
      return;
    }

    console.log(
      '[ChatPaneContext] Sidebar useEffect, currentActiveSpecialistId:',
      currentActiveSpecialistId,
    );
    console.log(
      '[ChatPaneContext] Reading from localStorage, specialistId:',
      localStorage.getItem('current-active-specialist'),
    );
    console.log(`[ChatPaneContext] Current session status: ${sessionStatus}`);

    console.log(
      `[DEBUG] Sidebar useEffect Trigger Check: Session Status='${sessionStatus}', currentActiveSpecialistId='${currentActiveSpecialistId}', isLoadingSidebarChats='${isLoadingSidebarChats}'`,
    );

    // Skip fetching if not authenticated
    if (sessionStatus !== 'authenticated') {
      console.log(
        '[ChatPaneContext] Not authenticated yet, skipping sidebar fetch until session is ready',
      );
      return;
    }

    // Always load sidebar chats, defaulting to 'chat-model' if no specialist is selected
    const contextId = currentActiveSpecialistId || 'chat-model';

    // Store the current specialist ID in localStorage for SWR key generation in other components
    try {
      localStorage.setItem('current-active-specialist', contextId);
      console.log(
        `[ChatPaneContext] Stored current-active-specialist in localStorage: ${contextId}`,
      );
    } catch (error) {
      console.error(
        '[ChatPaneContext] Error storing specialist ID in localStorage:',
        error,
      );
    }

    console.log(
      `[ChatPaneContext] useEffect calling loadSidebarChats with contextId: ${contextId}`,
    );
    console.error(
      `!!! SIDEBAR USEEFFECT IN CHATPANECONTEXT TRIGGERED !!! Will call loadSidebarChats with ContextID: ${contextId}, CurrentActiveSpecialistId: ${currentActiveSpecialistId}, Timestamp: ${new Date().toISOString()}`,
    );

    // Add useEffect execution tracking counter to localStorage to monitor how often this runs
    try {
      const execCount = Number.parseInt(
        localStorage.getItem('sidebar-effect-exec-count') || '0',
        10,
      );
      localStorage.setItem(
        'sidebar-effect-exec-count',
        (execCount + 1).toString(),
      );
      console.log(
        `[TRACKING] Sidebar useEffect execution count: ${execCount + 1}`,
      );
    } catch (e) {}

    // Re-enable the call now that we've fixed the dependencies
    loadSidebarChats(contextId);

    // For debugging: log the current state after a short delay
    const timerId = setTimeout(() => {
      console.log('[ChatPaneContext] Sidebar state after loading attempt:', {
        sidebarChats: sidebarChats?.length || 0,
        isLoading: isLoadingSidebarChats,
        contextId,
        currentActiveSpecialistIdState: currentActiveSpecialistId,
        sessionStatus,
      });
    }, 2000);

    return () => clearTimeout(timerId);
  }, [
    currentActiveSpecialistId,
    loadSidebarChats,
    sessionStatus,
    isLoadingSidebarChats,
    sidebarChats?.length,
  ]); // Added all dependencies used in the effect

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
              storedSpecialistId || prev.currentActiveSpecialistId,
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
              mainUiChatId: `${newState.mainUiChatId.substring(0, 8)}...`,
              globalPaneChatId: `${newState.globalPaneChatId.substring(0, 8)}...`,
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
  }, []);

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
      localStorage.setItem('main-ui-chat-id', mainUiChatId);
      localStorage.setItem('global-pane-chat-id', globalPaneChatId);

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

  const baseState = useChat({
    id: mainUiChatId, // Use the main UI chat ID for the primary useChat instance
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

      console.log('[ChatPaneContext] Submitting message with context:', {
        currentActiveSpecialistId,
        activeDocId,
        chatId,
        isFromGlobalPane,
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
        id: chatId,
        // For global pane messages, also include the main UI chat ID as reference
        ...(isFromGlobalPane && { referencedChatId: mainUiChatId }),
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
      loadSidebarChats,
      globalChats,
      isLoadingGlobalChats,
      loadGlobalChats,
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
      loadSidebarChats,
      globalChats,
      isLoadingGlobalChats,
      loadGlobalChats,
    ],
  );

  return (
    <ChatPaneContext.Provider value={contextValue}>
      {children}
    </ChatPaneContext.Provider>
  );
};
