'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useRouter } from 'next/navigation';
import { ChatHeader } from '@/components/chat-header';
import type { Vote, DBMessage } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { ChatPaneToggle } from './ChatPaneToggle';
import {
  saveSubsequentMessages,
  createChatAndSaveFirstMessages,
} from '@/app/(chat)/actions';
import { cn } from '@/lib/utils';
import { ChatScrollAnchor } from '@/components/chat-scroll-anchor';
import { ChatForm } from '@/components/chat-form';
import { Layout } from '@/components/layout';
import { PromptList } from '@/components/prompt-list';
import { FileIcon } from '@/components/icons/FileIcon';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

console.log('[Chat] actions:', {
  createChatAndSaveFirstMessages,
  saveSubsequentMessages,
});

// Define the ChatRequestOptions interface based on the actual structure
interface ChatRequestOptions {
  headers?: Record<string, string> | Headers;
  body?: object;
  data?: any;
  experimental_attachments?: FileList | Array<Attachment>;
  allowEmptySubmit?: boolean;
}

// Extend UIMessage with an optional __saved property
interface EnhancedUIMessage extends UIMessage {
  __saved?: boolean;
}

// --- File Context State (Hybrid Approach) ---
interface FileContext {
  filename: string;
  contentType: string;
  url: string;
  extractedText: string;
}

