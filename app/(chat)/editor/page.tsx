'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { useChatPane } from '@/context/ChatPaneContext';

export default function EditorIndexPage() {
  const router = useRouter();
  const { setCurrentActiveSpecialistId } = useChatPane();

  useEffect(() => {
    // Set the document editor bit context
    setCurrentActiveSpecialistId('document-editor');

    // Generate a new document ID and redirect to it
    const newDocId = nanoid();
    router.replace(`/editor/${newDocId}`);
  }, [router, setCurrentActiveSpecialistId]);

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-muted-foreground">Redirecting to new document...</p>
    </div>
  );
}
