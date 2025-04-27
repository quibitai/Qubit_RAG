'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { toast } from 'sonner';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { ChatPaneToggle } from './ChatPaneToggle';

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { mutate } = useSWRConfig();

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    status,
    stop,
    reload,
  } = useChat({
    id,
    api: '/api/brain',
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      console.error('Chat error:', error);
      toast.error('An error occurred, please try again!');
    },
    onResponse: (response) => {
      const originalBody = response.body;

      if (!originalBody) return;

      const { readable, writable } = new TransformStream();
      const reader = originalBody.getReader();
      const decoder = new TextDecoder();

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              writable.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });

            const debugMatches = chunk.match(/data: (.*?)\n\n/g);
            if (debugMatches?.length) {
              for (const match of debugMatches) {
                try {
                  const jsonStr = match.replace(/^data: /, '').trim();
                  const debugData = JSON.parse(jsonStr);

                  if (
                    debugData.type === 'debug' &&
                    Array.isArray(debugData.toolCalls)
                  ) {
                    console.log(
                      `[Chat] Processing ${debugData.toolCalls.length} tool calls`,
                    );

                    const event = new CustomEvent('debug-tool-calls', {
                      detail: debugData.toolCalls,
                    });
                    window.dispatchEvent(event);
                  }
                } catch (e) {
                  console.error('[Chat] Failed to process debug data:', e);
                }
              }
            }

            const writer = writable.getWriter();
            writer.write(value);
            writer.releaseLock();
          }
        } catch (e) {
          console.error('[Chat] Stream processing error:', e);
          writable.abort(e);
        }
      };

      pump();

      const newResponse = new Response(readable, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });

      Object.defineProperty(response, 'body', {
        value: newResponse.body,
      });
    },
  });

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <div className="relative">
          <ChatHeader
            chatId={id}
            selectedModelId={selectedChatModel}
            selectedVisibilityType={selectedVisibilityType}
            isReadonly={isReadonly}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <ChatPaneToggle />
          </div>
        </div>

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              append={append}
            />
          )}
        </form>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
      />
    </>
  );
}
