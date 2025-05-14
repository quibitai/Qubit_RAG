import { Artifact } from '@/components/create-artifact';
import {
  CopyIcon,
  LineChartIcon,
  RedoIcon,
  SparklesIcon,
  UndoIcon,
} from '@/components/icons';
import { SpreadsheetEditor } from '@/components/sheet-editor';
import { parse, unparse } from 'papaparse';
import { toast } from 'sonner';

interface SheetMetadata {
  // Track processed content hashes to prevent duplicate processing
  processedContentHashes: Set<string>;
  // Track the last content length to detect significant changes
  lastContentLength: number;
}

export const sheetArtifact = new Artifact<'sheet', SheetMetadata>({
  kind: 'sheet',
  description: 'Useful for working with spreadsheets',
  initialize: async ({ setMetadata }) => {
    setMetadata({
      processedContentHashes: new Set<string>(),
      lastContentLength: 0,
    });
  },
  onStreamPart: ({ setArtifact, streamPart, setMetadata }) => {
    // Skip processing if the stream part is not a valid type
    if (!streamPart || !streamPart.type) {
      console.log('[SheetArtifact] Invalid stream part received, skipping');
      return;
    }

    console.log(
      `[SheetArtifact] Processing stream part of type: ${streamPart.type}`,
    );

    if (streamPart.type === 'sheet-delta') {
      const deltaContent = streamPart.content as string;

      // Skip empty content
      if (!deltaContent || deltaContent.length === 0) {
        console.log('[SheetArtifact] Empty sheet-delta received, skipping');
        return;
      }

      // Generate a simple hash of the content for tracking
      const contentHash = `${deltaContent.length}:${deltaContent.substring(0, 10)}`;

      setMetadata((metadata) => {
        // Check if we've already processed this exact content
        if (metadata.processedContentHashes.has(contentHash)) {
          console.log(
            '[SheetArtifact] Duplicate content detected, skipping',
            contentHash,
          );
          return metadata;
        }

        // Add this content hash to our processed set
        const updatedHashes = new Set(metadata.processedContentHashes);
        updatedHashes.add(contentHash);

        return {
          ...metadata,
          processedContentHashes: updatedHashes,
          lastContentLength: deltaContent.length, // For sheet-delta, we replace the content
        };
      });

      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: deltaContent,
        isVisible: true,
        status: 'streaming',
      }));
    }

    if (streamPart.type === 'text-delta') {
      const deltaContent = streamPart.content as string;

      // Skip empty content
      if (!deltaContent || deltaContent.length === 0) {
        console.log('[SheetArtifact] Empty text-delta received, skipping');
        return;
      }

      // Generate a simple hash of the content for tracking
      const contentHash = `${deltaContent.length}:${deltaContent.substring(0, 10)}`;

      setMetadata((metadata) => {
        // Check if we've already processed this exact content
        if (metadata.processedContentHashes.has(contentHash)) {
          console.log(
            '[SheetArtifact] Duplicate content detected, skipping',
            contentHash,
          );
          return metadata;
        }

        // Add this content hash to our processed set
        const updatedHashes = new Set(metadata.processedContentHashes);
        updatedHashes.add(contentHash);

        return {
          ...metadata,
          processedContentHashes: updatedHashes,
          lastContentLength: metadata.lastContentLength + deltaContent.length,
        };
      });

      setArtifact((draftArtifact) => {
        console.log(
          '[SheetArtifact] Updating content with text-delta, delta length:',
          deltaContent.length,
        );

        return {
          ...draftArtifact,
          content: draftArtifact.content + deltaContent,
          isVisible: true,
          status: 'streaming',
        };
      });
    }

    if (streamPart.type === 'id') {
      setArtifact((draftArtifact) => {
        // Only update if ID is different
        if (draftArtifact.documentId === streamPart.content) {
          return draftArtifact;
        }

        console.log('[SheetArtifact] Setting document ID:', streamPart.content);

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
    }

    if (streamPart.type === 'title') {
      setArtifact((draftArtifact) => {
        // Only update if title is different
        if (draftArtifact.title === streamPart.content) {
          return draftArtifact;
        }

        console.log('[SheetArtifact] Setting title:', streamPart.content);
        return {
          ...draftArtifact,
          title: streamPart.content as string,
          isVisible: true,
        };
      });
    }

    if (streamPart.type === 'finish') {
      // Clear our tracking state on finish
      setMetadata((metadata) => ({
        ...metadata,
        processedContentHashes: new Set<string>(),
      }));

      setArtifact((draftArtifact) => {
        console.log('[SheetArtifact] Finishing stream, maintaining visibility');
        return {
          ...draftArtifact,
          status: 'idle',
          isVisible: true,
        };
      });
    }
  },
  content: ({
    content,
    currentVersionIndex,
    isCurrentVersion,
    onSaveContent,
    status,
  }) => {
    return (
      <SpreadsheetEditor
        content={content}
        currentVersionIndex={currentVersionIndex}
        isCurrentVersion={isCurrentVersion}
        saveContent={onSaveContent}
        status={status}
      />
    );
  },
  actions: [
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
      icon: <CopyIcon />,
      description: 'Copy as .csv',
      onClick: ({ content }) => {
        const parsed = parse<string[]>(content, { skipEmptyLines: true });

        const nonEmptyRows = parsed.data.filter((row) =>
          row.some((cell) => cell.trim() !== ''),
        );

        const cleanedCsv = unparse(nonEmptyRows);

        navigator.clipboard.writeText(cleanedCsv);
        toast.success('Copied csv to clipboard!');
      },
    },
  ],
  toolbar: [
    {
      description: 'Format and clean data',
      icon: <SparklesIcon />,
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content: 'Can you please format and clean the data?',
        });
      },
    },
    {
      description: 'Analyze and visualize data',
      icon: <LineChartIcon />,
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content:
            'Can you please analyze and visualize the data by creating a new code artifact in python?',
        });
      },
    },
  ],
});
