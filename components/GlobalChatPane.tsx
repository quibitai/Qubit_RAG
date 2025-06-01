'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useChatPane } from '@/context/ChatPaneContext';
import { generateUUID } from '@/lib/utils';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Button } from './ui/button';
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
import { useChat, type Message, type CreateMessage } from 'ai/react';
import type { Attachment } from 'ai';
import { useSWRConfig } from 'swr';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { GlobalChatHistoryDropdown } from './GlobalChatHistoryDropdown';
import { MultimodalInput } from './multimodal-input';

interface GlobalChatPaneProps {
  title?: string;
}

export function GlobalChatPane({
  title = 'Chat Assistant',
}: GlobalChatPaneProps) {
  const hasLoggedServerActionCheck = React.useRef(false);

  React.useEffect(() => {
    if (!hasLoggedServerActionCheck.current) {
      // console.log('[CLIENT] Server action check in GlobalChatPane:', {
      //   isFunction: typeof createChatAndSaveFirstMessages === 'function',
      //   hasServerRef:
      //     typeof createChatAndSaveFirstMessages === 'object' &&
      //     (createChatAndSaveFirstMessages as any)?.__$SERVER_REFERENCE,
      //   serverActionId: (createChatAndSaveFirstMessages as any)
      //     .__next_action_id,
      // });
      hasLoggedServerActionCheck.current = true;
    }
  }, []);

  const {
    currentActiveSpecialistId,
    isPaneOpen,
    globalPaneChatId,
    setGlobalPaneChatId,
    ensureValidChatId,
    mainUiChatId,
    loadGlobalChats,
    refreshHistory,
  } = useChatPane();

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  const {
    messages,
    input,
    isLoading,
    error,
    setInput,
    setMessages,
    status,
    stop,
    reload,
    append,
  } = useChat({
    id: globalPaneChatId || undefined,
    api: '/api/brain',
    body: {
      id: globalPaneChatId || '',
      selectedChatModel: 'global-orchestrator',
      activeBitContextId: currentActiveSpecialistId,
      currentActiveSpecialistId: currentActiveSpecialistId,
      isFromGlobalPane: true,
      referencedChatId: mainUiChatId,
      userTimezone,
    },
    experimental_throttle: 50,
    streamProtocol: 'data',
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onError: (err) => console.error('[GlobalPane useChat Error]', err),
    onResponse: (response) => {
      console.log('[GlobalPane onResponse]', response.status);
    },
    onFinish: (message) => {
      console.log(
        '[GlobalPane onFinish]',
        message.role,
        message.content?.substring(0, 30),
      );
      if (loadGlobalChats && message.role === 'assistant') {
        console.log('[GlobalPane onFinish] Force refreshing global chats');
        try {
          // @ts-ignore
          loadGlobalChats(true);
        } catch (error) {
          console.log(
            '[GlobalPane onFinish] Falling back to standard loadGlobalChats',
          );
          loadGlobalChats();
        }
      }
      setAttachments([]);
    },
  });

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  const savedMessageIdsRef = React.useRef<Set<string>>(new Set<string>());
  const processingMessageIdsRef = React.useRef<Set<string>>(new Set<string>());

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${globalPaneChatId}` : null,
    fetcher,
  );

  React.useEffect(() => {
    if (messages.length === 0) {
      requestAnimationFrame(() => {
        console.log(
          '[GlobalChatPane] New chat detected, resetting persistence state',
        );
        savedMessageIdsRef.current.clear();
        processingMessageIdsRef.current.clear();
      });
    }
  }, [messages.length]);

  React.useEffect(() => {
    if (isLoading) return;
    let cleanupInterval: NodeJS.Timeout | null = null;
    if (!isLoading) {
      cleanupInterval = setTimeout(() => {
        if (!isLoading && globalPaneChatId) {
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

  const { mutate: globalMutate } = useSWRConfig();

  const handleGlobalPaneSubmit = useCallback(async () => {
    const currentInput = input;
    const currentAttachments = attachments;

    if (!currentInput.trim() && currentAttachments.length === 0) return;

    let validChatId: string;
    if (!globalPaneChatId) {
      validChatId = generateUUID();
      setGlobalPaneChatId(validChatId);
    } else {
      const validChatIdResult = ensureValidChatId(globalPaneChatId);
      validChatId =
        typeof validChatIdResult === 'string'
          ? validChatIdResult
          : generateUUID();
      if (validChatId !== globalPaneChatId) {
        setGlobalPaneChatId(validChatId);
      }
    }

    const userMessage: CreateMessage = {
      id: generateUUID(),
      role: 'user',
      content: currentInput,
      createdAt: new Date(),
      experimental_attachments: currentAttachments,
    };

    await append(userMessage, {
      data: {
        chatId: validChatId,
      },
    });

    setInput('');

    if (refreshHistory) {
      refreshHistory();
    } else {
      globalMutate(unstable_serialize(getChatHistoryPaginationKey));
      globalMutate('/api/history?limit=30');
    }
  }, [
    input,
    attachments,
    globalPaneChatId,
    setGlobalPaneChatId,
    ensureValidChatId,
    append,
    setInput,
    refreshHistory,
    globalMutate,
  ]);

  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const startNewChat = () => {
    console.log('[GlobalChatPane] Starting new chat');
    setMessages([]);
    setGlobalPaneChatId(null);
    setInput('');
    setAttachments([]);
    savedMessageIdsRef.current.clear();
    processingMessageIdsRef.current.clear();

    const event = new CustomEvent('chat-selected', {
      detail: { chatId: null, source: 'global-pane-new-chat' },
    });
    window.dispatchEvent(event);
  };

  useEffect(() => {
    const handleChatSelected = (
      event: CustomEvent<{ chatId: string; source: string }>,
    ) => {
      const { chatId, source } = event.detail;
      if (source === 'global-pane' && chatId) {
        console.log(
          `[GlobalChatPane] Chat selected event received for chat: ${chatId}`,
        );
        setGlobalPaneChatId(chatId);
        setMessages([]);
        setIsLoadingMessages(true);
        (async () => {
          try {
            console.log(
              `[GlobalChatPane] Fetching messages for chat: ${chatId}`,
            );
            const response = await fetch(`/api/messages?chatId=${chatId}`);
            if (response.ok) {
              const data = await response.json();
              if (data && Array.isArray(data.messages)) {
                interface DBMessageType {
                  id: string;
                  role: Message['role'];
                  parts?: Array<{ type: string; text: string }> | string;
                  content?: string;
                  createdAt: string;
                  chatId?: string;
                  attachments?: Attachment[];
                  [key: string]: any;
                }
                const formattedMessages: Message[] = data.messages.map(
                  (msg: DBMessageType): Message => {
                    let content = '';
                    if (msg.content) {
                      content = msg.content;
                    } else if (
                      Array.isArray(msg.parts) &&
                      msg.parts.length > 0
                    ) {
                      const firstPart = msg.parts[0];
                      content =
                        typeof firstPart === 'object' && firstPart !== null
                          ? firstPart.text || ''
                          : String(firstPart || '');
                    } else if (typeof msg.parts === 'string') {
                      content = msg.parts;
                    }
                    return {
                      id: msg.id || generateUUID(),
                      role: msg.role || 'assistant',
                      content,
                      createdAt: new Date(msg.createdAt || Date.now()),
                      experimental_attachments: msg.attachments || [],
                    } as Message;
                  },
                );
                setMessages(formattedMessages);
                console.log(
                  `[GlobalChatPane] Successfully loaded and set ${formattedMessages.length} messages`,
                );
              } else {
                console.error(
                  '[GlobalChatPane] Messages data format unexpected:',
                  data,
                );
              }
            } else {
              console.error(
                `[GlobalChatPane] Failed to fetch messages for chat ${chatId}: ${response.statusText}`,
              );
            }
          } catch (error) {
            console.error(
              '[GlobalChatPane] Error loading chat messages:',
              error,
            );
          } finally {
            setIsLoadingMessages(false);
          }
        })();
      }
    };
    window.addEventListener(
      'chat-selected',
      handleChatSelected as EventListener,
    );
    return () => {
      window.removeEventListener(
        'chat-selected',
        handleChatSelected as EventListener,
      );
    };
  }, [setGlobalPaneChatId, setMessages]);

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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={startNewChat}
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">New chat</span>
          </Button>
        </div>
      </div>

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

      <div className="border-t p-4">
        <MultimodalInput
          chatId={globalPaneChatId || generateUUID()}
          input={input}
          setInput={setInput}
          handleSubmit={handleGlobalPaneSubmit}
          status={status as 'ready' | 'streaming' | 'submitted' | 'error'}
          stop={stop}
          messages={messages}
          setMessages={setMessages}
          append={append}
          attachments={attachments}
          setAttachments={setAttachments}
        />
      </div>
    </div>
  );
}
