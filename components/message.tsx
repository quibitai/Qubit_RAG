'use client';

import type { UIMessage } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';
import type { Vote } from '@/lib/db/schema';
import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon } from './icons';
import { Markdown } from './markdown';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import { MessageThinking } from './message-thinking';
import type { UseChatHelpers } from '@ai-sdk/react';
import { UserIcon } from './icons';

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  reload,
  isReadonly,
  onArtifactExpand,
}: {
  chatId: string;
  message: UIMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers['setMessages'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  onArtifactExpand?: (artifactId: string) => void;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  // Add a clear log to see when PurePreviewMessage renders and with what props
  console.log(
    `[PurePreviewMessage ${message.id?.substring(0, 5)}] Rendering. isLoading: ${isLoading}, Content: "${typeof message.content === 'string' ? message.content.substring(0, 30) : 'N/A'}"`,
  );

  // Enhanced debugging for message data and artifact detection
  console.log(
    `[PurePreviewMessage ${message.id?.substring(0, 5)}] Message data:`,
    {
      hasData: !!(message as any).data,
      dataLength: (message as any).data?.length || 0,
      dataItems: (message as any).data || [],
    },
  );

  // Find the conclusive 'artifact-end' event from the message data, if it exists.
  // This will be the single source of truth for rendering a document preview.
  let artifactPreviewProps = null;
  const data = (message as any).data;
  if (data && Array.isArray(data)) {
    // Find the 'end' event specifically. It should have the final, correct metadata.
    const conclusiveArtifactEvent = data.find(
      (item: any) =>
        item?.type === 'artifact' && item?.props?.eventType === 'artifact-end',
    );

    if (conclusiveArtifactEvent && conclusiveArtifactEvent.props) {
      // Ensure the props contain valid id and title before setting
      if (
        conclusiveArtifactEvent.props.documentId &&
        conclusiveArtifactEvent.props.title
      ) {
        artifactPreviewProps = {
          id: conclusiveArtifactEvent.props.documentId,
          title: conclusiveArtifactEvent.props.title,
          kind: conclusiveArtifactEvent.props.kind || 'text',
        };
        console.log(
          '[PreviewMessage] Preparing to render DocumentToolResult with props:',
          artifactPreviewProps,
        );
      } else {
        console.warn(
          '[PreviewMessage] Found artifact-end event but it is missing documentId or title.',
          conclusiveArtifactEvent.props,
        );
      }
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {message.experimental_attachments && (
              <div
                data-testid={`message-attachments`}
                className="flex flex-row justify-end gap-2"
              >
                {message.experimental_attachments.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}

            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (type === 'reasoning') {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={part.reasoning}
                  />
                );
              }

              if (type === 'text') {
                if (mode === 'view') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      {message.role === 'user' && !isReadonly && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="message-edit-button"
                              variant="ghost"
                              className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                              onClick={() => {
                                setMode('edit');
                              }}
                            >
                              <PencilEditIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit message</TooltipContent>
                        </Tooltip>
                      )}

                      <div
                        data-testid="message-content"
                        className={cn('flex flex-col gap-4', {
                          'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                            message.role === 'user',
                        })}
                      >
                        <Markdown>
                          {typeof part.text === 'string'
                            ? part.text
                                .replace(/<think>.*?<\/think>/gs, '')
                                .trim()
                            : ''}
                        </Markdown>
                      </div>
                    </div>
                  );
                }

                if (mode === 'edit') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      <div className="size-8" />

                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        reload={reload}
                      />
                    </div>
                  );
                }
              }

              if (type === 'tool-invocation') {
                // We no longer render previews from the tool call itself.
                // The definitive preview is rendered from the 'tool-result'.
                return null;
              }

              // The 'tool-result' part is now only used as a signal to maybe
              // render the preview based on the data stream. We will render the
              // conclusive artifact preview *after* the loop.
              return null;
            })}

            {/* 
              Render the conclusive artifact preview here, outside the parts loop.
              This ensures it's rendered only once for the entire message, based on
              the 'artifact-end' event found in the message.data stream.
            */}
            {artifactPreviewProps && (
              <DocumentToolResult
                isReadonly={isReadonly}
                type="create"
                result={artifactPreviewProps}
                onArtifactExpand={onArtifactExpand}
              />
            )}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    // Only re-render if streaming state or content changes, or if message id changes
    if (prevProps.isLoading !== nextProps.isLoading) {
      // console.log(`[PreviewMessage.memo ${prevProps.message.id.substring(0,5)}] RERENDER because isLoading changed`);
      return false;
    }
    if (prevProps.message.id !== nextProps.message.id) {
      // console.log(`[PreviewMessage.memo ${prevProps.message.id.substring(0,5)}] RERENDER because message.id changed`);
      return false;
    }
    if (prevProps.message.content !== nextProps.message.content) {
      // console.log(`[PreviewMessage.memo ${prevProps.message.id.substring(0,5)}] RERENDER because message.content changed`);
      return false;
    }
    if (!equal(prevProps.message.parts, nextProps.message.parts)) {
      // console.log(`[PreviewMessage.memo ${prevProps.message.id.substring(0,5)}] RERENDER because message.parts changed`);
      return false;
    }
    if (!equal(prevProps.vote, nextProps.vote)) {
      // console.log(`[PreviewMessage.memo ${prevProps.message.id.substring(0,5)}] RERENDER because vote changed`);
      return false;
    }
    if (prevProps.isReadonly !== nextProps.isReadonly) {
      // console.log(`[PreviewMessage.memo ${prevProps.message.id.substring(0,5)}] RERENDER because isReadonly changed`);
      return false;
    }
    // console.log(`[PreviewMessage.memo ${prevProps.message.id.substring(0,5)}] Props ARE equal, skipping re-render.`);
    return true; // Props are equal
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full mx-auto max-w-3xl px-4 group/message "
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Hmm...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
