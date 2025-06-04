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
      console.log('[useArtifact] 🚀 Starting artifact stream:', {
        kind,
        title,
      });
      setArtifact((current) => ({
        ...current,
        documentId: 'streaming', // Temporary ID until we get the real one
        kind: kind as any, // Type coercion needed here
        title,
        content: '', // Start with empty content
        status: 'streaming',
        isVisible: true,
      }));
    },
    [setArtifact],
  );

  const updateStreamingContent = useCallback(
    (contentChunk: string) => {
      console.log('[useArtifact] 💨 Updating streaming content:', {
        chunkLength: contentChunk?.length || 0,
        chunkPreview: contentChunk?.substring(0, 50) || 'N/A',
        chunkType: typeof contentChunk,
      });
      setArtifact((current) => {
        const newContent = (current.content || '') + contentChunk;
        console.log('[useArtifact] 📝 Content accumulation:', {
          previousLength: current.content?.length || 0,
          chunkLength: contentChunk?.length || 0,
          newTotalLength: newContent.length,
          currentStatus: current.status,
          documentId: current.documentId,
        });
        return {
          ...current,
          content: newContent,
          status: 'streaming', // Keep status as streaming
        };
      });
    },
    [setArtifact],
  );

  const finishStreamingArtifact = useCallback(
    (documentId: string) => {
      console.log('[useArtifact] ✅ Finishing artifact stream:', {
        documentId,
      });
      setArtifact((current) => {
        console.log('[useArtifact] 📊 Final streaming stats:', {
          finalDocumentId: documentId,
          finalContentLength: current.content?.length || 0,
          wasStreaming: current.status === 'streaming',
          currentDocumentId: current.documentId,
        });
        return {
          ...current,
          documentId, // Update to final documentId
          status: 'idle', // Set to idle to indicate streaming is complete
          // Keep the content that was accumulated during streaming
        };
      });
    },
    [setArtifact],
  );

  const closeArtifact = useCallback(() => {
    setArtifact((current) => ({
      ...current,
      isVisible: false,
    }));
  }, [setArtifact]);

  // Add cleanup method to reset artifact state completely
  const resetArtifact = useCallback(() => {
    setArtifact(initialArtifactData);
    setLocalArtifactMetadata(null);
  }, [setArtifact, setLocalArtifactMetadata]);

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
      resetArtifact,
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
      resetArtifact,
    ],
  );
}
