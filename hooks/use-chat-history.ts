import { useState, useCallback, useMemo, useRef } from 'react';
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

// Update the separateChatsByType function with more strict filtering
export const separateChatsByType = (chats: Chat[]): GroupedChats => {
  // Only include non-orchestrator chats (Chat Bit conversations) in the sidebar
  if (process.env.NODE_ENV === 'development') {
    console.log('[useChatHistory] Total chats to filter:', chats.length);
  }

  const chatBitChats = chats.filter((chat) => {
    // Skip chats without titles - consider them Chat Bit chats
    if (!chat.title) return true;

    const title = chat.title.toLowerCase();

    // Check if this is an orchestrator chat (should be excluded from sidebar)
    const isOrchestratorChat =
      title.includes('quibit') ||
      title.includes('orchestrator') ||
      title.includes('global');

    // For debugging in development only
    if (process.env.NODE_ENV === 'development' && isOrchestratorChat) {
      console.log(
        `[useChatHistory] Filtering out orchestrator chat: "${chat.title}"`,
      );
    }

    // Return true ONLY for non-orchestrator chats
    return !isOrchestratorChat;
  });

  if (process.env.NODE_ENV === 'development') {
    console.log(
      '[useChatHistory] Filtered chat count (for sidebar):',
      chatBitChats.length,
    );
  }

  // Now group by date
  return groupChatsByDate(chatBitChats);
};

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory,
) {
  if (previousPageData && previousPageData.hasMore === false) {
    return null;
  }

  if (pageIndex === 0) return `/api/history?limit=${PAGE_SIZE}`;

  const firstChatFromPage = previousPageData.chats.at(-1);

  if (!firstChatFromPage) return null;

  return `/api/history?ending_before=${firstChatFromPage.id}&limit=${PAGE_SIZE}`;
}

export function getDocumentHistoryPaginationKey(
  pageIndex: number,
  previousPageData: DocumentHistory,
) {
  if (previousPageData && previousPageData.hasMore === false) {
    return null;
  }

  if (pageIndex === 0) return `/api/documents-history?limit=${PAGE_SIZE}`;

  const firstDocFromPage = previousPageData.documents.at(-1);

  if (!firstDocFromPage) return null;

  return `/api/documents-history?ending_before=${firstDocFromPage.id}&limit=${PAGE_SIZE}`;
}

// The main hook for chat history management
export function useChatHistory(currentChatId?: string) {
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

  // Chat History fetching with SWR
  const {
    data: paginatedChatHistories,
    setSize: setChatSize,
    isValidating: isChatValidating,
    isLoading: isChatLoading,
    mutate: mutateChatHistory,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
    revalidateOnFocus: true,
    revalidateOnMount: true,
    dedupingInterval: 20000, // Increase to 20 seconds to prevent excessive refreshes
    refreshInterval: 60000, // Refresh every 60 seconds (less frequent)
    refreshWhenHidden: false, // Don't refresh when tab is not visible
    revalidateIfStale: true,
    loadingTimeout: 3000, // Only show loading state if it takes more than 3 seconds
  });

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
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 20000, // Increase to 20 seconds
      refreshInterval: 120000, // Refresh every 2 minutes for documents (much less frequent)
      refreshWhenHidden: false, // Don't refresh when tab is not visible
      revalidateIfStale: true,
      loadingTimeout: 3000, // Only show loading state if it takes more than 3 seconds
    },
  );

  // Flag to prevent multiple initializations
  const initializedRef = useRef(false);

  // Memoize grouped chats to prevent excessive recalculation
  const groupedChats = useMemo(() => {
    if (!paginatedChatHistories) return null;

    const chatsFromHistory = paginatedChatHistories.flatMap(
      (paginatedChatHistory) => paginatedChatHistory.chats,
    );

    // Filter and group chats
    return separateChatsByType(chatsFromHistory);
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
