'use client';

import React from 'react';
import { useChatPane } from '@/context/ChatPaneContext';
import { cn, generateUUID } from '@/lib/utils';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import {
  Send,
  Paperclip,
  Square,
  ChevronDown,
  CheckIcon,
  ArrowUp,
  Plus,
} from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import type { Vote, DBMessage } from '@/lib/db/schema';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { chatModels } from '@/lib/ai/models';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { createChatAndSaveFirstMessages } from '../app/(chat)/actions';
import { toast } from 'sonner';
import { useChat } from 'ai/react';

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
    id: globalPaneChatId, // Use the global pane's own chat ID
    api: '/api/brain',
    body: {
      id: globalPaneChatId,
      selectedChatModel: 'global-orchestrator',
      // Include the shared context from the main UI
      activeBitContextId: currentActiveSpecialistId,
      currentActiveSpecialistId: currentActiveSpecialistId,
      // Flag this as coming from the global pane
      isFromGlobalPane: true,
      // Include a reference to the main UI's chat ID
      referencedChatId: mainUiChatId,
    },
    experimental_throttle: 100,
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
    if (status === 'streaming') return;

    let cleanupInterval: NodeJS.Timeout | null = null;
    if (!isLoading && status !== 'streaming') {
      cleanupInterval = setTimeout(() => {
        if (!isLoading && status !== 'streaming' && globalPaneChatId) {
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
  }, [status, isLoading, globalPaneChatId]);

  const submitMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Ensure we're using a valid UUID for the global pane's chat ID
    const validChatId = ensureValidChatId(globalPaneChatId);

    // If the current ID is invalid, update it in the context
    if (validChatId !== globalPaneChatId) {
      setGlobalPaneChatId(validChatId);
    }

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
      chatId: validChatId, // Use the valid global pane chat ID
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
    await handleSubmit(e, {
      body: {
        selectedChatModel: 'global-orchestrator', // Always use orchestrator
        activeBitContextId: currentActiveSpecialistId, // Use shared context
        currentActiveSpecialistId: currentActiveSpecialistId, // Include both for compatibility
        chatId: validChatId, // Include the valid chatId in the request
        id: validChatId, // Also include as id for compatibility
        isFromGlobalPane: true, // Flag this request as coming from the global pane
        referencedChatId: mainUiChatId, // Always include main UI chat ID reference
      },
    });

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

  // Function to start a new chat in the global pane
  const startNewChat = () => {
    // Generate a new chat ID for the global pane
    const newChatId = generateUUID();
    setGlobalPaneChatId(newChatId);
    console.log('[GlobalChatPane] Started new chat with ID:', newChatId);

    // Clear the chat state
    setMessages([]);
    setInput('');
    chatPersistedRef.current = false;
    savedMessageIdsRef.current.clear();
    processingMessageIdsRef.current.clear();
    lastUserMsgRef.current = null;
  };

  if (!isPaneOpen) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-background border-l">
      <header className="px-3 py-2 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-muted"
                onClick={startNewChat}
                aria-label="New Chat"
                title="New Chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Chat</TooltipContent>
          </Tooltip>
          <h2 className="font-semibold">{title}</h2>
        </div>
      </header>

      {/* Messages container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        data-testid="messages-container"
      >
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>Ask me a question to get started</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <PreviewMessage
              key={message.id}
              chatId={globalPaneChatId}
              message={message}
              isLoading={
                status === 'streaming' && index === messages.length - 1
              }
              vote={votes?.find((vote) => vote.messageId === message.id)}
              setMessages={setMessages}
              reload={reload}
              isReadonly={false}
            />
          ))
        )}

        {status === 'submitted' &&
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
