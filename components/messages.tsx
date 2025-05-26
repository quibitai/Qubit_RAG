import type { UIMessage } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Greeting } from './greeting';
import { memo } from 'react';
import type { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ArtifactKind } from './artifact';
import { CollapsedArtifact } from './collapsed-artifact';

interface MessagesProps {
  chatId: string;
  status: UseChatHelpers['status'];
  votes: Array<Vote> | undefined;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  collapsedArtifacts?: Array<{
    id: string;
    title: string;
    kind: ArtifactKind;
    content: string;
  }>;
  onArtifactExpand?: (artifactId: string) => void;
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
    collapsedArtifacts,
    onArtifactExpand,
  } = props;

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll overflow-x-hidden pt-4"
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
          />
        );
      })}

      {status === 'submitted' &&
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' && <ThinkingMessage />}

      {/* Display collapsed artifacts inline with messages */}
      {collapsedArtifacts && collapsedArtifacts.length > 0 && (
        <div className="px-4 md:max-w-3xl mx-auto w-full mb-4">
          {collapsedArtifacts.map((artifact) => (
            <div key={artifact.id} className="mb-3">
              <CollapsedArtifact
                title={artifact.title}
                kind={artifact.kind}
                content={artifact.content}
                onExpand={() => onArtifactExpand?.(artifact.id)}
              />
            </div>
          ))}
        </div>
      )}

      <div ref={messagesEndRef} className="shrink-0 min-h-[24px]" />
    </div>
  );
}

// TEMPORARILY DISABLE MEMOIZATION FOR DEBUGGING
// export const Messages = PureMessages;

// Re-enable memoization for Messages with deep comparison
export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  let reasonForRerender = '';

  if (prevProps.status !== nextProps.status) reasonForRerender += 'status ';
  if (prevProps.isReadonly !== nextProps.isReadonly)
    reasonForRerender += 'isReadonly ';
  if (prevProps.isArtifactVisible !== nextProps.isArtifactVisible)
    reasonForRerender += 'isArtifactVisible ';

  if (prevProps.messages.length !== nextProps.messages.length) {
    reasonForRerender += 'messages.length ';
  } else if (
    prevProps.messages.length > 0 &&
    nextProps.messages.length > 0 &&
    prevProps.messages[prevProps.messages.length - 1] !==
      nextProps.messages[nextProps.messages.length - 1]
  ) {
    if (!equal(prevProps.messages, nextProps.messages)) {
      reasonForRerender += 'messages_deep_equal ';
    }
  } else if (
    prevProps.messages.length === 0 &&
    nextProps.messages.length === 0
  ) {
    // Both empty, no change
  } else {
    if (!equal(prevProps.messages, nextProps.messages)) {
      reasonForRerender += 'messages_deep_equal ';
    }
  }

  if (!equal(prevProps.votes, nextProps.votes)) reasonForRerender += 'votes ';

  if (!equal(prevProps.collapsedArtifacts, nextProps.collapsedArtifacts)) {
    reasonForRerender += 'collapsedArtifacts ';
  }

  return !reasonForRerender; // Return true if no reason to re-render (props are equal)
});
