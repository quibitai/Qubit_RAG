import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import useSWRInfinite from 'swr/infinite';
import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';
import { toast } from 'sonner';

import { fetcher } from '@/lib/utils';
import { deleteChat } from '@/app/(chat)/actions';
import type { Chat, Document } from '@/lib/db/schema';
import type {
  ChatHistory,
  DocumentHistory,
  GroupedChats,
  ExpandedSections,
} from '@/lib/types';

const PAGE_SIZE = 20;

// Helper functions for chat history (not tied to component state)
export const groupChatsByDate = (chats: Chat[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(chat.createdAt);

      if (isToday(chatDate)) {
        groups.today.push(chat);
      } else if (isYesterday(chatDate)) {
        groups.yesterday.push(chat);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(chat);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(chat);
      } else {
        groups.older.push(chat);
      }

      return groups;
    },
    {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: [],
    } as GroupedChats,
  );
};

// Update the separateChatsByType function with more inclusive filtering
export const separateChatsByType = (chats: Chat[]): GroupedChats => {
  // Include ALL chats in the sidebar now, regardless of bitContextId
  console.log('[useChatHistory] Total chats to filter:', chats.length);

  // Log a sample of the incoming chats
  if (chats.length > 0) {
    console.log('[useChatHistory] Sample of incoming chats (first 3):');
    chats.slice(0, 3).forEach((chat, idx) => {
      console.log(`[useChatHistory] Chat ${idx + 1}:`, {
        id: chat.id.substring(0, 8) + '...',
        title: chat.title,
        bitContextId: chat.bitContextId,
        createdAt: chat.createdAt,
      });
    });
  } else {
    console.log('[useChatHistory] No chats received from backend');
  }

  // MODIFIED APPROACH: Include all chats, except global orchestrator
  const chatBitChats = chats.filter((chat) => {
    // Only exclude global orchestrator chats
    if (chat.bitContextId === 'global-orchestrator') {
      console.log(
        `[useChatHistory] Excluding global orchestrator chat "${chat.title}"`,
      );
      return false;
    }

    // Include all other chats, even if bitContextId is null or empty
    console.log(
      `[useChatHistory] Including chat "${chat.title}" with bitContextId: ${chat.bitContextId || 'NULL/EMPTY'}`,
    );
    return true;
  });

  console.log(
    '[useChatHistory] Filtered chat count (for sidebar):',
    chatBitChats.length,
  );

  // Log summary of included/excluded chats
  console.log(`[useChatHistory] Filtering summary:
    - Total chats: ${chats.length}
    - Included in sidebar: ${chatBitChats.length}
    - Excluded from sidebar: ${chats.length - chatBitChats.length}
  `);

  // Now group by date
  return groupChatsByDate(chatBitChats);
};

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory,
) {
  // CRITICAL: Check where this function is being called from
  const caller = new Error().stack?.split('\n')[2] || 'unknown';
  console.error(`[SWR Key Gen] CALLER >>> ${caller.trim()}`);

  console.log(
    `[getChatHistoryPaginationKey] Function called with pageIndex=${pageIndex}, previousPageData=`,
    previousPageData
      ? {
          hasMore: previousPageData.hasMore,
          chatCount: previousPageData.chats?.length || 0,
          firstChatId:
            previousPageData.chats?.[0]?.id?.substring(0, 8) || 'none',
        }
      : 'null/undefined',
  );

  if (previousPageData && previousPageData.hasMore === false) {
    console.log(
      '[getChatHistoryPaginationKey] Returning null (end of pagination reached)',
    );
    return null;
  }

  // Get the active bit context ID from localStorage, default to 'chat-model'
  try {
    // Determine the type of history being requested
    // For now, we're hard-coding type=sidebar here to ensure we get sidebar requests
    const type = 'sidebar';

    // Get contextId from localStorage
    const activeContextId =
      localStorage.getItem('current-active-specialist') || 'chat-model';

    // Add uniqueness tracker to prevent repeated fetches
    // This creates a stable key that will only change when the specialist changes
    const lastFetchTimestamp =
      localStorage.getItem('last-sidebar-fetch-timestamp') || '0';
    const now = Date.now();

    // Only update the timestamp for new fetches, not for SWR internal validation
    if (Number(lastFetchTimestamp) + 5000 < now) {
      // 5 second minimum between actual fetches
      localStorage.setItem('last-sidebar-fetch-timestamp', now.toString());
      console.log(
        `[SWR Key Gen] Updating timestamp, prev=${lastFetchTimestamp}, new=${now}`,
      );
    } else {
      console.log(
        `[SWR Key Gen] Using existing timestamp ${lastFetchTimestamp}, not updating yet`,
      );
    }

    console.error(
      `[SWR Key Gen] >> Using type=${type}, contextId=${activeContextId}`,
    );

    // Create the URL with correct parameters
    let url = '';

    if (pageIndex === 0) {
      // Create a very clear, unmissable log about the key being generated
      url = `/api/history?type=${type}&contextId=${activeContextId}&limit=${PAGE_SIZE}`;
      console.error(
        `[SWR Key Gen] SIDEBAR ATTEMPT >> Type: ${type}, ContextID: ${activeContextId}, Page: ${pageIndex + 1}, Limit: ${PAGE_SIZE} || FINAL KEY: ${url}`,
      );
      return url;
    }

    const firstChatFromPage = previousPageData.chats.at(-1);

    if (!firstChatFromPage) {
      console.log(
        '[getChatHistoryPaginationKey] No chats in previous page, returning null',
      );
      return null;
    }

    // Include the same parameters as the first page, plus the cursor
    url = `/api/history?type=${type}&contextId=${activeContextId}&limit=${PAGE_SIZE}&cursor=${firstChatFromPage.id}`;
    console.error(
      `[SWR Key Gen] SIDEBAR PAGINATION ATTEMPT >> Type: ${type}, ContextID: ${activeContextId}, Page: ${pageIndex + 1}, Limit: ${PAGE_SIZE}, Cursor: ${firstChatFromPage.id.substring(0, 8)}... || FINAL KEY: ${url}`,
    );
    return url;
  } catch (error) {
    console.error('[getChatHistoryPaginationKey] Error generating key:', error);
    // In case of error, return a sane default that will at least load some data
    const url = `/api/history?type=sidebar&contextId=chat-model&limit=${PAGE_SIZE}`;
    console.error(
      `[SWR Key Gen] ERROR FALLBACK >> FINAL KEY: ${url}, Error: ${error}`,
    );
    return url;
  }
}

