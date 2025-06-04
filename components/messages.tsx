import type { UIMessage } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Greeting } from './greeting';
import { memo, useEffect, useCallback } from 'react';
import type { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { useArtifact } from '@/hooks/use-artifact';
import { fetcher } from '@/lib/utils';
import useSWR from 'swr';
import type { Document } from '@/lib/db/schema';

interface MessagesProps {
  chatId: string;
  status: UseChatHelpers['status'];
  votes: Array<Vote> | undefined;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  isArtifactVisible: boolean;
}

function PureMessages(props: MessagesProps) {
  const {
    chatId,
    status,
    votes,
    messages,
    setMessages,
    reload,
    isReadonly,
    isArtifactVisible,
  } = props;

  const { setArtifact } = useArtifact();

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

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
        '[Messages] handleArtifactExpand called with ID:',
        artifactId,
      );

      try {
        // Fetch the document from the database
        const documents = await fetcher(`/api/document?id=${artifactId}`);
        console.log(
          '[Messages] Fetched documents for ID:',
          artifactId,
          documents,
        );

        if (documents && documents.length > 0) {
          const document = documents[0];
          console.log('[Messages] Using document:', document);

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
            '[Messages] ✅ Artifact UI opened for document:',
            document.id,
          );
        } else {
          console.error('[Messages] ❌ No document found for ID:', artifactId);
        }
      } catch (error) {
        console.error('[Messages] ❌ Error fetching document:', error);
      }
    },
    [setArtifact],
  );

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-6 h-full overflow-y-auto overflow-x-hidden pt-4 focus:outline-none"
      tabIndex={-1}
    >
      {messages.length === 0 && <Greeting />}

      {messages.map((message, index) => {
        const isLastMessage = messages.length - 1 === index;
        const isLoading = status === 'streaming' && isLastMessage;

        return (
          <PreviewMessage
            key={message.id}
            chatId={chatId}
            message={message}
            isLoading={isLoading}
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
        );
      })}

      {status === 'submitted' &&
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' && <ThinkingMessage />}

      <div ref={messagesEndRef} className="shrink-0 min-h-[24px]" />
    </div>
  );
}

// Re-enable memoization for Messages with deep comparison
export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) return true;

  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;

  return true;
});
