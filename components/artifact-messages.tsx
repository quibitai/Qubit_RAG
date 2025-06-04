import { PreviewMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import type { Vote } from '@/lib/db/schema';
import type { UIMessage } from 'ai';
import { memo, useEffect, useCallback } from 'react';
import equal from 'fast-deep-equal';
import type { UIArtifact } from './artifact';
import type { UseChatHelpers } from '@ai-sdk/react';
import { useArtifact } from '@/hooks/use-artifact';
import { fetcher } from '@/lib/utils';

interface ArtifactMessagesProps {
  chatId: string;
  status: UseChatHelpers['status'];
  votes: Array<Vote> | undefined;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  artifactStatus: UIArtifact['status'];
}

function PureArtifactMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  reload,
  isReadonly,
}: ArtifactMessagesProps) {
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  const { setArtifact } = useArtifact();

  // Simple event handling that doesn't interfere with scrolling
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      // Just set tabindex for keyboard accessibility
      container.setAttribute('tabindex', '-1');
    }
  }, [messagesContainerRef]);

  const handleArtifactExpand = useCallback(
    async (artifactId: string) => {
      console.log(
        '[ArtifactMessages] handleArtifactExpand called with ID:',
        artifactId,
      );

      try {
        // Fetch the document from the database
        const documents = await fetcher(`/api/document?id=${artifactId}`);
        console.log(
          '[ArtifactMessages] Fetched documents for ID:',
          artifactId,
          documents,
        );

        if (documents && documents.length > 0) {
          const document = documents[0];
          console.log('[ArtifactMessages] Using document:', document);

          // Set the artifact to visible with the document data
          setArtifact({
            documentId: document.id,
            title: document.title,
            kind: document.kind,
            content: document.content || '',
            status: 'idle',
            isVisible: true,
            boundingBox: {
              top: 0,
              left: 0,
              width: 0,
              height: 0,
            },
          });

          console.log(
            '[ArtifactMessages] ✅ Artifact UI opened for document:',
            document.id,
          );
        } else {
          console.error(
            '[ArtifactMessages] ❌ No document found for ID:',
            artifactId,
          );
        }
      } catch (error) {
        console.error('[ArtifactMessages] ❌ Error fetching document:', error);
      }
    },
    [setArtifact],
  );

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col gap-4 h-full items-center overflow-y-auto px-4 pt-20 focus:outline-none"
      tabIndex={-1}
    >
      {messages.map((message, index) => (
        <PreviewMessage
          chatId={chatId}
          key={message.id}
          message={message}
          isLoading={status === 'streaming' && index === messages.length - 1}
          vote={
            votes
              ? votes.find((vote) => vote.messageId === message.id)
              : undefined
          }
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          onArtifactExpand={handleArtifactExpand}
        />
      ))}
      <div ref={messagesEndRef} className="shrink-0 min-h-[24px]" />
    </div>
  );
}

function areEqual(
  prevProps: ArtifactMessagesProps,
  nextProps: ArtifactMessagesProps,
) {
  if (
    prevProps.artifactStatus === 'streaming' &&
    nextProps.artifactStatus === 'streaming' &&
    prevProps.status !== 'streaming' &&
    nextProps.status !== 'streaming'
  ) {
    return true;
  }

  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;

  return true;
}

export const ArtifactMessages = memo(PureArtifactMessages, areEqual);
