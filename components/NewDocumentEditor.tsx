'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import RichTextEditor from './RichTextEditor';
import { generateDocumentId, createDocumentUrl } from '@/lib/utils/document';
import { Spinner } from './ui/spinner';

/**
 * NewDocumentEditor is a specialized component for handling new document creation.
 * It's completely separate from the regular DocumentEditor to avoid state conflicts.
 */
const NewDocumentEditor: React.FC = () => {
  const router = useRouter();
  const [title, setTitle] = useState('Untitled Document');
  const [content, setContent] = useState(
    '<p>Start typing your document here...</p>',
  );
  const [isCreating, setIsCreating] = useState(false);

  // Handle title changes
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value);
    },
    [],
  );

  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    // Just update local state, don't trigger any saves
    setContent(newContent);
  }, []);

  // Create a new document and redirect to it
  const handleCreateDocument = useCallback(async () => {
    try {
      setIsCreating(true);

      // Generate a new UUID
      const documentId = generateDocumentId();

      // Save the document
      const response = await fetch('/api/documents/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: documentId,
          content,
          title,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create document (${response.status})`);
      }

      toast.success('Document created successfully!');

      // Redirect to the new document
      router.push(createDocumentUrl(documentId));
    } catch (error) {
      console.error('Error creating document:', error);
      toast.error('Failed to create document. Please try again.');
      setIsCreating(false);
    }
  }, [content, title, router]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with title and create button */}
      <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          className="text-xl font-semibold bg-transparent border-0 border-b border-transparent 
                    hover:border-gray-200 dark:hover:border-gray-700 focus:ring-0 
                    focus:border-blue-500 dark:focus:border-blue-400 px-0 py-1 w-full max-w-md"
          placeholder="Untitled Document"
          disabled={isCreating}
        />

        <div className="flex items-center gap-4">
          <div className="text-sm text-blue-500 flex items-center gap-1">
            {isCreating ? (
              <>
                <Spinner size="xs" />
                Creating...
              </>
            ) : (
              'New Document'
            )}
          </div>

          <button
            type="button"
            onClick={handleCreateDocument}
            disabled={isCreating}
            className="px-3 py-1 rounded text-sm bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-800/70 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Document
          </button>
        </div>
      </div>

      {/* Editor container */}
      <div className="flex-grow p-4 overflow-auto">
        <RichTextEditor
          initialContent={content}
          onSaveContent={handleContentChange}
          docId="new"
          streamedContent={null}
          streamTimestamp={null}
        />

        {/* Information box */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded-md">
          <p className="font-medium">This is a new document</p>
          <p className="text-sm mt-1">
            Click the "Create Document" button above to save this document with
            a unique ID. Your changes won't be saved until you create the
            document.
          </p>
        </div>
      </div>
    </div>
  );
};

export default NewDocumentEditor;
