'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import type { ReactNode } from 'react';
import { useSWRConfig } from 'swr';

// Define types for document state
export interface DocumentState {
  activeDocId: string | null;
  activeDocVersion: string | null;
  isLoading: boolean;
  hasChanges: boolean;
  errors: { [key: string]: string } | null;
  docContent: string | null;
  streamedUpdates: Array<{
    id: string;
    content: string;
    timestamp: number;
  }>;
  lastStreamUpdate: number;
  // Add streamStatus for more detailed status tracking
  streamStatus: 'idle' | 'streaming' | 'completed' | 'error';
  // Add streamed content cache to optimize performance
  streamedContentCache: { [docId: string]: string };
}

export interface DocumentContextType {
  documentState: DocumentState;
  setActiveDocument: (id: string, initialContent?: string) => void;
  saveDocument: (content: string, title?: string) => Promise<boolean>;
  updateDocumentContent: (content: string) => void;
  applyStreamedUpdate: (update: string, docId: string) => void;
  clearDocumentState: () => void;
  getStreamedContentForDocument: (docId: string) => string | null;
  // Add new method to mark streaming as completed
  completeStreamingUpdate: (docId: string) => void;
  // Add new method to handle streaming errors
  setStreamingError: (docId: string, error: string) => void;
}

// Default state values
const defaultState: DocumentState = {
  activeDocId: null,
  activeDocVersion: null,
  isLoading: false,
  hasChanges: false,
  errors: null,
  docContent: null,
  streamedUpdates: [],
  lastStreamUpdate: 0,
  streamStatus: 'idle',
  streamedContentCache: {},
};

