import type { Attachment, UIMessage } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
  useRef,
} from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useDebounceCallback, useWindowSize } from 'usehooks-ts';
import type { Document, Vote } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Toolbar } from './toolbar';
import { VersionFooter } from './version-footer';
import { ArtifactActions } from './artifact-actions';
import { ArtifactCloseButton } from './artifact-close-button';
import { ArtifactMessages } from './artifact-messages';
import { useSidebar } from './ui/sidebar';
import { useArtifact } from '@/hooks/use-artifact';
import { imageArtifact } from '@/artifacts/image/client';
import { codeArtifact } from '@/artifacts/code/client';
import { sheetArtifact } from '@/artifacts/sheet/client';
import { textArtifact } from '@/artifacts/text/client';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { FileText, Code, Image as ImageIcon, Table } from 'lucide-react';

const isValidUUID = (id: string | null | undefined): boolean => {
  if (!id) return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export const artifactDefinitions = [
  textArtifact,
  codeArtifact,
  imageArtifact,
  sheetArtifact,
];
export type ArtifactKind = (typeof artifactDefinitions)[number]['kind'];

export interface UIArtifact {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string;
  isVisible: boolean;
  status: 'streaming' | 'idle';
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

function PureArtifact({
  chatId,
  input,
  setInput,
  handleSubmit,
  status,
  stop,
  attachments,
  setAttachments,
  append,
  messages,
  setMessages,
  reload,
  votes,
  isReadonly,
  documentId,
  title,
  kind,
  content,
  isStreaming,
  isVisible,
  error,
  onClose,
  onContentSaved,
}: {
  chatId: string;
  input: string;
  setInput: UseChatHelpers['setInput'];
  status: UseChatHelpers['status'];
  stop: UseChatHelpers['stop'];
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  votes: Array<Vote> | undefined;
  append: UseChatHelpers['append'];
  handleSubmit: UseChatHelpers['handleSubmit'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  documentId: string | null;
  title: string | null;
  kind: ArtifactKind | null;
  content: string;
  isStreaming: boolean;
  isVisible: boolean;
  error: string | null;
  onClose: () => void;
  onContentSaved?: (docId: string, newContent: string) => void;
}) {
  // Create a unique ID for this component instance to track duplicates
  const componentId = useRef(
    `artifact-${Math.random().toString(36).substr(2, 9)}`,
  );

  // Track render count for this component instance
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  // Track previous props to see what changed (only for significant changes)
  const prevPropsRef = useRef<any>(null);

  // Only log essential renders to reduce console noise
  const shouldLog =
    renderCountRef.current === 1 ||
    isVisible !== prevPropsRef.current?.isVisible ||
    documentId !== prevPropsRef.current?.documentId;

  if (shouldLog) {
    console.log(
      `[${componentId.current}] 🟡 ARTIFACT RENDER #${renderCountRef.current} - Props:`,
      {
        documentId,
        title,
        kind,
        contentLength: content?.length || 0,
        isStreaming,
        isVisible,
        error,
      },
    );
  }

  // Log when component is created (first render)
  if (renderCountRef.current === 1) {
    console.log(`[${componentId.current}] 🟢 NEW ARTIFACT COMPONENT CREATED`);
  }

  if (prevPropsRef.current && shouldLog) {
    const propsChanged = {
      documentId: prevPropsRef.current.documentId !== documentId,
      isVisible: prevPropsRef.current.isVisible !== isVisible,
      isStreaming: prevPropsRef.current.isStreaming !== isStreaming,
      contentLength:
        (prevPropsRef.current.content?.length || 0) !== (content?.length || 0),
    };

    if (Object.values(propsChanged).some(Boolean)) {
      console.log(`[${componentId.current}] 🔄 PROPS CHANGED:`, propsChanged);
    }
  }

  prevPropsRef.current = {
    documentId,
    isVisible,
    isStreaming,
    content,
  };

  // Log component lifecycle
  useEffect(() => {
    console.log(`[${componentId.current}] 🟣 ARTIFACT COMPONENT MOUNTED`);
    return () => {
      console.log(`[${componentId.current}] 🔴 ARTIFACT COMPONENT UNMOUNTED`);
    };
  }, []);

  const {
    artifact: globalArtifact,
    setArtifact,
    metadata,
    setMetadata,
  } = useArtifact();

  const artifact = {
    documentId: documentId || 'init',
    title: title || 'Document',
    kind: kind || ('text' as ArtifactKind),
    content: content,
    isVisible: isVisible,
    status: (isStreaming ? 'streaming' : 'idle') as 'streaming' | 'idle',
    boundingBox: globalArtifact.boundingBox,
  };

  const { open: isSidebarOpen } = useSidebar();

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    error: documentsError,
  } = useSWR<Array<Document>>(
    // Completely disable SWR fetching for artifacts that came from streaming
    // The streaming process already provides the complete content
    null, // Always null to disable fetching for streamed artifacts
    fetcher,
    {
      // Prevent excessive revalidation
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 5000, // Prevent duplicate calls within 5 seconds
      onSuccess: (data) => {
        console.log('[SWR_DOCUMENT_FETCH] Success:', data);
      },
      onError: (error) => {
        console.log('[SWR_DOCUMENT_FETCH] Error:', error);
      },
    },
  );

  // Add debug logging for SWR state
  console.log('[SWR_DOCUMENT_DEBUG] documentId:', documentId);
  console.log(
    '[SWR_DOCUMENT_DEBUG] isValidUUID(documentId):',
    isValidUUID(documentId),
  );
  console.log('[SWR_DOCUMENT_DEBUG] artifact.status:', artifact.status);
  console.log(
    '[SWR_DOCUMENT_DEBUG] SWR key:',
    isValidUUID(documentId) && artifact.status !== 'streaming'
      ? `/api/document?id=${documentId}`
      : null,
  );
  console.log('[SWR_DOCUMENT_DEBUG] documents:', documents);
  console.log('[SWR_DOCUMENT_DEBUG] isDocumentsFetching:', isDocumentsFetching);
  console.log('[SWR_DOCUMENT_DEBUG] documentsError:', documentsError);

  // SWR fetching is disabled for streaming artifacts - they already have complete content

  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isContentDirty, setIsContentDirty] = useState(false);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  const { mutate } = useSWRConfig();

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!documentId || documentId === 'init') return;

      // Simplified content saving without document fetching
      fetch(`/api/document?id=${documentId}`, {
        method: 'POST',
        body: JSON.stringify({
          title: title,
          content: updatedContent,
          kind: kind,
        }),
      })
        .then(async (res) => {
          if (res.ok) {
            setIsContentDirty(false);
            console.log(
              '[handleContentChange] Content saved successfully via API',
            );
            if (onContentSaved && documentId) {
              onContentSaved(documentId, updatedContent);
            }
          } else {
            const errorData = await res
              .json()
              .catch(() => ({ message: 'Unknown error' }));
            console.error(
              '[handleContentChange] API error saving content:',
              res.status,
              errorData,
            );
          }
        })
        .catch((error) => {
          console.error(
            '[handleContentChange] Fetch error saving content:',
            error,
          );
          setIsContentDirty(false);
        });
    },
    [documentId, title, kind, onContentSaved],
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000,
  );

  const saveContent = useCallback(
    (updatedContent: string, debounce = true) => {
      if (!documentId || documentId === 'init') {
        console.log('[saveContent] No valid documentId, skipping save');
        return;
      }

      // Since we disabled document fetching, compare against the content prop instead
      if (updatedContent === content) {
        console.log('[saveContent] Content unchanged, skipping save');
        return;
      }

      console.log('[saveContent] Saving content, debounce:', debounce);
      setIsContentDirty(true);

      if (debounce) {
        debouncedHandleContentChange(updatedContent);
      } else {
        handleContentChange(updatedContent);
      }
    },
    [documentId, content, debouncedHandleContentChange, handleContentChange],
  );

  function getDocumentContentById(index: number) {
    // Since we're not fetching documents anymore, just return current content
    return content || '';
  }

  const handleVersionChange = (type: 'next' | 'prev' | 'toggle' | 'latest') => {
    // Version changes not supported for streaming artifacts
    console.log(
      '[handleVersionChange] Version changes not supported for streaming artifacts',
    );
  };

  const isCurrentVersion = true; // Always current version since we're not fetching document history

  const isLoading = isStreaming && !artifact.content;

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind,
  );

  useEffect(() => {
    if (artifact.documentId !== 'init' && artifactDefinition) {
      if (artifactDefinition.initialize) {
        // Only initialize once per document ID and avoid initializing during streaming
        if (artifact.status !== 'streaming') {
          console.log(
            '[Artifact] Initializing artifact for documentId:',
            artifact.documentId,
          );
          artifactDefinition.initialize({
            documentId: artifact.documentId,
            setMetadata,
          });
        }
      }
    }
  }, [artifact.documentId, artifactDefinition, setMetadata, artifact.status]);

  // Commented out to prevent duplicate artifacts - we now use props directly instead of global state
  // useEffect(() => {
  //   setArtifact((prevArtifact) => ({
  //     ...prevArtifact,
  //     documentId: documentId || 'init',
  //     title: title || 'Document',
  //     kind: kind || ('text' as ArtifactKind),
  //     content: content,
  //     isVisible: isVisible,
  //     status: (isStreaming ? 'streaming' : 'idle') as 'streaming' | 'idle',
  //   }));
  // }, [documentId, title, kind, content, isVisible, isStreaming, setArtifact]);

  const getIconForKind = (artifactKind: ArtifactKind | null) => {
    if (!artifactKind)
      return <FileText className="mr-2 flex-shrink-0 h-5 w-5" />;
    switch (artifactKind) {
      case 'text':
        return <FileText className="mr-2 flex-shrink-0 h-5 w-5" />;
      case 'code':
        return <Code className="mr-2 flex-shrink-0 h-5 w-5" />;
      case 'image':
        return <ImageIcon className="mr-2 flex-shrink-0 h-5 w-5" />;
      case 'sheet':
        return <Table className="mr-2 flex-shrink-0 h-5 w-5" />;
      default:
        return <FileText className="mr-2 flex-shrink-0 h-5 w-5" />;
    }
  };

  // Add debug logging for global artifact state
  console.log('[ARTIFACT_GLOBAL_STATE_DEBUG] Global artifact state:', {
    documentId: artifact.documentId,
    title: artifact.title,
    kind: artifact.kind,
    contentLength: artifact.content?.length || 0,
    isVisible: artifact.isVisible,
    status: artifact.status,
  });

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          data-testid="artifact"
          className="flex flex-row h-dvh w-dvw fixed top-0 left-0 z-50 bg-transparent"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { delay: 0.4 } }}
        >
          {!isMobile && (
            <motion.div
              className="fixed bg-background h-dvh"
              initial={{
                width: isSidebarOpen ? windowWidth - 256 : windowWidth,
                right: 0,
              }}
              animate={{ width: windowWidth, right: 0 }}
              exit={{
                width: isSidebarOpen ? windowWidth - 256 : windowWidth,
                right: 0,
              }}
            />
          )}

          {!isMobile && (
            <motion.div
              className="relative w-[400px] bg-muted dark:bg-background h-dvh shrink-0"
              initial={{ opacity: 0, x: 10, scale: 1 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                transition: {
                  delay: 0.2,
                  type: 'spring',
                  stiffness: 200,
                  damping: 30,
                },
              }}
              exit={{
                opacity: 0,
                x: 0,
                scale: 1,
                transition: { duration: 0 },
              }}
            >
              <AnimatePresence>
                {!isCurrentVersion && (
                  <motion.div
                    className="left-0 absolute h-dvh w-[400px] top-0 bg-zinc-900/50 z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </AnimatePresence>

              <div className="flex flex-col h-full">
                <div className="flex-1 min-h-0">
                  <ArtifactMessages
                    chatId={chatId}
                    status={status}
                    votes={votes}
                    messages={messages}
                    setMessages={setMessages}
                    reload={reload}
                    isReadonly={isReadonly}
                    artifactStatus={artifact.status}
                  />
                </div>

                <div className="flex-shrink-0">
                  <form className="flex flex-row gap-2 relative items-end w-full px-4 pb-4">
                    <MultimodalInput
                      chatId={chatId}
                      input={input}
                      setInput={setInput}
                      handleSubmit={handleSubmit}
                      status={status}
                      stop={stop}
                      attachments={attachments}
                      setAttachments={setAttachments}
                      messages={messages}
                      append={append}
                      className="bg-background dark:bg-muted"
                      setMessages={setMessages}
                    />
                  </form>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div
            className="fixed dark:bg-muted bg-background h-dvh flex flex-col overflow-y-scroll md:border-l dark:border-zinc-700 border-zinc-200"
            initial={
              isMobile
                ? {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
                : {
                    opacity: 1,
                    x: artifact.boundingBox.left,
                    y: artifact.boundingBox.top,
                    height: artifact.boundingBox.height,
                    width: artifact.boundingBox.width,
                    borderRadius: 50,
                  }
            }
            animate={
              isMobile
                ? {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth ? windowWidth : 'calc(100dvw)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
                : {
                    opacity: 1,
                    x: 400,
                    y: 0,
                    height: windowHeight,
                    width: windowWidth
                      ? windowWidth - 400
                      : 'calc(100dvw-400px)',
                    borderRadius: 0,
                    transition: {
                      delay: 0,
                      type: 'spring',
                      stiffness: 200,
                      damping: 30,
                      duration: 5000,
                    },
                  }
            }
            exit={{
              opacity: 0,
              scale: 0.5,
              transition: {
                delay: 0.1,
                type: 'spring',
                stiffness: 600,
                damping: 30,
              },
            }}
          >
            <div className="flex items-center p-2 border-b border-border bg-muted/40 min-h-[50px]">
              {getIconForKind(kind)}
              <span
                className="font-semibold truncate flex-grow"
                title={title || 'Artifact'}
              >
                {title || 'Artifact'}
              </span>
              <ArtifactCloseButton onClose={onClose} />
            </div>

            <div className="p-2 flex flex-row justify-between items-start">
              <div>
                {isContentDirty ? (
                  <div className="text-sm text-muted-foreground">
                    Saving changes...
                  </div>
                ) : documentId && documentId !== 'init' ? (
                  <div className="text-sm text-muted-foreground">
                    {status === 'streaming' || isStreaming
                      ? 'Streaming...'
                      : 'Ready'}
                  </div>
                ) : (
                  <div className="w-32 h-3 mt-2 bg-muted-foreground/20 rounded-md animate-pulse" />
                )}
              </div>

              <ArtifactActions
                artifact={{
                  documentId: documentId || 'init',
                  title: title || 'Document',
                  kind: kind || ('text' as ArtifactKind),
                  content: content,
                  isVisible: isVisible,
                  status: (isStreaming ? 'streaming' : 'idle') as
                    | 'streaming'
                    | 'idle',
                  boundingBox: artifact.boundingBox,
                }}
                currentVersionIndex={-1}
                handleVersionChange={handleVersionChange}
                isCurrentVersion={isCurrentVersion}
                mode={mode}
                metadata={metadata}
                setMetadata={setMetadata}
              />
            </div>

            <div className="dark:bg-muted bg-background h-full overflow-hidden !max-w-full items-center">
              {error && (
                <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
                  <p className="font-semibold">An error occurred:</p>
                  <p>{error}</p>
                </div>
              )}
              {!error &&
                artifactDefinition &&
                (() => {
                  const contentToPass = content; // Always use streaming content since we disabled document fetching

                  console.log(
                    '[ARTIFACT_COMPONENT] About to render artifact content with:',
                  );
                  console.log(
                    '[ARTIFACT_COMPONENT] artifact.status:',
                    artifact.status,
                  );
                  console.log(
                    '[ARTIFACT_COMPONENT] Using streaming content only',
                  );
                  console.log(
                    '[ARTIFACT_COMPONENT] content prop length:',
                    content?.length || 0,
                  );
                  console.log(
                    '[ARTIFACT_COMPONENT] contentToPass length:',
                    contentToPass?.length || 0,
                  );
                  console.log(
                    '[ARTIFACT_COMPONENT] contentToPass preview:',
                    contentToPass?.substring(0, 100) || 'empty',
                  );

                  // Add fallback content for debugging
                  const finalContent =
                    contentToPass ||
                    (artifact.status === 'streaming'
                      ? 'Loading content...'
                      : '');

                  return (
                    <artifactDefinition.content
                      title={title || 'Artifact'}
                      content={finalContent}
                      mode={mode}
                      status={
                        (isStreaming ? 'streaming' : 'idle') as
                          | 'streaming'
                          | 'idle'
                      }
                      currentVersionIndex={currentVersionIndex}
                      suggestions={metadata?.suggestions || []}
                      onSaveContent={saveContent}
                      isInline={false}
                      isCurrentVersion={isCurrentVersion}
                      getDocumentContentById={getDocumentContentById}
                      isLoading={isLoading}
                      metadata={metadata}
                      setMetadata={setMetadata}
                    />
                  );
                })()}
              {!error && !artifactDefinition && kind && (
                <div className="p-4 text-muted-foreground">
                  Loading artifact content for type: {kind}...
                </div>
              )}

              <AnimatePresence>
                {isCurrentVersion && kind && (
                  <Toolbar
                    isToolbarVisible={isToolbarVisible}
                    setIsToolbarVisible={setIsToolbarVisible}
                    append={append}
                    status={status}
                    stop={stop}
                    setMessages={setMessages}
                    artifactKind={kind}
                    content={content}
                    title={title}
                    kind={kind}
                  />
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {!isCurrentVersion && (
                <VersionFooter
                  currentVersionIndex={-1}
                  documents={[]}
                  handleVersionChange={handleVersionChange}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  // Skip memo logging in production for performance
  if (process.env.NODE_ENV === 'development') {
    const contentChanged = prevProps.content !== nextProps.content;
    const isStreamingChanged = prevProps.isStreaming !== nextProps.isStreaming;
    const isVisibleChanged = prevProps.isVisible !== nextProps.isVisible;
    const documentIdChanged = prevProps.documentId !== nextProps.documentId;

    console.log('[ARTIFACT_MEMO_DEBUG] Memo comparison:', {
      contentChanged,
      prevContentLength: prevProps.content?.length || 0,
      nextContentLength: nextProps.content?.length || 0,
      isStreamingChanged,
      isVisibleChanged,
      documentIdChanged,
      prevDocumentId: prevProps.documentId,
      nextDocumentId: nextProps.documentId,
    });
  }

  // Most critical props that should trigger re-render
  if (prevProps.isVisible !== nextProps.isVisible) {
    console.log('[ARTIFACT_MEMO] Re-render due to isVisible change');
    return false;
  }

  if (prevProps.documentId !== nextProps.documentId) {
    console.log('[ARTIFACT_MEMO] Re-render due to documentId change');
    return false;
  }

  if (prevProps.content !== nextProps.content) {
    console.log('[ARTIFACT_MEMO] Re-render due to content change');
    return false;
  }

  if (prevProps.isStreaming !== nextProps.isStreaming) {
    console.log('[ARTIFACT_MEMO] Re-render due to isStreaming change');
    return false;
  }

  if (prevProps.title !== nextProps.title) {
    console.log('[ARTIFACT_MEMO] Re-render due to title change');
    return false;
  }

  if (prevProps.kind !== nextProps.kind) {
    console.log('[ARTIFACT_MEMO] Re-render due to kind change');
    return false;
  }

  if (prevProps.error !== nextProps.error) {
    console.log('[ARTIFACT_MEMO] Re-render due to error change');
    return false;
  }

  // Less critical props - only check if critical ones are the same
  if (prevProps.status !== nextProps.status) {
    console.log('[ARTIFACT_MEMO] Re-render due to status change');
    return false;
  }

  // Skip deep comparisons of complex objects if critical props haven't changed
  // This prevents unnecessary re-renders from objects that are recreated but functionally identical

  console.log(
    '[ARTIFACT_MEMO] Preventing re-render - no critical changes detected',
  );
  return true; // Prevent re-render
});
