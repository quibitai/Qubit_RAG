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

interface TextArtifactMetadata {
  suggestions: Array<Suggestion>;
  // Track processed content hashes to prevent duplicate processing
  processedContentHashes: Set<string>;
  // Track the last content length to detect significant changes
  lastContentLength: number;
}

export const textArtifact = new Artifact<'text', TextArtifactMetadata>({
  kind: 'text',
  description: 'Useful for text content, like drafting essays and emails.',
  initialize: async ({ documentId, setMetadata }) => {
    const suggestions = await getSuggestions({ documentId });

    setMetadata({
      suggestions,
      processedContentHashes: new Set<string>(),
      lastContentLength: 0,
    });
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    // Skip processing if the stream part is not a valid type
    if (!streamPart || !streamPart.type) {
      console.log('[TextArtifact] Invalid stream part received, skipping');
      return;
    }

    console.log(
      `[TextArtifact] Processing stream part of type: ${streamPart.type}`,
    );

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
        console.log('[TextArtifact] Empty text-delta received, skipping');
        return;
      }

      // Generate a simple hash of the content for tracking
      const contentHash = `${deltaContent.length}:${deltaContent.substring(0, 10)}`;

      console.log(
        `[TextArtifact] Processing text-delta with contentHash: ${contentHash}, length: ${deltaContent.length}`,
      );

      setMetadata((metadata) => {
        // Check if we've already processed this exact content
        if (metadata.processedContentHashes.has(contentHash)) {
          console.log(
            '[TextArtifact] Duplicate content detected, skipping',
            contentHash,
          );
          return metadata;
        }

        // Add this content hash to our processed set
        const updatedHashes = new Set(metadata.processedContentHashes);
        updatedHashes.add(contentHash);

        console.log(
          `[TextArtifact] New content hash added. Total unique deltas: ${updatedHashes.size}`,
        );

        return {
          ...metadata,
          processedContentHashes: updatedHashes,
          lastContentLength: metadata.lastContentLength + deltaContent.length,
        };
      });

      // Now handle the artifact update with the new content
      setArtifact((draftArtifact) => {
        // Use a functional update to ensure we're working with the latest state
        console.log(
          '[TextArtifact] Updating content with text-delta, delta length:',
          deltaContent.length,
          'Current artifact content length:',
          draftArtifact.content.length,
          'Will result in new length:',
          draftArtifact.content.length + deltaContent.length,
        );

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

        console.log('[TextArtifact] Setting document ID:', streamPart.content);

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

        console.log('[TextArtifact] Setting title:', streamPart.content);
        return {
          ...draftArtifact,
          title: streamPart.content as string,
          isVisible: true,
        };
      });
    } else if (streamPart.type === 'finish') {
      // Clear our tracking state on finish
      setMetadata((metadata) => ({
        ...metadata,
        processedContentHashes: new Set<string>(),
      }));

      setArtifact((draftArtifact) => {
        console.log('[TextArtifact] Finishing stream, maintaining visibility');
        return {
          ...draftArtifact,
          status: 'idle',
          isVisible: true,
        };
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

    return (
      <>
        <div className="flex flex-row py-8 md:p-20 px-4">
          {isCurrentVersion && status === 'streaming' ? (
            <Editor
              content={content}
              suggestions={metadata?.suggestions || []}
              isCurrentVersion={isCurrentVersion}
              currentVersionIndex={currentVersionIndex}
              status={status}
              onSaveContent={onSaveContent}
            />
          ) : (
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <Markdown>{content}</Markdown>
            </div>
          )}

          {metadata?.suggestions && metadata.suggestions.length > 0 ? (
            <div className="md:hidden h-dvh w-12 shrink-0" />
          ) : null}
        </div>
      </>
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
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content:
            'Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.',
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
