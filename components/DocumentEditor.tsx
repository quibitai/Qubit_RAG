import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useDocumentState } from '@/context/DocumentContext';
import RichTextEditor from './RichTextEditor';
import { toast } from 'sonner';
import debounce from 'lodash.debounce';
import { useRouter } from 'next/navigation';

// Simple spinner component since we couldn't find an existing one
const Spinner = ({ size = 'md' }: { size?: 'xs' | 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div
      className={`inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent ${sizeClasses[size]}`}
      role="status"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

interface DocumentEditorProps {
  docId: string;
  initialContent?: string | null;
}

const DocumentEditor: React.FC<DocumentEditorProps> = memo(
  ({ docId, initialContent }) => {
    const router = useRouter();
    const {
      documentState,
      setActiveDocument,
      saveDocument,
      updateDocumentContent,
      getStreamedContentForDocument,
      completeStreamingUpdate,
    } = useDocumentState();

    const [title, setTitle] = useState<string>('Untitled Document');
    const [isTitleFocused, setIsTitleFocused] = useState(false);
    const [lastTitleSaveTime, setLastTitleSaveTime] = useState<number>(0);
    const MIN_TITLE_SAVE_INTERVAL = 5000; // 5 seconds
    const prevDocIdRef = useRef<string | null>(null);

    // Save title debounced
    const debouncedTitleSave = useRef(
      debounce(async (newTitle: string) => {
        // Only save if the title has changed and isn't the default
        if (newTitle !== 'Untitled Document' && newTitle.trim()) {
          const success = await saveDocument(
            documentState.docContent || '',
            newTitle,
          );
          if (success) {
            setLastTitleSaveTime(Date.now());
          }
        }
      }, 2000),
    ).current;

    // Initialize document state - with dependency protection
    useEffect(() => {
      // Only set active document if docId has changed
      if (docId !== prevDocIdRef.current) {
        console.log(`Setting active document for docId: ${docId}`);
        prevDocIdRef.current = docId;

        // Only set active document if it's not already set to this docId or changed
        if (!documentState.activeDocId || documentState.activeDocId !== docId) {
          // Defer the setActiveDocument call to prevent React lifecycle violations
          requestAnimationFrame(() => {
            setActiveDocument(docId, initialContent || undefined);
          });
        }
      }
    }, [docId, initialContent, setActiveDocument, documentState.activeDocId]);

    // Listen for server-sent events for document updates
    const setupEventSource = useCallback(() => {
      if (!docId) return undefined;

      // Check for document completion via event listener
      const eventSource = new EventSource(`/api/documents/${docId}/listen`);

      eventSource.addEventListener('document-update-complete', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.docId === docId || data.docId === `doc-${docId}`) {
            // Wrap in setTimeout to prevent React lifecycle violations
            setTimeout(() => {
              completeStreamingUpdate(docId);
              // Log instead of toast
              console.log('[DocumentEditor] AI document update completed');
            }, 0);
          }
        } catch (error) {
          console.error(
            '[DocumentEditor] Error parsing stream completion event:',
            error,
          );
        }
      });

      eventSource.addEventListener('error', () => {
        console.log('[DocumentEditor] SSE connection closed or errored');
        eventSource.close();
      });

      return eventSource;
    }, [docId, completeStreamingUpdate]);

    useEffect(() => {
      const eventSource = setupEventSource();

      return () => {
        if (eventSource) {
          console.log('[DocumentEditor] Cleaning up SSE connection');
          eventSource.close();
        }
      };
    }, [setupEventSource]);

    // Create a new document with a unique ID and redirect to it
    const handleCreateNewDocument = useCallback(async () => {
      // Generate a new UUID
      const newUUID = crypto.randomUUID();

      // Get the current content or use a default
      const content =
        documentState.docContent || '<p>Start typing your document here...</p>';

      try {
        // Save the document with the new UUID
        const response = await fetch('/api/documents/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newUUID,
            content,
            title: title || 'Untitled Document',
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create document (${response.status})`);
        }

        // Log instead of toast
        console.log('[DocumentEditor] Document created successfully');

        // Redirect to the new document URL
        router.push(`/editor/${newUUID}`);
      } catch (error) {
        console.error('Error creating document:', error);
        toast.error('Failed to create document');
      }
    }, [documentState.docContent, title, router]);

    // Update title
    const handleTitleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setTitle(newTitle);

        // Debounce title saves to reduce API calls
        if (Date.now() - lastTitleSaveTime > MIN_TITLE_SAVE_INTERVAL) {
          debouncedTitleSave(newTitle);
        }
      },
      [debouncedTitleSave, lastTitleSaveTime, MIN_TITLE_SAVE_INTERVAL],
    );

    // Handle focus on title
    const handleTitleFocus = useCallback(() => {
      setIsTitleFocused(true);
    }, []);

    // Save title on blur
    const handleTitleBlur = useCallback(async () => {
      setIsTitleFocused(false);

      // Save title immediately on blur if it has changed
      if (
        title !== 'Untitled Document' &&
        title.trim() &&
        Date.now() - lastTitleSaveTime > MIN_TITLE_SAVE_INTERVAL
      ) {
        const success = await saveDocument(
          documentState.docContent || '',
          title,
        );
        if (success) {
          setLastTitleSaveTime(Date.now());
        }
      }
    }, [
      title,
      lastTitleSaveTime,
      MIN_TITLE_SAVE_INTERVAL,
      saveDocument,
      documentState.docContent,
    ]);

    // Handle content changes from the editor
    const handleContentChange = useCallback(
      (content: string) => {
        // Don't update content during AI streaming
        if (documentState.streamStatus === 'streaming') {
          console.log(
            '[DocumentEditor] Ignoring manual content change during streaming',
          );
          return;
        }

        updateDocumentContent(content);
      },
      [documentState.streamStatus, updateDocumentContent],
    );

    // Check if this is a "new" document
    const isNewDocument = docId === 'new';

    // Handle manual save button click
    const handleManualSave = useCallback(async () => {
      // Don't allow saves for "new" documents
      if (isNewDocument) {
        // Log instead of toast
        console.log('[DocumentEditor] Please create the document first');
        return;
      }

      // Don't allow manual saves during streaming
      if (documentState.streamStatus === 'streaming') {
        // Log instead of toast
        console.log(
          '[DocumentEditor] Please wait until AI updates are complete',
        );
        return;
      }

      if (documentState.docContent) {
        const success = await saveDocument(documentState.docContent, title);
        if (success) {
          // Log instead of toast
          console.log('[DocumentEditor] Document saved successfully');
        } else {
          toast.error('Failed to save document');
        }
      } else {
        toast.warning('Nothing to save');
      }
    }, [
      documentState.streamStatus,
      documentState.docContent,
      saveDocument,
      title,
      isNewDocument,
    ]);

    // Get save status text and styling
    const getSaveStatus = useCallback(() => {
      if (documentState.isLoading) {
        return { text: 'Saving...', className: 'text-yellow-500' };
      }

      if (documentState.errors) {
        return { text: 'Save failed', className: 'text-red-500' };
      }

      if (documentState.streamStatus === 'streaming') {
        return { text: 'AI updating...', className: 'text-blue-500' };
      }

      if (!documentState.hasChanges) {
        return {
          text: documentState.lastStreamUpdate > 0 ? 'Updated by AI' : 'Saved',
          className: 'text-green-500',
        };
      }

      return { text: 'Unsaved changes', className: 'text-yellow-500' };
    }, [
      documentState.isLoading,
      documentState.errors,
      documentState.streamStatus,
      documentState.hasChanges,
      documentState.lastStreamUpdate,
    ]);

    const saveStatus = getSaveStatus();

    // Extract and set title from document content when it loads
    useEffect(() => {
      if (documentState.docContent && !isTitleFocused) {
        try {
          // Try to extract title from first heading in the document
          const parser = new DOMParser();
          const doc = parser.parseFromString(
            documentState.docContent,
            'text/html',
          );
          const h1 = doc.querySelector('h1');

          if (h1 && h1.textContent && h1.textContent.trim() !== '') {
            setTitle(h1.textContent.trim());
          }
        } catch (error) {
          console.error(
            '[DocumentEditor] Error extracting title from content:',
            error,
          );
        }
      }
    }, [documentState.docContent, isTitleFocused]);

    // Get streamed content for this document - memoized to prevent excessive recalculations
    const currentStreamedContent = getStreamedContentForDocument(docId);

    return (
      <div className="flex flex-col h-full">
        {/* Header with title and save button */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            onFocus={handleTitleFocus}
            onBlur={handleTitleBlur}
            className="text-xl font-semibold bg-transparent border-0 border-b border-transparent 
                    hover:border-gray-200 dark:hover:border-gray-700 focus:ring-0 
                    focus:border-blue-500 dark:focus:border-blue-400 px-0 py-1 w-full max-w-md"
            placeholder="Untitled Document"
            disabled={documentState.streamStatus === 'streaming'}
          />

          <div className="flex items-center gap-4">
            <div
              className={`text-sm ${saveStatus.className} flex items-center gap-1`}
            >
              {documentState.streamStatus === 'streaming' && (
                <Spinner size="xs" />
              )}
              {saveStatus.text}
            </div>

            {/* Show Create Document button for "new" documents */}
            {isNewDocument ? (
              <button
                type="button"
                onClick={handleCreateNewDocument}
                className="px-3 py-1 rounded text-sm bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-800/70"
              >
                Create Document
              </button>
            ) : (
              <button
                type="button"
                onClick={handleManualSave}
                disabled={
                  !documentState.hasChanges ||
                  documentState.isLoading ||
                  documentState.streamStatus === 'streaming'
                }
                className={`px-3 py-1 rounded text-sm ${
                  documentState.hasChanges &&
                  !documentState.isLoading &&
                  documentState.streamStatus !== 'streaming'
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-800/70'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'
                }`}
              >
                Save
              </button>
            )}
          </div>
        </div>

        {/* Editor container */}
        <div className="flex-grow p-4 overflow-auto">
          {documentState.isLoading && !documentState.docContent ? (
            <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-96 rounded-md" />
          ) : (
            <RichTextEditor
              initialContent={documentState.docContent || ''}
              onSaveContent={handleContentChange}
              docId={docId}
              streamedContent={currentStreamedContent}
              streamTimestamp={documentState.lastStreamUpdate}
            />
          )}

          {/* Information for new documents */}
          {isNewDocument && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded-md">
              <p className="font-medium">This is a new document</p>
              <p className="text-sm mt-1">
                Click the "Create Document" button above to save this document
                with a unique ID.
              </p>
            </div>
          )}

          {/* Error display - show non-streaming errors */}
          {(() => {
            // Only show if we have errors but no streaming error
            if (documentState.errors) {
              const nonStreamErrors = Object.entries(documentState.errors)
                .filter(([key]) => key !== 'stream')
                .map(([_, value]) => value);

              if (nonStreamErrors.length > 0) {
                return (
                  <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md">
                    <p className="font-medium">Error</p>
                    <p className="text-sm mt-1">{nonStreamErrors.join('. ')}</p>
                  </div>
                );
              }
            }
            return null;
          })()}
        </div>
      </div>
    );
  },
);

DocumentEditor.displayName = 'DocumentEditor';

export default DocumentEditor;
