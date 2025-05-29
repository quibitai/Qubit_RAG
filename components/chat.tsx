'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useRouter } from 'next/navigation';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { toast } from 'sonner';
import { ChatPaneToggle } from './ChatPaneToggle';
import { useChatPane } from '@/context/ChatPaneContext';
import type { ArtifactKind } from '@/components/artifact';

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
        setMainUiChatId(chatId);
      } catch (error) {
        console.error('[Chat] Error validating chat ID:', error);
        setMainUiChatId(null);
      }
    }
  }, [id, setMainUiChatId]);

  const { mutate, cache } = useSWRConfig();
  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const chatPersistedRef = useRef<boolean>(initialMessages.length > 0);

  const router = useRouter();

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

  // Add state for collapsed artifacts that appear inline in chat
  const [collapsedArtifacts, setCollapsedArtifacts] = useState<
    Array<{
      id: string;
      title: string;
      kind: ArtifactKind;
      content: string;
      messageId: string; // Track which message created this artifact
    }>
  >([]);

  // Add a flag to track when an artifact was manually expanded
  const manuallyExpandedRef = useRef<string | null>(null);

  // Reduced logging

  // Handle processed files for context
  const handleFileProcessed = useCallback(
    (fileMeta: {
      filename: string;
      contentType: string;
      url: string;
      extractedText: string;
    }) => {
      // Store the file context for use in AI requests
      setFileContext(fileMeta);
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
      if (event?.preventDefault) event.preventDefault();
      if (!input.trim()) return;

      try {
        // Clear input field immediately for better UX
        setInput('');

        // Get current artifact context for better AI awareness
        let artifactContext = null;
        if (activeArtifactState.documentId && activeArtifactState.content) {
          artifactContext = {
            documentId: activeArtifactState.documentId,
            title: activeArtifactState.title,
            kind: activeArtifactState.kind,
            content: activeArtifactState.content,
          };
        }

        // Include collapsed artifacts in context so AI remains aware of all documents
        const collapsedArtifactsContext =
          collapsedArtifacts.length > 0
            ? {
                collapsedArtifacts: collapsedArtifacts.map((artifact) => ({
                  documentId: artifact.id,
                  title: artifact.title,
                  kind: artifact.kind,
                  content: artifact.content,
                })),
              }
            : null;

        // Use the original handleSubmit from AI SDK to handle streaming response
        await originalHandleSubmit(event, {
          ...chatRequestOptions,
          body: {
            ...chatRequestOptions?.body,
            fileContext: fileContext || null, // Include fileContext in the request payload
            artifactContext, // Include current artifact context
            collapsedArtifactsContext, // Include collapsed artifacts context
            id: id,
            chatId: id,
            // Indicate this is from the main UI, not the global pane
            isFromGlobalPane: false,
          },
        });
      } catch (err) {
        console.error('[Chat] Error in handleSubmit:', err);
        toast.error('Failed to process your message. Please try again.');
      }
    },
    [
      input,
      originalHandleSubmit,
      setInput,
      fileContext,
      toast,
      id,
      activeArtifactState,
      collapsedArtifacts, // Add collapsedArtifacts dependency
    ],
  );

  useEffect(() => {
    // Add a robust fallback to ensure messages are properly saved to the database
    const ensureMessagesSaved = async () => {
      if (!messages.length || messages.length < 2) return;

      // Find pairs of user messages followed by assistant messages
      for (let i = 0; i < messages.length - 1; i++) {
        const currentMsg = messages[i];
        const nextMsg = messages[i + 1];

        // Check if we have a user->assistant message pair
        if (currentMsg.role === 'user' && nextMsg.role === 'assistant') {
          // Skip if assistant message has no content (still streaming)
          if (!nextMsg.content || nextMsg.content.trim() === '') {
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

          try {
            // Message saving is now handled by the Brain API
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

  // --- Defensive logic to prevent duplicate streaming and infinite loops ---
  // Track the last streamed documentId to avoid re-processing the same artifact
  const lastStreamedDocIdRef = useRef<string | null>(null);

  // Track which indexes in the data array we've already processed to avoid reprocessing
  const processedDataIndexRef = useRef<number>(0);

  // Add a reference to track if the finish event has been processed
  const streamFinishedRef = useRef<boolean>(false);

  // Reset streaming state when component is unmounted or new conversation starts
  useEffect(() => {
    return () => {
      // Clean up when component unmounts
      processedDataIndexRef.current = 0;
      streamFinishedRef.current = false;
      lastStreamedDocIdRef.current = null;
    };
  }, [id]); // Reset when chat ID changes

  // Process data stream for artifact-related events
  useEffect(() => {
    // Skip processing if no data
    if (!data || data.length === 0) {
      return;
    }

    // Skip processing if the current artifact was manually expanded
    if (
      manuallyExpandedRef.current &&
      activeArtifactState.documentId === manuallyExpandedRef.current
    ) {
      console.log(
        '[Chat] 🔒 Skipping data processing - artifact was manually expanded:',
        manuallyExpandedRef.current,
      );
      processedDataIndexRef.current = data.length; // Mark all data as processed
      return;
    }

    // Only process new items since last time this effect ran
    if (data.length <= processedDataIndexRef.current) {
      return;
    }

    // If streaming was already finished for the current document, don't process more data
    // for the same document ID (unless it's a new artifact-start event)
    if (streamFinishedRef.current && lastStreamedDocIdRef.current) {
      // Check for new 'artifact-start' or 'id' events in the *new* data items.
      const newDataSlice = data.slice(processedDataIndexRef.current);
      const hasNewArtifactStartInNewData = newDataSlice.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          'type' in item &&
          item.type === 'artifact-start',
      );
      const hasNewIdInNewData = newDataSlice.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          'type' in item &&
          item.type === 'id',
      );

      if (!hasNewArtifactStartInNewData && !hasNewIdInNewData) {
        // If the current stream is marked finished (streamFinishedRef.current is true),
        // and there are no 'artifact-start' or 'id' events in the new data items,
        // then these new items are likely irrelevant for starting a new stream or continuing the finished one
        // (e.g., trailing deltas for the finished stream, or other event types).
        // We can safely update the processed index and skip further processing in this effect run.
        processedDataIndexRef.current = data.length;
        return;
      }
      // If there IS a new artifact-start or a new ID in newDataItems, we proceed.
      // Crucially, we DO NOT reset streamFinishedRef.current here.
      // The subsequent logic (shouldInitializeNewDocument and the switch cases)
      // will handle resetting streamFinishedRef.current if a genuinely new stream context is established.
    }

    // Extract only the new items we haven't processed yet
    const newDataItems = data.slice(processedDataIndexRef.current);

    // Defensive: Only process new streams if documentId changes
    let newDocumentId = activeArtifactState.documentId;
    let newKind = activeArtifactState.kind;
    let newTitle = activeArtifactState.title;
    let newContent = activeArtifactState.content;
    let newIsStreaming = activeArtifactState.isStreaming;
    let newIsVisible = activeArtifactState.isVisible;
    let newError = activeArtifactState.error;
    let stateActuallyChangedThisCycle = false;

    // Find the latest artifact-start or id event to determine the current docId
    let latestDocId: string | null = null;
    newDataItems.forEach((dataObject) => {
      if (
        dataObject &&
        typeof dataObject === 'object' &&
        'type' in dataObject &&
        dataObject.type === 'id' &&
        'content' in dataObject &&
        typeof (dataObject as any).content === 'string'
      ) {
        latestDocId = (dataObject as any).content;
      }
    });

    // MODIFIED: Only use the guard for initialization, not for skipping delta processing
    let shouldInitializeNewDocument = true;
    if (latestDocId && lastStreamedDocIdRef.current === latestDocId) {
      shouldInitializeNewDocument = false;
    } else if (latestDocId) {
      lastStreamedDocIdRef.current = latestDocId;
      shouldInitializeNewDocument = true;
      // Reset finished state for new document
      streamFinishedRef.current = false;
    }

    // Process only the new data items
    newDataItems.forEach((dataObject, relativeIndex) => {
      const absoluteIndex = processedDataIndexRef.current + relativeIndex;
      const typedDataObject = dataObject as any; // Replace with actual type if available

      if (
        typeof dataObject === 'object' &&
        dataObject !== null &&
        'type' in dataObject
      ) {
        switch (typedDataObject.type) {
          case 'artifact-start':
            if (shouldInitializeNewDocument) {
              newIsVisible = true;
              newIsStreaming = true;
              newKind = typedDataObject.kind as ArtifactKind;
              newTitle = typedDataObject.title;

              // Reset content when starting a new document
              newContent = '';

              newError = null;
              stateActuallyChangedThisCycle = true;
              // Reset finished flag for new artifact
              streamFinishedRef.current = false;
              // Clear manual expansion flag when new artifact starts
              manuallyExpandedRef.current = null;
            }
            break;

          case 'id':
            if (shouldInitializeNewDocument) {
              newDocumentId = typedDataObject.content;
              stateActuallyChangedThisCycle = true;
              // Clear manual expansion flag when new document ID is assigned
              manuallyExpandedRef.current = null;
            }
            break;

          case 'text-delta':
          case 'sheet-delta':
            // Skip delta processing if stream is already finished
            if (streamFinishedRef.current) {
              break;
            }

            // Properly accumulate delta content
            // Don't reset content for deltas, just accumulate
            if (typedDataObject.content) {
              const oldLength = newContent.length;
              newContent += typedDataObject.content;
              stateActuallyChangedThisCycle = true;
              newIsVisible = true;
            }
            break;

          case 'finish':
            if (newIsStreaming) {
              newIsStreaming = false;
              stateActuallyChangedThisCycle = true;
              newIsVisible = true;
              streamFinishedRef.current = true;

              // Content is already complete from streaming - no need to fetch again
              console.log(
                '[Chat] 🟢 Streaming finished. Content length:',
                newContent.length,
              );

              if (stop) {
                stop();
              }
            }
            break;

          case 'error':
            // console.error(
            //   '[ChatUI] CASE: error from stream. Payload:',
            //    typedDataObject,
            // );
            newError =
              typedDataObject.error ||
              typedDataObject.message ||
              'An unknown error occurred.';
            newIsStreaming = false;
            stateActuallyChangedThisCycle = true;
            // Mark stream as finished on error
            streamFinishedRef.current = true;

            // Stop the useChat hook from making more requests
            if (stop) {
              stop();
            }
            break;

          case 'status-update':
            // if (typedDataObject.message) {
            //   // console.log('[Chat] Status Update:', typedDataObject.message);
            // }
            break;

          case 'tool-result':
            // if (
            //   typedDataObject.content &&
            //   typedDataObject.content.toolName === 'createDocument'
            // ) {
            //   // console.log(
            //   //   '[Chat] Document creation tool result:',
            //   //   typedDataObject.content.result,
            //   // );
            // }
            break;

          default:
            // console.log('[Chat] Unhandled data item type:', typedDataObject.type);
            break;
        }
      }
    });

    // Update the processed index to avoid reprocessing
    processedDataIndexRef.current = data.length;

    // Only update state if it actually changed
    if (stateActuallyChangedThisCycle) {
      const isStateChanged =
        newDocumentId !== activeArtifactState.documentId ||
        newKind !== activeArtifactState.kind ||
        newTitle !== activeArtifactState.title ||
        newIsStreaming !== activeArtifactState.isStreaming ||
        newIsVisible !== activeArtifactState.isVisible ||
        newError !== activeArtifactState.error ||
        newContent.length !== activeArtifactState.content.length;

      if (isStateChanged) {
        if (newContent && newContent.length > 0) {
          newIsVisible = true;
        }

        // console.log('[Chat] ✅ Updating artifact state:', {
        //   documentId: newDocumentId,
        //   kind: newKind,
        //   title: newTitle,
        //   contentLength: newContent.length,
        //   isStreaming: newIsStreaming,
        //   isVisible: newIsVisible,
        //   error: newError,
        //   contentPreview: `${newContent.substring(0, 50)}...`,
        // });
        console.log(
          '[Chat] About to call setActiveArtifactState. New Content Length:',
          newContent.length,
          'Is Streaming:',
          newIsStreaming,
          'Content Preview:',
          newContent.substring(0, 100),
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
      }
    }
  }, [data, activeArtifactState, stop]); // Add stop to dependencies

  // Function to handle closing the artifact panel
  const handleArtifactClose = useCallback(
    () => {
      const { documentId, title, kind, content } = activeArtifactState;

      if (documentId && content && title && kind) {
        // Find the most recent assistant message to associate this artifact with
        const lastAssistantMessage = messages
          .slice()
          .reverse()
          .find((msg) => msg.role === 'assistant');

        const collapsedArtifact = {
          id: documentId,
          title: title,
          kind: kind,
          content: content,
          messageId: lastAssistantMessage?.id || documentId, // Fallback to documentId if no message found
        };

        setCollapsedArtifacts((prev) => {
          const exists = prev.some(
            (artifact) => artifact.id === collapsedArtifact.id,
          );
          if (exists) {
            return prev;
          }
          const newList = [...prev, collapsedArtifact];
          return newList;
        });

        // This will also set isVisible: false and reset other fields
        setActiveArtifactState((prev) => ({
          ...prev,
          isVisible: false,
          documentId: null,
          title: null,
          content: '',
          kind: null,
          error: null,
          isStreaming: false,
        }));

        // Clear manual expansion flag when artifact is closed
        manuallyExpandedRef.current = null;
      } else {
        setActiveArtifactState((prev) => ({
          ...prev,
          isVisible: false,
          documentId: null,
          title: null,
          content: '',
          kind: null,
          error: null,
          isStreaming: false,
        }));

        // Clear manual expansion flag when artifact is closed
        manuallyExpandedRef.current = null;
      }
    },
    [
      activeArtifactState,
      setActiveArtifactState,
      setCollapsedArtifacts,
      messages,
    ], // Add messages dependency
  );

  // Function to handle expanding a collapsed artifact back to full view
  const handleArtifactExpand = useCallback(
    (artifactId: string) => {
      console.log(
        '[Chat] 🔴 handleArtifactExpand called with artifactId:',
        artifactId,
      );
      console.log('[Chat] 🔴 Current collapsedArtifacts:', collapsedArtifacts);
      console.log('[Chat] 🔴 Current activeArtifactState BEFORE expand:', {
        documentId: activeArtifactState.documentId,
        isVisible: activeArtifactState.isVisible,
        isStreaming: activeArtifactState.isStreaming,
        contentLength: activeArtifactState.content.length,
      });

      const artifactToExpand = collapsedArtifacts.find(
        (a) => a.id === artifactId,
      );
      if (artifactToExpand) {
        console.log(
          '[Chat] 🔴 Found collapsed artifact, expanding:',
          artifactToExpand,
        );

        // Signal that this artifact is now active, complete, and should not be re-streamed
        // by the useEffect data processor.
        lastStreamedDocIdRef.current = artifactToExpand.id;
        streamFinishedRef.current = true; // It's fully loaded, not streaming.
        processedDataIndexRef.current = data?.length || 0; // Mark all prior stream data as "seen" for this or other artifacts.

        // Mark this artifact as manually expanded to prevent useEffect interference
        manuallyExpandedRef.current = artifactToExpand.id;

        console.log('[Chat] 🔴 About to setActiveArtifactState with:', {
          documentId: artifactToExpand.id,
          title: artifactToExpand.title,
          kind: artifactToExpand.kind,
          contentLength: artifactToExpand.content.length,
          isStreaming: false,
          isVisible: true,
        });

        setActiveArtifactState({
          documentId: artifactToExpand.id,
          title: artifactToExpand.title,
          kind: artifactToExpand.kind,
          content: artifactToExpand.content,
          isStreaming: false, // Explicitly not streaming
          isVisible: true,
          error: null,
        });

        setCollapsedArtifacts((prev) =>
          prev.filter((a) => a.id !== artifactId),
        );

        console.log('[Chat] 🔴 handleArtifactExpand completed');
      } else {
        console.log(
          '[Chat] 🔴 No collapsed artifact found with ID:',
          artifactId,
        );
      }
    },
    [
      collapsedArtifacts,
      setActiveArtifactState,
      setCollapsedArtifacts,
      data,
      activeArtifactState,
    ], // Added activeArtifactState to deps for logging
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

        <div className="flex-1 min-h-0">
          <Messages
            chatId={id}
            status={uiStatus}
            votes={votes}
            messages={messages}
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
            isArtifactVisible={activeArtifactState.isVisible}
            collapsedArtifacts={collapsedArtifacts}
            onArtifactExpand={handleArtifactExpand}
          />

          {/* Debug collapsed artifacts state */}
          {/* // REMOVE THIS DEBUG UI BLOCK
          {collapsedArtifacts.length > 0 && (
            <div className="fixed bottom-4 right-4 bg-red-500 text-white p-2 rounded text-xs z-50">
              🔴 DEBUG: {collapsedArtifacts.length} collapsed artifacts
            </div>
          )}
          */}
        </div>

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
        documentId={activeArtifactState.documentId}
        title={activeArtifactState.title}
        kind={activeArtifactState.kind}
        content={activeArtifactState.content}
        isStreaming={activeArtifactState.isStreaming}
        isVisible={activeArtifactState.isVisible}
        error={activeArtifactState.error}
        onClose={handleArtifactClose}
      />

      {/* Debug info - single box */}
      {/* // REMOVE THIS DEBUG UI BLOCK
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-20 left-4 bg-purple-500 text-white p-2 rounded text-xs z-50 max-w-sm">
          🟣 DEBUG INFO:
          <br />📤 Props to Artifact: ID=
          {activeArtifactState.documentId || 'null'}, Content=
          {activeArtifactState.content?.length || 0}chars
          <br />📦 Collapsed: {collapsedArtifacts.length} artifacts
          <br />
          👁️ Visible: {activeArtifactState.isVisible ? 'true' : 'false'}
        </div>
      )}
      */}
    </>
  );
}
