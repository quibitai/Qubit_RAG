import { Artifact } from '@/components/create-artifact';
import { DiffView } from '@/components/diffview';
import { DocumentSkeleton } from '@/components/document-skeleton';
import { Editor } from '@/components/text-editor';
import { Markdown } from '@/components/markdown';
import {
  ClockRewind,
  CopyIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
} from '@/components/icons';
import type { Suggestion } from '@/lib/db/schema';
import { toast } from 'sonner';
import { getSuggestions } from '../actions';
import type { Attachment } from 'ai';
import { useEffect, useRef, useState } from 'react';

interface TextArtifactMetadata {
  suggestions: Array<Suggestion>;
  // Track processed content hashes to prevent duplicate processing
  processedContentHashes: Set<string>;
  // Track the last content length to detect significant changes
  lastContentLength: number;
}

// Smart scrolling container for autoscroll during streaming
function StreamingScrollContainer({
  children,
  isStreaming,
}: {
  children: React.ReactNode;
  isStreaming: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const lastScrollTop = useRef(0);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (isStreaming && autoScrollEnabled && containerRef.current) {
      const container = containerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [children, isStreaming, autoScrollEnabled]);

  // Handle scroll events to detect user scrolling
  const handleScroll = () => {
    if (!containerRef.current || !isStreaming) return;

    const container = containerRef.current;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px threshold

    // If user scrolled up during streaming, disable autoscroll
    if (scrollTop < lastScrollTop.current && !isAtBottom) {
      setUserScrolledUp(true);
      setAutoScrollEnabled(false);
      console.log('[StreamingScroll] User scrolled up - disabling autoscroll');
    }

    // If user scrolls back to bottom, re-enable autoscroll
    if (isAtBottom && userScrolledUp) {
      setUserScrolledUp(false);
      setAutoScrollEnabled(true);
      console.log('[StreamingScroll] User at bottom - re-enabling autoscroll');
    }

    lastScrollTop.current = scrollTop;
  };

  // Reset autoscroll when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setAutoScrollEnabled(true);
      setUserScrolledUp(false);
      console.log('[StreamingScroll] Streaming started - enabling autoscroll');
    }
  }, [isStreaming]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto"
    >
      {children}
    </div>
  );
}

