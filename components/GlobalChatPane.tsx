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

export function GlobalChatPane() {
  // Debug: Check if server action is correctly identified
  console.log('[CLIENT] Server action check in GlobalChatPane:', {
    isFunction: typeof createChatAndSaveFirstMessages === 'function',
    hasServerRef:
      typeof createChatAndSaveFirstMessages === 'object' &&
      (createChatAndSaveFirstMessages as any)?.__$SERVER_REFERENCE,
    serverActionId: (createChatAndSaveFirstMessages as any).__next_action_id,
  });

  const { chatState, activeBitId, isPaneOpen, setActiveBitId } = useChatPane();
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

  // Get votes for the messages if available
  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${chatState.id}` : null,
    fetcher,
  );

  // Find the selected model details
  const selectedChatModel = React.useMemo(
    () =>
      chatModels.find((chatModel) => chatModel.id === activeBitId) ||
      chatModels[0],
    [activeBitId],
  );

  // Adjust textarea height as user types
  const adjustHeight = React.useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  }, []);

  React.useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [input, adjustHeight]);

  // Reset chatPersistedRef when a new chat is created
  React.useEffect(() => {
    if (chatState.messages.length === 0) {
      console.log(
        '[GlobalChatPane] New chat detected, resetting persistence state',
      );
      chatPersistedRef.current = false;
    }
  }, [chatState.messages.length]);

  // Ref to track chat persistence
  const chatPersistedRef = React.useRef<boolean>(false);

  const submitMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Create and store the user message before submitting
    const currentChatId = chatState.id || generateUUID();

    const userMsg = {
      id: generateUUID(),
      chatId: currentChatId,
      role: 'user',
      parts: [{ type: 'text', text: input }],
      attachments: [],
      createdAt: new Date(),
    };

    // Store in ref for later use in onFinish
    lastUserMsgRef.current = userMsg;

    console.log('[GlobalChatPane] Storing user message in ref:', userMsg);
    console.log(
      '[GlobalChatPane] Chat persistence state:',
      chatPersistedRef.current ? 'persisted' : 'not persisted',
    );
    console.log('[GlobalChatPane] Using chat ID:', currentChatId);

    // Send the message to the AI with model selection
    handleSubmit(e, {
      body: {
        selectedChatModel: activeBitId,
        chatId: currentChatId,
      },
    });

    // Clear the input and reset height
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  if (!isPaneOpen) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-background border-l">
      <div className="px-4 py-2 border-b flex items-center justify-between">
        <h2 className="font-semibold">Chat Assistant</h2>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1">
              {selectedChatModel.name}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            {chatModels.map((model) => (
              <DropdownMenuItem
                key={model.id}
                onClick={() => setActiveBitId(model.id)}
                className="flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <span>{model.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {model.description}
                  </span>
                </div>
                {model.id === activeBitId && <CheckIcon className="h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    className="size-6 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-1 focus-visible:ring-primary transition-colors"
                    aria-label="Attach files"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach files</TooltipContent>
              </Tooltip>
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