export function getDocumentHistoryPaginationKey(
  pageIndex: number,
  previousPageData: DocumentHistory,
) {
  console.log(
    `[getDocumentHistoryPaginationKey] Function called with pageIndex=${pageIndex}, previousPageData=`,
    previousPageData
      ? {
          hasMore: previousPageData.hasMore,
          documentCount: previousPageData.documents?.length || 0,
          firstDocId:
            previousPageData.documents?.[0]?.id?.substring(0, 8) || 'none',
        }
      : 'null/undefined',
  );

  if (previousPageData && previousPageData.hasMore === false) {
    console.log(
      '[getDocumentHistoryPaginationKey] Returning null (end of pagination reached)',
    );
    return null;
  }

  let url = '';

  if (pageIndex === 0) {
    url = `/api/documents-history?limit=${PAGE_SIZE}`;
    console.log(`[getDocumentHistoryPaginationKey] Initial URL: ${url}`);
    return url;
  }

  const lastDocumentFromPage = previousPageData.documents.at(-1);

  if (!lastDocumentFromPage) {
    console.log(
      '[getDocumentHistoryPaginationKey] No documents in previous page, returning null',
    );
    return null;
  }

  url = `/api/documents-history?limit=${PAGE_SIZE}&cursor=${lastDocumentFromPage.id}`;
  console.log(`[getDocumentHistoryPaginationKey] Pagination URL: ${url}`);
  return url;
}