export const textArtifact = new Artifact<'text', TextArtifactMetadata>({
  kind: 'text',
  description: 'Useful for text content, like drafting essays and emails.',
  initialize: async ({ documentId, setMetadata }) => {
    // Temporarily disable suggestions fetching to prevent duplicate API calls
    // const suggestions = await getSuggestions({ documentId });

    setMetadata({
      suggestions: [], // Use empty array instead of fetching
      processedContentHashes: new Set<string>(),
      lastContentLength: 0,
    });
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    // Skip processing if the stream part is not a valid type
    if (!streamPart || !streamPart.type) {
      return;
    }

    if (streamPart.type === 'suggestion') {
      setMetadata((metadata) => {
        return {
          ...metadata,
          suggestions: [
            ...metadata.suggestions,
            streamPart.content as Suggestion,
          ],
        };
      });
    } else if (streamPart.type === 'text-delta') {
      const deltaContent = streamPart.content as string;

      // Skip empty content deltas
      if (!deltaContent || deltaContent.length === 0) {
        return;
      }

      // Generate a more robust hash for content tracking
      const contentHash = `${deltaContent.length}:${deltaContent.substring(0, 20)}:${Date.now()}`;

      setMetadata((metadata) => {
        // Check if we've already processed this exact content recently
        const recentHashes = Array.from(metadata.processedContentHashes);
        const duplicateFound = recentHashes.some((hash) =>
          hash.startsWith(
            `${deltaContent.length}:${deltaContent.substring(0, 20)}`,
          ),
        );

        if (duplicateFound) {
          console.log('[TextArtifact] Skipping duplicate content delta');
          return metadata;
        }

        // Keep only recent hashes to prevent memory growth
        const updatedHashes = new Set(metadata.processedContentHashes);
        if (updatedHashes.size > 100) {
          // Keep only the last 50 hashes
          const hashArray = Array.from(updatedHashes);
          updatedHashes.clear();
          hashArray.slice(-50).forEach((hash) => updatedHashes.add(hash));
        }

        updatedHashes.add(contentHash);

        return {
          ...metadata,
          processedContentHashes: updatedHashes,
          lastContentLength: metadata.lastContentLength + deltaContent.length,
        };
      });

      // Update artifact content
      setArtifact((draftArtifact) => {
        return {
          ...draftArtifact,
          content: draftArtifact.content + deltaContent,
          isVisible: true,
          status: 'streaming',
        };
      });
    } else if (streamPart.type === 'id') {
      setArtifact((draftArtifact) => {
        // Only update if ID is different
        if (draftArtifact.documentId === streamPart.content) {
          return draftArtifact;
        }

        // Reset metadata when we get a new document ID
        setMetadata((metadata) => ({
          ...metadata,
          processedContentHashes: new Set<string>(),
          lastContentLength: 0,
        }));

        return {
          ...draftArtifact,
          documentId: streamPart.content as string,
          isVisible: true,
        };
      });
    } else if (streamPart.type === 'title') {
      setArtifact((draftArtifact) => {
        // Only update if title is different
        if (draftArtifact.title === streamPart.content) {
          return draftArtifact;
        }

        return {
          ...draftArtifact,
          title: streamPart.content as string,
          isVisible: true,
        };
      });
    } else if (streamPart.type === 'finish') {
      console.log('[TextArtifact] Finish event received, finalizing content');

      // Clear our tracking state on finish
      setMetadata((metadata) => ({
        ...metadata,
        processedContentHashes: new Set<string>(),
      }));

      setArtifact((draftArtifact) => {
        // Only update status if currently streaming to avoid unnecessary renders
        if (draftArtifact.status === 'streaming') {
          return {
            ...draftArtifact,
            status: 'idle',
            isVisible: true,
          };
        }
        return draftArtifact;
      });
    }
  },
  content: ({
    mode,
    status,
    content,
    isCurrentVersion,
    currentVersionIndex,
    onSaveContent,
    getDocumentContentById,
    isLoading,
    metadata,
  }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    if (mode === 'diff') {
      const oldContent = getDocumentContentById(currentVersionIndex - 1);
      const newContent = getDocumentContentById(currentVersionIndex);

      return <DiffView oldContent={oldContent} newContent={newContent} />;
    }

    // If mode is 'edit' (since diff is handled above)
    if (isCurrentVersion) {
      // Current version, show Editor. Editor can use 'status' to manage editability during streaming.
      return (
        <StreamingScrollContainer isStreaming={status === 'streaming'}>
          <div className="flex flex-row py-2 md:py-4 px-3 md:px-6">
            <Editor
              content={content}
              suggestions={metadata?.suggestions || []}
              isCurrentVersion={isCurrentVersion}
              currentVersionIndex={currentVersionIndex}
              status={status}
              onSaveContent={onSaveContent}
            />
            {metadata?.suggestions && metadata.suggestions.length > 0 ? (
              <div className="md:hidden h-dvh w-12 shrink-0" />
            ) : null}
          </div>
        </StreamingScrollContainer>
      );
    }

    // Not current version, but mode is 'edit'. Show read-only Markdown of the specific version.
    const versionContent = getDocumentContentById(currentVersionIndex);
    return (
      <StreamingScrollContainer isStreaming={status === 'streaming'}>
        <div className="flex flex-row py-2 md:py-4 px-3 md:px-6">
          <div className="prose prose-gray dark:prose-invert prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 max-w-none">
            <Markdown>{versionContent}</Markdown>
          </div>
        </div>
      </StreamingScrollContainer>
    );
  },
  actions: [
    {
      icon: <ClockRewind size={18} />,
      description: 'View changes',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('toggle');
      },
      isDisabled: ({ currentVersionIndex }) => {
        return currentVersionIndex === 0;
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: 'View Previous version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('prev');
      },
      isDisabled: ({ currentVersionIndex }) => {
        return currentVersionIndex === 0;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: 'View Next version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('next');
      },
      isDisabled: ({ isCurrentVersion }) => {
        return isCurrentVersion;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy to clipboard',
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success('Copied to clipboard!');
      },
    },
  ],
  toolbar: [
    {
      icon: <PenIcon />,
      description: 'Add final polish',
      onClick: ({ appendMessage, content, title, kind }) => {
        const fullMessage = `Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly. Here is the current draft for your review:

---
**Document Title: ${title || 'Untitled Document'}**
${content}
---
`;
        appendMessage({
          role: 'user',
          content: fullMessage,
          experimental_attachments: [
            {
              contentType: 'text/plain',
              name: title || 'document.txt',
              url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
            } as unknown as Attachment,
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: 'Request suggestions',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content:
            'Please add suggestions you have that could improve the writing.',
        });
      },
    },
  ],
});
