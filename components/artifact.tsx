import type { Attachment, UIMessage } from 'ai';
import { formatDistance } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
  useMemo,
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

// Add a type guard for UUID validation
const isValidUUID = (id: string | null | undefined): boolean => {
  if (!id || id === '') return false;
  // Simple UUID v4 regex
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    id,
  );
};

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
  streamingDocumentId,
  streamingTitle,
  streamingKind,
  streamingContent,
  isStreaming,
  isVisible: isStreamingVisible,
  error: streamingError,
  onClose,
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
  streamingDocumentId: string | null;
  streamingTitle: string | null;
  streamingKind: ArtifactKind | null;
  streamingContent: string;
  isStreaming: boolean;
  isVisible: boolean;
  error: string | null;
  onClose: () => void;
}) {
  console.log(
    '[CLIENT ARTIFACT_COMPONENT RENDER] Props received => isVisible (isStreamingVisible):',
    isStreamingVisible,
    '| streamingDocId:',
    streamingDocumentId,
    '| streamingKind:',
    streamingKind,
    '| isStreaming:',
    isStreaming,
    '| streamingError:',
    streamingError,
    '| streamingContent length:',
    streamingContent?.length || 0,
  );

  // ENHANCED DEBUGGING - Add clear console markers for visibility
  console.log('============== ARTIFACT COMPONENT RENDER ==============');
  console.log('[PureArtifact] COMPONENT MOUNTED/UPDATED with props:', {
    streamingDocumentId,
    streamingTitle,
    streamingKind,
    streamingContentLength: streamingContent?.length || 0,
    isStreaming,
    isStreamingVisible,
    streamingError,
    chatId,
  });

  // Most important visibility debugging
  console.log(
    `[PureArtifact] VISIBILITY STATUS: ${isStreamingVisible ? 'VISIBLE ✅' : 'HIDDEN ❌'}`,
  );

  // Log incoming props for debugging
  console.debug('[PureArtifact] Props received:', {
    isStreaming,
    isStreamingVisible,
    streamingError,
    streamingKind,
    streamingTitle,
    streamingDocumentId,
  });

  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();

  // Log current local artifact state
  console.debug(
    '[PureArtifact] Current local artifact state from useArtifact:',
    artifact,
  );

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    isValidUUID(artifact.documentId) && artifact.status !== 'streaming'
      ? `/api/document?id=${artifact.documentId}`
      : null,
    fetcher,
  );

  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);

  const { open: isSidebarOpen } = useSidebar();

  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);

      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          content: mostRecentDocument.content ?? '',
        }));
      }
    }
  }, [documents, setArtifact]);

  useEffect(() => {
    mutateDocuments();
  }, [artifact.status, mutateDocuments]);

  const { mutate } = useSWRConfig();
  const [isContentDirty, setIsContentDirty] = useState(false);

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!artifact || !isValidUUID(artifact.documentId)) return;

      mutate<Array<Document>>(
        `/api/document?id=${artifact.documentId}`,
        async (currentDocuments) => {
          if (!currentDocuments) return undefined;

          const currentDocument = currentDocuments.at(-1);

          if (!currentDocument || !currentDocument.content) {
            setIsContentDirty(false);
            return currentDocuments;
          }

          if (currentDocument.content !== updatedContent) {
            await fetch(`/api/document?id=${artifact.documentId}`, {
              method: 'POST',
              body: JSON.stringify({
                title: artifact.title,
                content: updatedContent,
                kind: artifact.kind,
              }),
            });

            setIsContentDirty(false);

            const newDocument = {
              ...currentDocument,
              content: updatedContent,
              createdAt: new Date(),
            };

            return [...currentDocuments, newDocument];
          }
          return currentDocuments;
        },
        { revalidate: false },
      );
    },
    [artifact, mutate],
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000,
  );

  const saveContent = useCallback(
    (updatedContent: string, debounce: boolean) => {
      if (document && updatedContent !== document.content) {
        setIsContentDirty(true);

        if (debounce) {
          debouncedHandleContentChange(updatedContent);
        } else {
          handleContentChange(updatedContent);
        }
      }
    },
    [document, debouncedHandleContentChange, handleContentChange],
  );

  function getDocumentContentById(index: number) {
    if (!documents) return '';
    if (!documents[index]) return '';
    return documents[index].content ?? '';
  }

  const handleVersionChange = (type: 'next' | 'prev' | 'toggle' | 'latest') => {
    if (!documents) return;

    if (type === 'latest') {
      setCurrentVersionIndex(documents.length - 1);
      setMode('edit');
    }

    if (type === 'toggle') {
      setMode((mode) => (mode === 'edit' ? 'diff' : 'edit'));
    }

    if (type === 'prev') {
      if (currentVersionIndex > 0) {
        setCurrentVersionIndex((index) => index - 1);
      }
    } else if (type === 'next') {
      if (currentVersionIndex < documents.length - 1) {
        setCurrentVersionIndex((index) => index + 1);
      }
    }
  };

  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  /*
   * NOTE: if there are no documents, or if
   * the documents are being fetched, then
   * we mark it as the current version.
   */

  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind,
  );

  if (!artifactDefinition) {
    throw new Error('Artifact definition not found!');
  }

  // Memoize the content to prevent unnecessary re-renders
  const memoizedArtifactContent = useMemo(() => {
    console.log(
      '[PureArtifact] Memoizing artifact content, length:',
      artifact.content.length,
    );
    return artifact.content;
  }, [artifact.content]);

  useEffect(() => {
    if (artifact.documentId !== 'init' && isValidUUID(artifact.documentId)) {
      if (artifactDefinition.initialize) {
        artifactDefinition.initialize({
          documentId: artifact.documentId,
          setMetadata,
        });
      }
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

  useEffect(() => {
    console.debug(
      '[PureArtifact] Sync useEffect triggered. isStreamingVisible:',
      isStreamingVisible,
      'streamingKind:',
      streamingKind,
    );

    // Only update when streaming is active and visible
    if (isStreamingVisible && streamingKind) {
      // Compare with current values to avoid unnecessary updates
      const needsUpdate =
        (isValidUUID(streamingDocumentId) &&
          streamingDocumentId !== artifact.documentId) ||
        (streamingTitle && streamingTitle !== artifact.title) ||
        streamingKind !== artifact.kind ||
        isStreaming !== (artifact.status === 'streaming') ||
        artifact.isVisible !== true;

      if (needsUpdate) {
        console.debug(
          '[PureArtifact] Syncing streaming props to useArtifact state - values changed.',
        );

        setArtifact((currentArtifact) => {
          // Create a properly typed artifact state
          const newArtifactState: UIArtifact = {
            ...currentArtifact,
            // Only use documentId if it's a valid UUID
            documentId: isValidUUID(streamingDocumentId)
              ? streamingDocumentId || ''
              : currentArtifact.documentId,
            title: streamingTitle || 'Document',
            kind: streamingKind,
            isVisible: true, // Always set to true when streaming content is available
            status: isStreaming ? 'streaming' : 'idle',
          };

          // Only update content if we need to keep the existing content
          // Don't synchronize content here to avoid duplication

          console.debug(
            '[PureArtifact] New artifact state for setArtifact:',
            newArtifactState,
          );
          return newArtifactState;
        });
      } else {
        console.debug(
          '[PureArtifact] No state update needed - values unchanged.',
        );
      }
    } else if (!isStreamingVisible && artifact.isVisible) {
      // If the prop says not visible but local state is visible, attempt to hide
      console.debug(
        '[PureArtifact] Prop isVisible is false, ensuring local artifact is hidden.',
      );
      setArtifact((prev) => ({ ...prev, isVisible: false }));
    }
  }, [
    streamingDocumentId,
    streamingTitle,
    streamingKind,
    isStreaming,
    isStreamingVisible,
    setArtifact,
    artifact.isVisible,
    artifact.documentId,
    artifact.title,
    artifact.kind,
    artifact.status,
  ]);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      setArtifact((currentArtifact) => ({
        ...currentArtifact,
        isVisible: false,
      }));
    }
  }, [onClose, setArtifact]);

  // Add debug logging when key props change
  useEffect(() => {
    console.debug('[PureArtifact] Visibility changed:', isStreamingVisible);
  }, [isStreamingVisible]);

  useEffect(() => {
    if (streamingDocumentId) {
      console.debug('[PureArtifact] Document ID changed:', streamingDocumentId);
    }
  }, [streamingDocumentId]);

  useEffect(() => {
    if (streamingContent) {
      console.debug(
        '[PureArtifact] Content updated, length:',
        streamingContent.length,
        'Content preview:',
        streamingContent.substring(0, 50),
      );
    }
  }, [streamingContent]);

  // Add debug element to show content length in UI
  const debugInfo = (
    <div className="fixed bottom-4 left-4 z-[9999] bg-black text-white p-2 rounded text-xs">
      Content length: {artifact.content.length}
      <br />
      streamingContent length: {streamingContent?.length || 0}
      <br />
      isVisible: {String(artifact.isVisible)}
      <br />
      isStreamingVisible: {String(isStreamingVisible)}
      <br />
      Status: {artifact.status}
      <br />
      Kind: {artifact.kind}
      <br />
      DocumentId: {artifact.documentId?.substring(0, 8)}...
    </div>
  );

  // Force sync of streaming content to artifact content when needed
  useEffect(() => {
    // Log debugging info for easier troubleshooting
    if (streamingContent) {
      console.log(
        '[PureArtifact] FORCE SYNC CHECK - streamingContent length:',
        streamingContent.length,
        'artifact.content length:',
        artifact.content.length,
        'isStreamingVisible:',
        isStreamingVisible,
        'artifact.isVisible:',
        artifact.isVisible,
      );
    }

    // Only attempt sync if we have streaming content to sync
    if (streamingContent && streamingContent.length > 0) {
      // ALWAYS ensure visibility if we have streaming content
      if (isStreamingVisible && !artifact.isVisible) {
        console.log(
          '[PureArtifact] Forcing artifact visibility because isStreamingVisible is true',
        );
        setArtifact((current) => ({
          ...current,
          isVisible: true,
        }));
      }

      // Determine if we need to sync content (one of the following must be true):
      // 1. We have no existing content at all
      // 2. The streaming content is substantially different and not a duplicate
      const needsContentSync =
        !artifact.content ||
        artifact.content.length === 0 ||
        (streamingContent.length > artifact.content.length &&
          !streamingContent.includes(artifact.content + artifact.content));

      if (needsContentSync) {
        console.log(
          '[PureArtifact] FORCE SYNC: Syncing content. Current:',
          artifact.content.length,
          'Streaming:',
          streamingContent.length,
        );

        // Use functional update to ensure we're working with latest state
        setArtifact((current) => {
          // Skip update if content is already identical
          if (current.content === streamingContent) {
            console.log(
              '[PureArtifact] FORCE SYNC: Content already matches, skipping update',
            );
            return current;
          }

          console.log(
            '[PureArtifact] FORCE SYNC: Updating content and ensuring visibility',
          );

          return {
            ...current,
            content: streamingContent,
            isVisible: true,
            status: isStreaming ? 'streaming' : 'idle',
          };
        });
      } else {
        console.log(
          '[PureArtifact] FORCE SYNC: Content sync not needed based on conditions',
        );
      }
    }
  }, [
    streamingContent,
    artifact.content,
    setArtifact,
    isStreaming,
    isStreamingVisible,
    artifact.isVisible,
  ]);

  // Always show debug info in development
  const debugElement = process.env.NODE_ENV !== 'production' && debugInfo;

  if (streamingError && isStreamingVisible) {
    return (
      <AnimatePresence>
        {isStreamingVisible && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="bg-white rounded-md p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">
                Error Creating Document
              </h2>
              <p className="text-red-500 mb-4">{streamingError}</p>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {(isStreamingVisible || artifact.isVisible) && (
        <motion.div
          data-testid="artifact"
          className="flex flex-row h-dvh w-dvw fixed top-0 left-0 z-50 bg-transparent"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { delay: 0.4 } }}
        >
          {debugElement}

          <div
            className="fixed top-0 left-0 z-[9999] p-2 bg-yellow-300 text-black text-xs"
            style={{ display: 'none' }}
          >
            DEBUG: isStreamingVisible={String(isStreamingVisible)},
            artifact.isVisible={String(artifact.isVisible)}
          </div>

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

              <div className="flex flex-col h-full justify-between items-center gap-4">
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
            <div className="p-2 flex flex-row justify-between items-start">
              <div className="flex flex-row gap-4 items-start">
                <ArtifactCloseButton />

                <div className="flex flex-col">
                  <div className="font-medium">{artifact.title}</div>

                  {isContentDirty ? (
                    <div className="text-sm text-muted-foreground">
                      Saving changes...
                    </div>
                  ) : document ? (
                    <div className="text-sm text-muted-foreground">
                      {`Updated ${formatDistance(
                        new Date(document.createdAt),
                        new Date(),
                        {
                          addSuffix: true,
                        },
                      )}`}
                    </div>
                  ) : (
                    <div className="w-32 h-3 mt-2 bg-muted-foreground/20 rounded-md animate-pulse" />
                  )}
                </div>
              </div>

              <ArtifactActions
                artifact={artifact}
                currentVersionIndex={currentVersionIndex}
                handleVersionChange={handleVersionChange}
                isCurrentVersion={isCurrentVersion}
                mode={mode}
                metadata={metadata}
                setMetadata={setMetadata}
              />
            </div>

            <div className="dark:bg-muted bg-background h-full overflow-y-scroll !max-w-full items-center">
              {artifact.content && artifact.content.length > 0
                ? (() => {
                    // Log the content sources to understand which content is being used
                    console.log(
                      `[ARTIFACT_COMPONENT CONTENT_CHOICE] isStreaming: ${isStreaming}, streamingContent length: ${streamingContent?.length || 0}, artifact.content length: ${artifact.content?.length || 0}, isStreamingVisible: ${isStreamingVisible}, artifact.isVisible: ${artifact.isVisible}`,
                    );
                    console.log(
                      `[ARTIFACT_COMPONENT CONTENT_SAMPLE] First 50 chars: "${artifact.content?.substring(0, 50)}"`,
                    );

                    return (
                      <artifactDefinition.content
                        title={artifact.title}
                        content={
                          isCurrentVersion
                            ? memoizedArtifactContent // Use memoized content
                            : getDocumentContentById(currentVersionIndex)
                        }
                        mode={mode}
                        status={artifact.status}
                        currentVersionIndex={currentVersionIndex}
                        suggestions={[]}
                        onSaveContent={saveContent}
                        isInline={false}
                        isCurrentVersion={isCurrentVersion}
                        getDocumentContentById={getDocumentContentById}
                        isLoading={isDocumentsFetching && !artifact.content}
                        metadata={metadata}
                        setMetadata={setMetadata}
                      />
                    );
                  })()
                : (() => {
                    // Log when content is missing
                    console.log(
                      `[ARTIFACT_COMPONENT CONTENT_MISSING] No content to display. isStreaming: ${isStreaming}, streamingContent length: ${streamingContent?.length || 0}, artifact.content length: ${artifact.content?.length || 0}, isStreamingVisible: ${isStreamingVisible}, artifact.isVisible: ${artifact.isVisible}`,
                    );

                    return (
                      <div className="flex flex-col items-center justify-center h-full p-8">
                        <div className="animate-pulse bg-muted rounded-md h-6 w-3/4 mb-4" />
                        <div className="animate-pulse bg-muted rounded-md h-6 w-2/3 mb-4" />
                        <div className="animate-pulse bg-muted rounded-md h-6 w-1/2 mb-4" />
                        <div className="text-center text-muted-foreground mt-4">
                          Loading content...
                        </div>
                      </div>
                    );
                  })()}

              <AnimatePresence>
                {isCurrentVersion && (
                  <Toolbar
                    isToolbarVisible={isToolbarVisible}
                    setIsToolbarVisible={setIsToolbarVisible}
                    append={append}
                    status={status}
                    stop={stop}
                    setMessages={setMessages}
                    artifactKind={artifact.kind}
                  />
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {!isCurrentVersion && (
                <VersionFooter
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
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
  if (prevProps.status !== nextProps.status) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;
  if (prevProps.input !== nextProps.input) return false;
  if (!equal(prevProps.messages, nextProps.messages.length)) return false;

  return true;
});
