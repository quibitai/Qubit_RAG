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

const logger = {
  info: (...args: any[]) => console.log('[Artifact.tsx]', ...args),
  warn: (...args: any[]) => console.warn('[Artifact.tsx]', ...args),
  error: (...args: any[]) => console.error('[Artifact.tsx]', ...args),
};

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
  status: 'streaming' | 'idle' | 'loading' | 'complete' | 'error';
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
  status: chatStatus,
  stop,
  attachments,
  setAttachments,
  append,
  messages,
  setMessages,
  reload,
  votes,
  isReadonly,
  documentId: initialDocumentId,
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
  onClose: () => void;
  onContentSaved?: (docId: string, newContent: string) => void;
}) {
  const { artifact, isLoading, isStreaming, error } =
    useArtifact(initialDocumentId);

  const { open: isSidebarOpen } = useSidebar();

  const {
    documentId,
    title,
    kind,
    content: displayContent,
    status: artifactStatus,
    isVisible,
  } = artifact;

  const [isContentDirty, setIsContentDirty] = useState(false);
  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const [metadata, setMetadata] = useState<any>({});

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
      if (updatedContent === displayContent) {
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
    [
      documentId,
      displayContent,
      debouncedHandleContentChange,
      handleContentChange,
    ],
  );

  function getDocumentContentById(index: number) {
    // Since we're not fetching documents anymore, just return current content
    return displayContent || '';
  }

  const handleVersionChange = (type: 'next' | 'prev' | 'toggle' | 'latest') => {
    // Version changes not supported for streaming artifacts
    console.log(
      '[handleVersionChange] Version changes not supported for streaming artifacts',
    );
  };

  const isCurrentVersion = true; // Always current version since we're not fetching document history

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;

  const artifactDefinition = artifactDefinitions.find(
    (def) => def.kind === kind,
  );

  const Component = artifactDefinition
    ? (artifactDefinition as any).component
    : null;

  // const onRun = useCallback(
  //   (value?: string) => {
  //     if (
  //       !artifactDefinition ||
  //       !('onRun' in artifactDefinition) ||
  //       !artifactDefinition.onRun
  //     )
  //       return;
  //     artifactDefinition.onRun({
  //       content: value ?? displayContent,
  //       append,
  //       reload,
  //       stop,
  //       chatId,
  //       messages,
  //       setInput,
  //     });
  //   },
  //   [
  //     artifactDefinition,
  //     displayContent,
  //     append,
  //     reload,
  //     stop,
  //     chatId,
  //     messages,
  //     setInput,
  //   ],
  // );

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
    documentId: documentId,
    title: title,
    kind: kind,
    contentLength: displayContent?.length || 0,
    isVisible: isVisible,
    status: artifactStatus,
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
                    status={chatStatus}
                    votes={votes}
                    messages={messages}
                    setMessages={setMessages}
                    reload={reload}
                    isReadonly={isReadonly}
                    artifactStatus={artifactStatus}
                  />
                </div>

                <div className="flex-shrink-0">
                  <form className="flex flex-row gap-2 relative items-end w-full px-4 pb-4">
                    <MultimodalInput
                      chatId={chatId}
                      input={input}
                      setInput={setInput}
                      handleSubmit={handleSubmit}
                      status={chatStatus}
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
            <header className="flex h-14 shrink-0 items-center justify-between border-b bg-muted/40 px-4">
              <div className="flex items-center gap-2">
                {getIconForKind(kind)}
                <h2 className="text-lg font-semibold">{title || 'Document'}</h2>
                {artifactStatus === 'streaming' && (
                  <span className="text-sm text-muted-foreground ml-2">
                    (Streaming...)
                  </span>
                )}
                {isLoading && artifactStatus !== 'streaming' && (
                  <span className="text-sm text-muted-foreground ml-2">
                    (Loading...)
                  </span>
                )}
                {error && (
                  <span className="text-sm text-destructive ml-2">Error</span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {/* Toolbar temporarily disabled due to interface mismatch */}
                {/* <Toolbar
                  isToolbarVisible={isToolbarVisible}
                  setIsToolbarVisible={setIsToolbarVisible}
                  append={append}
                  status={chatStatus}
                  stop={stop}
                  setMessages={setMessages}
                  artifactKind={kind}
                  content={displayContent}
                  title={title}
                  kind={kind}
                /> */}
              </div>
            </header>
            <div className="flex-1 overflow-auto">
              {Component && (
                <Component
                  content={displayContent}
                  isStreaming={isStreaming}
                  isContentDirty={isContentDirty}
                  isToolbarVisible={isToolbarVisible}
                  onContentChange={saveContent}
                />
              )}
            </div>
            <div className="border-t p-2">
              <ArtifactActions
                artifact={{
                  ...artifact,
                  status: isStreaming ? 'streaming' : 'idle',
                }}
                currentVersionIndex={currentVersionIndex}
                handleVersionChange={handleVersionChange}
                isCurrentVersion={isCurrentVersion}
                mode={mode}
                metadata={metadata}
                setMetadata={setMetadata}
              />
            </div>
            {mode === 'diff' && (
              <VersionFooter
                currentVersionIndex={currentVersionIndex}
                documents={[]}
                handleVersionChange={handleVersionChange}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.input === nextProps.input &&
    prevProps.status === nextProps.status &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.documentId === nextProps.documentId &&
    equal(prevProps.attachments, nextProps.attachments) &&
    equal(prevProps.messages, nextProps.messages)
  );
});
