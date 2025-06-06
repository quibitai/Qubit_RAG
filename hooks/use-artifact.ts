'use client';

import useSWR, { type MutatorCallback } from 'swr';
import type { UIArtifact, ArtifactKind } from '@/components/artifact';
import { useCallback, useMemo, useState, useEffect } from 'react';
import type { Document } from '@/lib/db/schema';
import { logger } from '@/lib/logger';
import { generateUUID } from '@/lib/utils';

// Centralized fetcher for SWR
const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Type guard to validate that a string is a valid ArtifactKind
function isValidArtifactKind(
  kind: string | undefined | null,
): kind is ArtifactKind {
  return (
    typeof kind === 'string' &&
    ['text', 'code', 'image', 'sheet'].includes(kind)
  );
}

// Safe conversion from database Document kind to ArtifactKind
function toArtifactKind(dbKind: string | undefined | null): ArtifactKind {
  if (isValidArtifactKind(dbKind)) {
    return dbKind;
  }
  // Fallback to 'text' if the database kind is invalid or missing
  return 'text';
}

export const initialArtifactData: UIArtifact = {
  documentId: 'init',
  content: '',
  kind: 'text',
  title: '',
  status: 'idle',
  isVisible: false,
  boundingBox: {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
};

export function useArtifact(documentId?: string | null) {
  // SWR hook for fetching the persisted document state from the server
  const {
    data: dbDocument,
    error: dbError,
    mutate: revalidateDbDocument,
  } = useSWR<Document>(
    documentId && documentId !== 'init' ? `/api/documents/${documentId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  // Local-only SWR key for managing transient UI state (visibility, streaming status)
  const { data: localState, mutate: setLocalState } = useSWR<UIArtifact>(
    'artifact-ui-state',
    null,
    {
      fallbackData: initialArtifactData,
    },
  );

  // State specifically for accumulating streamed content
  const [streamingContent, setStreamingContent] = useState<string | null>(null);

  // Effect to update local state when fetched data changes
  useEffect(() => {
    if (dbDocument) {
      const updater: MutatorCallback<UIArtifact> = (current) => {
        const state = current || initialArtifactData;
        return {
          ...state,
          documentId: dbDocument.id,
          title: dbDocument.title,
          kind: toArtifactKind(dbDocument.kind),
          content:
            state.status !== 'streaming'
              ? dbDocument.content || ''
              : state.content,
        };
      };
      setLocalState(updater, false);
    }
  }, [dbDocument, setLocalState]);

  const artifact = useMemo<UIArtifact>(() => {
    const state = localState || initialArtifactData;
    const isStreaming = state.status === 'streaming';

    const content =
      isStreaming && streamingContent !== null
        ? streamingContent
        : (dbDocument?.content ?? state.content);

    return {
      ...state,
      documentId: documentId || state.documentId,
      title: dbDocument?.title ?? state.title,
      kind: dbDocument ? toArtifactKind(dbDocument.kind) : state.kind,
      content: content || '',
      status: isStreaming
        ? 'streaming'
        : dbError
          ? 'error'
          : !dbDocument && documentId && documentId !== 'init'
            ? 'loading'
            : state.status === 'idle' && dbDocument
              ? 'complete'
              : state.status,
    };
  }, [localState, dbDocument, streamingContent, documentId, dbError]);

  const setVisibility = useCallback(
    (isVisible: boolean) => {
      const updater: MutatorCallback<UIArtifact> = (current) => ({
        ...(current || initialArtifactData),
        isVisible,
      });
      setLocalState(updater, false);
    },
    [setLocalState],
  );

  // Direct artifact setter for compatibility with existing components
  const setArtifact = useCallback(
    (updaterOrValue: UIArtifact | ((current: UIArtifact) => UIArtifact)) => {
      const updater: MutatorCallback<UIArtifact> = (current) => {
        const currentState = current || initialArtifactData;
        if (typeof updaterOrValue === 'function') {
          return updaterOrValue(currentState);
        }
        return updaterOrValue;
      };
      setLocalState(updater, false);
    },
    [setLocalState],
  );

  const startStreamingArtifact = useCallback(
    (kind: string, title: string, newDocId?: string) => {
      const docId = newDocId || generateUUID();
      logger.info('useArtifact', 'START_STREAMING', { docId, kind, title });
      setStreamingContent('');
      setLocalState(
        {
          ...initialArtifactData,
          documentId: docId,
          kind: toArtifactKind(kind),
          title,
          status: 'streaming',
          isVisible: true,
        },
        false,
      );
    },
    [setLocalState],
  );

  const updateStreamingContent = useCallback((contentChunk: string) => {
    if (typeof contentChunk === 'string') {
      setStreamingContent((prev) => (prev || '') + contentChunk);
    } else {
      logger.warn('useArtifact', 'Received non-string chunk', {
        chunk: contentChunk,
      });
    }
  }, []);

  const finishStreamingArtifact = useCallback(
    (finalDocId: string) => {
      logger.info('useArtifact', 'FINISH_STREAMING', { finalDocId });
      const updater: MutatorCallback<UIArtifact> = (current) => ({
        ...(current || initialArtifactData),
        status: 'complete',
        documentId: finalDocId,
      });
      setLocalState(updater, false);
      revalidateDbDocument();
      setStreamingContent(null);
    },
    [setLocalState, revalidateDbDocument],
  );

  const closeArtifact = useCallback(() => {
    const updater: MutatorCallback<UIArtifact> = (current) => ({
      ...(current || initialArtifactData),
      isVisible: false,
    });
    setLocalState(updater, false);
  }, [setLocalState]);

  const resetArtifact = useCallback(() => {
    setLocalState(initialArtifactData, false);
    setStreamingContent(null);
  }, [setLocalState]);

  return useMemo(
    () => ({
      artifact,
      setArtifact,
      setVisibility,
      startStreamingArtifact,
      updateStreamingContent,
      finishStreamingArtifact,
      closeArtifact,
      resetArtifact,
      isLoading: artifact.status === 'loading',
      isStreaming: artifact.status === 'streaming',
      error: dbError,
    }),
    [
      artifact,
      setArtifact,
      setVisibility,
      startStreamingArtifact,
      updateStreamingContent,
      finishStreamingArtifact,
      closeArtifact,
      resetArtifact,
      dbError,
    ],
  );
}
