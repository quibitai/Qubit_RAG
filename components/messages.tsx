import type { UIMessage } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Greeting } from './greeting';
import { memo, useEffect } from 'react';
import type { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';

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

// Keep debugging logs in the implementation but restore memoization
function PureMessages(props: MessagesProps) {
  const { chatId, status, votes, messages, setMessages, reload, isReadonly } =
    props;

  // Add a log to see when PureMessages itself re-renders
  console.log(
    '[PureMessages] Rendering. Message count:',
    props.messages.length,
    'Status:',
    props.status,
  );

  // Add logging when messages array changes
  useEffect(() => {
    console.log(
      '[Messages] Messages array updated:',
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content:
          typeof m.content === 'string'
            ? `${m.content.substring(0, 30)}...`
            : 'non-string content',
        parts:
          m.parts && m.parts.length > 0
            ? `${m.parts.length} parts`
            : 'no parts',
      })),
    );
  }, [messages]);

  // Add logging when status changes
  useEffect(() => {
    console.log('[Messages] Status changed:', status);
  }, [status]);

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
    >
      {messages.length === 0 && <Greeting />}

      {messages.map((message, index) => {
        const isLastMessage = messages.length - 1 === index;
        const isLoading = status === 'streaming' && isLastMessage;

        // Only log in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[Messages] Rendering message ${index}:`, {
            id: message.id,
            role: message.role,
            contentPreview:
              typeof message.content === 'string'
                ? message.content.length > 0
                  ? `${message.content.substring(0, 30)}...`
                  : '<empty string>'
                : message.content === null
                  ? '<null>'
                  : `<non-string: ${typeof message.content}>`,
            isLoading,
          });
        }

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

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

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

  if (reasonForRerender) {
    console.log('[Messages.memo] Re-rendering because:', reasonForRerender);
    return false; // Props are different, re-render
  }
  console.log('[Messages.memo] Props are equal, skipping re-render.');
  return true; // Props are equal, prevent re-render
});
