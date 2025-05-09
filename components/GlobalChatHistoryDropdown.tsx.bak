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
import { useSWRConfig } from 'swr';
import { useChatPane } from '@/context/ChatPaneContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { GLOBAL_ORCHESTRATOR_CONTEXT_ID } from '@/lib/constants';

export function GlobalChatHistoryDropdown() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const {
    globalPaneChatId,
    setGlobalPaneChatId,
    globalChats,
    isLoadingGlobalChats,
    loadGlobalChats,
  } = useChatPane();
  const { mutate: globalMutate } = useSWRConfig();

  // Set the current chat ID as the selected value when the component mounts
  useEffect(() => {
    if (globalPaneChatId) {
      setValue(globalPaneChatId);
    }
  }, [globalPaneChatId]);

  // Debug chat data
  useEffect(() => {
    if (globalChats && process.env.NODE_ENV === 'development') {
      console.log(
        '[GlobalChatHistoryDropdown] Raw chat data from context:',
        globalChats,
      );
      console.log(
        '[GlobalChatHistoryDropdown] Chat count:',
        globalChats.length,
      );
    }
  }, [globalChats]);

  // Add detailed logging for incoming chats before filtering
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && globalChats.length > 0) {
      console.log(
        '[GlobalChatHistoryDropdown] Raw chat data before filtering:',
      );
      globalChats.forEach((chat, index) => {
        console.log(`Chat ${index + 1}: ID=${chat.id}, Title=${chat.title}`);
      });
    }
  }, [globalChats]);

  // Updated filtering logic to use GLOBAL_ORCHESTRATOR_CONTEXT_ID
  const chatOptions = globalChats.filter((chat) => {
    // Option A: Strict filtering by GLOBAL_ORCHESTRATOR_CONTEXT_ID
    const isStrictGlobalChat =
      chat.bitContextId === GLOBAL_ORCHESTRATOR_CONTEXT_ID ||
      (chat.bitContextId === null && GLOBAL_ORCHESTRATOR_CONTEXT_ID === null); // Handle if null is used for global

    // Option B: Using the `isGlobal` flag (if reliably derived in getChatSummaries)
    const isDerivedGlobalChat = chat.isGlobal === true;

    // Combine both approaches for more robust filtering
    const isGlobalChat = isStrictGlobalChat || isDerivedGlobalChat;

    if (isGlobalChat && process.env.NODE_ENV === 'development') {
      console.log(
        `[GlobalChatHistoryDropdown] Including global chat: "${chat.title}", ID: ${chat.id}, bitContextId: ${chat.bitContextId}, isGlobal: ${chat.isGlobal}`,
      );
    } else if (process.env.NODE_ENV === 'development') {
      console.log(
        `[GlobalChatHistoryDropdown] Excluding non-global chat: "${chat.title}", ID: ${chat.id}, bitContextId: ${chat.bitContextId}, isGlobal: ${chat.isGlobal}`,
      );
    }

    return isGlobalChat;
  });

  // Debug filtered orchestrator chats
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[GlobalChatHistoryDropdown] Total chats after filtering:',
        chatOptions.length,
      );

      if (chatOptions.length > 0) {
        console.log(
          '[GlobalChatHistoryDropdown] Filtered orchestrator chats:',
          chatOptions.map((c) => c.title),
        );
      } else {
        console.log(
          '[GlobalChatHistoryDropdown] No orchestrator chats found after filtering',
        );
      }
    }
  }, [chatOptions]);

  // Select a chat from the history
  const selectChat = async (chatId: string) => {
    if (chatId === globalPaneChatId) return; // No need to reload if it's the same chat

    console.log(`[GlobalChatHistoryDropdown] Selected chat: ${chatId}`);
    setValue(chatId);
    setGlobalPaneChatId(chatId);
    setOpen(false);

    // Trigger revalidation of related data
    globalMutate(`/api/chats/${chatId}`);
    globalMutate(unstable_serialize(getChatHistoryPaginationKey));

    // Force an immediate reload of the history data
    loadGlobalChats();

    try {
      // Fetch messages for this chat specifically
      console.log(
        `[GlobalChatHistoryDropdown] Fetching messages for chat ${chatId}`,
      );

      // Use a timeout to give the state time to update
      setTimeout(async () => {
        try {
          const response = await fetch(`/api/messages?chatId=${chatId}`);

          if (response.ok) {
            // If messages are fetched successfully, reload the chat interface
            const data = await response.json();
            console.log(
              `[GlobalChatHistoryDropdown] Successfully loaded ${data.messages?.length || 0} messages for chat ${chatId}`,
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
              `[GlobalChatHistoryDropdown] Failed to load messages for chat ${chatId}: ${response.statusText}`,
            );
            console.error('Failed to load chat messages');
          }
        } catch (error) {
          console.error(
            '[GlobalChatHistoryDropdown] Error in delayed message loading:',
            error,
          );
          console.error('Failed to load chat messages');
        }
      }, 100); // Short delay to ensure context updates
    } catch (error) {
      console.error(
        '[GlobalChatHistoryDropdown] Error loading chat messages:',
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
              {isLoadingGlobalChats
                ? 'Loading Quibit history...'
                : 'No Quibit chat history found.'}
            </CommandEmpty>
            <CommandGroup heading="Recent Quibit Conversations">
              {isLoadingGlobalChats && globalChats.length === 0 ? (
                <div className="py-2 px-2 text-xs text-muted-foreground">
                  Loading Quibit history...
                </div>
              ) : chatOptions.length === 0 && !isLoadingGlobalChats ? (
                <div className="py-2 px-2 text-xs text-muted-foreground">
                  No Quibit conversations found
                </div>
              ) : (
                chatOptions.map((chat) => (
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
                        {formatDate(
                          chat.lastMessageTimestamp?.toString() ||
                            chat.createdAt?.toString() ||
                            new Date().toString(),
                        )}
                      </div>
                    </div>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        value === chat.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
