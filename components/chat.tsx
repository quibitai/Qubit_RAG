'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatHeader } from '@/components/chat-header';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { ChatPaneToggle } from './ChatPaneToggle';
import { useChatPane } from '@/context/ChatPaneContext';
import type { ArtifactKind } from '@/components/artifact';
import React from 'react';
import { useArtifact } from '@/hooks/use-artifact';

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

export function Chat({
  id,
  initialMessages: initialMessagesFromProps,
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
  // Access the ChatPaneContext to use the shared chat state
  const {
    setMainUiChatId,
    chatState,
    currentActiveSpecialistId,
    globalPaneChatId,
    submitMessage,
  } = useChatPane();

  // Use the global artifact hook (single source of truth)
  const { artifact, setArtifact } = useArtifact();

  const {
    messages,
    input,
    isLoading,
    error,
    append,
    data,
    setInput,
    setMessages,
    stop,
    reload,
  } = chatState;

  useEffect(() => {
    if (id) setMainUiChatId(id);
  }, [id, setMainUiChatId]);

  useEffect(() => {
    if (
      initialMessagesFromProps &&
      initialMessagesFromProps.length > 0 &&
      messages.length === 0
    ) {
      setMessages(initialMessagesFromProps);
    }
  }, [initialMessagesFromProps, messages.length, setMessages]);

  const processedDataIndexRef = useRef<number>(0);

  useEffect(() => {
    processedDataIndexRef.current = 0;

    // For new chats, clear any stale artifact state
    if (!initialMessagesFromProps || initialMessagesFromProps.length === 0) {
      setArtifact({
        documentId: 'init',
        content: '',
        kind: 'text',
        title: '',
        status: 'idle',
        isVisible: false,
        boundingBox: {
          top: 0,
          left: 0,
          width: 0,
          height: 0,
        },
      });
    }
  }, [id, initialMessagesFromProps, setArtifact]);

  // Simplified data processing - only handle artifact-related events
  useEffect(() => {
    if (!data || data.length === 0) {
      return;
    }

    if (data.length <= processedDataIndexRef.current) {
      return;
    }

    const newDataItems = data.slice(processedDataIndexRef.current);
    let artifactUpdate: any = null;

    newDataItems.forEach((dataObject) => {
      if (
        typeof dataObject === 'object' &&
        dataObject !== null &&
        'type' in dataObject
      ) {
        const typedDataObject = dataObject as any;

        switch (typedDataObject.type) {
          case 'artifact-start':
            artifactUpdate = {
              documentId: 'streaming',
              kind: typedDataObject.kind as ArtifactKind,
              title: typedDataObject.title,
              content: '',
              status: 'streaming',
              isVisible: true,
              boundingBox: {
                top: 0,
                left: 0,
                width: 0,
                height: 0,
              },
            };
            break;

          case 'id':
            if (artifactUpdate || artifact.status === 'streaming') {
              artifactUpdate = {
                ...(artifactUpdate || artifact),
                documentId: typedDataObject.content,
              };
            }
            break;

          case 'text-delta':
          case 'sheet-delta':
            if (artifactUpdate || artifact.status === 'streaming') {
              const currentContent =
                artifactUpdate?.content || artifact.content || '';
              artifactUpdate = {
                ...(artifactUpdate || artifact),
                content: currentContent + typedDataObject.content,
              };
            }
            break;

          case 'finish':
            if (artifactUpdate || artifact.status === 'streaming') {
              artifactUpdate = {
                ...(artifactUpdate || artifact),
                status: 'idle',
              };
            }
            if (stop) stop();
            break;

          case 'error':
            if (artifactUpdate || artifact.status === 'streaming') {
              artifactUpdate = {
                ...(artifactUpdate || artifact),
                status: 'idle',
                content:
                  typedDataObject.error ||
                  typedDataObject.message ||
                  'An error occurred.',
              };
            }
            if (stop) stop();
            break;
        }
      }
    });

    processedDataIndexRef.current = data.length;

    // Apply artifact update if any
    if (artifactUpdate) {
      setArtifact(artifactUpdate);
    }
  }, [data, artifact, setArtifact, stop]);

  const handleSubmitFromUi = useCallback(async () => {
    if (!input.trim()) return;

    const currentInputVal = input.trim();
    setInput('');
    let artifactContextPayload = null;
    if (artifact?.documentId && artifact.documentId !== 'init') {
      artifactContextPayload = {
        documentId: artifact.documentId,
        title: artifact.title,
        kind: artifact.kind,
        content: artifact.content || '',
      };
    }

    try {
      await submitMessage({
        message: currentInputVal,
        data: {
          fileContext: null,
          artifactContext: artifactContextPayload,
          collapsedArtifactsContext: null, // Removed
          id: id,
          chatId: id,
          currentActiveSpecialistId,
          globalPaneChatId,
          isFromGlobalPane: false,
        },
      });
    } catch (err) {
      console.error('[Chat] Error in handleSubmitFromUi:', err);
      setInput(currentInputVal);
    }
  }, [
    input,
    setInput,
    submitMessage,
    artifact,
    id,
    currentActiveSpecialistId,
    globalPaneChatId,
  ]);

  // Add state for attachments for MultimodalInput
  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  const isArtifactVisible = artifact?.isVisible || false;

  // JSX rendering part
  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={selectedChatModel}
          selectedVisibilityType={selectedVisibilityType}
          isReadonly={isReadonly}
        />
        <div className="absolute top-4 right-4 z-10">
          <ChatPaneToggle />
        </div>
        <div className="flex-1 min-h-0">
          <Messages
            chatId={id}
            status={isLoading ? 'streaming' : error ? 'error' : 'ready'}
            messages={messages}
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
            isArtifactVisible={isArtifactVisible}
            votes={undefined}
          />
        </div>
        <form
          className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmitFromUi();
          }}
        >
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmitFromUi}
              status={isLoading ? 'streaming' : error ? 'error' : 'ready'}
              stop={stop}
              messages={messages}
              setMessages={setMessages}
              append={append}
              attachments={attachments}
              setAttachments={setAttachments}
            />
          )}
        </form>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmitFromUi}
        status={isLoading ? 'streaming' : error ? 'error' : 'ready'}
        stop={stop}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        isReadonly={isReadonly}
        documentId={artifact?.documentId}
        title={artifact?.title}
        kind={artifact?.kind}
        content={artifact?.content || ''}
        isStreaming={artifact?.status === 'streaming'}
        isVisible={artifact?.isVisible}
        error={null}
        onClose={() => setArtifact({ ...artifact, isVisible: false })}
        onContentSaved={() => {}} // Simplified
        attachments={attachments}
        setAttachments={setAttachments}
        votes={undefined}
      />
    </>
  );
}
