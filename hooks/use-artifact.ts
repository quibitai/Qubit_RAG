'use client';

import useSWR from 'swr';
import type { UIArtifact } from '@/components/artifact';
import { useCallback, useMemo } from 'react';

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

  const setArtifactMetadata = useCallback(
    (updaterFn: any | ((currentMetadata: any) => any)) => {
      setLocalArtifactMetadata((currentMetadata: any) => {
        if (typeof updaterFn === 'function') {
          return updaterFn(currentMetadata);
        }
        return updaterFn;
      });
    },
    [setLocalArtifactMetadata],
  );

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
      setMetadata: setArtifactMetadata,
      // Add new streaming-specific methods
      startStreamingArtifact,
      updateStreamingContent,
      finishStreamingArtifact,
      closeArtifact,
    }),
    [
      artifact,
      setArtifact,
      localArtifactMetadata,
      setArtifactMetadata,
      startStreamingArtifact,
      updateStreamingContent,
      finishStreamingArtifact,
      closeArtifact,
    ],
  );
}
