'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { fetcher } from '@/lib/utils';
import useSWR, { useSWRConfig } from 'swr';
import { useChatPane } from '@/context/ChatPaneContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';

// Define the chat history item type
interface ChatHistoryItem {
  id: string;
  title: string;
  createdAt: string;
}

interface ChatHistory {
  chats: ChatHistoryItem[];
  hasMore: boolean;
}

export function GlobalChatHistoryCombobox() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const { globalPaneChatId, setGlobalPaneChatId } = useChatPane();
  const { mutate: globalMutate } = useSWRConfig();

  // Fetch chat history with more frequent polling but less aggressive
  const { data, error, isLoading, mutate } = useSWR<ChatHistory>(
    '/api/history?limit=50',
    fetcher,
    {
      refreshInterval: 30000, // Poll every 30 seconds instead of 15
      revalidateOnFocus: false, // Disable revalidation on focus
      revalidateOnMount: true,
      dedupingInterval: 30000, // Increase deduping interval to match refresh interval
      revalidateIfStale: false, // Disable revalidation if stale
      focusThrottleInterval: 30000, // Throttle focus events
    },
  );

  // Set the current chat ID as the selected value when the component mounts
  useEffect(() => {
    if (globalPaneChatId) {
      setValue(globalPaneChatId);
    }
  }, [globalPaneChatId]);

  // Debug chat data
  useEffect(() => {
    if (data && process.env.NODE_ENV === 'development') {
      console.log('[GlobalChatHistoryCombobox] Raw chat data:', data);
      console.log('[GlobalChatHistoryCombobox] Chat count:', data.chats.length);
    }
  }, [data]);

  // STRICT filtering for orchestrator chats ONLY
  const chatOptions =
    data?.chats.filter((chat) => {
      // Skip chats without titles
      if (!chat.title) return false;

      const title = chat.title.toLowerCase();

      // ONLY include chats that are DEFINITELY from the global orchestrator
      const isOrchestratorChat =
        title.includes('quibit') ||
        title.includes('orchestrator') ||
        title.includes('global');

      // Skip chats that explicitly mention specialists
      const containsSpecialistReferences =
        title.includes('echo tango') || title.includes('specialist');

      // For debugging in development only
      if (process.env.NODE_ENV === 'development' && isOrchestratorChat) {
        console.log(
          `[GlobalChatHistoryCombobox] Including orchestrator chat: "${chat.title}"`,
        );
      }

      // Return true ONLY for orchestrator chats that don't have specialist references
      return isOrchestratorChat && !containsSpecialistReferences;
    }) || [];

  // Debug filtered orchestrator chats
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      if (chatOptions.length > 0) {
        console.log(
          '[GlobalChatHistoryCombobox] Filtered orchestrator chats:',
          chatOptions.map((c) => c.title),
        );
      } else {
        console.log(
          '[GlobalChatHistoryCombobox] No orchestrator chats found after filtering',
        );
      }
    }
  }, [chatOptions]);

  // Select a chat from the history
  const selectChat = async (chatId: string) => {
    if (chatId === globalPaneChatId) return; // No need to reload if it's the same chat

    console.log(`[GlobalChatHistoryCombobox] Selected chat: ${chatId}`);
    setValue(chatId);
    setGlobalPaneChatId(chatId);
    setOpen(false);

    // Trigger revalidation of related data
    globalMutate(`/api/chats/${chatId}`);
    globalMutate(unstable_serialize(getChatHistoryPaginationKey));

    // Force an immediate reload of the history data
    mutate();

    try {
      // Fetch messages for this chat specifically
      console.log(
        `[GlobalChatHistoryCombobox] Fetching messages for chat ${chatId}`,
      );

      // Use a timeout to give the state time to update
      setTimeout(async () => {
        try {
          const response = await fetch(`/api/messages?chatId=${chatId}`);

          if (response.ok) {
            // If messages are fetched successfully, reload the chat interface
            const data = await response.json();
            console.log(
              `[GlobalChatHistoryCombobox] Successfully loaded ${data.messages?.length || 0} messages for chat ${chatId}`,
            );

            // This will trigger a re-render of the global chat pane with the selected chat
            window.dispatchEvent(
              new CustomEvent('chat-selected', {
                detail: { chatId, source: 'global-pane' },
              }),
            );

            // Also save to local storage to ensure consistency
            localStorage.setItem('global-pane-chat-id', chatId);
          } else {
            console.error(
              `[GlobalChatHistoryCombobox] Failed to load messages for chat ${chatId}: ${response.statusText}`,
            );
            console.error('Failed to load chat messages');
          }
        } catch (error) {
          console.error(
            '[GlobalChatHistoryCombobox] Error in delayed message loading:',
            error,
          );
          console.error('Failed to load chat messages');
        }
      }, 100); // Short delay to ensure context updates
    } catch (error) {
      console.error(
        '[GlobalChatHistoryCombobox] Error loading chat messages:',
        error,
      );
      console.error('Failed to load chat messages');
    }
  };

  // Format the date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              aria-label="View chat history"
            >
              <History className="h-4 w-4" />
              {chatOptions.length > 0 && (
                <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-blue-500" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Quibit Chat History</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search chat history..." className="h-9" />
          <CommandList>
            <CommandEmpty>
              {isLoading ? 'Loading...' : 'No Quibit chat history found.'}
            </CommandEmpty>
            <CommandGroup heading="Recent Quibit Conversations">
              {chatOptions.map((chat) => (
                <CommandItem
                  key={chat.id}
                  value={chat.id}
                  onSelect={() => selectChat(chat.id)}
                >
                  <div className="flex flex-col">
                    <div className="truncate max-w-[230px]">
                      {chat.title || 'Untitled Chat'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(chat.createdAt)}
                    </div>
                  </div>
                  <Check
                    className={cn(
                      'ml-auto h-4 w-4',
                      value === chat.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
              {chatOptions.length === 0 && !isLoading && (
                <div className="py-2 px-2 text-xs text-muted-foreground">
                  No Quibit conversations found
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
