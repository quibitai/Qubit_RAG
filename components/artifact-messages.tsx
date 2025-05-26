import { PreviewMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import type { Vote } from '@/lib/db/schema';
import type { UIMessage } from 'ai';
import { memo, useEffect } from 'react';
import equal from 'fast-deep-equal';
import type { UIArtifact } from './artifact';
import type { UseChatHelpers } from '@ai-sdk/react';

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

  // Improve scroll behavior for the container
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      // Ensure the container can receive focus for keyboard scrolling
      container.setAttribute('tabindex', '-1');

      // Add wheel event listener to ensure smooth scrolling
      const handleWheel = (e: WheelEvent) => {
        // Allow normal scroll behavior and prevent event bubbling
        e.stopPropagation();
      };

      // Add keyboard event listener for arrow key scrolling
      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'PageUp' ||
          e.key === 'PageDown'
        ) {
          e.stopPropagation();
        }
      };

      container.addEventListener('wheel', handleWheel, { passive: true });
      container.addEventListener('keydown', handleKeyDown);

      return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [messagesContainerRef]);

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col gap-4 h-full items-center overflow-y-auto px-4 pt-20 scroll-smooth focus:outline-none"
      style={{
        // Ensure proper scrolling behavior
        overscrollBehavior: 'contain',
        scrollBehavior: 'smooth',
      }}
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
