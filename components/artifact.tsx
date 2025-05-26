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
import type { VisibilityType } from './visibility-selector';
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
}) {
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
    mutate: mutateDocuments,
  } = useSWR<Array<Document>>(
    isValidUUID(documentId) && artifact.status !== 'streaming'
      ? `/api/document?id=${documentId}`
      : null,
    fetcher,
  );

  const [mode, setMode] = useState<'edit' | 'diff'>('edit');
  const [document, setDocument] = useState<Document | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const [isContentDirty, setIsContentDirty] = useState(false);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);
      if (mostRecentDocument) {
        setDocument(mostRecentDocument);
        setCurrentVersionIndex(documents.length - 1);
      }
    }
  }, [documents]);

  useEffect(() => {
    mutateDocuments();
  }, [artifact.status, mutateDocuments]);

  const { mutate } = useSWRConfig();

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!documentId || documentId === 'init') return;

      mutate<Array<Document>>(
        `/api/document?id=${documentId}`,
        async (currentDocuments) => {
          if (!currentDocuments) return undefined;

          const currentDocument = currentDocuments.at(-1);

          if (!currentDocument || !currentDocument.content) {
            setIsContentDirty(false);
            return currentDocuments;
          }

          if (currentDocument.content !== updatedContent) {
            await fetch(`/api/document?id=${documentId}`, {
              method: 'POST',
              body: JSON.stringify({
                title: title,
                content: updatedContent,
                kind: kind,
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
    [documentId, title, kind, mutate],
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000,
  );

  const saveContent = useCallback(
    (updatedContent: string, debounce: boolean = true) => {
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

  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;

  const isLoading = isStreaming && !artifact.content;

  const { width: windowWidth, height: windowHeight } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind,
  );

  useEffect(() => {
    if (artifact.documentId !== 'init' && artifactDefinition) {
      if (artifactDefinition.initialize) {
        artifactDefinition.initialize({
          documentId: artifact.documentId,
          setMetadata,
        });
      }
    }
  }, [artifact.documentId, artifactDefinition, setMetadata]);

  useEffect(() => {
    setArtifact((prevArtifact) => ({
      ...prevArtifact,
      documentId: documentId || 'init',
      title: title || 'Document',
      kind: kind || ('text' as ArtifactKind),
      content: content,
      isVisible: isVisible,
      status: (isStreaming ? 'streaming' : 'idle') as 'streaming' | 'idle',
    }));
  }, [documentId, title, kind, content, isVisible, isStreaming, setArtifact]);

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

  return (
    <AnimatePresence>
      {(isVisible || artifact.isVisible) && (
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

              <div className="flex flex-col h-full justify-between items-center">
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
                artifact={artifact}
                currentVersionIndex={-1}
                handleVersionChange={handleVersionChange}
                isCurrentVersion={isCurrentVersion}
                mode={mode}
                metadata={metadata}
                setMetadata={setMetadata}
              />
            </div>

            <div className="dark:bg-muted bg-background h-full overflow-y-scroll !max-w-full items-center">
              {error && (
                <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
                  <p className="font-semibold">An error occurred:</p>
                  <p>{error}</p>
                </div>
              )}
              {!error && artifactDefinition && (
                <artifactDefinition.content
                  title={artifact.title}
                  content={
                    artifact.status === 'streaming' || !document
                      ? content
                      : (document.content ?? '')
                  }
                  mode={mode}
                  status={artifact.status}
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
              )}
              {!error && !artifactDefinition && kind && (
                <div className="p-4 text-muted-foreground">
                  Loading artifact content for type: {kind}...
                </div>
              )}

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
                    content={
                      artifact.status === 'streaming' || !document
                        ? content
                        : (document.content ?? '')
                    }
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
  if (prevProps.status !== nextProps.status) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (prevProps.content !== nextProps.content) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.documentId !== nextProps.documentId) return false;
  if (prevProps.title !== nextProps.title) return false;
  if (prevProps.kind !== nextProps.kind) return false;
  if (prevProps.error !== nextProps.error) return false;
  if (prevProps.onClose !== nextProps.onClose) return false;

  return true;
});
