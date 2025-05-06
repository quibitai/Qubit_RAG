'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatPane } from '@/context/ChatPaneContext';
import { Button } from '@/components/ui/button';

export default function EditorPage() {
  const router = useRouter();
  const { setCurrentActiveSpecialistId } = useChatPane();

  // Redirect to a new document by default
  useEffect(() => {
    // Set context first
    setCurrentActiveSpecialistId('document-editor');

    // Then redirect
    router.push('/editor/new');
  }, [router, setCurrentActiveSpecialistId]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Button variant="outline" className="animate-pulse">
        Redirecting...
      </Button>
    </div>
  );
}
