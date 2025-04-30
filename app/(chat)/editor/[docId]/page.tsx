'use client';

import React, { useState, useEffect, useCallback } from 'react';
import RichTextEditor from '@/components/RichTextEditor';
import { toast } from 'sonner';
import debounce from 'lodash.debounce';

interface DocumentData {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function EditorPage({ params }: { params: { docId: string } }) {
  const [docContent, setDocContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Fetch document content on initial load
  useEffect(() => {
    async function fetchDocument() {
      setIsLoading(true);
      try {
        // Handle 'new' as a special case to create a new document
        if (params.docId === 'new') {
          // Set initial empty content for a new document
          setDocContent('<p>Start typing your document here...</p>');
          setIsLoading(false);
          return;
        }

        // Fetch existing document
        const response = await fetch(`/api/documents/${params.docId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch document: ${response.statusText}`);
        }

        const document: DocumentData = await response.json();
        setDocContent(document.content);
        setLastSaved(document.updatedAt);
      } catch (error) {
        console.error('Error fetching document:', error);
        toast.error('Failed to load the document. Please try again.');
        // Set to empty content to allow editing anyway
        setDocContent('<p></p>');
      } finally {
        setIsLoading(false);
      }
    }

    fetchDocument();
  }, [params.docId]);

  // Handle content changes and save
  const saveContent = useCallback(
    async (content: string) => {
      try {
        const isNew = params.docId === 'new';
        const method = isNew ? 'POST' : 'PUT';
        const url = isNew ? '/api/documents' : `/api/documents/${params.docId}`;

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content,
            title: 'Untitled Document', // You can extract title from content or add a title field
            id: isNew ? undefined : params.docId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to save document: ${response.statusText}`);
        }

        const savedDoc = await response.json();

        // If this was a new document, redirect to the saved document's URL
        if (isNew && window) {
          window.history.replaceState({}, '', `/editor/${savedDoc.id}`);
        }

        setLastSaved(new Date().toISOString());

        toast.success('Document saved successfully.');
      } catch (error) {
        console.error('Error saving document:', error);
        toast.error('Failed to save your changes. Please try again.');
      }
    },
    [params.docId],
  );

  // Create debounced version of save function
  const onContentChange = useCallback(
    (content: string, debounced = false) => {
      if (debounced) {
        // This is already debounced by the editor
        saveContent(content);
      } else {
        // Manual save, trigger immediately
        saveContent(content);
      }
    },
    [saveContent],
  );

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Document Bit</h1>
      <p className="mb-4">Editing Document ID: {params.docId}</p>
      <div className="border p-4 min-h-[400px] bg-white dark:bg-gray-800 rounded">
        {isLoading ? (
          <p>Loading document...</p>
        ) : docContent !== null ? (
          <RichTextEditor
            docId={params.docId}
            initialContent={docContent}
            onSaveContent={onContentChange} // Pass the save handler
          />
        ) : (
          <p>Document not found or failed to load.</p>
        )}
      </div>
      {lastSaved && (
        <p className="text-xs text-muted-foreground mt-2">
          Last saved: {new Date(lastSaved).toLocaleString()}
        </p>
      )}
    </div>
  );
}
