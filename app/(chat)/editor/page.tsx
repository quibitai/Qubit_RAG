'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';

export default function EditorIndexPage() {
  const router = useRouter();

  useEffect(() => {
    // Generate a new document ID and redirect to it
    const newDocId = nanoid();
    router.replace(`/editor/${newDocId}`);
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-muted-foreground">Redirecting to new document...</p>
    </div>
  );
}
