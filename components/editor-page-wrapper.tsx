'use client';

import { ReactNode, useEffect } from 'react';
import { useChatPane } from '@/context/ChatPaneContext';

/**
 * EditorPageWrapper
 *
 * This component automatically sets the currentActiveSpecialistId to 'document-editor'
 * when the editor page loads, ensuring proper context for the Document Editor Bit.
 */
export function EditorPageWrapper({
  children,
  docId,
}: {
  children: ReactNode;
  docId: string;
}) {
  const { setCurrentActiveSpecialistId, setActiveDocId } = useChatPane();

  // Set the context when this component mounts
  useEffect(() => {
    console.log(
      '[EditorPageWrapper] Setting currentActiveSpecialistId to document-editor',
    );
    setCurrentActiveSpecialistId('document-editor');

    // Set the active document ID if provided and not 'new'
    if (docId && docId !== 'new') {
      console.log(`[EditorPageWrapper] Setting activeDocId to ${docId}`);
      setActiveDocId(docId);
    }
  }, [setCurrentActiveSpecialistId, setActiveDocId, docId]);

  return <>{children}</>;
}