// Inline SVG for clear (X) icon
const XCircleIcon = (props: any) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className || ''}
    height="1em"
    width="1em"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  console.log(
    '[Chat] Component mounted with initialMessages count:',
    initialMessages.length,
  );
  console.log('[Chat] Chat ID:', id);

  const { mutate } = useSWRConfig();
  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const formRef = useRef<HTMLFormElement>(null);
  const chatPersistedRef = useRef<boolean>(initialMessages.length > 0);
  // Add a component-specific reference to track persisted chat IDs
  const persistedChatIdsRef = useRef<Set<string>>(new Set<string>());

  console.log(
    '[Chat] chatPersistedRef initialized to:',
    chatPersistedRef.current,
  );

  // If we have initialMessages, add this chat ID to our persisted set
  useEffect(() => {
    if (initialMessages.length > 0 && id) {
      persistedChatIdsRef.current.add(id);
      console.log('[Chat] Added chat ID to persisted set:', id);
      console.log(
        '[Chat] Current persisted IDs:',
        Array.from(persistedChatIdsRef.current),
      );
    }
  }, [id, initialMessages.length]);

  const router = useRouter();

  // Create a ref to hold the last user message
  const lastUserMsgRef = useRef<{
    id: string;
    chatId: string;
    role: string;
    parts: Array<{ type: string; text: string }> | unknown[];
    attachments: Array<Attachment> | unknown[];
    createdAt: Date;
  } | null>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    isLoading,
    error,
    append,
    data,
    setInput,
    setMessages,
    stop,
    reload,
  } = useChat({
    id,
    api: '/api/brain',
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onResponse: (response) => {
      // Log basic response information
      console.log(
        `[Chat] Received response from API, status: ${response.status}`,
      );

      const originalBody = response.body;

      if (!originalBody) return;

      const { readable, writable } = new TransformStream();
      const reader = originalBody.getReader();
      const decoder = new TextDecoder();

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              writable.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });

            const debugMatches = chunk.match(/data: (.*?)\n\n/g);
            if (debugMatches?.length) {
              for (const match of debugMatches) {
                try {
                  const jsonStr = match.replace(/^data: /, '').trim();
                  const debugData = JSON.parse(jsonStr);

                  if (
                    debugData.type === 'debug' &&
                    Array.isArray(debugData.toolCalls)
                  ) {
                    console.log(
                      `[Chat] Processing ${debugData.toolCalls.length} tool calls`,
                    );

                    const event = new CustomEvent('debug-tool-calls', {
                      detail: debugData.toolCalls,
                    });
                    window.dispatchEvent(event);
                  }
                } catch (e) {
                  console.error('[Chat] Failed to process debug data:', e);
                }
              }
            }

            const writer = writable.getWriter();
            writer.write(value);
            writer.releaseLock();
          }
        } catch (e) {
          console.error('[Chat] Stream processing error:', e);
          writable.abort(e);
        }
      };

      pump();

      const newResponse = new Response(readable, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });

      Object.defineProperty(response, 'body', {
        value: newResponse.body,
      });
    },
    onFinish: (message) => {
      // Define custom type that includes finish_reason
      const extendedMessage = message as UIMessage & {
        finish_reason?: string;
      };

      console.log('[Chat] onFinish callback triggered with message:', {
        id: extendedMessage.id,
        role: extendedMessage.role,
        contentType: typeof extendedMessage.content,
        contentLength:
          typeof extendedMessage.content === 'string'
            ? extendedMessage.content.length
            : 'N/A',
        finish_reason: extendedMessage.finish_reason,
      });

      // Check for assistant message's content
      if (extendedMessage.role === 'assistant') {
        if (!extendedMessage.content && !extendedMessage.finish_reason) {
          console.log(
            '[Chat] WARNING: Assistant message has no content and no finish_reason',
          );
        } else if (!extendedMessage.content) {
          console.log(
            '[Chat] Assistant message has no content, finish_reason:',
            extendedMessage.finish_reason,
          );
        }
      }

      // Only skip saving messages without content
      if (!extendedMessage.content) {
        console.log('[Chat] Skipping saving message with no content');
        return;
      }

      // Get the most recent messages from state to ensure we use current state
      const currentMessages = messages;
      console.log(
        '[Chat] Current message count in onFinish:',
        currentMessages.length,
      );

      const lastUserMessageInState = currentMessages.findLast(
        (m) => m.role === 'user',
      );
      console.log(
        '[Chat] Last user message in state:',
        lastUserMessageInState?.id,
      );

      const isFirstTurn = currentMessages.length <= 2;
      console.log('[Chat] Is first turn?', isFirstTurn);

      try {
        if (isFirstTurn && lastUserMsgRef.current) {
          console.log('[Chat] First turn detected, creating new chat...');

          if (
            !chatPersistedRef.current &&
            !persistedChatIdsRef.current.has(id)
          ) {
            console.log('[Chat] Chat not yet persisted, creating now...');

            // Mark this chat as being persisted to prevent duplicate calls
            persistedChatIdsRef.current.add(id);
            console.log(
              '[Chat] Added to in-memory persisted chat IDs set:',
              id,
            );

            createChatAndSaveFirstMessages({
              chatId: id,
              userMessage: lastUserMsgRef.current,
              assistantMessage: {
                id: extendedMessage.id,
                chatId: id,
                role: extendedMessage.role,
                parts: Array.isArray(extendedMessage.parts)
                  ? extendedMessage.parts
                  : [{ type: 'text', text: extendedMessage.content as string }],
                attachments:
                  (extendedMessage as any).experimental_attachments || [],
                createdAt: new Date(extendedMessage.createdAt || new Date()),
              },
            })
              .then((result) => {
                console.log(
                  '[Chat] createChatAndSaveFirstMessages result:',
                  result,
                );
                console.log('[Chat] Result chatId:', result?.chatId);
                console.log('[Chat] Current chatId:', id);

                chatPersistedRef.current = true;

                // Check if the operation succeeded
                if (result?.success) {
                  console.log(
                    '[Chat] Successfully persisted first chat messages',
                  );

                  // Mark all current messages as saved
                  setMessages((prev) =>
                    prev.map((m) => ({ ...m, __saved: true })),
                  );

                  // Invalidate the chats cache to refresh the sidebar
                  mutate(unstable_serialize(getChatHistoryPaginationKey));

                  // Get the chat ID from the result (if available) or use the current ID
                  const navigateToChatId = result?.chatId || id;

                  // Log before navigation
                  console.log(
                    `[Chat] Navigation: Preparing to navigate to chat/${navigateToChatId}`,
                  );
                  console.log(
                    `[Chat] Full URL to navigate to: /chat/${navigateToChatId}`,
                  );

                  // Navigate to the chat page for this ID - removing router.refresh() to avoid timing issues
                  router.push(`/chat/${navigateToChatId}`);

                  // Don't call router.refresh() as it might interfere with router.push()
                } else {
                  console.error(
                    '[Chat] Failed to save first messages:',
                    result?.error || 'Unknown error',
                  );

                  // Remove from set on error so we can try again
                  persistedChatIdsRef.current.delete(id);
                  console.log(
                    '[Chat] Removed from persisted IDs due to error:',
                    id,
                  );

                  toast.error(
                    'Failed to save your conversation. Please try again.',
                  );
                }
              })
              .catch((err) => {
                console.error('[Chat] Error saving first messages:', err);

                // Remove from set on error so we can try again
                persistedChatIdsRef.current.delete(id);
                console.log(
                  '[Chat] Removed from persisted IDs due to error:',
                  id,
                );

                toast.error(
                  'Failed to save your conversation. Please try again.',
                );
              });
          } else {
            console.log(
              '[Chat] Chat already persisted, not saving first messages again',
            );
          }
        } else if (lastUserMsgRef.current) {
          console.log('[Chat] Subsequent turn detected, saving messages...');

          // Update to use structured params instead of FormData
          saveSubsequentMessages({
            chatId: id,
            userMessage: lastUserMsgRef.current,
            assistantMessage: {
              id: extendedMessage.id,
              chatId: id,
              role: extendedMessage.role,
              parts: Array.isArray(extendedMessage.parts)
                ? extendedMessage.parts
                : [{ type: 'text', text: extendedMessage.content as string }],
              attachments:
                (extendedMessage as any).experimental_attachments || [],
              createdAt: new Date(extendedMessage.createdAt || new Date()),
            },
          })
            .then((result) => {
              console.log('[Chat] saveSubsequentMessages result:', result);

              // Check if the operation succeeded
              if (result?.success) {
                console.log(
                  '[Chat] Successfully persisted subsequent messages',
                );

                // Mark the messages as saved
                setMessages((prev) => {
                  return prev.map((m) => {
                    if (
                      m.id === lastUserMsgRef.current?.id ||
                      m.id === extendedMessage.id
                    ) {
                      return { ...m, __saved: true };
                    }
                    return m;
                  });
                });
              } else {
                console.error(
                  '[Chat] Failed to save subsequent messages:',
                  result?.error || 'Unknown error',
                );
                toast.error(
                  'Failed to save your conversation. Please try again.',
                );
              }
            })
            .catch((err) => {
              console.error('[Chat] Error saving subsequent messages:', err);
              toast.error(
                'Failed to save your conversation. Please try again.',
              );
            });
        } else {
          console.warn('[Chat] No user message reference available for saving');
        }
      } catch (error) {
        console.error('[Chat] Error in onFinish saving logic:', error);
        toast.error('An error occurred while saving your conversation.');
      } finally {
        // Reset the last user message reference
        console.log('[Chat] Clearing lastUserMsgRef');
        lastUserMsgRef.current = null;
      }
    },
    // Add a fetch function wrapper to monitor requests
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      console.log('[Chat] AI SDK making fetch request to:', url);
      console.log('[Chat] Request method:', init?.method);

      // Only log body for POST requests to avoid logging sensitive data in URLs
      if (init?.method === 'POST' && init?.body) {
        try {
          // Try to parse and log the request body
          const body = JSON.parse(init.body as string);
          console.log(
            '[Chat Client] Sending messages to /api/brain:',
            JSON.stringify(body.messages, null, 2),
          );
          console.log('[Chat Client] Messages count:', body.messages.length);

          // Check for any potential problematic message formats
          body.messages.forEach((msg: any, i: number) => {
            if (typeof msg.content !== 'string' && msg.content !== null) {
              console.warn(
                `[Chat Client] WARNING: Message ${i} has non-string content type: ${typeof msg.content}`,
              );
            }
            if (msg.role === 'tool' && typeof msg.content === 'object') {
              console.warn(
                `[Chat Client] Tool message with object content detected at index ${i}`,
              );
            }
          });
        } catch (e) {
          console.error('[Chat] Error parsing request body:', e);
        }
      }

      // Make the actual fetch request
      return fetch(input, init);
    },
  });

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  // Use type from useChat
  const uiStatus = isLoading ? 'streaming' : error ? 'error' : 'ready';

  // --- Hybrid File Context State ---
  const [fileContext, setFileContext] = useState<FileContext | null>(null);

  // Handle processed files for context
  const handleFileProcessed = useCallback(
    (fileMeta: {
      filename: string;
      contentType: string;
      url: string;
      extractedText: string;
    }) => {
      console.log('[Chat] File processed for context:', fileMeta.filename);
      // Store the file context for use in AI requests
      setFileContext(fileMeta);

      // Notify user that file context is active
      toast.success('File context added', {
        description: `"${fileMeta.filename}" content is now available for the AI to reference.`,
        duration: 3000,
      });
    },
    [],
  );

  // Component to show active file context
  const FileContextBanner = () => {
    if (!fileContext) return null;

    return (
      <div className="my-2 p-2 bg-muted rounded-md flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <XCircleIcon className="h-4 w-4" />
          <span>
            Using context from:{' '}
            <span className="font-medium">{fileContext.filename}</span>
          </span>
        </div>
        <button
          type="button"
          className="p-1 hover:bg-gray-200 rounded-full"
          onClick={() => {
            setFileContext(null);
            toast.success('File context removed', {
              description: 'The AI will no longer reference this file.',
              duration: 3000,
            });
          }}
        >
          <XCircleIcon className="h-4 w-4" />
        </button>
      </div>
    );
  };

  // Updated handleSubmit to store the user message in the ref
  const handleSubmit = useCallback(
    async (
      event?: { preventDefault?: () => void } | undefined,
      chatRequestOptions?: ChatRequestOptions | undefined,
    ) => {
      console.log('[Chat] handleSubmit called');
      if (event?.preventDefault) event.preventDefault();
      if (!input.trim()) return;

      try {
        console.log('[Chat] Including fileContext in request:', fileContext);

        // Clear input field immediately for better UX
        setInput('');

        // Use the original handleSubmit from AI SDK to handle streaming response
        await originalHandleSubmit(event, {
          ...chatRequestOptions,
          body: {
            ...chatRequestOptions?.body,
            fileContext: fileContext || null, // Include fileContext in the request payload
          },
        });

        console.log('[Chat] Message processing complete');
      } catch (err) {
        console.error('[Chat] Error in handleSubmit:', err);
        toast.error('Failed to process your message. Please try again.');
      }
    },
    [input, originalHandleSubmit, setInput, fileContext, toast], // Add fileContext to dependencies
  );

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <div className="relative">
          <ChatHeader
            chatId={id}
            selectedModelId={selectedChatModel}
            selectedVisibilityType={selectedVisibilityType}
            isReadonly={isReadonly}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <ChatPaneToggle />
          </div>
        </div>

        {/* --- Show file context banner if a file is in context --- */}
        <div className="px-4 md:max-w-3xl mx-auto w-full">
          <FileContextBanner />
        </div>

        <Messages
          chatId={id}
          status={uiStatus}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <form
          ref={formRef}
          className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl"
          onSubmit={handleSubmit}
        >
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={uiStatus}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              append={append}
              onFileProcessed={handleFileProcessed}
            />
          )}
        </form>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={uiStatus}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
      />
    </>
  );
}
