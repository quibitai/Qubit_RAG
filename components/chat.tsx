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
import { createChatAndSaveFirstMessages } from '@/app/(chat)/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';
import { useChatPane } from '@/context/ChatPaneContext';
import type { ArtifactKind } from '@/components/artifact';

console.log('[Chat] actions:', {
  createChatAndSaveFirstMessages,
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
interface EnhancedUIMessage extends Omit<UIMessage, 'createdAt'> {
  __saved?: boolean;
  attachments?: Array<Attachment>;
  createdAt?: string | number | Date;
}

// --- File Context State (Hybrid Approach) ---
interface FileContext {
  filename: string;
  contentType: string;
  url: string;
  extractedText: string;
}

// Simple logger for this file
const logger = {
  info: (message: string, data?: any) =>
    console.log(`[ChatUI] ${message}`, data || ''),
  error: (message: string, data?: any) =>
    console.error(`[ChatUI ERROR] ${message}`, data || ''),
  debug: (message: string, data?: any) =>
    console.log(`[ChatUI DEBUG] ${message}`, data || ''),
  warn: (message: string, data?: any) =>
    console.warn(`[ChatUI WARN] ${message}`, data || ''),
};

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

// Add this interface to define the artifact state
interface ActiveArtifactState {
  documentId: string | null;
  kind: ArtifactKind | null;
  title: string | null;
  content: string;
  isStreaming: boolean;
  isVisible: boolean;
  error: string | null;
}

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
  const {
    setMainUiChatId,
    ensureValidChatId,
    mainUiChatId,
    currentActiveSpecialistId,
    globalPaneChatId,
    refreshHistory,
    chatState,
    submitMessage,
    isNewChat,
    setIsNewChat,
  } = useChatPane();

  // When a chat with a specific ID is loaded, update the shared context
  useEffect(() => {
    if (id) {
      try {
        // Parse the chatId and check if it's a valid UUID before setting it
        const chatId = id.toString();
        console.log(`[Chat] Updating shared mainUiChatId to: ${chatId}`);
        setMainUiChatId(chatId);
      } catch (error) {
        console.error('[Chat] Error validating chat ID:', error);
        setMainUiChatId(null);
      }
    }
  }, [id, setMainUiChatId]);

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

  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
      isFromGlobalPane: false,
      mainUiChatId: id,
      referencedGlobalPaneChatId: globalPaneChatId,
      currentActiveSpecialistId,
      activeBitContextId: currentActiveSpecialistId,
      userTimezone,
    },
    initialMessages,
    experimental_throttle: 50, // Lower value for smoother streaming
    streamProtocol: 'data', // Explicitly set for Vercel AI SDK - this handles streaming custom data
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onError: (err) => console.error('[ChatBit UI useChat Error]', err), // Simplified error
    // onResponse: (response) => { console.log('[ChatBit UI onResponse]', response.status); }, // Temporarily disabled
    // onFinish: (message) => { console.log('[ChatBit UI onFinish]', message.role, message.content?.substring(0,30)); }, // Temporarily disabled
    // fetch: async (input, init) => { console.log('[ChatBit UI fetch]', input); return fetch(input, init); }, // Temporarily disabled
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

  useEffect(() => {
    // Add a robust fallback to ensure messages are properly saved to the database
    const ensureMessagesSaved = async () => {
      if (!messages.length || messages.length < 2) return;

      // Track how many message pairs we've processed
      let processedPairs = 0;

      // Find pairs of user messages followed by assistant messages
      for (let i = 0; i < messages.length - 1; i++) {
        const currentMsg = messages[i];
        const nextMsg = messages[i + 1];

        // Check if we have a user->assistant message pair
        if (currentMsg.role === 'user' && nextMsg.role === 'assistant') {
          // Skip if assistant message has no content (still streaming)
          if (!nextMsg.content || nextMsg.content.trim() === '') {
            console.log(
              `[Chat] Skipping message pair [${i},${i + 1}] - assistant message has no content yet`,
            );
            continue;
          }

          // Skip if the assistant message is marked as saved and has content
          if (
            (nextMsg as EnhancedUIMessage).__saved &&
            nextMsg.content &&
            nextMsg.content.trim() !== ''
          ) {
            continue;
          }

          processedPairs++;
          console.log(
            `[Chat] Processing message pair [${i},${i + 1}] (${processedPairs}/${Math.floor(messages.length / 2)})`,
            {
              userMsgId: currentMsg.id,
              assistantMsgId: nextMsg.id,
              assistantContent: `${nextMsg.content?.substring(0, 50)}...`,
            },
          );

          const currentMsgWithAttachments = currentMsg as EnhancedUIMessage;
          const nextMsgWithAttachments = nextMsg as EnhancedUIMessage;

          // Format messages for database storage
          const userMessage = {
            id: currentMsg.id,
            chatId: id,
            role: currentMsg.role,
            parts: [{ type: 'text', text: currentMsg.content }],
            attachments: currentMsgWithAttachments.attachments || [],
            createdAt: new Date(
              currentMsgWithAttachments.createdAt || Date.now(),
            ),
          };

          const assistantMessage = {
            id: nextMsg.id,
            chatId: id,
            role: nextMsg.role,
            parts: [{ type: 'text', text: nextMsg.content }],
            attachments: nextMsgWithAttachments.attachments || [],
            createdAt: new Date(nextMsgWithAttachments.createdAt || Date.now()),
          };

          try {
            // Message saving is now handled by the Brain API
            console.log(
              `[Chat] Message saving now handled by Brain API - skipping client-side save`,
            );

            // Mark the message as saved since Brain API handles it
            (nextMsg as EnhancedUIMessage).__saved = true;
          } catch (error) {
            console.error(
              `[Chat] Error processing message pair [${i},${i + 1}]:`,
              error,
            );

            // Wait a bit before the next attempt
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      // Log summary
      if (processedPairs > 0) {
        console.log(
          `[Chat] Processed ${processedPairs} message pairs for persistence`,
        );
      }
    };

    // Create a debounced version of the function to avoid too many calls
    let timeoutId: NodeJS.Timeout | null = null;

    const debouncedEnsureMessagesSaved = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        ensureMessagesSaved();
        timeoutId = null;
      }, 1000); // Wait 1 second after messages change
    };

    // Execute the debounced function whenever messages change
    debouncedEnsureMessagesSaved();

    // Clear timeout on cleanup
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [messages, id]);

  // Add state for managing the currently active/streaming artifact
  const [activeArtifactState, setActiveArtifactState] =
    useState<ActiveArtifactState>({
      documentId: null,
      kind: null,
      title: null,
      content: '',
      isStreaming: false,
      isVisible: false, // To control the artifact panel
      error: null,
    });

  // Process data stream for artifact-related events
  useEffect(() => {
    console.log(
      '[ChatUI] useEffect[data] TRIGGERED. Current raw data from useChat():',
      JSON.stringify(data, null, 2),
    );

    if (!data) {
      console.log('[ChatUI] useEffect[data]: data is null. Returning.');
      return;
    }
    if (data.length === 0) {
      console.log(
        '[ChatUI] useEffect[data]: data is an empty array. Returning.',
      );
      return;
    }

    console.log(
      `[ChatUI] useEffect[data]: PROCESSING ${data.length} item(s) in data stream.`,
    );

    // It's safer to create the new state based on the previous state from the hook,
    // rather than mutating a copy of activeArtifactState directly in each loop.
    let newDocumentId = activeArtifactState.documentId;
    let newKind = activeArtifactState.kind;
    let newTitle = activeArtifactState.title;
    let newContent = activeArtifactState.content;
    let newIsStreaming = activeArtifactState.isStreaming;
    let newIsVisible = activeArtifactState.isVisible;
    let newError = activeArtifactState.error;
    let stateActuallyChangedThisCycle = false;

    // Process each data item in the stream
    data.forEach((dataObject, index) => {
      console.log(
        `[ChatUI] useEffect[data]: Inspecting data item [${index}]:`,
        JSON.stringify(dataObject, null, 2),
      );

      if (
        typeof dataObject === 'object' &&
        dataObject !== null &&
        'type' in dataObject
      ) {
        const typedDataObject = dataObject as {
          type: string;
          [key: string]: any;
        };
        console.log(
          `[ChatUI] useEffect[data]: Item [${index}] is valid. Type: "${typedDataObject.type}".`,
        );

        switch (typedDataObject.type) {
          case 'artifact-start':
            console.log(
              '[ChatUI] CASE: artifact-start. Payload:',
              typedDataObject,
            );
            console.log(
              '[ChatUI] SETTING VISIBILITY FLAG TO TRUE - THIS IS CRITICAL',
            );
            newIsVisible = true; // CRITICAL: Ensure this is set
            newIsStreaming = true;
            newKind = typedDataObject.kind as ArtifactKind;
            newTitle = typedDataObject.title;
            newContent = ''; // Reset content
            newError = null;
            console.debug(
              '[ChatUI] Artifact start detected:',
              typedDataObject,
              'Setting isVisible to TRUE',
            );
            stateActuallyChangedThisCycle = true;
            break;

          case 'id':
            console.log('[ChatUI] CASE: id. Payload:', typedDataObject);
            if (newIsStreaming) {
              newDocumentId = typedDataObject.content;
              stateActuallyChangedThisCycle = true;
            } else {
              console.warn(
                '[ChatUI] Received "id" but not in streaming state. Ignored.',
              );
            }
            break;

          case 'title':
            console.log('[ChatUI] CASE: title. Payload:', typedDataObject);
            if (newIsStreaming) {
              newTitle = typedDataObject.content;
              stateActuallyChangedThisCycle = true;
            } else {
              console.warn(
                '[ChatUI] Received "title" but not in streaming state. Ignored.',
              );
            }
            break;

          case 'kind':
            console.log('[ChatUI] CASE: kind. Payload:', typedDataObject);
            if (newIsStreaming) {
              newKind = typedDataObject.content as ArtifactKind;
              stateActuallyChangedThisCycle = true;
            } else {
              console.warn(
                '[ChatUI] Received "kind" but not in streaming state. Ignored.',
              );
            }
            break;

          case 'text-delta':
          case 'code-delta':
          case 'image-delta':
          case 'sheet-delta':
            console.log(
              `[ChatUI] CASE: ${typedDataObject.type}. Appending content.`,
            );
            if (newIsStreaming) {
              newContent = `${newContent}${typedDataObject.content}`;
              stateActuallyChangedThisCycle = true;
            } else {
              console.warn(
                `[ChatUI] Received "${typedDataObject.type}" but not in streaming state. Delta ignored. Current content: "${newContent.substring(0, 50)}..."`,
              );
            }
            break;

          case 'finish':
            console.log('[ChatUI] CASE: finish. Payload:', typedDataObject);
            if (newIsStreaming) {
              newIsStreaming = false;
              stateActuallyChangedThisCycle = true;
              console.log('[ChatUI] Artifact streaming officially FINISHED.');
            } else {
              console.warn(
                '[ChatUI] Received "finish" but was not in streaming state.',
              );
            }
            break;

          case 'error':
            console.error(
              '[ChatUI] CASE: error from stream. Payload:',
              typedDataObject,
            );
            newError =
              typedDataObject.error ||
              typedDataObject.message ||
              'An unknown error occurred.';
            newIsStreaming = false; // Stop streaming on error
            stateActuallyChangedThisCycle = true;
            break;

          case 'status-update':
            // Could display status messages to the user if needed
            console.log('[ChatUI] Status update:', typedDataObject.status);
            break;

          case 'tool-result':
            // Process tool results which might contain artifact-related information
            console.log(
              '[ChatUI] CASE: tool-result. Payload:',
              typedDataObject,
            );
            if (
              typedDataObject.content &&
              typedDataObject.content.toolName === 'createDocument'
            ) {
              console.log(
                '[ChatUI] Document creation tool result:',
                typedDataObject.content,
              );
            }
            break;

          default:
            console.log(
              `[ChatUI] INFO: Data item type "${typedDataObject.type}" received but not specifically handled by artifact state logic. Payload:`,
              typedDataObject,
            );
        }
      } else {
        console.warn(
          `[ChatUI] useEffect[data]: Data item at index ${index} is invalid (not an object or no "type" property):`,
          JSON.stringify(dataObject, null, 2),
        );
      }
    });

    // If the state changed, update it
    if (stateActuallyChangedThisCycle) {
      console.log(
        '[ChatUI] useEffect[data]: State changes detected. Updating activeArtifactState with:',
        {
          documentId: newDocumentId,
          kind: newKind,
          title: newTitle,
          content:
            newContent.substring(0, 100) +
            (newContent.length > 100 ? '...' : ''), // Log snippet
          isStreaming: newIsStreaming,
          isVisible: newIsVisible,
          error: newError,
        },
      );
      setActiveArtifactState({
        documentId: newDocumentId,
        kind: newKind,
        title: newTitle,
        content: newContent,
        isStreaming: newIsStreaming,
        isVisible: newIsVisible,
        error: newError,
      });
    } else {
      console.log(
        '[ChatUI] useEffect[data]: No state changes for activeArtifactState in this cycle.',
      );
    }
  }, [data, activeArtifactState]); // Include activeArtifactState in dependencies

  // Add a new useEffect to log when activeArtifactState changes
  useEffect(() => {
    console.debug(
      '[ChatUI] activeArtifactState was updated to:',
      activeArtifactState,
    );
  }, [activeArtifactState]);

  // Function to handle closing the artifact panel
  const handleArtifactClose = useCallback(() => {
    setActiveArtifactState((prev) => ({ ...prev, isVisible: false }));
  }, []);

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
        streamingDocumentId={activeArtifactState.documentId}
        streamingTitle={activeArtifactState.title}
        streamingKind={activeArtifactState.kind}
        streamingContent={activeArtifactState.content}
        isStreaming={activeArtifactState.isStreaming}
        isVisible={activeArtifactState.isVisible}
        error={activeArtifactState.error}
        onClose={handleArtifactClose}
      />

      {/* Debug button for testing artifact visibility - hidden in production */}
      <button
        type="button"
        className="fixed bottom-4 right-4 z-[9999] bg-blue-600 text-white px-3 py-1 rounded text-xs"
        onClick={() => {
          console.log('[MANUAL DEBUG] Forcing artifact visibility');
          setActiveArtifactState({
            documentId: 'debug-doc-id',
            kind: 'text',
            title: 'Debug Test Document',
            content:
              'This is test content for debugging the artifact visibility issue.',
            isStreaming: false,
            isVisible: true,
            error: null,
          });
        }}
        style={{ opacity: 0.6 }}
      >
        Debug: Show Artifact
      </button>
    </>
  );
}
