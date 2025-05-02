'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useRef, useMemo, memo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useChatPane } from '@/context/ChatPaneContext';
import { ChatPaneToggle } from '@/components/ChatPaneToggle';
import DocumentEditor from '@/components/DocumentEditor';
import NewDocumentEditor from '@/components/NewDocumentEditor';
import ErrorBoundary from '@/components/ErrorBoundary';
import { toast } from 'sonner';
import useSWR from 'swr';
import { isValidDocumentId } from '@/lib/utils/document';
import { Spinner } from '@/components/ui/spinner';
import { DocumentDebugPanel } from '@/components/DocumentDebugPanel';

// Memoized DocumentEditor wrapper to prevent unnecessary re-renders
const MemoizedDocumentEditor = memo(
  ({
    docId,
    initialContent,
  }: { docId: string; initialContent?: string | null }) => {
    return (
      <ErrorBoundary
        onError={(error) => {
          console.error(`Error in DocumentEditor for ${docId}:`, error);
          toast.error(
            'An error occurred in the document editor. Please try refreshing the page.',
          );
        }}
      >
        <DocumentEditor docId={docId} initialContent={initialContent} />
      </ErrorBoundary>
    );
  },
);

MemoizedDocumentEditor.displayName = 'MemoizedDocumentEditor';

export default function EditorPage() {
  const router = useRouter();
  const { setActiveBitContextId, setActiveDocId, activeDocId } = useChatPane();
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const docId = typeof routeParams.docId === 'string' ? routeParams.docId : '';
  const prevDocIdRef = useRef<string | null>(null);
  const prevCycleRef = useRef<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const showDebug =
    searchParams.get('debug') === 'true' ||
    process.env.NODE_ENV === 'development';

  // Determine if this is a new document or an existing one
  const isNewDocument = docId === 'new';
  const isValidDocument = isValidDocumentId(docId);

  // Fetch document data if it's an existing document
  const { data: documentData, error } = useSWR(
    !isNewDocument && isValidDocument ? `/api/documents/${docId}` : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch document');
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      dedupingInterval: 10000, // Dedupe identical requests for 10 seconds
      onSuccess: () => setIsLoading(false),
      onError: () => setIsLoading(false),
    },
  );

  // For new documents, we don't need to wait for fetching
  useEffect(() => {
    if (isNewDocument) {
      setIsLoading(false);
    }
  }, [isNewDocument]);

  // Set document ID in chat pane context - with added checks to prevent infinite loops
  useEffect(() => {
    let isMounted = true;

    // Use requestAnimationFrame to defer state updates to the next frame
    // This helps avoid "Cannot update a component while rendering a different component" errors
    const updateContextId = () => {
      if (!isMounted) return;

      // Only update context if the document ID has actually changed and enough time has passed
      const now = Date.now();

      if (docId !== prevDocIdRef.current && now - prevCycleRef.current > 1000) {
        prevDocIdRef.current = docId;
        prevCycleRef.current = now;

        // Set the bit context ID for the editor
        setTimeout(() => {
          if (isMounted) {
            setActiveBitContextId('document-editor');
          }
        }, 0);

        // Only update active doc ID if it's a real doc (not 'new') and has changed
        if (isValidDocument && docId !== activeDocId) {
          setTimeout(() => {
            if (isMounted) {
              setActiveDocId(docId);
            }
          }, 0);
        }
      }
    };

    // Schedule the update for the next animation frame to avoid rendering conflicts
    const frameId = requestAnimationFrame(updateContextId);

    return () => {
      // Mark component as unmounted
      isMounted = false;

      // Cancel the animation frame to prevent stale updates
      cancelAnimationFrame(frameId);

      // Only reset if we're actually unmounting with the same docId
      // And it's been at least 1 second since our last effect run
      const unmountTime = Date.now();
      if (
        prevDocIdRef.current === docId &&
        unmountTime - prevCycleRef.current > 1000
      ) {
        // Use setTimeout for cleanup to avoid rendering conflicts
        setTimeout(() => {
          setActiveDocId(null);
          prevDocIdRef.current = null;
        }, 0);
      }
    };
  }, [
    docId,
    setActiveBitContextId,
    setActiveDocId,
    activeDocId,
    isValidDocument,
  ]);

  // Handle error state
  useEffect(() => {
    if (error) {
      console.error('Error loading document:', error);
      toast.error('Failed to load the document');
    }
  }, [error]);

  // Memoize initialContent to prevent unnecessary re-renders
  const initialContent = useMemo(() => {
    return documentData?.document?.content;
  }, [documentData?.document?.content]);

  // Show loading state while fetching document
  if (isLoading && !isNewDocument) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Spinner size="lg" className="mb-4" />
          <p className="text-gray-600 dark:text-gray-300">
            Loading document...
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="absolute right-4 top-4 z-50">
        <ChatPaneToggle />
      </div>

      <div className="container mx-auto px-4 py-2 h-screen max-w-4xl">
        {isNewDocument ? (
          <NewDocumentEditor />
        ) : isValidDocument ? (
          <MemoizedDocumentEditor
            docId={docId}
            initialContent={initialContent}
          />
        ) : (
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg mt-12">
            <h2 className="text-xl font-semibold text-red-800 dark:text-red-200 mb-2">
              Invalid Document ID
            </h2>
            <p className="text-red-700 dark:text-red-300">
              The document ID "{docId}" is not valid. Please check the URL or
              create a new document.
            </p>
            <button
              type="button"
              onClick={() => router.push('/editor/new')}
              className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 rounded-md hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
            >
              Create New Document
            </button>
          </div>
        )}
      </div>

      {/* Debug Panel - only shown in development or when debug=true query param is present */}
      {showDebug && isValidDocument && (
        <DocumentDebugPanel documentId={docId} />
      )}
    </ErrorBoundary>
  );
}
