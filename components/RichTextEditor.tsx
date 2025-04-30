'use client';

import React, { useEffect, useRef } from 'react';
// We will add ProseMirror imports later

interface RichTextEditorProps {
  initialContent: string | null;
  onSaveContent: (content: string, debounce?: boolean) => void;
  docId: string;
}

export default function RichTextEditor({
  initialContent,
  onSaveContent,
  docId,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null); // Replace 'any' with EditorView later

  console.log(
    'RichTextEditor loaded for docId:',
    docId,
    'with initialContent:',
    initialContent ? `${initialContent.substring(0, 50)}...` : null,
  );

  // We will add ProseMirror initialization logic later in useEffect

  return (
    <div ref={editorRef} className="prose dark:prose-invert max-w-none">
      {/* ProseMirror editor will mount here */}
    </div>
  );
}