// Create context with undefined default value
const DocumentContext = createContext<DocumentContextType | undefined>(
  undefined,
);

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [documentState, setDocumentState] =
    useState<DocumentState>(defaultState);
  const { mutate } = useSWRConfig();

  // Initialize streamed content cache when document state changes
  useEffect(() => {
    if (
      documentState.streamedUpdates.length > 0 &&
      Object.keys(documentState.streamedContentCache).length === 0
    ) {
      // Rebuild cache from existing updates
      const cache: { [docId: string]: string } = {};
      documentState.streamedUpdates.forEach((update) => {
        if (!cache[update.id]) {
          cache[update.id] = '';
        }
        cache[update.id] += update.content;
      });

      setDocumentState((prev) => ({
        ...prev,
        streamedContentCache: cache,
      }));
    }
  }, [documentState.streamedUpdates.length]);

  // Set active document and load its content if needed
  const setActiveDocument = async (id: string, initialContent?: string) => {
    try {
      // Reset streaming status when changing documents
      setDocumentState((prev) => ({
        ...prev,
        streamStatus: 'idle',
        activeDocId: id,
        isLoading: !initialContent,
        docContent: initialContent || prev.docContent,
        hasChanges: false,
        errors: null,
      }));

      // If we already have the content, we're done
      if (initialContent) return;

      // Otherwise, load the document content
      const response = await fetch(`/api/documents/${id}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to load document (${response.status})`,
        );
      }

      const { document } = await response.json();

      setDocumentState((prev) => ({
        ...prev,
        isLoading: false,
        docContent: document.content,
        activeDocVersion: document.versionId,
        hasChanges: false,
        errors: null,
      }));
    } catch (error: any) {
      console.error('Error loading document:', error);
      setDocumentState((prev) => ({
        ...prev,
        isLoading: false,
        errors: { load: error.message || 'Failed to load document' },
      }));
    }
  };

  // Save document changes
  const saveDocument = async (content: string, title?: string) => {
    if (!documentState.activeDocId) return false;

    // Add robust document ID validation
    if (documentState.activeDocId === 'new') {
      console.error(
        "Cannot save document with ID 'new' - this is a special placeholder",
      );

      // Use requestAnimationFrame to defer state updates
      requestAnimationFrame(() => {
        setDocumentState((prev) => ({
          ...prev,
          isLoading: false,
          errors: {
            save: "Cannot save document with ID 'new' - please initialize with a valid ID",
          },
        }));
      });

      return false;
    }

    // Use a UUID pattern to validate the document ID
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(documentState.activeDocId)) {
      console.error(`Invalid document ID format: ${documentState.activeDocId}`);

      // Use requestAnimationFrame to defer state updates
      requestAnimationFrame(() => {
        setDocumentState((prev) => ({
          ...prev,
          isLoading: false,
          errors: {
            save: 'Invalid document ID format - please use a valid UUID',
          },
        }));
      });

      return false;
    }

    try {
      // Use a functional state update to ensure latest state and prevent race conditions
      // Use requestAnimationFrame to defer state update
      requestAnimationFrame(() => {
        setDocumentState((prev) => ({
          ...prev,
          isLoading: true,
          errors: null,
        }));
      });

      const response = await fetch('/api/documents/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: documentState.activeDocId,
          content,
          title,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to save document (${response.status})`,
        );
      }

      const result = await response.json();

      // Update state outside of render cycle using requestAnimationFrame to prevent React violations
      requestAnimationFrame(() => {
        setDocumentState((prev) => ({
          ...prev,
          isLoading: false,
          hasChanges: false,
          activeDocVersion: result.versionId,
          errors: null,
        }));
      });

      // Invalidate document list cache to refresh sidebar
      mutate('/api/documents');

      return true;
    } catch (error: any) {
      console.error('Error saving document:', error);

      // Update state outside of render cycle using requestAnimationFrame
      requestAnimationFrame(() => {
        setDocumentState((prev) => ({
          ...prev,
          isLoading: false,
          errors: { save: error.message || 'Failed to save document' },
        }));
      });

      return false;
    }
  };

  // Update document content locally (without saving)
  const updateDocumentContent = (content: string) => {
    setDocumentState((prev) => ({
      ...prev,
      docContent: content,
      hasChanges: true,
    }));
  };

  // Apply streamed updates from AI with optimized caching
  const applyStreamedUpdate = useCallback((update: string, docId: string) => {
    // Skip empty updates
    if (!update || !update.trim() || !docId) {
      console.log('[DocumentContext] Skipping empty update or missing docId');
      return;
    }

    console.log(`[DocumentContext] Applying stream update for doc: ${docId}`);

    // Use requestAnimationFrame to avoid React cycle violations
    requestAnimationFrame(() => {
      // Use a consistent way to update state that doesn't cause React rendering issues
      setDocumentState((prev) => {
        // Skip if this exact update has already been applied (avoid duplicates)
        const existingUpdates = prev.streamedUpdates;
        const isDuplicate = existingUpdates.some(
          (item) => item.id === docId && item.content === update,
        );

        if (isDuplicate) {
          return prev; // Return state unchanged if duplicate
        }

        // Add new update to array
        const updatedStreamedUpdates = [...prev.streamedUpdates];
        const timestamp = Date.now();

        updatedStreamedUpdates.push({
          id: docId,
          content: update,
          timestamp,
        });

        // Update the cache for more efficient access
        const updatedCache = { ...prev.streamedContentCache };
        if (!updatedCache[docId]) {
          updatedCache[docId] = '';
        }
        updatedCache[docId] += update;

        return {
          ...prev,
          streamedUpdates: updatedStreamedUpdates,
          lastStreamUpdate: timestamp,
          streamStatus: 'streaming',
          streamedContentCache: updatedCache,
        };
      });
    });
  }, []);

  // Mark streaming as completed
  const completeStreamingUpdate = useCallback((docId: string) => {
    // Use requestAnimationFrame to prevent React lifecycle violations
    requestAnimationFrame(() => {
      setDocumentState((prev) => ({
        ...prev,
        streamStatus: 'completed',
        lastStreamUpdate: Date.now(),
      }));
    });
  }, []);

  // Handle streaming errors
  const setStreamingError = useCallback((docId: string, error: string) => {
    // Use requestAnimationFrame to prevent React lifecycle violations
    requestAnimationFrame(() => {
      setDocumentState((prev) => ({
        ...prev,
        streamStatus: 'error',
        errors: { ...prev.errors, stream: error },
        lastStreamUpdate: Date.now(),
      }));
    });
  }, []);

  // Get all streamed content for a specific document
  const getStreamedContentForDocument = useCallback(
    (docId: string): string | null => {
      if (!docId) return null;

      // Use the optimized cache instead of filtering every time
      return documentState.streamedContentCache[docId] || null;
    },
    [documentState.streamedContentCache],
  );

  // Reset document state
  const clearDocumentState = useCallback(() => {
    setDocumentState(defaultState);
  }, []);

  // Provide context values
  return (
    <DocumentContext.Provider
      value={{
        documentState,
        setActiveDocument,
        saveDocument,
        updateDocumentContent,
        applyStreamedUpdate,
        clearDocumentState,
        getStreamedContentForDocument,
        completeStreamingUpdate,
        setStreamingError,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
}

// Custom hook to use this context
export const useDocumentState = () => {
  const context = useContext(DocumentContext);
  if (context === undefined) {
    throw new Error('useDocumentState must be used within a DocumentProvider');
  }
  return context;
};
