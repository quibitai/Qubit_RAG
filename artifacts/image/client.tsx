import { Artifact } from '@/components/create-artifact';
import { CopyIcon, RedoIcon, UndoIcon } from '@/components/icons';
import { ImageEditor } from '@/components/image-editor';
import { toast } from 'sonner';

interface ImageMetadata {
  // Track processed content hashes to prevent duplicate processing
  processedContentHashes: Set<string>;
  // Track if an image has been fully received
  imageComplete: boolean;
}

export const imageArtifact = new Artifact<'image', ImageMetadata>({
  kind: 'image',
  description: 'Useful for image generation',
  initialize: async ({ setMetadata }) => {
    setMetadata({
      processedContentHashes: new Set<string>(),
      imageComplete: false,
    });
  },
  onStreamPart: ({ streamPart, setArtifact, setMetadata }) => {
    // Skip processing if the stream part is not a valid type
    if (!streamPart || !streamPart.type) {
      console.log('[ImageArtifact] Invalid stream part received, skipping');
      return;
    }

    console.log(
      `[ImageArtifact] Processing stream part of type: ${streamPart.type}`,
    );

    if (streamPart.type === 'image-delta') {
      const content = streamPart.content as string;

      // Skip empty content
      if (!content || content.length === 0) {
        console.log('[ImageArtifact] Empty image-delta received, skipping');
        return;
      }

      // For images we need to be careful - the content is usually a large base64 string
      // So we'll use just the first and last few characters for our hash
      const contentPreview = `${content.substring(0, 10)}...${content.substring(content.length - 10)}`;
      const contentHash = `${content.length}:${contentPreview}`;

      setMetadata((metadata) => {
        // Check if we've already processed this exact content
        if (metadata.processedContentHashes.has(contentHash)) {
          console.log(
            '[ImageArtifact] Duplicate content detected, skipping',
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
          imageComplete: true, // Mark as complete since image deltas are full images
        };
      });

      setArtifact((draftArtifact) => {
        // For images, we don't need to check if the content ends with the new content
        // since image-delta typically replaces the entire image
        console.log(
          '[ImageArtifact] Updating image with new content, length:',
          content.length,
        );

        return {
          ...draftArtifact,
          content: content,
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

        console.log('[ImageArtifact] Setting document ID:', streamPart.content);

        // Reset metadata when we get a new document ID
        setMetadata((metadata) => ({
          ...metadata,
          processedContentHashes: new Set<string>(),
          imageComplete: false,
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

        console.log('[ImageArtifact] Setting title:', streamPart.content);
        return {
          ...draftArtifact,
          title: streamPart.content as string,
          isVisible: true,
        };
      });
    }

    if (streamPart.type === 'finish') {
      // When we finish, we can clear our tracking state
      setMetadata((metadata) => ({
        ...metadata,
        processedContentHashes: new Set<string>(),
        // Don't reset imageComplete here to maintain completed state
      }));

      setArtifact((draftArtifact) => {
        console.log('[ImageArtifact] Finishing stream, maintaining visibility');
        return {
          ...draftArtifact,
          status: 'idle',
          isVisible: true,
        };
      });
    }
  },
  content: ImageEditor,
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
      icon: <CopyIcon size={18} />,
      description: 'Copy image to clipboard',
      onClick: ({ content }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${content}`;

        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
              ]);
            }
          }, 'image/png');
        };

        toast.success('Copied image to clipboard!');
      },
    },
  ],
  toolbar: [],
});
