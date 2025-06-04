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

  // Check for artifact data associated with this message - look for artifact-end event with complete metadata
  const artifactData = (message as any).data?.find(
    (item: any) =>
      item?.type === 'artifact' &&
      item?.componentName === 'document' &&
      (item?.props?.eventType === 'artifact-end' ||
        item?.props?.status === 'completed'),
  );

  // Fallback: if no artifact-end event, look for any document artifact event
  const fallbackArtifactData = !artifactData
    ? (message as any).data?.find(
        (item: any) =>
          item?.type === 'artifact' && item?.componentName === 'document',
      )
    : null;

  const finalArtifactData = artifactData || fallbackArtifactData;

  if (finalArtifactData) {
    console.log(
      `[PurePreviewMessage ${message.id?.substring(0, 5)}] Found artifact data:`,
      {
        eventType: finalArtifactData.props?.eventType,
        documentId: finalArtifactData.props?.documentId,
        title: finalArtifactData.props?.title,
        status: finalArtifactData.props?.status,
        isArtifactEnd: finalArtifactData.props?.eventType === 'artifact-end',
        source: artifactData ? 'artifact-end' : 'fallback',
      },
    );
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
                const { toolInvocation } = part;
                const { toolName, toolCallId, state } = toolInvocation;

                if (state === 'call') {
                  const { args } = toolInvocation;

                  return (
                    <div
                      key={toolCallId}
                      className={cx({
                        skeleton: ['getWeather'].includes(toolName),
                      })}
                    >
                      {toolName === 'getWeather' ? (
                        <Weather />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview
                          isReadonly={isReadonly}
                          args={args}
                          onArtifactExpand={onArtifactExpand}
                        />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentPreview
                          isReadonly={isReadonly}
                          args={args}
                          onArtifactExpand={onArtifactExpand}
                        />
                      ) : toolName === 'requestSuggestions' ? null : null}
                    </div>
                  );
                }

                if (state === 'result') {
                  const { result } = toolInvocation;

                  console.log(
                    `[PreviewMessage] Rendering tool result for ${toolName}:`,
                    {
                      toolName,
                      toolCallId,
                      state,
                      result,
                      resultKeys: result ? Object.keys(result) : [],
                      hasOnArtifactExpand: !!onArtifactExpand,
                      hasFinalArtifactData: !!finalArtifactData,
                    },
                  );

                  return (
                    <div key={toolCallId}>
                      {toolName === 'getWeather' ? (
                        <Weather weatherAtLocation={result} />
                      ) : toolName === 'createDocument' &&
                        !finalArtifactData ? (
                        <DocumentToolResult
                          type="create"
                          result={result}
                          isReadonly={isReadonly}
                          onArtifactExpand={onArtifactExpand}
                        />
                      ) : toolName === 'updateDocument' &&
                        !finalArtifactData ? (
                        <DocumentToolResult
                          type="update"
                          result={result}
                          isReadonly={isReadonly}
                          onArtifactExpand={onArtifactExpand}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolResult
                          type="request-suggestions"
                          result={result}
                          isReadonly={isReadonly}
                          onArtifactExpand={onArtifactExpand}
                        />
                      ) : toolName === 'createDocument' ||
                        toolName === 'updateDocument' ? (
                        <div className="text-sm text-muted-foreground italic">
                          Document operation completed successfully.
                        </div>
                      ) : (
                        <MessageThinking
                          toolResult={result}
                          toolName={toolName}
                        />
                      )}
                    </div>
                  );
                }
              }
            })}

            {/* Add artifact preview rendering for artifacts in message data */}
            {finalArtifactData && (
              <div key={`artifact-${finalArtifactData.id || 'unknown'}`}>
                {(() => {
                  const documentId =
                    finalArtifactData.props?.documentId || 'unknown';
                  const rawTitle = finalArtifactData.props?.title;
                  const safeTitle = rawTitle?.trim()
                    ? rawTitle.trim()
                    : 'Document';

                  console.log(
                    `[PurePreviewMessage ${message.id?.substring(0, 5)}] Creating artifact preview:`,
                    {
                      documentId,
                      rawTitle,
                      safeTitle,
                      titleIsUndefined: rawTitle === undefined,
                      titleIsEmptyString: rawTitle === '',
                      titleIsTrimmedEmpty: rawTitle && !rawTitle.trim(),
                      finalArtifactDataProps: finalArtifactData.props,
                      hasOnArtifactExpand: !!onArtifactExpand,
                    },
                  );

                  return (
                    <DocumentToolResult
                      type="create"
                      result={{
                        id: documentId,
                        title: safeTitle,
                        kind: 'text',
                      }}
                      isReadonly={isReadonly}
                      onArtifactExpand={onArtifactExpand}
                    />
                  );
                })()}
              </div>
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