// The main hook for chat history management
export function useChatHistory(currentChatId?: string) {
  console.log(
    '[useChatHistory] Hook initializing with currentChatId:',
    currentChatId,
  );

  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // State for expanded day sections and number of chats to show per day
  const [expandedDays, setExpandedDays] = useState<ExpandedSections>({
    today: true,
    yesterday: false,
    lastWeek: false,
    lastMonth: false,
    older: false,
  });

  const [expandedChatCounts, setExpandedChatCounts] =
    useState<ExpandedSections>({
      today: false,
      yesterday: false,
      lastWeek: false,
      lastMonth: false,
      older: false,
    });

  // Add a state for document sections
  const [expandedDocumentDays, setExpandedDocumentDays] =
    useState<ExpandedSections>({
      today: true,
      yesterday: false,
      lastWeek: false,
      lastMonth: false,
      older: false,
    });

  // Add a state for document chat counts
  const [expandedDocumentCounts, setExpandedDocumentCounts] =
    useState<ExpandedSections>({
      today: false,
      yesterday: false,
      lastWeek: false,
      lastMonth: false,
      older: false,
    });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Log when SWR is about to make API calls
  console.log('[useChatHistory] Setting up SWR infinite hook for chat history');

  // Chat History fetching with SWR
  const {
    data: paginatedChatHistories,
    setSize: setChatSize,
    isValidating: isChatValidating,
    isLoading: isChatLoading,
    mutate: mutateChatHistory,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
    revalidateOnFocus: false,
    revalidateOnMount: true,
    dedupingInterval: 60000,
    refreshInterval: 0,
    refreshWhenHidden: false,
    revalidateIfStale: false,
    loadingTimeout: 3000,
    onSuccess: (data) => {
      console.log('[useChatHistory] SWR onSuccess for chat history:', {
        pages: data.length,
        totalChats: data.reduce(
          (acc, page) => acc + (page.chats?.length || 0),
          0,
        ),
      });
    },
    onError: (error) => {
      console.error('[useChatHistory] SWR onError for chat history:', error);
    },
  });

  // Log SWR state changes
  useEffect(() => {
    console.log('[useChatHistory] SWR state update:', {
      paginatedChatHistories: paginatedChatHistories?.length || 0,
      isValidating: isChatValidating,
      isLoading: isChatLoading,
    });
  }, [paginatedChatHistories, isChatValidating, isChatLoading]);

  // Document History fetching with SWR
  const {
    data: paginatedDocumentHistories,
    setSize: setDocSize,
    isValidating: isDocValidating,
    isLoading: isDocLoading,
    mutate: mutateDocumentHistory,
  } = useSWRInfinite<DocumentHistory>(
    getDocumentHistoryPaginationKey,
    fetcher,
    {
      fallbackData: [],
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 60000,
      refreshInterval: 0,
      refreshWhenHidden: false,
      revalidateIfStale: false,
      loadingTimeout: 3000,
      onSuccess: (data) => {
        console.log('[useChatHistory] SWR onSuccess for document history:', {
          pages: data.length,
          totalDocs: data.reduce(
            (acc, page) => acc + (page.documents?.length || 0),
            0,
          ),
        });
      },
      onError: (error) => {
        console.error(
          '[useChatHistory] SWR onError for document history:',
          error,
        );
      },
    },
  );

  // Flag to prevent multiple initializations
  const initializedRef = useRef(false);

  // Memoize grouped chats to prevent excessive recalculation
  const groupedChats = useMemo(() => {
    if (!paginatedChatHistories) {
      console.log('[useChatHistory] No paginated chat histories available yet');
      return null;
    }

    console.log(
      '[useChatHistory] Processing paginated chat histories:',
      paginatedChatHistories.length,
      'pages',
    );

    // Log details of each pagination page
    paginatedChatHistories.forEach((page, idx) => {
      console.log(
        `[useChatHistory] Page ${idx + 1} contains ${page.chats.length} chats, hasMore: ${page.hasMore}`,
      );
    });

    const chatsFromHistory = paginatedChatHistories.flatMap(
      (paginatedChatHistory) => paginatedChatHistory.chats,
    );

    console.log(
      `[useChatHistory] Total chats after flatMap: ${chatsFromHistory.length}`,
    );

    // Filter and group chats
    const result = separateChatsByType(chatsFromHistory);

    // Log the grouped result summary
    console.log('[useChatHistory] Grouped chats counts:', {
      today: result.today.length,
      yesterday: result.yesterday.length,
      lastWeek: result.lastWeek.length,
      lastMonth: result.lastMonth.length,
      older: result.older.length,
      total:
        result.today.length +
        result.yesterday.length +
        result.lastWeek.length +
        result.lastMonth.length +
        result.older.length,
    });

    return result;
  }, [paginatedChatHistories]);

  // Check if chat history is empty
  const hasEmptyChatHistory = useMemo(() => {
    if (!groupedChats) return true;

    return (
      groupedChats.today.length === 0 &&
      groupedChats.yesterday.length === 0 &&
      groupedChats.lastWeek.length === 0 &&
      groupedChats.lastMonth.length === 0 &&
      groupedChats.older.length === 0
    );
  }, [groupedChats]);

  // Check if we've reached the end of pagination
  const hasReachedChatEnd = useMemo(() => {
    if (!paginatedChatHistories || paginatedChatHistories.length === 0)
      return false;
    const lastPage = paginatedChatHistories[paginatedChatHistories.length - 1];
    return lastPage && lastPage.hasMore === false;
  }, [paginatedChatHistories]);

  // Memoize grouped documents
  const groupedDocuments = useMemo(() => {
    if (!paginatedDocumentHistories) return null;

    const docsFromHistory = paginatedDocumentHistories.flatMap(
      (paginatedDocHistory) => paginatedDocHistory.documents,
    );

    // Convert Document type to match Chat type for grouping
    const formattedDocs = docsFromHistory.map((doc) => ({
      ...doc,
      title: doc.title || 'Untitled Document',
    }));

    return groupChatsByDate(formattedDocs as unknown as Chat[]);
  }, [paginatedDocumentHistories]);

  // Check if document history is empty
  const hasEmptyDocHistory = useMemo(() => {
    if (!paginatedDocumentHistories) return true;
    return paginatedDocumentHistories.every(
      (page) => page.documents.length === 0,
    );
  }, [paginatedDocumentHistories]);

  // Check if we've reached the end of document pagination
  const hasReachedDocEnd = useMemo(() => {
    if (!paginatedDocumentHistories || paginatedDocumentHistories.length === 0)
      return false;
    const lastPage =
      paginatedDocumentHistories[paginatedDocumentHistories.length - 1];
    return lastPage && lastPage.hasMore === false;
  }, [paginatedDocumentHistories]);

  // Callbacks for toggling day expansions with proper memoization
  const toggleDayExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedDays((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  const toggleDocumentDayExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedDocumentDays((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  const toggleChatCountExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedChatCounts((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  const toggleDocumentCountExpansion = useCallback(
    (day: keyof GroupedChats) => {
      setExpandedDocumentCounts((prev) => ({
        ...prev,
        [day]: !prev[day],
      }));
    },
    [],
  );

  // Initiate chat deletion
  const initDeleteChat = useCallback((id: string) => {
    setDeleteId(id);
    setShowDeleteDialog(true);
  }, []);

  // Cancel chat deletion
  const cancelDeleteChat = useCallback(() => {
    setDeleteId(null);
    setShowDeleteDialog(false);
  }, []);

  // Confirm and execute chat deletion
  const confirmDeleteChat = useCallback(async () => {
    if (!deleteId) {
      setShowDeleteDialog(false);
      return;
    }

    startTransition(async () => {
      try {
        await deleteChat(deleteId);
        toast.success('Chat deleted');

        // If we're viewing the deleted chat, redirect
        if (deleteId === currentChatId) {
          router.push('/');
        }

        // Refresh chat history data
        mutateChatHistory();
      } catch (error) {
        console.error('Error deleting chat:', error);
        toast.error('Failed to delete chat');
      } finally {
        setDeleteId(null);
        setShowDeleteDialog(false);
      }
    });
  }, [deleteId, currentChatId, router, mutateChatHistory]);

  // Load more chats
  const loadMoreChats = useCallback(() => {
    setChatSize((size) => size + 1);
  }, [setChatSize]);

  // Load more documents
  const loadMoreDocuments = useCallback(() => {
    setDocSize((size) => size + 1);
  }, [setDocSize]);

  return {
    // Chat data
    groupedChats,
    hasEmptyChatHistory,
    hasReachedChatEnd,
    isChatLoading,
    isChatValidating,

    // Document data
    groupedDocuments,
    hasEmptyDocHistory,
    hasReachedDocEnd,
    isDocLoading,
    isDocValidating,

    // Chat expansion states
    expandedDays,
    expandedChatCounts,
    toggleDayExpansion,
    toggleChatCountExpansion,

    // Document expansion states
    expandedDocumentDays,
    expandedDocumentCounts,
    toggleDocumentDayExpansion,
    toggleDocumentCountExpansion,

    // Chat deletion
    deleteId,
    showDeleteDialog,
    isPending,
    initDeleteChat,
    cancelDeleteChat,
    confirmDeleteChat,

    // Pagination
    loadMoreChats,
    loadMoreDocuments,

    // Utilities
    mutateChatHistory,
    mutateDocumentHistory,
  };
}
