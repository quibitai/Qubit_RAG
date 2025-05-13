'use client';

import useSWR from 'swr';
import type { UIArtifact } from '@/components/artifact';
import { useCallback, useMemo, useEffect } from 'react';
import { fetcher } from '@/lib/utils';

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

type Selector<T> = (state: UIArtifact) => T;

export function useArtifactSelector<Selected>(selector: Selector<Selected>) {
  const { data: localArtifact } = useSWR<UIArtifact>('artifact', null, {
    fallbackData: initialArtifactData,
  });

  const selectedValue = useMemo(() => {
    if (!localArtifact) return selector(initialArtifactData);
    return selector(localArtifact);
  }, [localArtifact, selector]);

  return selectedValue;
}

export function useArtifact() {
  const { data: localArtifact, mutate: setLocalArtifact } = useSWR<UIArtifact>(
    'artifact',
    null,
    {
      fallbackData: initialArtifactData,
    },
  );

  const artifact = useMemo(() => {
    if (!localArtifact) return initialArtifactData;
    return localArtifact;
  }, [localArtifact]);

  const setArtifact = useCallback(
    (updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact)) => {
      setLocalArtifact((currentArtifact) => {
        const artifactToUpdate = currentArtifact || initialArtifactData;

        if (typeof updaterFn === 'function') {
          return updaterFn(artifactToUpdate);
        }

        return updaterFn;
      });
    },
    [setLocalArtifact],
  );

  const { data: localArtifactMetadata, mutate: setLocalArtifactMetadata } =
    useSWR<any>(
      () =>
        artifact.documentId ? `artifact-metadata-${artifact.documentId}` : null,
      null,
      {
        fallbackData: null,
      },
    );

  // Add a way to fetch persisted document data when done streaming
  const { data: persistedDocument } = useSWR(
    () =>
      artifact.documentId &&
      artifact.documentId !== 'init' &&
      artifact.documentId !== 'streaming' &&
      artifact.status === 'idle'
        ? `/api/document?id=${artifact.documentId}`
        : null,
    fetcher,
    {
      // Only fetch when streaming is complete and we have a valid ID
      revalidateOnFocus: false,
    },
  );

  // Sync with persisted document data after streaming is complete
  useEffect(() => {
    if (persistedDocument && persistedDocument.length > 0) {
      const latestDocument = persistedDocument[persistedDocument.length - 1];

      // Update the local artifact with the persisted data
      if (
        latestDocument?.content &&
        artifact.documentId === latestDocument.id
      ) {
        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          content: latestDocument.content || currentArtifact.content,
          title: latestDocument.title || currentArtifact.title,
          // Keep status 'idle' since streaming is done
        }));
      }
    }
  }, [persistedDocument, artifact.documentId, setArtifact]);

  // Additional helper functions for managing streaming state
  const startStreamingArtifact = useCallback(
    (kind: string, title: string) => {
      setArtifact((current) => ({
        ...current,
        documentId: 'streaming', // Temporary ID until we get the real one
        kind: kind as any, // Type coercion needed here
        title,
        content: '',
        status: 'streaming',
        isVisible: true,
      }));
    },
    [setArtifact],
  );

  const updateStreamingContent = useCallback(
    (content: string) => {
      setArtifact((current) => ({
        ...current,
        content: current.content + content,
      }));
    },
    [setArtifact],
  );

  const finishStreamingArtifact = useCallback(
    (documentId: string) => {
      setArtifact((current) => ({
        ...current,
        documentId,
        status: 'idle',
      }));
    },
    [setArtifact],
  );

  const closeArtifact = useCallback(() => {
    setArtifact((current) => ({
      ...current,
      isVisible: false,
    }));
  }, [setArtifact]);

  return useMemo(
    () => ({
      artifact,
      setArtifact,
      metadata: localArtifactMetadata,
      setMetadata: setLocalArtifactMetadata,
      // Add new streaming-specific methods
      startStreamingArtifact,
      updateStreamingContent,
      finishStreamingArtifact,
      closeArtifact,
      // Add persisted document data
      persistedDocument: persistedDocument?.[persistedDocument.length - 1],
    }),
    [
      artifact,
      setArtifact,
      localArtifactMetadata,
      setLocalArtifactMetadata,
      startStreamingArtifact,
      updateStreamingContent,
      finishStreamingArtifact,
      closeArtifact,
      persistedDocument,
    ],
  );
}
