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
import { useChatPane } from '@/context/ChatPaneContext';

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

  // Access the ChatPaneContext to update and use the shared mainUiChatId
  const { setMainUiChatId, ensureValidChatId } = useChatPane();

  // When a chat with a specific ID is loaded, update the shared context
  useEffect(() => {
    if (id) {
      // Ensure the ID is a valid UUID before setting it
      const validChatId = ensureValidChatId(id);
      console.log(`[Chat] Updating shared mainUiChatId to: ${validChatId}`);
      setMainUiChatId(validChatId);
    }
  }, [id, setMainUiChatId, ensureValidChatId]);

  const { mutate, cache } = useSWRConfig();
  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const formRef = useRef<HTMLFormElement>(null);
  const chatPersistedRef = useRef<boolean>(initialMessages.length > 0);
  // Add a component-specific reference to track persisted chat IDs
  const persistedChatIdsRef = useRef<Set<string>>(new Set<string>());
  // Add isMounted ref to prevent state updates after unmount
  const isMountedRef = useRef<boolean>(true);

  // Set up unmount cleanup
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  console.log(
    '[Chat] chatPersistedRef initialized to:',
    chatPersistedRef.current,
  );

  // If we have initialMessages, add this chat ID to our persisted set
  useEffect(() => {
    if (initialMessages.length > 0 && id) {
      // Use requestAnimationFrame to defer state updates
      requestAnimationFrame(() => {
        if (isMountedRef.current) {
          persistedChatIdsRef.current.add(id);
          console.log('[Chat] Added chat ID to persisted set:', id);
          console.log(
            '[Chat] Current persisted IDs:',
            Array.from(persistedChatIdsRef.current),
          );
        }
      });
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
    id, // Use the specific chat ID passed to this component
    api: '/api/brain',
    body: {
      id,
      selectedChatModel: selectedChatModel,
      // Flag this as coming from the main UI (not the global pane)
      isFromGlobalPane: false,
    },
    initialMessages,
    experimental_throttle: 0,
    streamProtocol: 'data',
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onError: (error: any) => {
      console.error('[Chat] useChat onError callback triggered:', error);
      // Log more details about the error if available
      if (error instanceof Error) {
        console.error('[Chat] Error name:', error.name);
        console.error('[Chat] Error message:', error.message);
        console.error('[Chat] Error stack:', error.stack);
      }

      // Check for response errors
      if ('response' in error && error.response) {
        const response = error.response as Response;
        console.error('[Chat] Response status:', response.status);
        console.error('[Chat] Response statusText:', response.statusText);

        // Try to get more details from the response
        response
          .text()
          .then((text: string) => {
            console.error('[Chat] Response body:', text);
            try {
              const json = JSON.parse(text);
              console.error('[Chat] Response JSON:', json);
            } catch (e) {
              // Not JSON, which is fine
            }
          })
          .catch((e: Error) => {
            console.error('[Chat] Could not read response body:', e);
          });
      }

      // Don't show error toasts during development to avoid confusion
      if (process.env.NODE_ENV === 'production') {
        toast.error('An error occurred. Please try again.');
      }
    },
    onResponse: (response) => {
      // Log basic response information
      console.log(
        `[Chat] Received response from API, status: ${response.status}`,
      );

      // No need for custom transformation anymore since the server now sends
      // properly formatted data stream that the AI SDK can understand directly
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
          return; // Early return for messages without content
        } else if (!extendedMessage.content) {
          console.log(
            '[Chat] Assistant message has no content, finish_reason:',
            extendedMessage.finish_reason,
          );

          // Add specific logging for tool_calls finish reason
          if (extendedMessage.finish_reason === 'tool_calls') {
            console.log(
              '[Chat] IMPORTANT: Message has tool_calls finish_reason but no content',
              extendedMessage,
            );
          }
          return; // Early return for messages without content
        }
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

            // Note: Removed fetch to /api/chat-actions
            // Messages are now saved directly by the Brain API
            console.log(
              '[Chat] Skipping manual message save - handled by Brain API',
            );
            chatPersistedRef.current = true;
          }
        } else if (lastUserMsgRef.current) {
          console.log(
            '[Chat] Subsequent turn detected, skipping manual message save...',
          );
          // Note: Removed fetch to /api/chat-actions
          // Messages are now saved directly by the Brain API
          console.log(
            '[Chat] Skipping manual message save - handled by Brain API',
          );
        } else {
          console.warn('[Chat] No user message reference available for saving');
        }
      } catch (error) {
        console.error('[Chat] Error in handleOnFinish:', error);
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

      // Log instead of showing toast
      console.log(`[Chat] File context added: "${fileMeta.filename}"`);
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
            // Log instead of showing toast
            console.log('[Chat] File context removed');
          }}
        >
          <XCircleIcon className="h-4 w-4" />
        </button>
      </div>
    );
  };

  // Updated handleSubmit to store the user message in the ref and add logging
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

        // Log the user message before sending
        console.log('[Chat] New user message:', input);

        // Generate a proper UUID for the user message
        const messageUuid = generateUUID();

        // Verify that the generated UUID matches the required pattern for PostgreSQL
        const isValidUUID =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            messageUuid,
          );
        if (!isValidUUID) {
          console.error(
            '[Chat] Generated UUID does not match required pattern:',
            messageUuid,
          );
        } else {
          console.log('[Chat] Valid UUID generated for message:', messageUuid);
        }

        // Prepare the message structure to monitor
        const userMsg = {
          id: messageUuid,
          role: 'user',
          content: input,
          createdAt: new Date().toISOString(),
        };

        // Store this message in the ref for later persistence
        lastUserMsgRef.current = {
          id: messageUuid,
          chatId: id,
          role: userMsg.role,
          parts: [{ type: 'text', text: userMsg.content }],
          attachments: [],
          createdAt: new Date(),
        };

        console.log(
          '[Chat] Set lastUserMsgRef.current:',
          lastUserMsgRef.current,
        );

        // Clear input field immediately for better UX
        setInput('');

        // Log current state of messages
        console.log(
          '[Chat] Current messages before adding user message:',
          messages.map((m) => ({ id: m.id, role: m.role })),
        );

        // Use the original handleSubmit from AI SDK to handle streaming response
        await originalHandleSubmit(event, {
          ...chatRequestOptions,
          body: {
            ...chatRequestOptions?.body,
            fileContext: fileContext || null, // Include fileContext in the request payload
            id: id,
            chatId: id,
            // Indicate this is from the main UI, not the global pane
            isFromGlobalPane: false,
          },
        });

        console.log('[Chat] Message submission complete');
      } catch (err) {
        console.error('[Chat] Error in handleSubmit:', err);
        toast.error('Failed to process your message. Please try again.');
      }
    },
    [input, originalHandleSubmit, setInput, fileContext, toast, id, messages], // Add all dependencies
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
