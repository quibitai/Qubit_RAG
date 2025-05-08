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
import type { Chat } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { ChatItem } from './sidebar-history-item';
import useSWRInfinite from 'swr/infinite';
import { ChevronDown, ChevronRight, Loader, MessageSquare } from 'lucide-react';
import { deleteChat } from '@/app/(chat)/actions';
import { useTransition } from 'react';
import { useChatPane } from '@/context/ChatPaneContext';
import {
  GroupedChats,
  ChatHistory,
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
  // Include ALL chats in the sidebar now, regardless of bitContextId
  console.log('[SidebarHistory] Total chats to filter:', chats.length);

  // Log a sample of chats for debugging
  if (chats.length > 0) {
    console.log('[SidebarHistory] Sample chats (first 3):');
    chats.slice(0, 3).forEach((chat, idx) => {
      console.log(`[SidebarHistory] Chat ${idx + 1}:`, {
        id: chat.id,
        title: chat.title,
        bitContextId: chat.bitContextId,
      });
    });
  }

  // MODIFIED APPROACH: Include all chats, except global orchestrator
  const chatBitChats = chats.filter((chat) => {
    // Only exclude global orchestrator chats
    if (chat.bitContextId === 'global-orchestrator') {
      console.log(
        `[SidebarHistory] Excluding global orchestrator chat "${chat.title}"`,
      );
      return false;
    }

    // Include all other chats, even if bitContextId is null or empty
    console.log(
      `[SidebarHistory] Including chat "${chat.title}" with bitContextId: ${chat.bitContextId || 'NULL/EMPTY'}`,
    );
    return true;
  });

  console.log(
    '[SidebarHistory] Filtered chat count (for sidebar):',
    chatBitChats.length,
  );

  // Log summary of included/excluded chats
  console.log(`[SidebarHistory] Filtering summary:
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
  if (previousPageData && previousPageData.hasMore === false) {
    return null;
  }

  if (pageIndex === 0) return `/api/history?limit=${PAGE_SIZE}`;

  const firstChatFromPage = previousPageData.chats.at(-1);

  if (!firstChatFromPage) return null;

  return `/api/history?ending_before=${firstChatFromPage.id}&limit=${PAGE_SIZE}`;
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

// Memoize the entire SidebarHistory component
export const SidebarHistory = memo(function SidebarHistory({
  user,
}: {
  user: User | undefined;
}) {
  console.log('[SidebarHistory] Component rendering');

  const { setOpenMobile } = useSidebar();
  const { id: chatId } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const {
    currentActiveSpecialistId,
    sidebarChats,
    isLoadingSidebarChats,
    loadSidebarChats,
  } = useChatPane();

  // Log fetched sidebar chats information
  useEffect(() => {
    console.log('[SidebarHistory] Current sidebar state:', {
      currentActiveSpecialistId,
      sidebarChats: sidebarChats?.length || 0,
      isLoading: isLoadingSidebarChats,
    });

    // COMMENTING OUT: We'll rely solely on the ChatPaneContext's useEffect to load sidebar chats
    // This avoids potential race conditions or duplicate calls
    /*
    if (loadSidebarChats) {
      const contextId = currentActiveSpecialistId || 'chat-model';
      console.error(
        `!!! SIDEBAR COMPONENT DIRECTLY LOADING CHATS !!! ContextID: ${contextId}, Timestamp: ${new Date().toISOString()}`,
      );
      loadSidebarChats(contextId);
    }
    */
  }, [
    currentActiveSpecialistId,
    sidebarChats,
    isLoadingSidebarChats,
    // loadSidebarChats, // Removed since we're not using it
  ]);

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
      }
    }
  }, [groupedChats, expandedDays]);

  // Update the toggleDayExpansion to use callback
  const toggleDayExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedDays((prev) => ({
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
        } catch (error) {
          console.error('Error deleting chat:', error);
          toast.error('Failed to delete chat');
        } finally {
          setDeleteId(null);
          setShowDeleteDialog(false);
        }
      });
    },
    [chatId, router],
  );

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

  if (isLoadingSidebarChats && !sidebarChats?.length) {
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

      {hasEmptyChatHistory && (
        <div className="text-xs text-muted-foreground text-center p-1">
          No chats available
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
    </div>
  );
});
