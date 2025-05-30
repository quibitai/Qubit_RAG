'use client';

import type { Attachment, UIMessage } from 'ai';
import cx from 'classnames';
import type React from 'react';
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

import { ArrowUpIcon, PlusIcon, StopIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';

export interface MultimodalInputProps {
  chatId: string;
  input: UseChatHelpers['input'];
  setInput: UseChatHelpers['setInput'];
  status: UseChatHelpers['status'];
  stop: () => void;
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  append: UseChatHelpers['append'];
  handleSubmit: UseChatHelpers['handleSubmit'];
  className?: string;
  onFileProcessed?: (fileMeta: {
    filename: string;
    contentType: string;
    url: string;
    extractedText: string;
  }) => void;
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
  handleSubmit,
  className,
  onFileProcessed,
}: MultimodalInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '98px';
    }
  };

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    'input',
    '',
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || '';
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);
  const [isDragging, setIsDragging] = useState(false);

  const submitForm = useCallback(() => {
    window.history.replaceState({}, '', `/chat/${chatId}`);

    handleSubmit(undefined, {
      experimental_attachments: attachments,
    });

    setAttachments([]);
    setLocalStorageInput('');
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    attachments,
    handleSubmit,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
  ]);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        const { url, pathname, contentType } = data;
        return {
          url,
          name: pathname,
          contentType: contentType,
        };
      } else {
        // Handle error from the server
        const errorMessage = data.error || 'Failed to upload file';
        toast.error(errorMessage);
        console.error('Upload error:', errorMessage);
        return undefined;
      }
    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Failed to upload file, please try again!');
      return undefined;
    }
  };

  const extractFileContent = async (file: File) => {
    try {
      // Create FormData for the extraction API
      const formData = new FormData();
      formData.append('file', file);

      console.log(
        `[MultimodalInput] Extracting content from file "${file.name}"`,
      );

      // Send the file to our extraction API which connects to n8n
      const response = await fetch('/api/files/extract', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Error ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.success || !data.extractedContent) {
        throw new Error('Extraction failed: No content returned');
      }

      console.log(
        `[MultimodalInput] Successfully extracted content from "${file.name}"`,
      );

      // Return the extracted content as a success result
      // This will be used as metadata with the file attachment
      return {
        success: true,
        extractedContent: data.extractedContent,
      };
    } catch (error) {
      console.error('[MultimodalInput] File extraction error:', error);
      toast.error(
        `Failed to extract content: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { success: false };
    }
  };

  const handleFileUploadAndExtract = async (files: File[]) => {
    if (files.length === 0) return;

    setUploadQueue(files.map((file) => file.name));

    try {
      // For each file, first try to extract content for text-based files
      const processPromises = files.map(async (file) => {
        // Process text-based files with extraction
        if (
          file.type.includes('text/') ||
          file.type.includes('application/pdf') ||
          file.type.includes('application/msword') ||
          file.type.includes('application/vnd.openxmlformats-officedocument') ||
          file.type.includes('application/json') ||
          file.name.endsWith('.md')
        ) {
          // Try to extract content first
          const extractionResult = await extractFileContent(file);

          // Upload the file regardless of extraction success
          const uploadResult = await uploadFile(file);

          if (uploadResult && extractionResult.success) {
            // Notify parent component about processed file with extracted content
            if (onFileProcessed) {
              onFileProcessed({
                filename: file.name,
                contentType: file.type,
                url: uploadResult.url,
                extractedText: extractionResult.extractedContent,
              });
            }

            // Attach the extracted content as metadata to the file attachment
            return {
              ...uploadResult,
              metadata: {
                extractedContent: extractionResult.extractedContent,
              },
            };
          }

          return uploadResult;
        } else {
          // For other files like images, just upload
          return uploadFile(file);
        }
      });

      const results = await Promise.all(processPromises);

      // Filter out nulls (files that failed to upload)
      const successfulAttachments = results.filter(
        (attachment): attachment is NonNullable<typeof attachment> =>
          attachment !== null && attachment !== undefined,
      );

      // Add successfully uploaded files to attachments
      if (successfulAttachments.length > 0) {
        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfulAttachments,
        ]);
      }
    } catch (error) {
      console.error('[MultimodalInput] Error processing files:', error);
      toast.error('Error processing files. Please try again.');
    } finally {
      setUploadQueue([]);
    }
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      await handleFileUploadAndExtract(files);

      // Clear the file input value to allow re-uploading the same file
      if (event.target.value) {
        event.target.value = '';
      }
    },
    [handleFileUploadAndExtract],
  );

  // Drag and drop handlers
  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (status !== 'ready') return;
      setIsDragging(true);
    },
    [status],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (status !== 'ready') return;
      if (!isDragging) setIsDragging(true);
    },
    [isDragging, status],
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const dropHandler = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      if (event.dataTransfer && event.dataTransfer.files.length > 0) {
        const files = Array.from(event.dataTransfer.files);
        await handleFileUploadAndExtract(files);
      }
    },
    [handleFileUploadAndExtract],
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const clipboardItems = event.clipboardData?.items;
      if (!clipboardItems) return;

      const files: File[] = [];

      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];

        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        await handleFileUploadAndExtract(files);
      }
    },
    [handleFileUploadAndExtract],
  );

  useEffect(() => {
    const pasteHandler = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      handlePaste(e);
    };

    window.addEventListener('paste', pasteHandler);

    return () => {
      window.removeEventListener('paste', pasteHandler);
    };
  }, [handlePaste]);

  return (
    <div
      className={cx(
        'relative w-full flex flex-col gap-4',
        isDragging &&
          'after:absolute after:inset-0 after:rounded-2xl after:border-2 after:border-dashed after:border-primary after:bg-primary/5 after:pointer-events-none',
      )}
      role="button"
      tabIndex={0}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={dropHandler}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-card p-4 rounded-lg shadow-lg">
            <p className="font-medium text-primary">Drop files to upload</p>
          </div>
        </div>
      )}

      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions append={append} chatId={chatId} />
        )}

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
        accept=".txt,.md,.csv,.json,.js,.py,.html,.css,.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
      />

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div
          data-testid="attachments-preview"
          className="flex flex-row gap-2 overflow-x-scroll items-end"
        >
          {attachments.map((attachment) => (
            <PreviewAttachment key={attachment.url} attachment={attachment} />
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={filename}
              attachment={{
                url: '',
                name: filename,
                contentType: '',
              }}
              isUploading={true}
            />
          ))}
        </div>
      )}

      <Textarea
        data-testid="multimodal-input"
        ref={textareaRef}
        placeholder="Send a message..."
        value={input}
        onChange={handleInput}
        className={cx(
          'min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base bg-white dark:bg-black text-black dark:text-white pb-10 border-zinc-200 dark:border-zinc-700',
          className,
        )}
        rows={2}
        autoFocus
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();

            if (status !== 'ready') {
              toast.error('Please wait for the model to finish its response!');
            } else {
              submitForm();
            }
          }
        }}
      />

      <div className="absolute bottom-0 inset-x-0 p-2 flex flex-row justify-between">
        <div className="pl-1">
          <AttachmentsButton fileInputRef={fileInputRef} status={status} />
        </div>
        <div>
          {status === 'submitted' ? (
            <StopButton stop={stop} setMessages={setMessages} />
          ) : (
            <SendButton
              input={input}
              submitForm={submitForm}
              uploadQueue={uploadQueue}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export const MultimodalInput = memo(
  ({
    chatId,
    input,
    setInput,
    status,
    stop,
    attachments,
    setAttachments,
    messages,
    setMessages,
    append,
    handleSubmit,
    className,
    onFileProcessed,
  }: MultimodalInputProps) => {
    return (
      <PureMultimodalInput
        chatId={chatId}
        input={input}
        setInput={setInput}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        messages={messages}
        setMessages={setMessages}
        append={append}
        handleSubmit={handleSubmit}
        className={className}
        onFileProcessed={onFileProcessed}
      />
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.chatId === nextProps.chatId &&
      prevProps.input === nextProps.input &&
      prevProps.status === nextProps.status &&
      equal(prevProps.attachments, nextProps.attachments) &&
      equal(prevProps.messages, nextProps.messages)
    );
  },
);

function PureAttachmentsButton({
  fileInputRef,
  status,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers['status'];
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid="attachments-button"
          variant="ghost"
          size="icon"
          type="button"
          className="size-6 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-1 focus-visible:ring-primary transition-colors"
          aria-label="Attach files"
          disabled={status !== 'ready'}
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          <PlusIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Attach files</TooltipContent>
    </Tooltip>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers['setMessages'];
}) {
  return (
    <Button
      data-testid="stop-button"
      variant="outline"
      className="rounded-full p-1.5 h-fit border-white dark:border-black bg-white dark:bg-black text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-black hover:text-black dark:hover:text-white"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({
  submitForm,
  input,
  uploadQueue,
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
}) {
  return (
    <Button
      data-testid="send-button"
      variant="outline"
      className="rounded-full p-1.5 h-fit border-white dark:border-black bg-white dark:bg-black text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-black hover:text-black dark:hover:text-white"
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={input.length === 0 || uploadQueue.length > 0}
    >
      <ArrowUpIcon size={14} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length)
    return false;
  if (prevProps.input !== nextProps.input) return false;
  return true;
});
