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
import {
  ChevronDown,
  ChevronRight,
  Loader,
  MessageSquare,
  Trash,
  RotateCw,
} from 'lucide-react';
import { deleteChat } from '@/app/(chat)/actions';
import { useTransition } from 'react';
import { useChatPane } from '@/context/ChatPaneContext';
import {
  GroupedChats,
  ChatHistory,
  ExpandedSections,
  type ChatSummary,
} from '@/lib/types';
import {
  GLOBAL_ORCHESTRATOR_CONTEXT_ID,
  CHAT_BIT_CONTEXT_ID,
  ECHO_TANGO_SPECIALIST_ID,
} from '@/lib/constants';

const PAGE_SIZE = 20;

// Compute the grouped documents
const groupChatsByDate = (chats: Chat[] | ChatSummary[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      // Ensure we have a valid Date object for createdAt, with fallback
      const createdAt = chat.createdAt || new Date();
      const chatDate =
        createdAt instanceof Date ? createdAt : new Date(createdAt);

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
      today: [] as (Chat | ChatSummary)[],
      yesterday: [] as (Chat | ChatSummary)[],
      lastWeek: [] as (Chat | ChatSummary)[],
      lastMonth: [] as (Chat | ChatSummary)[],
      older: [] as (Chat | ChatSummary)[],
    } as GroupedChats,
  );
};

