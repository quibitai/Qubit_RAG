'use client';

import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';
import { useParams, useRouter, usePathname } from 'next/navigation';
import type { User } from 'next-auth';
import { useState, useCallback, useMemo } from 'react';
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
import { ChevronDownIcon, ChevronRightIcon, LoaderIcon } from './icons';
import { FileEdit, MessageSquare } from 'lucide-react';
import { deleteChat } from '@/app/(chat)/actions';
import { useTransition } from 'react';

type GroupedChats = {
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

export interface ChatHistory {
  chats: Array<Chat>;
  hasMore: boolean;
}

export interface DocumentHistory {
  documents: Array<Document>;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

const groupChatsByDate = (chats: Chat[]): GroupedChats => {
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

export function SidebarHistory({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { id: chatId } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const isOnEditorPage = pathname?.startsWith('/editor') || false;
  const currentDocId = isOnEditorPage ? chatId : undefined;

  // Chat History fetching
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
    dedupingInterval: 5000, // 5 seconds
  });

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
      dedupingInterval: 5000, // 5 seconds
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

  // Toggle expanded state of a day section
  const toggleDayExpansion = useCallback(
    (day: keyof GroupedChats) => {
      console.log(
        `Toggling day expansion for ${day}, current state:`,
        expandedDays[day],
      );
      setExpandedDays((prev) => {
        const newState = { ...prev, [day]: !prev[day] };
        console.log(`New state for ${day}:`, newState[day]);
        return newState;
      });
    },
    [expandedDays],
  );

  // Toggle expanded chat count for a day
  const toggleChatCountExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedChatCounts((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  // Toggle expanded state of a document day section
  const toggleDocumentDayExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedDocumentDays((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  // Toggle expanded document count for a day
  const toggleDocumentCountExpansion = useCallback(
    (day: keyof GroupedChats) => {
      setExpandedDocumentCounts((prev) => ({
        ...prev,
        [day]: !prev[day],
      }));
    },
    [],
  );

  const hasReachedChatEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory = paginatedChatHistories
    ? paginatedChatHistories.every((page) => page.chats.length === 0)
    : false;

  // Add document handling
  const hasReachedDocEnd = paginatedDocumentHistories
    ? paginatedDocumentHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyDocHistory = paginatedDocumentHistories
    ? paginatedDocumentHistories.every((page) => page.documents.length === 0)
    : false;

  // Compute the grouped chats only when data changes
  const groupedChats = useMemo(() => {
    if (!paginatedChatHistories) return null;

    const chatsFromHistory = paginatedChatHistories.flatMap(
      (paginatedChatHistory) => paginatedChatHistory.chats,
    );

    const groups = groupChatsByDate(chatsFromHistory);

    // Set the default expanded day the first time we load chats
    const shouldUpdateExpandedDays =
      !expandedDays.today &&
      !expandedDays.yesterday &&
      !expandedDays.lastWeek &&
      !expandedDays.lastMonth &&
      !expandedDays.older;

    if (shouldUpdateExpandedDays) {
      setExpandedDays(calculateDefaultExpandedDay(groups));
    }

    return groups;
  }, [paginatedChatHistories, calculateDefaultExpandedDay]);

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

  const handleDelete = async () => {
    if (!deleteId) {
      setShowDeleteDialog(false);
      return;
    }

    // Use useTransition to show loading state
    startTransition(async () => {
      try {
        const result = await deleteChat(deleteId);

        if (result.success) {
          // Force a complete refresh of the chat history
          mutateChatHistory();
          console.log('[Sidebar] Chat deleted successfully');
          toast.success('Chat deleted successfully');
        } else {
          console.error('[Sidebar] Error deleting chat:', result.error);
          toast.error(
            `Failed to delete chat: ${result.error || 'Unknown error'}`,
          );
        }
      } catch (error) {
        console.error('[Sidebar] Error deleting chat:', error);
        toast.error('Failed to delete chat');
      }

      setShowDeleteDialog(false);

      if (deleteId === chatId) {
        router.push('/');
      }
    });
  };

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

  // Helper component for day section
  const DaySection = ({
    day,
    title,
    chats,
  }: {
    day: keyof GroupedChats;
    title: string;
    chats: Chat[];
  }) => {
    const hasChats = chats.length > 0;
    const isExpanded = expandedDays[day];
    const showAllChats = expandedChatCounts[day];

    if (!hasChats) return null;

    const displayChats = showAllChats
      ? chats
      : chats.slice(0, MAX_INITIAL_CHATS);

    // Create a direct toggle handler that doesn't rely on the callback
    const handleToggle = () => {
      console.log(`[Sidebar] Direct toggle for ${day}, current:`, isExpanded);
      setExpandedDays((prev) => {
        const newState = { ...prev, [day]: !prev[day] };
        console.log(`[Sidebar] New state for ${day}:`, newState[day]);
        return newState;
      });
    };

    return (
      <SidebarGroup>
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground w-full px-2"
          onClick={handleToggle}
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-3 w-3" />
          ) : (
            <ChevronRightIcon className="h-3 w-3" />
          )}
          <span>{title}</span>
          <span className="text-xs font-normal">({chats.length})</span>
        </button>
        {isExpanded && (
          <SidebarGroupContent>
            <SidebarMenu>
              {displayChats.map((chat) => (
                <ChatItem
                  key={`chat-${chat.id}-${chat.createdAt}`}
                  chat={chat}
                  isActive={chat.id === chatId}
                  onDelete={(chatId) => {
                    setDeleteId(chatId);
                    setShowDeleteDialog(true);
                  }}
                  setOpenMobile={setOpenMobile}
                />
              ))}
              {chats.length > MAX_INITIAL_CHATS && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground w-full text-center p-1"
                  onClick={() => toggleChatCountExpansion(day)}
                >
                  {showAllChats
                    ? 'Show less'
                    : `Show ${chats.length - MAX_INITIAL_CHATS} more`}
                </button>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        )}
      </SidebarGroup>
    );
  };

  // Create a similar DocumentDaySection component
  const DocumentDaySection = ({
    day,
    title,
    documents,
  }: {
    day: keyof GroupedChats;
    title: string;
    documents: Document[];
  }) => {
    const hasDocuments = documents.length > 0;
    const isExpanded = expandedDocumentDays[day];
    const showAllDocuments = expandedDocumentCounts[day];

    if (!hasDocuments) return null;

    const docsToShow = showAllDocuments
      ? documents
      : documents.slice(0, MAX_INITIAL_CHATS);

    // Create a direct toggle handler similar to DaySection
    const handleToggle = () => {
      setExpandedDocumentDays((prev) => ({
        ...prev,
        [day]: !prev[day],
      }));
    };

    return (
      <SidebarGroup>
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground w-full px-2"
          onClick={handleToggle}
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-3 w-3" />
          ) : (
            <ChevronRightIcon className="h-3 w-3" />
          )}
          <span>{title}</span>
          <span className="text-xs font-normal">({documents.length})</span>
        </button>
        {isExpanded && (
          <SidebarGroupContent>
            <SidebarMenu>
              {docsToShow.map((doc, index) => (
                <ChatItem
                  key={`doc-${doc.id}-${doc.createdAt}`}
                  chat={doc as unknown as Chat}
                  isActive={doc.id === currentDocId}
                  onDelete={(docId) => {
                    setDeleteDocId(docId);
                    setShowDeleteDocDialog(true);
                  }}
                  setOpenMobile={setOpenMobile}
                  itemType="document"
                />
              ))}
              {documents.length > MAX_INITIAL_CHATS && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground w-full text-center p-1"
                  onClick={() => toggleDocumentCountExpansion(day)}
                >
                  {showAllDocuments
                    ? 'Show less'
                    : `Show ${documents.length - MAX_INITIAL_CHATS} more`}
                </button>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        )}
      </SidebarGroup>
    );
  };

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

  if (isChatLoading) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
          Today
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
    <div className="space-y-1 overflow-auto h-full pb-20">
      <div className="pt-6 px-2">
        <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 flex gap-2 items-center">
          <MessageSquare className="h-3 w-3" />
          <span>Chats</span>
        </div>
      </div>

      {groupedChats ? (
        <>
          <DaySection day="today" title="Today" chats={groupedChats.today} />
          <DaySection
            day="yesterday"
            title="Yesterday"
            chats={groupedChats.yesterday}
          />
          <DaySection
            day="lastWeek"
            title="Previous 7 Days"
            chats={groupedChats.lastWeek}
          />
          <DaySection
            day="lastMonth"
            title="Previous 30 Days"
            chats={groupedChats.lastMonth}
          />
          <DaySection day="older" title="Older" chats={groupedChats.older} />

          {!hasReachedChatEnd && !isChatLoading && !hasEmptyChatHistory && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground w-full text-center p-1"
              onClick={() => setChatSize((size) => size + 1)}
            >
              Load more chats
            </button>
          )}

          {isChatValidating && (
            <div className="flex justify-center p-1">
              <LoaderIcon className="animate-spin h-4 w-4 text-muted-foreground" />
            </div>
          )}

          {hasEmptyChatHistory && (
            <div className="text-xs text-muted-foreground text-center p-1">
              No chats available
            </div>
          )}
        </>
      ) : (
        <div className="flex justify-center p-1">
          <LoaderIcon className="animate-spin h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Documents Section */}
      <div className="pt-6 px-2">
        <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 flex gap-2 items-center">
          <FileEdit className="h-3 w-3" />
          <span>Documents</span>
        </div>
      </div>

      {groupedDocuments ? (
        <>
          <DocumentDaySection
            day="today"
            title="Today"
            documents={groupedDocuments.today}
          />
          <DocumentDaySection
            day="yesterday"
            title="Yesterday"
            documents={groupedDocuments.yesterday}
          />
          <DocumentDaySection
            day="lastWeek"
            title="Previous 7 Days"
            documents={groupedDocuments.lastWeek}
          />
          <DocumentDaySection
            day="lastMonth"
            title="Previous 30 Days"
            documents={groupedDocuments.lastMonth}
          />
          <DocumentDaySection
            day="older"
            title="Older"
            documents={groupedDocuments.older}
          />

          {!hasReachedDocEnd && !isDocLoading && !hasEmptyDocHistory && (
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
              <LoaderIcon className="animate-spin h-4 w-4 text-muted-foreground" />
            </div>
          )}

          {hasEmptyDocHistory && (
            <div className="text-xs text-muted-foreground text-center p-1">
              No documents available
            </div>
          )}
        </>
      ) : (
        <div className="flex justify-center p-1">
          <LoaderIcon className="animate-spin h-4 w-4 text-muted-foreground" />
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
              onClick={handleDelete}
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
}
