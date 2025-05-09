'use client';

import React, { useEffect, useState } from 'react';
import { useChatPane } from '@/context/ChatPaneContext';
import { generateUUID } from '@/lib/utils';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Square, ArrowUp, Plus, Loader } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import type { Vote } from '@/lib/db/schema';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { createChatAndSaveFirstMessages } from '../app/(chat)/actions';
import { useChat } from 'ai/react';
import { useSWRConfig } from 'swr';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import type { UIMessage } from 'ai';
import { GlobalChatHistoryDropdown } from './GlobalChatHistoryDropdown';

interface GlobalChatPaneProps {
  title?: string;
}

export function GlobalChatPane({
  title = 'Chat Assistant',
}: GlobalChatPaneProps) {
  // Debug: Check if server action is correctly identified
  // Only log once during development
  const hasLoggedServerActionCheck = React.useRef(false);

  React.useEffect(() => {
    if (!hasLoggedServerActionCheck.current) {
      console.log('[CLIENT] Server action check in GlobalChatPane:', {
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

  // Get shared context values, including the global pane's own chat ID
  const {
    currentActiveSpecialistId,
    isPaneOpen,
    globalPaneChatId,
    setGlobalPaneChatId,
    ensureValidChatId,
    mainUiChatId,
    loadGlobalChats,
  } = useChatPane();

  // Create a separate useChat instance specific for the global chat pane
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    setInput,
    setMessages,
    status,
    stop,
    reload,
  } = useChat({
    id: globalPaneChatId || undefined, // Convert null to undefined if needed
    api: '/api/brain',
    body: {
      id: globalPaneChatId || '',
      selectedChatModel: 'global-orchestrator',
      activeBitContextId: currentActiveSpecialistId,
      currentActiveSpecialistId: currentActiveSpecialistId,
      isFromGlobalPane: true,
      referencedChatId: mainUiChatId,
    },
    experimental_throttle: 50,
    streamProtocol: 'data',
    sendExtraMessageFields: true,
    generateId: generateUUID, // Ensure message IDs are valid UUIDs
  });

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Ref to hold the last user message
  const lastUserMsgRef = React.useRef<{
    id: string;
    chatId: string;
    role: string;
    parts: Array<{ type: string; text: string }>;
    attachments: Array<any>;
    createdAt: Date;
  } | null>(null);

  // Track saved message IDs to prevent duplicate saves
  const savedMessageIdsRef = React.useRef<Set<string>>(new Set<string>());

  // Track currently processing message IDs to prevent duplicate requests
  const processingMessageIdsRef = React.useRef<Set<string>>(new Set<string>());

  // Get votes for the messages if available
  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${globalPaneChatId}` : null,
    fetcher,
  );

  // Adjust textarea height as user types
  const adjustHeight = React.useCallback(() => {
    if (textareaRef.current) {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
        }
      });
    }
  }, []);

  React.useEffect(() => {
    if (textareaRef.current) {
      requestAnimationFrame(() => {
        adjustHeight();
      });
    }
  }, [input, adjustHeight]);

  // Reset chatPersistedRef when a new chat is created
  React.useEffect(() => {
    if (messages.length === 0) {
      requestAnimationFrame(() => {
        console.log(
          '[GlobalChatPane] New chat detected, resetting persistence state',
        );
        chatPersistedRef.current = false;
        // Also clear saved message tracking
        savedMessageIdsRef.current.clear();
        processingMessageIdsRef.current.clear();
      });
    }
  }, [messages.length]);

  // Ref to track chat persistence
  const chatPersistedRef = React.useRef<boolean>(false);

  // Create a message observer to monitor when assistant messages are completed
  const checkAndSaveCompletedMessages = () => {
    // No longer needed - messages are saved by the Brain API
    console.log(
      '[GlobalChatPane] Skipping message saving - now handled by Brain API',
    );
  };

  // Set up an interval to check for stable messages
  React.useEffect(() => {
    const messageCheckInterval = setInterval(() => {
      checkAndSaveCompletedMessages();
    }, 1000);

    // Clean up interval on component unmount
    return () => clearInterval(messageCheckInterval);
  }, [messages]);

  // Add cleanup for empty messages when a streaming session ends
  React.useEffect(() => {
    // Don't do anything if we're currently loading
    if (isLoading) return;

    let cleanupInterval: NodeJS.Timeout | null = null;
    if (!isLoading) {
      cleanupInterval = setTimeout(() => {
        if (!isLoading && globalPaneChatId) {
          // No longer needed - cleaning now handled by Brain API
          console.log(
            '[GlobalChatPane] Skipping message cleanup - now handled by Brain API',
          );
        }
      }, 2000);
    }

    return () => {
      if (cleanupInterval) clearTimeout(cleanupInterval);
    };
  }, [isLoading, globalPaneChatId]);

  // Add global mutate
  const { mutate: globalMutate } = useSWRConfig();

  // Modify submitMessage function to include revalidation
  const submitMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Declare validChatId at the function scope level
    let validChatId: string;

    // Generate a new UUID if we don't have a chat ID
    if (!globalPaneChatId) {
      validChatId = generateUUID();
      setGlobalPaneChatId(validChatId);
      console.log('[GlobalChatPane] Generated new chat ID:', validChatId);
    } else {
      // Ensure we're using a valid UUID for the global pane's chat ID
      // Convert the result to string to ensure type safety
      const validChatIdResult = ensureValidChatId(globalPaneChatId);
      validChatId =
        typeof validChatIdResult === 'string'
          ? validChatIdResult
          : generateUUID();

      // If the current ID is invalid, update it in the context
      if (validChatId !== globalPaneChatId) {
        setGlobalPaneChatId(validChatId);
      }
    }

    // Use validChatId after ensuring it's valid above
    console.log('[GlobalChatPane] Using global pane chat ID:', validChatId);

    // Ensure a proper UUID is generated for the user message
    const userMsgId = generateUUID();
    console.log('[GlobalChatPane] Generated UUID for user message:', userMsgId);

    // Verify that the generated UUID matches the required pattern for PostgreSQL
    const isValidUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userMsgId,
      );
    if (!isValidUUID) {
      console.error(
        '[GlobalChatPane] Generated UUID does not match required pattern!',
      );
    }

    const userMsg = {
      id: userMsgId,
      chatId: validChatId, // Use validChatId which is now in scope
      role: 'user',
      parts: [{ type: 'text', text: input }],
      attachments: [],
      createdAt: new Date(),
    };

    // Store in ref for later use in onFinish - use requestAnimationFrame to defer updates
    requestAnimationFrame(() => {
      lastUserMsgRef.current = userMsg;

      console.log('[GlobalChatPane] Storing user message in ref:', userMsg);
      console.log(
        '[GlobalChatPane] Chat persistence state:',
        chatPersistedRef.current ? 'persisted' : 'not persisted',
      );
      console.log('[GlobalChatPane] Using chat ID:', validChatId);
    });

    // Check if we're asking about Echo Tango or other specialists
    // Look for variations of "echo tango" with word boundaries to avoid false positives
    const hasEchoTangoReference = /\b(echo\s*tango|specialist)\b/i.test(input);

    // Create a global variable to make request context available to tool handlers
    // Use global variable that now has proper TypeScript typing
    global.CURRENT_REQUEST_BODY = {
      referencedChatId: mainUiChatId,
      currentActiveSpecialistId: currentActiveSpecialistId,
    };

    console.log('[GlobalChatPane] Request context:', {
      hasEchoTangoReference,
      referencedChatId: mainUiChatId,
      currentActiveSpecialistId: currentActiveSpecialistId,
    });

    // Send the message to the AI with model selection
    // Always use the shared currentActiveSpecialistId from context
    try {
      await handleSubmit(e, {
        body: {
          selectedChatModel: 'global-orchestrator', // Always use orchestrator
          activeBitContextId: currentActiveSpecialistId, // Use shared context
          currentActiveSpecialistId: currentActiveSpecialistId, // Include both for compatibility
          chatId: validChatId, // Use validChatId for the chat ID
          isFromGlobalPane: true, // Flag this request as coming from the global pane
          referencedChatId: mainUiChatId || '', // Always include main UI chat ID reference with fallback
        },
      });

      // After successful submission, trigger revalidation of chat history
      globalMutate(unstable_serialize(getChatHistoryPaginationKey));
      globalMutate('/api/history?limit=30');

      // Also load global chats for the dropdown
      if (loadGlobalChats) {
        console.log(
          '[GlobalChatPane] Refreshing global chat history after message submission',
        );
        loadGlobalChats();
      }
    } catch (error) {
      console.error('[GlobalChatPane] Error submitting message:', error);
      console.error('Failed to send message');
    }

    // Clean up global context (set to null instead of using delete)
    global.CURRENT_REQUEST_BODY = null;

    // Clear the input and reset height - defer to next frame
    requestAnimationFrame(() => {
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });
  };

  // Modify startNewChat function to include revalidation
  const startNewChat = () => {
    // Generate a new chat ID for the global pane
    const newChatId = generateUUID();
    setGlobalPaneChatId(newChatId);
    console.log('[GlobalChatPane] Started new chat with ID:', newChatId);

    // Clear the chat state
    setMessages([]);
    setInput('');
    setIsLoadingMessages(false); // Reset loading state for new chat
    chatPersistedRef.current = false;
    savedMessageIdsRef.current.clear();
    processingMessageIdsRef.current.clear();
    lastUserMsgRef.current = null;

    // Trigger revalidation of chat history
    globalMutate(unstable_serialize(getChatHistoryPaginationKey));
    globalMutate('/api/history?limit=30');
  };

  // Add a state for tracking message loading
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Improve the event listener for chat selection to properly load messages
  useEffect(() => {
    const handleChatSelected = (
      event: CustomEvent<{ chatId: string; source: string }>,
    ) => {
      const { chatId, source } = event.detail;

      // Only handle events for the global pane
      if (source === 'global-pane' && chatId) {
        console.log(
          `[GlobalChatPane] Chat selected event received for chat: ${chatId}`,
        );

        // Set the global pane chat ID immediately
        setGlobalPaneChatId(chatId);

        // Clear current messages
        setMessages([]);
        setIsLoadingMessages(true);

        // Directly fetch messages for this chat and display them
        (async () => {
          try {
            console.log(
              `[GlobalChatPane] Fetching messages for chat: ${chatId}`,
            );
            const response = await fetch(`/api/messages?chatId=${chatId}`);

            if (response.ok) {
              const data = await response.json();
              console.log(
                `[GlobalChatPane] Loaded ${data.messages?.length || 0} messages for chat ${chatId}`,
              );

              // Format messages to match the expected format
              if (data.messages && Array.isArray(data.messages)) {
                // Define the message interface for DB messages
                interface DBMessageType {
                  id: string;
                  role: string;
                  parts: Array<{ type: string; text: string }> | string;
                  createdAt: string;
                  chatId?: string;
                  [key: string]: any; // Allow additional properties
                }

                // Convert DB messages to UI messages format with better error handling
                // Use the UIMessage type directly to match what setMessages expects
                const formattedMessages: UIMessage[] = data.messages.map(
                  (msg: DBMessageType) => {
                    let content = '';

                    // Handle all possible formats of message parts
                    if (Array.isArray(msg.parts) && msg.parts.length > 0) {
                      const firstPart = msg.parts[0];
                      content =
                        typeof firstPart === 'object' && firstPart !== null
                          ? firstPart.text || ''
                          : String(firstPart || '');
                    } else if (typeof msg.parts === 'string') {
                      content = msg.parts;
                    } else if (msg.content) {
                      // Fallback to content field if it exists
                      content = String(msg.content);
                    }

                    // Return a properly typed message object
                    return {
                      id: msg.id || generateUUID(),
                      role: msg.role || 'assistant',
                      content,
                      createdAt: new Date(msg.createdAt || Date.now()),
                    } as UIMessage;
                  },
                );

                // Set the messages in the chat pane
                setMessages(formattedMessages);

                console.log(
                  `[GlobalChatPane] Successfully loaded and set ${formattedMessages.length} messages`,
                );
              } else {
                console.error(
                  '[GlobalChatPane] Messages data format unexpected:',
                  data,
                );
                console.error('Error loading chat: unexpected message format');
              }
            } else {
              console.error(
                `[GlobalChatPane] Failed to fetch messages for chat ${chatId}: ${response.statusText}`,
              );
              console.error('Failed to load chat messages');
            }
          } catch (error) {
            console.error(
              '[GlobalChatPane] Error loading chat messages:',
              error,
            );
            console.error('Failed to load chat messages');
          } finally {
            setIsLoadingMessages(false);
          }
        })();
      }
    };

    // Add event listener with type casting
    window.addEventListener(
      'chat-selected',
      handleChatSelected as EventListener,
    );

    // Clean up
    return () => {
      window.removeEventListener(
        'chat-selected',
        handleChatSelected as EventListener,
      );
    };
  }, [setGlobalPaneChatId, setMessages, generateUUID]);

  if (!isPaneOpen) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-background border-l">
      <div className="border-border/50 flex items-center border-b p-2 sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
        <div className="flex-1 overflow-hidden">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
        </div>
        <div className="flex gap-2 items-center">
          <GlobalChatHistoryDropdown />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Plus className="h-4 w-4" />
                <span className="sr-only">New chat</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={startNewChat}>
                New chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        data-testid="messages-container"
      >
        {isLoadingMessages ? (
          <div className="flex justify-center items-center h-full">
            <div className="flex flex-col items-center gap-2">
              <Loader className="animate-spin h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading messages...
              </p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>Ask me a question to get started</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <PreviewMessage
              key={message.id}
              chatId={globalPaneChatId || ''}
              message={message}
              isLoading={index === messages.length - 1 && isLoading}
              vote={votes?.find((vote) => vote.messageId === message.id)}
              setMessages={setMessages}
              reload={reload}
              isReadonly={false}
            />
          ))
        )}

        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1].role === 'user' && <ThinkingMessage />}

        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              handleInputChange(e);
              adjustHeight();
            }}
            placeholder="Type your message..."
            className="min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base bg-white dark:bg-black text-black dark:text-white pb-10 border-zinc-200 dark:border-zinc-700"
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (input.trim()) {
                  submitMessage(
                    e as unknown as React.FormEvent<HTMLFormElement>,
                  );
                }
              }
            }}
          />

          <div className="absolute bottom-0 inset-x-0 p-2 flex flex-row justify-between">
            <div className="pl-1">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="size-6 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-1 focus-visible:ring-primary transition-colors"
                aria-label="Attach files"
                title="Attach files"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div>
              {status === 'streaming' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full p-1.5 h-fit border-white dark:border-black bg-white dark:bg-black text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-black hover:text-black dark:hover:text-white"
                  onClick={(e) => {
                    e.preventDefault();
                    stop();
                  }}
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="outline"
                  className="rounded-full p-1.5 h-fit border-white dark:border-black bg-white dark:bg-black text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-black hover:text-black dark:hover:text-white"
                  onClick={(e) => {
                    e.preventDefault();
                    submitMessage(
                      e as unknown as React.FormEvent<HTMLFormElement>,
                    );
                  }}
                  disabled={!input.trim() || status !== 'ready'}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