// Update the separateChatsByType function with more logging and less strict filtering
// NOTE: This function can be removed/deprecated as filtering is now handled by ChatPaneContext
// Keeping it here for reference or potential future use, but it's no longer used in this component
const separateChatsByType = (chats: Chat[]): GroupedChats => {
  console.log(
    '[SidebarHistory] DEPRECATED: separateChatsByType function is now redundant as filtering is handled by ChatPaneContext',
  );
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
    chats: Chat[] | ChatSummary[];
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
                chat={chat as any} // Use type assertion to avoid TS errors for now
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

// Add SpecialistSection component for displaying chats grouped by specialist
const SpecialistSection = memo(
  ({
    specialistId,
    specialistName,
    specialistDescription,
    chats,
    isExpanded,
    isCountExpanded,
    onToggleExpansion,
    onToggleCountExpansion,
    onDelete,
    setOpenMobile,
    currentChatId,
  }: {
    specialistId: string;
    specialistName: string;
    specialistDescription: string;
    chats: ChatSummary[];
    isExpanded: boolean;
    isCountExpanded: boolean;
    onToggleExpansion: (specialistId: string) => void;
    onToggleCountExpansion: (specialistId: string) => void;
    onDelete: (chatId: string) => void;
    setOpenMobile: (open: boolean) => void;
    currentChatId: string | undefined;
  }) => {
    // Skip rendering if there are no chats for this specialist
    if (chats.length === 0) return null;

    const MAX_INITIAL_CHATS = 5;
    const visibleChats = isCountExpanded
      ? chats
      : chats.slice(0, MAX_INITIAL_CHATS);
    const hasMoreChats = chats.length > MAX_INITIAL_CHATS;

    const handleToggle = useCallback(() => {
      onToggleExpansion(specialistId);
    }, [specialistId, onToggleExpansion]);

    const handleToggleCount = useCallback(() => {
      onToggleCountExpansion(specialistId);
    }, [specialistId, onToggleCountExpansion]);

    return (
      <SidebarGroup className="compact-sidebar-group">
        <div
          className="flex items-center justify-between px-2 py-1 text-xs font-medium text-primary cursor-pointer hover:text-primary hover:bg-muted/30 rounded-md"
          onClick={handleToggle}
        >
          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{specialistName}</span>
            <span className="text-muted-foreground ml-1">({chats.length})</span>
          </div>
        </div>
        {isExpanded && (
          <SidebarGroupContent className="py-0.5">
            {visibleChats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat as any} // Use type assertion to avoid TS errors for now
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
SpecialistSection.displayName = 'SpecialistSection';

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
    specialistGroupedChats, // New prop from context
    refreshHistory, // Use the refreshHistory function which is available in the ChatPaneContext
  } = useChatPane();

  // Log fetched sidebar chats information
  useEffect(() => {
    console.log('[SidebarHistory] Current sidebar state:', {
      currentActiveSpecialistId,
      chatCount: sidebarChats?.length || 0,
      specialistGroupCount: specialistGroupedChats?.length || 0,
      isLoading: isLoadingSidebarChats,
    });

    // Better debug info for the pre-filtered chats
    if (sidebarChats && sidebarChats.length > 0) {
      console.log(
        `[SidebarHistory] Received ${sidebarChats.length} pre-filtered chats from ChatPaneContext. Sample bitContextId: ${sidebarChats[0]?.bitContextId || 'null'}`,
      );
    }
  }, [
    currentActiveSpecialistId,
    sidebarChats,
    isLoadingSidebarChats,
    specialistGroupedChats,
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

  // New state for expanded specialist sections
  const [expandedSpecialists, setExpandedSpecialists] = useState<
    Record<string, boolean>
  >({});

  const [expandedChatCounts, setExpandedChatCounts] = useState<
    Record<string, boolean>
  >({
    today: false,
    yesterday: false,
    lastWeek: false,
    lastMonth: false,
    older: false,
  });

  // State for expanded specialist chat counts
  const [expandedSpecialistChatCounts, setExpandedSpecialistChatCounts] =
    useState<Record<string, boolean>>({});

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

  // Initialize specialist expanded state when the list changes
  useEffect(() => {
    if (specialistGroupedChats && specialistGroupedChats.length > 0) {
      const newExpandedState: Record<string, boolean> = {};
      specialistGroupedChats.forEach((specialist) => {
        // Default to expanded for any specialist with chats
        newExpandedState[specialist.id] = specialist.chats.length > 0;
      });
      setExpandedSpecialists((prev) => ({ ...prev, ...newExpandedState }));
    }
  }, [specialistGroupedChats]);

  // Add these handlers for specialist sections
  const handleToggleSpecialistExpansion = useCallback(
    (specialistId: string) => {
      setExpandedSpecialists((prev) => ({
        ...prev,
        [specialistId]: !prev[specialistId],
      }));
    },
    [],
  );

  const handleToggleSpecialistChatCount = useCallback(
    (specialistId: string) => {
      setExpandedSpecialistChatCounts((prev) => ({
        ...prev,
        [specialistId]: !prev[specialistId],
      }));
    },
    [],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setDeleteId(id);
      setShowDeleteDialog(true);
    },
    [setDeleteId, setShowDeleteDialog],
  );

  const confirmDelete = useCallback(() => {
    if (!deleteId) return;

    startTransition(async () => {
      try {
        console.log(
          `[SidebarHistory] Deleting chat ${deleteId} using server action`,
        );

        // Call the server action to delete the chat
        const result = await deleteChat(deleteId);

        if (result?.success) {
          // Add optional chaining
          // Update UI with success message
          console.log(`[SidebarHistory] Successfully deleted chat ${deleteId}`);
          toast.success('Chat deleted');

          // Refresh sidebar history after successful deletion
          const contextIdToReload =
            currentActiveSpecialistId || CHAT_BIT_CONTEXT_ID;
          console.log(
            `[SidebarHistory] Chat deletion successful. Refreshing sidebar for context: ${contextIdToReload}`,
          );

          // Use refreshHistory to refresh both the sidebar and global chats
          refreshHistory();

          // Navigate away if we're currently viewing the deleted chat
          if (chatId === deleteId) {
            router.push('/');
          }
        } else {
          // Handle server action failure
          console.error(
            '[SidebarHistory] Server action deleteChat failed:',
            result?.error,
          );
          toast.error(result?.error || 'Failed to delete chat');
        }
      } catch (error) {
        console.error(
          '[SidebarHistory] Error calling deleteChat server action:',
          error,
        );
        toast.error('Failed to delete chat due to an unexpected error');
      } finally {
        setShowDeleteDialog(false);
        setDeleteId(null);
      }
    });
  }, [deleteId, router, chatId, refreshHistory, currentActiveSpecialistId]);

  const cancelDelete = useCallback(() => {
    setShowDeleteDialog(false);
    setDeleteId(null);
  }, []);

  // Function to toggle day expansion
  const handleToggleDayExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedDays((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  // Function to toggle chat count expansion
  const handleToggleChatCount = useCallback((day: keyof GroupedChats) => {
    setExpandedChatCounts((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  // Use grouped date chats as a fallback if specialist groups are not available
  const groupedChats = useMemo(() => {
    if (!sidebarChats || sidebarChats.length === 0) {
      // console.log('[SidebarHistory] No sidebar chats from context or empty.');
      return null;
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[SidebarHistory] Grouping ${sidebarChats.length} sidebar chats from context by date. First chat bitContextId: ${sidebarChats[0]?.bitContextId}`,
      );
    }
    // No filtering needed as the ChatPaneContext now provides filtered chats
    return groupChatsByDate(sidebarChats);
  }, [sidebarChats]);

  // Determine whether to show specialists grouped view or date grouped view
  const shouldShowSpecialistGroups = useMemo(() => {
    return specialistGroupedChats && specialistGroupedChats.length > 0;
  }, [specialistGroupedChats]);

  // Skip loading state handling to avoid extra renders
  // if (isLoadingSidebarChats) {
  //   return (
  //     <div className="p-8 text-center">
  //       <RotateCw className="h-4 w-4 animate-spin" />
  //     </div>
  //   );
  // }

  // Initialize expandedDays if this is the first render with actual data
  useEffect(() => {
    if (groupedChats && !initializedRef.current) {
      setExpandedDays(calculateDefaultExpandedDay(groupedChats));
      initializedRef.current = true;
    }
  }, [groupedChats, calculateDefaultExpandedDay]);

  // Handle case where there are no chats
  if (!groupedChats && !shouldShowSpecialistGroups) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">
        {isLoadingSidebarChats ? 'Loading...' : 'No chat history'}
      </div>
    );
  }

  return (
    <>
      <SidebarMenu>
        {shouldShowSpecialistGroups ? (
          // Display specialist-grouped view
          <div className="px-1 my-2">
            <div className="text-xs font-medium text-primary mb-1 px-2">
              Chat History by Specialist
            </div>
            {specialistGroupedChats.map((specialist) => (
              <SpecialistSection
                key={specialist.id}
                specialistId={specialist.id}
                specialistName={specialist.name}
                specialistDescription={specialist.description}
                chats={specialist.chats}
                isExpanded={!!expandedSpecialists[specialist.id]}
                isCountExpanded={!!expandedSpecialistChatCounts[specialist.id]}
                onToggleExpansion={handleToggleSpecialistExpansion}
                onToggleCountExpansion={handleToggleSpecialistChatCount}
                onDelete={handleDelete}
                setOpenMobile={setOpenMobile}
                currentChatId={chatId}
              />
            ))}
          </div>
        ) : (
          // Fallback to date-grouped view
          <div className="px-1 my-2">
            <div className="text-xs font-medium text-muted-foreground mb-1 px-2">
              Recent Chats
            </div>
            {groupedChats && (
              <>
                <DaySection
                  day="today"
                  title="Today"
                  chats={groupedChats.today}
                  isExpanded={expandedDays.today}
                  isCountExpanded={expandedChatCounts.today}
                  onToggleExpansion={handleToggleDayExpansion}
                  onToggleCountExpansion={handleToggleChatCount}
                  onDelete={handleDelete}
                  setOpenMobile={setOpenMobile}
                  currentChatId={chatId}
                />
                <DaySection
                  day="yesterday"
                  title="Yesterday"
                  chats={groupedChats.yesterday}
                  isExpanded={expandedDays.yesterday}
                  isCountExpanded={expandedChatCounts.yesterday}
                  onToggleExpansion={handleToggleDayExpansion}
                  onToggleCountExpansion={handleToggleChatCount}
                  onDelete={handleDelete}
                  setOpenMobile={setOpenMobile}
                  currentChatId={chatId}
                />
                <DaySection
                  day="lastWeek"
                  title="Last 7 Days"
                  chats={groupedChats.lastWeek}
                  isExpanded={expandedDays.lastWeek}
                  isCountExpanded={expandedChatCounts.lastWeek}
                  onToggleExpansion={handleToggleDayExpansion}
                  onToggleCountExpansion={handleToggleChatCount}
                  onDelete={handleDelete}
                  setOpenMobile={setOpenMobile}
                  currentChatId={chatId}
                />
                <DaySection
                  day="lastMonth"
                  title="Last 30 Days"
                  chats={groupedChats.lastMonth}
                  isExpanded={expandedDays.lastMonth}
                  isCountExpanded={expandedChatCounts.lastMonth}
                  onToggleExpansion={handleToggleDayExpansion}
                  onToggleCountExpansion={handleToggleChatCount}
                  onDelete={handleDelete}
                  setOpenMobile={setOpenMobile}
                  currentChatId={chatId}
                />
                <DaySection
                  day="older"
                  title="Older"
                  chats={groupedChats.older}
                  isExpanded={expandedDays.older}
                  isCountExpanded={expandedChatCounts.older}
                  onToggleExpansion={handleToggleDayExpansion}
                  onToggleCountExpansion={handleToggleChatCount}
                  onDelete={handleDelete}
                  setOpenMobile={setOpenMobile}
                  currentChatId={chatId}
                />
              </>
            )}
          </div>
        )}
      </SidebarMenu>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this chat and remove the data from
              our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 focus:ring-red-600"
            >
              {isPending ? (
                <RotateCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash className="mr-2 h-4 w-4" />
              )}
              <span>Delete</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
