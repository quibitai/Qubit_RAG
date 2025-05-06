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

// Add utility function for fallback API calls
const callServerActionWithFallback = async (
  action: 'createChatAndSaveFirstMessages' | 'saveSubsequentMessages',
  payload: any,
) => {
  try {
    // First try using the server action directly
    if (
      action === 'createChatAndSaveFirstMessages' &&
      typeof createChatAndSaveFirstMessages === 'function'
    ) {
      console.log('[FALLBACK] Trying direct server action first');
      return await createChatAndSaveFirstMessages(payload);
    }

    // If server action is not available or fails, use the API fallback
    console.log('[FALLBACK] Using API route fallback for', action);
    const response = await fetch('/api/chat-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
      throw new Error(`API fallback failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[FALLBACK] Error in callServerActionWithFallback:', error);
    return { success: false, error: (error as Error).message };
  }
};

console.log('[GlobalChatPane] action (relative import):', {
  createChatAndSaveFirstMessages,
  isServerAction:
    typeof createChatAndSaveFirstMessages === 'function' &&
    (createChatAndSaveFirstMessages as any)?.__$SERVER_REFERENCE !== undefined,
});

// Export the utility function for use in ChatPaneContext
export { callServerActionWithFallback };

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

  const { chatState, currentActiveSpecialistId, isPaneOpen } = useChatPane();
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    setInput,
    status,
    stop,
  } = chatState;

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
    messages.length >= 2 ? `/api/vote?chatId=${chatState.id}` : null,
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
    if (chatState.messages.length === 0) {
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
  }, [chatState.messages.length]);

  // Ref to track chat persistence
  const chatPersistedRef = React.useRef<boolean>(false);

  // Add onFinish handler for GlobalChatPane
  React.useEffect(() => {
    // Create a custom message handler function
    const handleMessageCompletion = (message: any) => {
      // Skip messages with no content
      if (!message.content) {
        console.log('[GlobalChatPane] Skipping persistence for empty message');
        return;
      }

      // Skip if we already saved or are processing this message
      if (
        savedMessageIdsRef.current.has(message.id) ||
        processingMessageIdsRef.current.has(message.id)
      ) {
        console.log(
          `[GlobalChatPane] Message ${message.id} already saved or being processed, skipping`,
        );
        return;
      }

      // Mark this message as being processed
      processingMessageIdsRef.current.add(message.id);
      console.log(`[GlobalChatPane] Started processing message ${message.id}`);

      // Get the user message from our ref
      if (!lastUserMsgRef.current) {
        console.log(
          '[GlobalChatPane] No user message ref found for persistence',
        );
        processingMessageIdsRef.current.delete(message.id);
        return;
      }

      const currentChatId = chatState.id;

      // Skip if chat is already persisted
      if (chatPersistedRef.current) {
        console.log('[GlobalChatPane] Chat already persisted, adding messages');

        // Note: Removed fetch to /api/chat-actions
        // Messages are now saved directly by the Brain API
        console.log(
          '[GlobalChatPane] Skipping manual message save - handled by Brain API',
        );

        // Still mark this message as processed
        savedMessageIdsRef.current.add(message.id);
        processingMessageIdsRef.current.delete(message.id);
        console.log(
          `[GlobalChatPane] Marked message ${message.id} as processed`,
        );
      } else {
        console.log('[GlobalChatPane] New chat, creating with messages');

        // Note: Removed fetch to /api/chat-actions
        // Messages are now saved directly by the Brain API
        console.log(
          '[GlobalChatPane] Skipping manual message save - handled by Brain API',
        );

        // Mark chat as persisted to avoid future creations
        chatPersistedRef.current = true;

        // Mark this message as processed
        savedMessageIdsRef.current.add(message.id);
        processingMessageIdsRef.current.delete(message.id);
        console.log(
          `[GlobalChatPane] Marked message ${message.id} as processed`,
        );
      }

      // Reset the user message ref
      lastUserMsgRef.current = null;
    };

    // Create an event handler to listen for message completions
    const handleMessageEvent = (event: CustomEvent) => {
      if (event.detail && event.detail.role === 'assistant') {
        handleMessageCompletion(event.detail);
      }
    };

    // Register a custom event listener for completed messages
    window.addEventListener(
      'ai-message-complete',
      handleMessageEvent as EventListener,
    );

    // Dispatch an event whenever new messages appear
    const messagesObserver = new MutationObserver(() => {
      const assistantMessages = chatState.messages.filter(
        (m) => m.role === 'assistant',
      );
      if (assistantMessages.length > 0) {
        const lastAssistantMessage =
          assistantMessages[assistantMessages.length - 1];
        // Ensure we only fire for completed messages that have content
        if (lastAssistantMessage.content && !chatState.isLoading) {
          // Skip if we've already processed this message
          if (
            savedMessageIdsRef.current.has(lastAssistantMessage.id) ||
            processingMessageIdsRef.current.has(lastAssistantMessage.id)
          ) {
            console.log(
              `[GlobalChatPane] Skipping event for already processed message ${lastAssistantMessage.id}`,
            );
            return;
          }

          console.log(
            `[GlobalChatPane] Dispatching event for message ${lastAssistantMessage.id}`,
          );
          const event = new CustomEvent('ai-message-complete', {
            detail: lastAssistantMessage,
          });
          window.dispatchEvent(event);
        }
      }
    });

    // Observe the messages container for changes
    const messagesContainer = document.querySelector(
      '[data-testid="messages-container"]',
    );
    if (messagesContainer) {
      messagesObserver.observe(messagesContainer, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      // Clean up event listener and observer
      window.removeEventListener(
        'ai-message-complete',
        handleMessageEvent as EventListener,
      );
      messagesObserver.disconnect();
    };
  }, [chatState]);

  const submitMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Create and store the user message before submitting
    const currentChatId = chatState.id || generateUUID();

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
      chatId: currentChatId,
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
      console.log('[GlobalChatPane] Using chat ID:', currentChatId);
    });

    // Send the message to the AI with model selection
    // Always use the shared currentActiveSpecialistId from context
    await handleSubmit({
      data: {
        selectedChatModel: 'global-orchestrator', // Always use orchestrator
        activeBitContextId: currentActiveSpecialistId, // Use shared context
        chatId: currentChatId,
      },
    });

    // Clear the input and reset height - defer to next frame
    requestAnimationFrame(() => {
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });
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
                onClick={() => {
                  // Clear the chat state to start a new conversation
                  chatState.setMessages([]);
                  setInput('');
                  chatPersistedRef.current = false;
                  savedMessageIdsRef.current.clear();
                  processingMessageIdsRef.current.clear();
                  lastUserMsgRef.current = null;
                }}
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
              chatId={chatState.id || ''}
              message={message}
              isLoading={
                status === 'streaming' && index === messages.length - 1
              }
              vote={votes?.find((vote) => vote.messageId === message.id)}
              setMessages={chatState.setMessages}
              reload={chatState.reload}
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
