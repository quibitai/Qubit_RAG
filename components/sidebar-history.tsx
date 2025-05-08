'use client';

import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';
import { useParams, useRouter, usePathname } from 'next/navigation';
import type { User } from 'next-auth';
import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import type { Chat, Document } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { ChatItem } from './sidebar-history-item';
import useSWRInfinite from 'swr/infinite';
import {
  ChevronDown,
  ChevronRight,
  FileEdit,
  Loader,
  MessageSquare,
} from 'lucide-react';
import { deleteChat } from '@/app/(chat)/actions';
import { useTransition } from 'react';
import { useChatPane } from '@/context/ChatPaneContext';
import {
  GroupedChats,
  ChatHistory,
  DocumentHistory,
  ExpandedSections,
  type ChatSummary,
} from '@/lib/types';

const PAGE_SIZE = 20;

// Compute the grouped documents
const groupChatsByDate = (chats: Chat[] | ChatSummary[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(chat.createdAt);

      if (isToday(chatDate)) {
        groups.today.push(chat as Chat);
      } else if (isYesterday(chatDate)) {
        groups.yesterday.push(chat as Chat);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(chat as Chat);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(chat as Chat);
      } else {
        groups.older.push(chat as Chat);
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

// Update the separateChatsByType function with more logging and less strict filtering
const separateChatsByType = (chats: Chat[]): GroupedChats => {
  // Only include non-orchestrator chats (Chat Bit conversations) in the sidebar
  if (process.env.NODE_ENV === 'development') {
    console.log('[SidebarHistory] Total chats to filter:', chats.length);
  }

  const chatBitChats = chats.filter((chat) => {
    // Always include chats without titles
    if (!chat.title) return true;

    const title = chat.title.toLowerCase();

    // Check if this is an orchestrator chat (should be excluded from sidebar)
    // Less strict orchestrator detection - look for clear indicators
    const isOrchestratorChat =
      (title.includes('quibit') && !title.includes('specialist')) ||
      title.includes('orchestrator') ||
      title.includes('global');

    // Check if this is likely a Chat Bit chat
    const isChatBitChat =
      title.includes('echo tango') ||
      title.includes('specialist') ||
      !isOrchestratorChat; // If not clearly an orchestrator chat, include it

    // For debugging in development only
    if (process.env.NODE_ENV === 'development') {
      if (isOrchestratorChat) {
        console.log(
          `[SidebarHistory] Filtering out orchestrator chat: "${chat.title}"`,
        );
      }
    }

    // Return true for non-orchestrator chats (show them in sidebar)
    return !isOrchestratorChat;
  });

  if (process.env.NODE_ENV === 'development') {
    console.log(
      '[SidebarHistory] Filtered chat count (for sidebar):',
      chatBitChats.length,
    );
    console.log(
      '[SidebarHistory] Chat Bit titles:',
      chatBitChats.map((c) => c.title),
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

// Memoize the DaySection component to prevent unnecessary re-renders
const DaySection = memo(
  ({
    day,
    title,
    chats,
    isExpanded,
    isCountExpanded,
    onToggleExpansion,
    onToggleCountExpansion,
    onDelete,
    setOpenMobile,
    currentChatId,
  }: {
    day: keyof GroupedChats;
    title: string;
    chats: Chat[];
    isExpanded: boolean;
    isCountExpanded: boolean;
    onToggleExpansion: (day: keyof GroupedChats) => void;
    onToggleCountExpansion: (day: keyof GroupedChats) => void;
    onDelete: (chatId: string) => void;
    setOpenMobile: (open: boolean) => void;
    currentChatId: string | undefined;
  }) => {
    // Skip rendering if there are no chats for this day
    if (chats.length === 0) return null;

    const MAX_INITIAL_CHATS = 5;
    const visibleChats = isCountExpanded
      ? chats
      : chats.slice(0, MAX_INITIAL_CHATS);
    const hasMoreChats = chats.length > MAX_INITIAL_CHATS;

    const handleToggle = useCallback(() => {
      onToggleExpansion(day);
    }, [day, onToggleExpansion]);

    const handleToggleCount = useCallback(() => {
      onToggleCountExpansion(day);
    }, [day, onToggleCountExpansion]);

    return (
      <SidebarGroup className="compact-sidebar-group">
        <div
          className="flex items-center justify-between px-2 py-0.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-primary hover:bg-muted/30 rounded-md"
          onClick={handleToggle}
        >
          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{title}</span>
            <span className="text-muted-foreground ml-1">({chats.length})</span>
          </div>
        </div>
        {isExpanded && (
          <SidebarGroupContent className="py-0.5">
            {visibleChats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === currentChatId}
                onDelete={onDelete}
                setOpenMobile={setOpenMobile}
              />
            ))}
            {hasMoreChats && (
              <div
                className="px-2 py-0.5 text-xs text-muted-foreground hover:text-primary cursor-pointer"
                onClick={handleToggleCount}
              >
                {isCountExpanded
                  ? 'Show less...'
                  : `Show ${chats.length - MAX_INITIAL_CHATS} more...`}
              </div>
            )}
          </SidebarGroupContent>
        )}
      </SidebarGroup>
    );
  },
);
DaySection.displayName = 'DaySection';

// Memoize the DocumentDaySection component similarly
const DocumentDaySection = memo(
  ({
    day,
    title,
    documents,
    isExpanded,
    isCountExpanded,
    onToggleExpansion,
    onToggleCountExpansion,
    onDelete,
    setOpenMobile,
    currentDocId,
  }: {
    day: keyof GroupedChats;
    title: string;
    documents: Document[];
    isExpanded: boolean;
    isCountExpanded: boolean;
    onToggleExpansion: (day: keyof GroupedChats) => void;
    onToggleCountExpansion: (day: keyof GroupedChats) => void;
    onDelete: (docId: string) => void;
    setOpenMobile: (open: boolean) => void;
    currentDocId: string | undefined;
  }) => {
    // Skip rendering if there are no documents for this day
    if (documents.length === 0) return null;

    const MAX_INITIAL_DOCS = 5;
    const visibleDocs = isCountExpanded
      ? documents
      : documents.slice(0, MAX_INITIAL_DOCS);
    const hasMoreDocs = documents.length > MAX_INITIAL_DOCS;

    const handleToggle = useCallback(() => {
      onToggleExpansion(day);
    }, [day, onToggleExpansion]);

    const handleToggleCount = useCallback(() => {
      onToggleCountExpansion(day);
    }, [day, onToggleCountExpansion]);

    return (
      <SidebarGroup className="compact-sidebar-group">
        <div
          className="flex items-center justify-between px-2 py-0.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-primary hover:bg-muted/30 rounded-md"
          onClick={handleToggle}
        >
          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{title}</span>
            <span className="text-muted-foreground ml-1">
              ({documents.length})
            </span>
          </div>
        </div>
        {isExpanded && (
          <SidebarGroupContent className="py-0.5">
            {visibleDocs.map((doc) => (
              <ChatItem
                key={doc.id}
                chat={doc as unknown as Chat}
                isActive={doc.id === currentDocId}
                onDelete={onDelete}
                setOpenMobile={setOpenMobile}
                itemType="document"
              />
            ))}
            {hasMoreDocs && (
              <div
                className="px-2 py-0.5 text-xs text-muted-foreground hover:text-primary cursor-pointer"
                onClick={handleToggleCount}
              >
                {isCountExpanded
                  ? 'Show less...'
                  : `Show ${documents.length - MAX_INITIAL_DOCS} more...`}
              </div>
            )}
          </SidebarGroupContent>
        )}
      </SidebarGroup>
    );
  },
);
DocumentDaySection.displayName = 'DocumentDaySection';

// Use memo to optimize the entire SidebarHistory component
export const SidebarHistory = memo(function SidebarHistory({
  user,
}: {
  user: User | undefined;
}) {
  const { setOpenMobile } = useSidebar();
  const { id: chatId } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const isOnEditorPage = pathname?.startsWith('/editor') || false;
  const currentDocId = isOnEditorPage ? (chatId as string) : undefined;
  const {
    currentActiveSpecialistId,
    sidebarChats,
    isLoadingSidebarChats,
    loadSidebarChats,
  } = useChatPane();

  // Document History fetching
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

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isPending, startTransition] = useTransition();

  // State for expanded day sections and number of chats to show per day
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({
    today: true,
    yesterday: false,
    lastWeek: false,
    lastMonth: false,
    older: false,
  });

  const [expandedChatCounts, setExpandedChatCounts] = useState<
    Record<string, boolean>
  >({
    today: false,
    yesterday: false,
    lastWeek: false,
    lastMonth: false,
    older: false,
  });

  // Add a state for document sections
  const [expandedDocumentDays, setExpandedDocumentDays] = useState<
    Record<string, boolean>
  >({
    today: true,
    yesterday: false,
    lastWeek: false,
    lastMonth: false,
    older: false,
  });

  // Add a state for document chat counts
  const [expandedDocumentCounts, setExpandedDocumentCounts] = useState<
    Record<string, boolean>
  >({
    today: false,
    yesterday: false,
    lastWeek: false,
    lastMonth: false,
    older: false,
  });

  const MAX_INITIAL_CHATS = 5;

  // Add this near the top of your component with other state declarations
  const initializedRef = useRef(false);

  // Calculate which day should be expanded by default
  const calculateDefaultExpandedDay = useCallback(
    (groupedChats: GroupedChats) => {
      const newExpandedDays = {
        today: false,
        yesterday: false,
        lastWeek: false,
        lastMonth: false,
        older: false,
      };

      if (groupedChats.today.length > 0) {
        newExpandedDays.today = true;
      } else if (groupedChats.yesterday.length > 0) {
        newExpandedDays.yesterday = true;
      } else if (groupedChats.lastWeek.length > 0) {
        newExpandedDays.lastWeek = true;
      } else if (groupedChats.lastMonth.length > 0) {
        newExpandedDays.lastMonth = true;
      } else if (groupedChats.older.length > 0) {
        newExpandedDays.older = true;
      }

      return newExpandedDays;
    },
    [],
  );

  // Compute the grouped chats using the filtered sidebarChats from context
  const groupedChats = useMemo(() => {
    if (!sidebarChats || sidebarChats.length === 0) return null;

    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[SidebarHistory] Processing sidebar chats from context:',
        sidebarChats.length,
      );
    }

    // Group the already-filtered sidebar chats by date
    return groupChatsByDate(sidebarChats);
  }, [sidebarChats]);

  // Compute the grouped documents
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

  // Fix issue with empty document history and document end checks
  const hasReachedDocEnd = useMemo(() => {
    if (!paginatedDocumentHistories || paginatedDocumentHistories.length === 0)
      return false;
    const lastPage =
      paginatedDocumentHistories[paginatedDocumentHistories.length - 1];
    return lastPage && lastPage.hasMore === false;
  }, [paginatedDocumentHistories]);

  const hasEmptyDocHistory = useMemo(() => {
    if (!paginatedDocumentHistories) return true;
    return paginatedDocumentHistories.every(
      (page) => page.documents.length === 0,
    );
  }, [paginatedDocumentHistories]);

  // Modify the hasEmptyChatHistory to use the new groupedChats structure
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

  // Load the sidebar chats when the active specialist changes
  useEffect(() => {
    if (currentActiveSpecialistId) {
      console.log(
        `[SidebarHistory] Active specialist changed to: ${currentActiveSpecialistId}. Ensuring sidebar chats are loaded.`,
      );
      loadSidebarChats(currentActiveSpecialistId);
    }
  }, [currentActiveSpecialistId, loadSidebarChats]);

  // Update useEffect for initial expansion
  useEffect(() => {
    // Only run this once when data is first loaded
    if (groupedChats && !initializedRef.current) {
      // Check if we need to initialize the expanded days
      const needsInitialization =
        !expandedDays.today &&
        !expandedDays.yesterday &&
        !expandedDays.lastWeek &&
        !expandedDays.lastMonth &&
        !expandedDays.older;

      if (needsInitialization) {
        initializedRef.current = true; // Set flag to prevent future runs

        // For chat bit
        if (groupedChats.today.length > 0) {
          setExpandedDays((prev) => ({ ...prev, today: true }));
        } else if (groupedChats.yesterday.length > 0) {
          setExpandedDays((prev) => ({ ...prev, yesterday: true }));
        }

        // For documents
        if (groupedChats) {
          if (groupedChats.today.length > 0) {
            setExpandedDocumentDays((prev) => ({ ...prev, today: true }));
          } else if (groupedChats.yesterday.length > 0) {
            setExpandedDocumentDays((prev) => ({ ...prev, yesterday: true }));
          }
        }
      }
    }
  }, [groupedChats]);

  // Update the toggleDayExpansion to use callback
  const toggleDayExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedDays((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  // Update the toggleDocumentDayExpansion to use callback
  const toggleDocumentDayExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedDocumentDays((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  // Update the toggleChatCountExpansion to use callback
  const toggleChatCountExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedChatCounts((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  // Update the toggleDocumentCountExpansion to use callback
  const toggleDocumentCountExpansion = useCallback(
    (day: keyof GroupedChats) => {
      setExpandedDocumentCounts((prev) => ({
        ...prev,
        [day]: !prev[day],
      }));
    },
    [],
  );

  // Optimize the handleDelete function with useCallback
  const handleDelete = useCallback(
    async (deleteId: string) => {
      if (!deleteId) {
        setShowDeleteDialog(false);
        return;
      }

      // Use useTransition to show loading state
      startTransition(async () => {
        try {
          // Call server action to delete
          await deleteChat(deleteId);
          toast.success('Chat deleted');

          // If we're viewing the deleted chat, redirect
          if (deleteId === chatId) {
            router.push('/');
          }

          // Refresh chat history data
          mutateDocumentHistory();
        } catch (error) {
          console.error('Error deleting chat:', error);
          toast.error('Failed to delete chat');
        } finally {
          setDeleteId(null);
          setShowDeleteDialog(false);
        }
      });
    },
    [chatId, mutateDocumentHistory, router],
  );

  // Add a document delete handler
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [showDeleteDocDialog, setShowDeleteDocDialog] = useState(false);

  const handleDeleteDocument = async () => {
    try {
      const response = await fetch(`/api/documents/${deleteDocId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        toast.error('Failed to delete document');
      } else {
        // Force a complete refresh of the document history
        mutateDocumentHistory();
        console.log('[Sidebar] Document deleted successfully');
      }
    } catch (error) {
      console.error('[Sidebar] Error deleting document:', error);
      toast.error('Failed to delete document');
    }

    setShowDeleteDocDialog(false);

    if (deleteDocId === currentDocId) {
      router.push('/editor/new');
    }
  };

  // Render method with memoized sections
  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-2 text-zinc-500 w-full flex flex-row justify-center items-center text-sm gap-2">
            Login to save and revisit previous chats!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isDocLoading && !paginatedDocumentHistories?.length) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
          Loading...
        </div>
        <SidebarGroupContent>
          <div className="flex flex-col">
            {[44, 32, 28, 64, 52].map((item) => (
              <div
                key={item}
                className="rounded-md h-8 flex gap-2 px-2 items-center"
              >
                <div
                  className="h-4 rounded-md flex-1 max-w-[--skeleton-width] bg-sidebar-accent-foreground/10"
                  style={
                    {
                      '--skeleton-width': `${item}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (hasEmptyChatHistory) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="px-2 text-zinc-500 w-full flex flex-row justify-center items-center text-sm gap-2">
            Your conversations will appear here once you start chatting!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <div className="space-y-0.5 overflow-auto h-full pb-20 sidebar-list">
      {/* Chat History Section - with standardized spacing */}
      <div className="py-2 px-2">
        <div className="text-xs font-semibold text-muted-foreground px-2 flex gap-2 items-center">
          <MessageSquare className="h-3 w-3" />
          <span>Chat History</span>
        </div>
      </div>

      {/* Chat history content */}
      {groupedChats ? (
        <>
          <DaySection
            day="today"
            title="Today"
            chats={groupedChats.today}
            isExpanded={expandedDays.today}
            isCountExpanded={expandedChatCounts.today}
            onToggleExpansion={toggleDayExpansion}
            onToggleCountExpansion={toggleChatCountExpansion}
            onDelete={(chatId) => {
              setDeleteId(chatId);
              setShowDeleteDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentChatId={chatId}
          />
          <DaySection
            day="yesterday"
            title="Yesterday"
            chats={groupedChats.yesterday}
            isExpanded={expandedDays.yesterday}
            isCountExpanded={expandedChatCounts.yesterday}
            onToggleExpansion={toggleDayExpansion}
            onToggleCountExpansion={toggleChatCountExpansion}
            onDelete={(chatId) => {
              setDeleteId(chatId);
              setShowDeleteDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentChatId={chatId}
          />
          <DaySection
            day="lastWeek"
            title="Previous 7 Days"
            chats={groupedChats.lastWeek}
            isExpanded={expandedDays.lastWeek}
            isCountExpanded={expandedChatCounts.lastWeek}
            onToggleExpansion={toggleDayExpansion}
            onToggleCountExpansion={toggleChatCountExpansion}
            onDelete={(chatId) => {
              setDeleteId(chatId);
              setShowDeleteDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentChatId={chatId}
          />
          <DaySection
            day="lastMonth"
            title="Previous 30 Days"
            chats={groupedChats.lastMonth}
            isExpanded={expandedDays.lastMonth}
            isCountExpanded={expandedChatCounts.lastMonth}
            onToggleExpansion={toggleDayExpansion}
            onToggleCountExpansion={toggleChatCountExpansion}
            onDelete={(chatId) => {
              setDeleteId(chatId);
              setShowDeleteDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentChatId={chatId}
          />
          <DaySection
            day="older"
            title="Older"
            chats={groupedChats.older}
            isExpanded={expandedDays.older}
            isCountExpanded={expandedChatCounts.older}
            onToggleExpansion={toggleDayExpansion}
            onToggleCountExpansion={toggleChatCountExpansion}
            onDelete={(chatId) => {
              setDeleteId(chatId);
              setShowDeleteDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentChatId={chatId}
          />
        </>
      ) : (
        <div className="flex justify-center p-1">
          <Loader className="animate-spin h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Only show validation loading state on initial load */}
      {isDocValidating &&
        !isDocLoading &&
        !paginatedDocumentHistories?.length && (
          <div className="flex justify-center p-1">
            <Loader className="animate-spin h-4 w-4 text-muted-foreground" />
          </div>
        )}

      {hasEmptyChatHistory && (
        <div className="text-xs text-muted-foreground text-center p-1">
          No chats available
        </div>
      )}

      {/* Documents Section - with standardized spacing */}
      <div className="py-2 px-2 mt-4">
        <div className="text-xs font-semibold text-muted-foreground px-2 flex gap-2 items-center">
          <FileEdit className="h-3 w-3" />
          <span>Documents</span>
        </div>
      </div>

      {groupedChats ? (
        <>
          <DocumentDaySection
            day="today"
            title="Today"
            documents={groupedChats.today as any}
            isExpanded={expandedDocumentDays.today}
            isCountExpanded={expandedDocumentCounts.today}
            onToggleExpansion={toggleDocumentDayExpansion}
            onToggleCountExpansion={toggleDocumentCountExpansion}
            onDelete={(docId) => {
              setDeleteDocId(docId);
              setShowDeleteDocDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentDocId={currentDocId}
          />
          <DocumentDaySection
            day="yesterday"
            title="Yesterday"
            documents={groupedChats.yesterday as any}
            isExpanded={expandedDocumentDays.yesterday}
            isCountExpanded={expandedDocumentCounts.yesterday}
            onToggleExpansion={toggleDocumentDayExpansion}
            onToggleCountExpansion={toggleDocumentCountExpansion}
            onDelete={(docId) => {
              setDeleteDocId(docId);
              setShowDeleteDocDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentDocId={currentDocId}
          />
          <DocumentDaySection
            day="lastWeek"
            title="Previous 7 Days"
            documents={groupedChats.lastWeek as any}
            isExpanded={expandedDocumentDays.lastWeek}
            isCountExpanded={expandedDocumentCounts.lastWeek}
            onToggleExpansion={toggleDocumentDayExpansion}
            onToggleCountExpansion={toggleDocumentCountExpansion}
            onDelete={(docId) => {
              setDeleteDocId(docId);
              setShowDeleteDocDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentDocId={currentDocId}
          />
          <DocumentDaySection
            day="lastMonth"
            title="Previous 30 Days"
            documents={groupedChats.lastMonth as any}
            isExpanded={expandedDocumentDays.lastMonth}
            isCountExpanded={expandedDocumentCounts.lastMonth}
            onToggleExpansion={toggleDocumentDayExpansion}
            onToggleCountExpansion={toggleDocumentCountExpansion}
            onDelete={(docId) => {
              setDeleteDocId(docId);
              setShowDeleteDocDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentDocId={currentDocId}
          />
          <DocumentDaySection
            day="older"
            title="Older"
            documents={groupedChats.older as any}
            isExpanded={expandedDocumentDays.older}
            isCountExpanded={expandedDocumentCounts.older}
            onToggleExpansion={toggleDocumentDayExpansion}
            onToggleCountExpansion={toggleDocumentCountExpansion}
            onDelete={(docId) => {
              setDeleteDocId(docId);
              setShowDeleteDocDialog(true);
            }}
            setOpenMobile={setOpenMobile}
            currentDocId={currentDocId}
          />

          {!isDocLoading && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground w-full text-center p-1"
              onClick={() => setDocSize((size) => size + 1)}
            >
              Load more documents
            </button>
          )}

          {isDocValidating && (
            <div className="flex justify-center p-1">
              <Loader className="animate-spin h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </>
      ) : (
        <div className="flex justify-center p-1">
          <Loader className="animate-spin h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteId)}
              disabled={isPending}
              className={isPending ? 'opacity-70 cursor-not-allowed' : ''}
            >
              {isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteDocDialog}
        onOpenChange={setShowDeleteDocDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDocument}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
