'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import RichTextEditor from '@/components/RichTextEditor';
import { toast } from 'sonner';
import debounce from 'lodash.debounce';
import { ChatPaneToggle } from '@/components/ChatPaneToggle';
import { PanelRightClose } from 'lucide-react';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { getDocumentHistoryPaginationKey } from '@/components/sidebar-history';
import { unstable_serialize } from 'swr/infinite';
import { useChatPane } from '@/context/ChatPaneContext';

interface DocumentData {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// Define an interface for our save options
interface SaveOptions {
  content?: string | null;
  title?: string;
  isManualSave?: boolean;
}

// Define improved document state tracking interfaces
interface DocumentState {
  currentContent: string | null; // Current editor content
  persistedContent: string | null; // Last successfully saved content
  contentVersion: number; // Version counter for detecting conflicts
  contentLastSaved: number | null; // Timestamp of last successful content save
  isDirty: boolean; // Whether content has unsaved changes
  saveInProgress: boolean; // Whether a save operation is in progress
  saveQueue: SaveOptions[]; // Queue of pending save operations
  lastError: Error | null; // Last error that occurred during save
  localBackup: string | null; // Local storage backup of content
  lastBackupTime: number | null; // When the last backup was made
  saveAttemptCount: number; // Count of consecutive save attempts
  saveHistory: Array<{ content: string; timestamp: number }> | null; // History of recent saves
}

export default function EditorPage({ params }: { params: { docId: string } }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { setActiveBitContextId, setActiveDocId } = useChatPane();

  // Extract document ID to a state variable to avoid params reference issues
  const [documentId, setDocumentId] = useState<string>(params.docId || 'new');

  // Consolidated document state
  const [docState, setDocState] = useState<DocumentState>({
    currentContent: null,
    persistedContent: null,
    contentVersion: 0,
    contentLastSaved: null,
    isDirty: false,
    saveInProgress: false,
    saveQueue: [],
    lastError: null,
    localBackup: null,
    lastBackupTime: null,
    saveAttemptCount: 0,
    saveHistory: null,
  });

  // UI state
  const [docTitle, setDocTitle] = useState<string>('Untitled Document');
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'failed' | 'conflict'
  >('idle');

  // Track document ID for the current editing session - use state instead of params
  const currentDocIdRef = useRef<string>(documentId);

  // Update currentDocIdRef when documentId changes
  useEffect(() => {
    currentDocIdRef.current = documentId;
  }, [documentId]);

  // Refs for optimized state access
  const docStateRef = useRef<DocumentState>(docState);
  const saveAbortControllerRef = useRef<AbortController | null>(null);

  // Add a throttling mechanism for title saves
  const [lastTitleSaveTime, setLastTitleSaveTime] = useState<number>(0);
  const MIN_TITLE_SAVE_INTERVAL = 5000; // 5 seconds between title saves

  // Update ref when state changes
  useEffect(() => {
    docStateRef.current = docState;
  }, [docState]);

  // Helper to update document state with partial updates
  const updateDocState = useCallback((updates: Partial<DocumentState>) => {
    setDocState((current) => ({
      ...current,
      ...updates,
    }));
  }, []);

  // Set content with proper state tracking
  const setDocContent = useCallback(
    (content: string | null) => {
      updateDocState({
        currentContent: content,
        isDirty: content !== docStateRef.current.persistedContent,
        contentVersion: docStateRef.current.contentVersion + 1,
      });
    },
    [updateDocState],
  );

  // Mark content as successfully saved
  const markContentSaved = useCallback(
    (content: string | null) => {
      const now = Date.now();
      updateDocState({
        persistedContent: content,
        contentLastSaved: now,
        isDirty: false,
        saveAttemptCount: 0, // Reset save attempts on successful save
      });
      setLastSaved(new Date(now).toISOString());

      // Add to save history for recovery purposes
      if (content) {
        const newHistoryEntry = { content, timestamp: now };
        const currentHistory = docStateRef.current.saveHistory || [];
        const updatedHistory = [newHistoryEntry, ...currentHistory.slice(0, 4)]; // Keep last 5 saves
        updateDocState({ saveHistory: updatedHistory });
      }
    },
    [updateDocState],
  );

  // Add a specialized function to save only the title - MOVED UP from later in the file
  const saveTitleOnly = useCallback(
    async (title: string): Promise<boolean> => {
      // Skip empty or default titles
      if (!title || title === 'Untitled Document') return false;

      // Don't save during initial loading
      if (isFirstLoad) return false;

      console.log(`[EditorPage] Saving only title: "${title}"`);

      try {
        const isNew = currentDocIdRef.current === 'new';
        // Cannot save title for new documents that haven't been created yet
        if (isNew) return false;

        const url = `/api/documents/${currentDocIdRef.current}/title`;

        const response = await fetch(url, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[EditorPage] Failed to save title: ${errorText}`);
          return false;
        }

        // Update sidebar cache but don't navigate or change other state
        mutate(unstable_serialize(getDocumentHistoryPaginationKey));
        return true;
      } catch (error) {
        console.error('[EditorPage] Error saving title:', error);
        return false;
      }
    },
    [isFirstLoad, mutate],
  );

  // Local storage backup function - use documentId instead of params.docId
  const backupToLocalStorage = useCallback(() => {
    if (!docStateRef.current.currentContent || documentId === 'new') return;

    try {
      const backupData = {
        docId: currentDocIdRef.current,
        content: docStateRef.current.currentContent,
        title: docTitle,
        timestamp: Date.now(),
      };

      localStorage.setItem(
        `doc_backup_${currentDocIdRef.current}`,
        JSON.stringify(backupData),
      );

      updateDocState({
        localBackup: docStateRef.current.currentContent,
        lastBackupTime: Date.now(),
      });

      console.log('[EditorPage] Local backup created');
    } catch (error) {
      console.error('[EditorPage] Failed to create local backup:', error);
    }
  }, [docTitle, documentId, updateDocState]);

  // Check for existing backup on load - use documentId instead of params.docId
  useEffect(() => {
    if (documentId === 'new' || isFirstLoad === false) return;

    try {
      const backupKey = `doc_backup_${documentId}`;
      const backupJson = localStorage.getItem(backupKey);

      if (backupJson) {
        const backup = JSON.parse(backupJson);

        // Only use backup if it's newer than the server version and for the same doc
        if (
          backup.docId === documentId &&
          (!lastSaved || new Date(backup.timestamp) > new Date(lastSaved))
        ) {
          // We'll offer recovery option after loading the server version
          console.log(
            '[EditorPage] Found newer local backup:',
            backup.timestamp,
          );
          updateDocState({
            localBackup: backup.content,
            lastBackupTime: backup.timestamp,
          });
        }
      }
    } catch (error) {
      console.error('[EditorPage] Error checking for backup:', error);
    }
  }, [documentId, lastSaved, isFirstLoad, updateDocState]);

  // Add the backup timer useEffect that was accidentally removed
  useEffect(() => {
    // Only backup if we have content and aren't in initial loading state
    if (!docStateRef.current.currentContent || isFirstLoad) return;

    // Create initial backup
    backupToLocalStorage();

    // Set up periodic backup
    const backupInterval = setInterval(() => {
      // Only create new backup if content has changed since last backup
      if (
        docStateRef.current.currentContent !==
          docStateRef.current.localBackup &&
        docStateRef.current.isDirty
      ) {
        backupToLocalStorage();
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(backupInterval);
  }, [backupToLocalStorage, isFirstLoad]);

  // Unified save function that handles all document saving logic
  const saveDocument = useCallback(
    async (options: SaveOptions) => {
      const { content, title, isManualSave = false } = options;

      // Don't save during initial loading or if already saving
      if (isFirstLoad) return false;

      // Queue the save if we're already processing one
      if (docStateRef.current.saveInProgress) {
        // For manual saves, we might want to cancel the current save and prioritize this one
        if (isManualSave && saveAbortControllerRef.current) {
          saveAbortControllerRef.current.abort();
          saveAbortControllerRef.current = null;
        } else {
          // For auto-save, just queue it up
          updateDocState({
            saveQueue: [
              ...docStateRef.current.saveQueue,
              {
                content,
                title: title || docTitle,
                isManualSave,
              },
            ],
          });
          return false;
        }
      }

      // Safety check: if we're only saving title, use saveTitleOnly instead
      if (title && content === undefined) {
        return !!saveTitleOnly(title);
      }

      // Use existing content if not provided in options
      const contentToSave =
        content !== undefined ? content : docStateRef.current.currentContent;
      const titleToSave = title || docTitle;

      // Skip if we have no content to save
      if (contentToSave === null) {
        return false;
      }

      // Skip if content hasn't changed (unless it's a manual save)
      if (
        !isManualSave &&
        contentToSave === docStateRef.current.persistedContent
      ) {
        console.log('[EditorPage] Skipping save - content unchanged');
        return true;
      }

      // Create a new abort controller for this save operation
      saveAbortControllerRef.current = new AbortController();

      updateDocState({
        saveInProgress: true,
        saveAttemptCount: docStateRef.current.saveAttemptCount + 1,
      });

      setIsSaving(true);
      setSaveStatus('saving');

      try {
        const isNew = currentDocIdRef.current === 'new';
        const method = isNew ? 'POST' : 'PUT';
        const url = isNew
          ? '/api/documents'
          : `/api/documents/${currentDocIdRef.current}`;

        console.log(
          `[EditorPage] Saving document to ${url}. Content length: ${contentToSave?.length}, title: ${titleToSave}`,
        );

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: contentToSave,
            title: titleToSave,
            id: isNew ? undefined : currentDocIdRef.current,
            version: docStateRef.current.contentVersion, // Send version for conflict detection
          }),
          signal: saveAbortControllerRef.current.signal,
        });

        if (!response.ok) {
          // Handle version conflict (409) specially
          if (response.status === 409) {
            console.warn('[EditorPage] Document version conflict detected');
            setSaveStatus('conflict');
            toast.warning('Document was modified elsewhere', {
              description:
                'Your changes may overwrite other edits. Continue saving?',
              action: {
                label: 'Save anyway',
                onClick: () => {
                  // Force save with override flag
                  saveDocument({
                    content: contentToSave,
                    title: titleToSave,
                    isManualSave: true,
                  });
                },
              },
            });
            throw new Error('Document conflict detected');
          }

          const errorText = await response.text();
          throw new Error(
            `Failed to save document: ${response.status} - ${errorText}`,
          );
        }

        const savedDoc = await response.json();
        console.log('[EditorPage] Document saved successfully:', savedDoc.id);

        // Update last saved content reference
        markContentSaved(contentToSave);

        // If this was a new document, use Next.js router to navigate
        if (isNew) {
          // Update the current document ID reference first
          currentDocIdRef.current = savedDoc.id;

          // Use Next.js navigation instead of history.replaceState
          router.replace(`/editor/${savedDoc.id}`);
        }

        // Update save status
        setSaveStatus('saved');

        // Show success message for manual saves
        if (isManualSave) {
          toast.success('Document saved successfully.');
        }

        // Invalidate document history cache to refresh sidebar
        mutate(unstable_serialize(getDocumentHistoryPaginationKey));

        return true;
      } catch (error) {
        // Skip error handling if this was an abort
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('[EditorPage] Save operation aborted');
          return false;
        }

        console.error('[EditorPage] Error saving document:', error);

        // Set error status
        setSaveStatus('failed');

        // Update error state
        updateDocState({
          lastError: error instanceof Error ? error : new Error(String(error)),
        });

        // Only show error toast for manual saves or repeated failures
        if (isManualSave || docStateRef.current.saveAttemptCount > 2) {
          toast.error('Failed to save your changes. Please try again.');
        }

        // For automatic saves, retry with progressive backoff
        if (!isManualSave && docStateRef.current.saveAttemptCount <= 3) {
          const backoffTime =
            Math.pow(2, docStateRef.current.saveAttemptCount) * 1000;
          console.log(`[EditorPage] Will retry save in ${backoffTime}ms`);

          setTimeout(() => {
            saveDocument({
              content: contentToSave,
              title: titleToSave,
              isManualSave: false,
            });
          }, backoffTime);
        }

        return false;
      } finally {
        // Clear the abort controller
        saveAbortControllerRef.current = null;

        updateDocState({
          saveInProgress: false,
        });

        setIsSaving(false);

        // Process the next save in queue if there is one
        if (docStateRef.current.saveQueue.length > 0) {
          const nextSave = docStateRef.current.saveQueue[0];
          updateDocState({
            saveQueue: docStateRef.current.saveQueue.slice(1),
          });

          // Use a small timeout to prevent hammering the server
          setTimeout(() => {
            saveDocument({
              content: nextSave.content,
              title: nextSave.title || docTitle,
              isManualSave: nextSave.isManualSave || false,
            });
          }, 300);
        }
      }
    },
    [
      docTitle,
      isFirstLoad,
      markContentSaved,
      router,
      mutate,
      saveTitleOnly,
      updateDocState,
    ],
  );

  // GET and implement the API endpoint to handle title-only updates
  useEffect(() => {
    // Check if we need to implement the title-only update API endpoint
    // For a "real" implementation we would want this on the server
    console.log('[EditorPage] Initialized editor page');
  }, []);

  // Update save status when isSaving changes
  useEffect(() => {
    if (isSaving) {
      setSaveStatus('saving');
    }
  }, [isSaving]);

  // Visual feedback timer to reset saved status
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (saveStatus === 'saved') {
      timer = setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [saveStatus]);

  // Update context when document ID changes
  useEffect(() => {
    // Set document editor as the active bit context
    setActiveBitContextId('document-editor');

    // Set the current document ID in the global context
    // Only set a real doc ID (not 'new') to avoid confusion
    if (documentId !== 'new') {
      setActiveDocId(documentId);
    }

    console.log('[EditorPage] Updated global context:', {
      activeBitContextId: 'document-editor',
      activeDocId: documentId !== 'new' ? documentId : null,
    });

    // Clean up context when unmounting
    return () => {
      // Only clean up if we're still on this document when unmounting
      if (currentDocIdRef.current === documentId) {
        console.log('[EditorPage] Clearing document context on unmount');
        setActiveDocId(null);
      }
    };
  }, [documentId, setActiveBitContextId, setActiveDocId]);

  // Fetch document content on initial load
  useEffect(() => {
    async function fetchDocument() {
      setIsLoading(true);
      try {
        // Handle 'new' as a special case to create a new document
        if (documentId === 'new') {
          // Set initial empty content for a new document
          setDocContent('<p>Start typing your document here...</p>');
          setDocTitle('Untitled Document');
          docStateRef.current.persistedContent =
            '<p>Start typing your document here...</p>';
          setIsLoading(false);
          return;
        }

        // Fetch existing document
        const response = await fetch(`/api/documents/${documentId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.statusText}`);
        }

        const document: DocumentData = await response.json();
        setDocContent(document.content);
        setDocTitle(document.title || 'Untitled Document');
        docStateRef.current.persistedContent = document.content;
        setLastSaved(document.updatedAt);

        // Update the current document ID reference
        currentDocIdRef.current = documentId;

        // Also update the active document ID in context once we have loaded a real document
        if (documentId !== 'new') {
          setActiveDocId(documentId);
        }
      } catch (error) {
        console.error('Error fetching document:', error);
        toast.error('Failed to load the document. Please try again.');
        // Set to empty content to allow editing anyway
        setDocContent('<p></p>');
        docStateRef.current.persistedContent = '<p></p>';
      } finally {
        setIsLoading(false);
        setIsFirstLoad(false);
      }
    }

    fetchDocument();
  }, [documentId, setDocContent, setDocTitle, setActiveDocId]);

  // Auto-generate title based on content
  useEffect(() => {
    // Only try to generate a title if:
    // 1. We have content
    // 2. The title is still the default "Untitled Document"
    // 3. The user isn't currently editing the title
    if (
      docStateRef.current.currentContent &&
      docTitle === 'Untitled Document' &&
      !isTitleFocused &&
      docStateRef.current.currentContent.length > 50 &&
      !docStateRef.current.currentContent.includes(
        'Start typing your document here',
      )
    ) {
      const generateTitleFromContent = async () => {
        try {
          // Extract the first paragraph as a potential title
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = docStateRef.current.currentContent;
          const firstParagraph = tempDiv.querySelector('p');

          if (firstParagraph) {
            const text = firstParagraph.textContent || '';
            // Use the first 40 characters or the first sentence as the title
            const potentialTitle = text.split('.')[0].trim().substring(0, 40);

            if (potentialTitle && potentialTitle.length > 5) {
              setDocTitle(potentialTitle);
            }
          }
        } catch (error) {
          console.error('Error generating title:', error);
        }
      };

      generateTitleFromContent();
    }
  }, [
    docStateRef.current.currentContent,
    docTitle,
    isTitleFocused,
    setDocTitle,
  ]);

  // Get save status text and color
  const getSaveStatusInfo = () => {
    switch (saveStatus) {
      case 'saving':
        return { text: 'Saving...', className: 'text-yellow-500' };
      case 'saved':
        return { text: 'Saved', className: 'text-green-500' };
      case 'failed':
        return { text: 'Save failed', className: 'text-red-500' };
      case 'conflict':
        return { text: 'Conflict detected', className: 'text-orange-500' };
      default:
        return {
          text: lastSaved
            ? `Last saved: ${new Date(lastSaved).toLocaleString()}`
            : '',
          className: docStateRef.current.isDirty
            ? 'text-yellow-500'
            : 'text-muted-foreground',
        };
    }
  };

  // Handle focus on title to prevent focus jumping
  const handleTitleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.preventDefault();
    // Set a flag to tell the editor not to steal focus
    setIsTitleFocused(true);
  };

  // Handler for title changes - prevent content clearing
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only update the title state, never touch docContent
    setDocTitle(e.target.value);
  };

  // Save title when user leaves the input field - protect content
  const handleTitleBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    // Don't immediately blur if we're just switching focus to the editor
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    // Use optional chaining and use a type guard to satisfy the linter
    const targetClassName = relatedTarget?.className || '';
    if (
      typeof targetClassName === 'string' &&
      targetClassName.includes('ProseMirror')
    ) {
      e.preventDefault(); // Try to prevent the focus change if it's going to the editor
    }

    setIsTitleFocused(false);

    // Save ONLY the title, explicitly passing null for content to prevent overwriting
    if (
      docTitle !== 'Untitled Document' &&
      Date.now() - lastTitleSaveTime > MIN_TITLE_SAVE_INTERVAL
    ) {
      // Use a specialized save for titles that won't touch content
      saveTitleOnly(docTitle);
      setLastTitleSaveTime(Date.now());
    }
  };

  // Add a heavily throttled debouncedTitleSave function
  const debouncedTitleSave = useCallback(
    debounce((title: string) => {
      // Skip if not enough time has passed since last title save
      if (Date.now() - lastTitleSaveTime < MIN_TITLE_SAVE_INTERVAL) {
        console.log('[Editor] Skipping title save, too soon after last save');
        return;
      }

      // Only save title, not content
      if (title !== 'Untitled Document') {
        saveTitleOnly(title);
        setLastTitleSaveTime(Date.now());
      }
    }, 3000), // Very long debounce for title changes
    [saveTitleOnly, lastTitleSaveTime],
  );

  // Type for our debounced save function
  type DebouncedSaveFunction = {
    save: (content: string | null) => void;
    cancel: () => void;
  };

  // Progressive debounce for auto-save with increasing delays as user continues typing
  const debouncedSave = useCallback(() => {
    // Start with a short debounce time, but increase it as typing continues
    let consecutiveChanges = 0;
    const getDebounceTime = () => {
      // Start at 1500ms, increase to 3000ms for heavy editing
      if (consecutiveChanges < 3) return 1500;
      if (consecutiveChanges < 10) return 2000;
      return 3000;
    };

    // Create a named function to use in the reset
    const saveFunction = (content: string | null) => {
      if (!content) return; // Skip empty content

      consecutiveChanges = 0; // Reset counter after save
      saveDocument({ content, isManualSave: false });
    };

    // Create and return the debounced function
    return {
      save: (content: string | null) => {
        if (!content) return; // Skip empty content

        consecutiveChanges++;
        debounce(saveFunction, getDebounceTime())(content);
      },
      cancel: () => {
        debounce(saveFunction, 0).cancel();
        consecutiveChanges = 0;
      },
    } as DebouncedSaveFunction;
  }, [saveDocument]);

  // Initialize the debounced save function
  const debouncedSaveInstance = useMemo(() => debouncedSave(), [debouncedSave]);

  // Handle content changes and save
  const onContentChange = useCallback(
    (content: string | null, isManual = false) => {
      if (!content) return;

      // Update the local state immediately regardless of content
      setDocContent(content);

      // Skip saving if content hasn't changed from last save
      if (
        typeof docStateRef.current.persistedContent === 'string' &&
        content === docStateRef.current.persistedContent
      ) {
        return;
      }

      if (!isManual) {
        // Use debounced save for automatic saves
        debouncedSaveInstance.save(content);
      } else {
        // Cancel any pending debounced saves
        debouncedSaveInstance.cancel();

        // Save immediately for manual saves
        saveDocument({ content, isManualSave: true });
      }
    },
    [debouncedSaveInstance, saveDocument, setDocContent],
  );

  // Show recovery UI if we have a newer local backup
  const RecoveryBanner = () => {
    if (
      !docStateRef.current.localBackup ||
      !docStateRef.current.lastBackupTime ||
      isFirstLoad
    ) {
      return null;
    }

    // Only show if backup is newer than server version and not same as current
    const backupDate = new Date(docStateRef.current.lastBackupTime);
    const serverDate = lastSaved ? new Date(lastSaved) : new Date(0);

    if (
      backupDate > serverDate &&
      docStateRef.current.localBackup !== docStateRef.current.currentContent
    ) {
      return (
        <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 p-2 rounded-md mb-4 text-sm flex justify-between items-center">
          <div>Found unsaved changes from {backupDate.toLocaleString()}</div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-2 py-1 text-xs bg-yellow-200 dark:bg-yellow-800 rounded-md"
              onClick={() => {
                if (docStateRef.current.localBackup) {
                  setDocContent(docStateRef.current.localBackup);
                  toast.success('Recovered unsaved changes');
                }
              }}
            >
              Restore
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded-md"
              onClick={() => {
                updateDocState({
                  localBackup: null,
                  lastBackupTime: null,
                });
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  const saveStatusInfo = getSaveStatusInfo();

  // Update editor content handler
  const handleEditorContentChange = (editorContent: string) => {
    if (editorContent) {
      onContentChange(editorContent, false);
    }
  };

  // Handle manual save button clicks
  const handleManualSave = () => {
    const currentContent = docStateRef.current.currentContent;
    if (currentContent) {
      onContentChange(currentContent, true);
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Document Bit</h1>
        <ChatPaneToggle />
      </div>

      <div className="mb-4 flex items-center">
        <input
          type="text"
          className="text-xl font-medium bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary/20 p-1 rounded w-full"
          value={docTitle}
          onChange={handleTitleChange}
          onFocus={handleTitleFocus}
          onBlur={handleTitleBlur}
          placeholder="Untitled Document"
        />
      </div>

      {/* Recovery banner */}
      <RecoveryBanner />

      <div className="border p-4 min-h-[400px] bg-white dark:bg-gray-800 rounded">
        {isLoading ? (
          <p>Loading document...</p>
        ) : docStateRef.current.currentContent !== null ? (
          <RichTextEditor
            docId={documentId}
            initialContent={docStateRef.current.currentContent}
            onSaveContent={handleEditorContentChange}
          />
        ) : (
          <p>Document not found or failed to load.</p>
        )}
      </div>

      <div className="flex justify-between items-center mt-2">
        <div className="flex items-center gap-2">
          <p className={`text-xs ${saveStatusInfo.className}`}>
            {saveStatusInfo.text}
          </p>
          {docStateRef.current.isDirty && (
            <span className="text-xs bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 px-2 py-0.5 rounded-full">
              Unsaved changes
            </span>
          )}
        </div>

        {/* Add a manual save button */}
        {!isLoading && docStateRef.current.currentContent && (
          <button
            onClick={handleManualSave}
            disabled={isSaving || saveStatus === 'saving'}
            type="button"
            className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded disabled:opacity-50"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}
