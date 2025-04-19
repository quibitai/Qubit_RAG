'use client';

import { isToday, isYesterday, subMonths, subWeeks } from 'date-fns';
import { useParams, useRouter } from 'next/navigation';
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
import type { Chat } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { ChatItem } from './sidebar-history-item';
import useSWRInfinite from 'swr/infinite';
import { ChevronDownIcon, ChevronRightIcon, LoaderIcon } from './icons';

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

export function SidebarHistory({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const { id } = useParams();

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
  });

  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
  const toggleDayExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedDays((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  // Toggle expanded chat count for a day
  const toggleChatCountExpansion = useCallback((day: keyof GroupedChats) => {
    setExpandedChatCounts((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  }, []);

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory = paginatedChatHistories
    ? paginatedChatHistories.every((page) => page.chats.length === 0)
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
  }, [paginatedChatHistories, calculateDefaultExpandedDay, expandedDays]);

  const handleDelete = async () => {
    const deletePromise = fetch(`/api/chat?id=${deleteId}`, {
      method: 'DELETE',
    });

    toast.promise(deletePromise, {
      loading: 'Deleting chat...',
      success: () => {
        mutate((chatHistories) => {
          if (chatHistories) {
            return chatHistories.map((chatHistory) => ({
              ...chatHistory,
              chats: chatHistory.chats.filter((chat) => chat.id !== deleteId),
            }));
          }
        });

        return 'Chat deleted successfully';
      },
      error: 'Failed to delete chat',
    });

    setShowDeleteDialog(false);

    if (deleteId === id) {
      router.push('/');
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
    if (chats.length === 0) return null;

    const isExpanded = expandedDays[day];
    const showAllChats = expandedChatCounts[day];
    const displayChats = showAllChats
      ? chats
      : chats.slice(0, MAX_INITIAL_CHATS);
    const hasMoreChats = chats.length > MAX_INITIAL_CHATS;

    return (
      <div>
        <div
          className="px-2 py-1 text-xs flex items-center cursor-pointer hover:bg-sidebar-accent/10 rounded-sm"
          onClick={() => toggleDayExpansion(day)}
        >
          {isExpanded ? (
            <ChevronDownIcon
              size={12}
              className="mr-1 text-sidebar-foreground/50"
            />
          ) : (
            <ChevronRightIcon
              size={12}
              className="mr-1 text-sidebar-foreground/50"
            />
          )}
          <span className="text-sidebar-foreground/50">{title}</span>
        </div>

        {isExpanded && (
          <div>
            {displayChats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === id}
                onDelete={(chatId) => {
                  setDeleteId(chatId);
                  setShowDeleteDialog(true);
                }}
                setOpenMobile={setOpenMobile}
              />
            ))}

            {hasMoreChats && (
              <div
                className="px-4 py-1 text-xs text-sidebar-foreground/50 cursor-pointer hover:text-sidebar-foreground flex justify-center"
                onClick={() => toggleChatCountExpansion(day)}
              >
                {showAllChats
                  ? 'Show less'
                  : `Show ${chats.length - MAX_INITIAL_CHATS} more`}
              </div>
            )}
          </div>
        )}
      </div>
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

  if (isLoading) {
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
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {groupedChats && (
              <div className="flex flex-col gap-2">
                <DaySection
                  day="today"
                  title="Today"
                  chats={groupedChats.today}
                />
                <DaySection
                  day="yesterday"
                  title="Yesterday"
                  chats={groupedChats.yesterday}
                />
                <DaySection
                  day="lastWeek"
                  title="Last 7 days"
                  chats={groupedChats.lastWeek}
                />
                <DaySection
                  day="lastMonth"
                  title="Last 30 days"
                  chats={groupedChats.lastMonth}
                />
                <DaySection
                  day="older"
                  title="Older than last month"
                  chats={groupedChats.older}
                />
              </div>
            )}
          </SidebarMenu>

          <motion.div
            onViewportEnter={() => {
              if (!isValidating && !hasReachedEnd) {
                setSize((size) => size + 1);
              }
            }}
          />

          {!hasReachedEnd && (
            <div className="p-2 text-zinc-500 dark:text-zinc-400 flex flex-row gap-2 items-center mt-8">
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              <div>Loading Chats...</div>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              chat and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
