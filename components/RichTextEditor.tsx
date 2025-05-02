'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { exampleSetup } from 'prosemirror-example-setup';
import { marks, nodes } from 'prosemirror-schema-basic';
import debounce from 'lodash.debounce';
import { useDocumentState } from '@/context/DocumentContext';
import { toast } from 'sonner';

// Extend EditorView type to include our custom docId property
declare module 'prosemirror-view' {
  interface EditorView {
    docId?: string;
  }
}

// Define a basic document schema extending the basic schema
const docSchema = new Schema({
  nodes: {
    ...nodes,
    doc: {
      content: 'block+',
    },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
  },
  marks: {
    ...marks,
  },
});

interface RichTextEditorProps {
  initialContent: string | null;
  onSaveContent: (content: string, debounce?: boolean) => void;
  docId: string;
  streamedContent?: string | null;
  streamTimestamp?: number | null;
}

export default function RichTextEditor({
  initialContent,
  onSaveContent,
  docId,
  streamedContent,
  streamTimestamp,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastSavedContentRef = useRef<string>(initialContent || '');
  const contentChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedTimestampRef = useRef<number | null>(null);
  const { documentState, completeStreamingUpdate, setStreamingError } =
    useDocumentState();
  const isNewDoc = docId === 'new'; // Track if this is a special "new" document
  const isMountedRef = useRef<boolean>(true); // Track if component is mounted

  // Cleanup function for unmounting
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  console.log(
    'RichTextEditor loaded for docId:',
    docId,
    'with initialContent:',
    initialContent ? `${initialContent.substring(0, 50)}...` : null,
    'streamStatus:',
    documentState.streamStatus,
  );

  // Create a debounced save function with isMounted check
  const debouncedSave = useCallback(
    debounce((content: string) => {
      // Skip if component is unmounted
      if (!isMountedRef.current) return;

      // Don't save if docId is "new" - this is a special placeholder
      if (isNewDoc) {
        console.log(
          '[RichTextEditor] Cannot save document with ID "new" - use "Save As" instead',
        );
        console.log(
          '[RichTextEditor] Please use "Create" or "Save As" to save this new document first',
        );
        return;
      }

      // More strict empty content check
      if (
        !content ||
        content.trim() === '' ||
        content === '<p></p>' ||
        content.includes('Start typing your document here...')
      ) {
        console.log(
          '[RichTextEditor] Empty content or placeholder detected, skipping save',
        );
        return;
      }

      // Add a meaningful change detection threshold
      const hasSignificantChange = (current: string, previous: string) => {
        // Skip if identical
        if (current === previous) return false;

        // Remove all HTML tags and whitespace for comparison
        const stripHtml = (html: string) => {
          const temp = document.createElement('div');
          temp.innerHTML = html;
          return temp.textContent?.replace(/\s+/g, '') || '';
        };

        const strippedCurrent = stripHtml(current);
        const strippedPrevious = stripHtml(previous);

        // Skip if the content is essentially the same (ignoring formatting)
        if (strippedCurrent === strippedPrevious) return false;

        // Detect if the difference is substantial (at least 2 characters)
        const lenDiff = Math.abs(
          strippedCurrent.length - strippedPrevious.length,
        );

        // Require a meaningful difference in content to trigger a save
        return lenDiff >= 2;
      };

      // Only save if content has actually changed significantly
      if (hasSignificantChange(content, lastSavedContentRef.current)) {
        console.log(
          '[RichTextEditor] Significant content change detected, saving...',
        );
        lastSavedContentRef.current = content;

        // Use requestAnimationFrame to ensure we're not in a render cycle
        requestAnimationFrame(() => {
          if (isMountedRef.current) {
            onSaveContent(content, true);
          }
        });
      } else {
        console.log(
          '[RichTextEditor] No significant change detected, skipping save',
        );
      }
    }, 3000), // Increased debounce to 3 seconds for more stability
    [onSaveContent, docId, isNewDoc],
  );

  // Add dispatchTransaction to respect the 'new' document status
  const handleDocChanged = useCallback(
    (content: string) => {
      // For 'new' documents, just record the content but don't trigger saves
      if (isNewDoc) {
        console.log(
          '[RichTextEditor] Content changed in new document, updating local state',
        );
        lastSavedContentRef.current = content;
        // Use requestAnimationFrame to defer state updates
        requestAnimationFrame(() => {
          onSaveContent(content, false); // Update without triggering save
        });
        return;
      }

      // Only process changes if we're not currently streaming from the AI
      if (documentState.streamStatus === 'streaming') {
        console.log('[RichTextEditor] Ignoring user edit during AI streaming');
        return;
      }

      // Skip empty content
      if (!content || content.trim() === '' || content === '<p></p>') {
        console.log('Empty content detected during edit, skipping save');
        return;
      }

      // Skip if content is very similar to last saved
      const stripHtml = (html: string) => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent?.replace(/\s+/g, '') || '';
      };

      const currentText = stripHtml(content);
      const savedText = stripHtml(lastSavedContentRef.current);

      // If there's no substantial difference, avoid scheduling a save
      const lenDiff = Math.abs(currentText.length - savedText.length);
      if (currentText === savedText || lenDiff < 2) {
        return;
      }

      // Cancel existing timeout if there is one
      if (contentChangeTimeoutRef.current) {
        clearTimeout(contentChangeTimeoutRef.current);
      }

      // Set a new timeout to trigger debounced save after period of inactivity
      contentChangeTimeoutRef.current = setTimeout(() => {
        console.log(
          '[RichTextEditor] Content change detected, scheduling debounced save',
        );
        debouncedSave(content);
      }, 1500);
    },
    [debouncedSave, documentState.streamStatus, isNewDoc, onSaveContent],
  );

  // Add custom CSS to fix toolbar and editor styling
  useEffect(() => {
    // Create a style element
    const style = document.createElement('style');
    style.innerHTML = `
      .ProseMirror {
        position: relative;
        word-wrap: break-word;
        white-space: pre-wrap;
        white-space: break-spaces;
        -webkit-font-variant-ligatures: none;
        font-variant-ligatures: none;
        font-feature-settings: "liga" 0;
        padding: 12px;
        min-height: 300px;
        border-radius: 0.25rem;
        outline: none;
        color: inherit;
        background: transparent;
      }
      
      .ProseMirror-menubar {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-start;
        background-color: #f5f5f5;
        border-bottom: 1px solid #e0e0e0;
        margin-bottom: 8px;
        border-top-left-radius: 0.25rem;
        border-top-right-radius: 0.25rem;
        position: sticky;
        top: 0;
        z-index: 10;
        padding: 4px;
      }
      
      .dark .ProseMirror-menubar {
        background-color: #2d3748;
        border-color: #4a5568;
      }
      
      .ProseMirror-menuitem {
        margin: 0 2px;
      }
      
      .ProseMirror p {
        margin-top: 0.75em;
        margin-bottom: 0.75em;
      }
      
      .ProseMirror-menu-dropdown-menu {
        color: black;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        z-index: 15;
        min-width: 6em;
        padding: 4px;
      }
      
      .ProseMirror-menu {
        margin: 0 -4px;
        line-height: 1;
      }
      
      .ProseMirror-menu-active {
        background: #eee;
        border-radius: 4px;
      }
      
      .ProseMirror-menu-disabled {
        opacity: 0.3;
      }
      
      .ProseMirror-menu-submenu-wrap {
        position: relative;
        margin-right: -4px;
      }
      
      .ProseMirror-menu-submenu-label::after {
        content: "▾";
        font-size: 0.7em;
        vertical-align: text-top;
        padding-left: 2px;
      }
      
      .ProseMirror-menu-submenu {
        display: none;
        min-width: 4em;
        left: 100%;
        top: -3px;
      }
      
      .ProseMirror-menu-active.ProseMirror-menu-submenu-wrap > .ProseMirror-menu-submenu {
        display: block;
      }
      
      .dark .ProseMirror-menu-dropdown-menu {
        background-color: #2d3748;
        color: white;
        border-color: #4a5568;
      }
      
      .dark .ProseMirror {
        color: white;
      }
      
      .ProseMirror-icon {
        display: inline-block;
        line-height: 0.8;
        vertical-align: -2px;
        padding: 2px 8px;
        cursor: pointer;
        border: 1px solid transparent;
        border-radius: 4px;
      }
      
      .ProseMirror-icon:hover {
        background: #f0f0f0;
        border-color: #ccc;
      }
      
      .dark .ProseMirror-icon:hover {
        background: #4a5568;
        border-color: #718096;
      }
      
      .ProseMirror-icon svg {
        fill: currentColor;
        height: 1em;
      }
      
      /* Add visual indicator for streaming status */
      .editor-container {
        position: relative;
      }
      
      .editor-streaming-indicator {
        position: absolute;
        top: 10px;
        right: 10px;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        animation: pulse 1.5s infinite;
        z-index: 20;
        background-color: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
      }
      
      .dark .editor-streaming-indicator {
        background-color: rgba(59, 130, 246, 0.3);
        color: #93c5fd;
      }
      
      @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
    `;

    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Initialize ProseMirror
  useEffect(() => {
    // Don't initialize if we don't have a DOM element reference yet
    if (!editorRef.current) return;

    // Don't re-initialize if we already have a view instance for this docId
    if (viewRef.current && docId === viewRef.current.docId) return;

    // If we have an existing view instance, clean it up before creating a new one
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    // Use try/catch to prevent cryptic ProseMirror initialization errors
    try {
      // Create a temporary element to parse HTML content
      const contentElement = document.createElement('div');

      // If we have initial content, use it; otherwise, use an empty paragraph
      if (
        initialContent &&
        initialContent.trim() !== '' &&
        initialContent !== '<p></p>'
      ) {
        contentElement.innerHTML = initialContent;
        lastSavedContentRef.current = initialContent;
      } else {
        contentElement.innerHTML = '<p>Start typing your document here...</p>';
        lastSavedContentRef.current =
          '<p>Start typing your document here...</p>';
      }

      // Create the initial editor state
      const state = EditorState.create({
        doc: DOMParser.fromSchema(docSchema).parse(contentElement),
        plugins: exampleSetup({
          schema: docSchema,
          menuBar: true,
          floatingMenu: false,
          history: true,
        }),
      });

      // Create the editor view
      const view = new EditorView(editorRef.current, {
        state,
        dispatchTransaction: (transaction) => {
          if (!view) return;

          // Apply the transaction to create a new state
          const newState = view.state.apply(transaction);

          // Update the editor with the new state
          if (transaction.docChanged) {
            // Apply the state update first
            requestAnimationFrame(() => {
              view.updateState(newState);

              // Extract content as HTML after the state update is applied
              const contentElement = document.createElement('div');
              const fragment = DOMSerializer.fromSchema(
                docSchema,
              ).serializeFragment(newState.doc.content);
              contentElement.appendChild(fragment);
              const content = contentElement.innerHTML;

              // Handle document changes with another requestAnimationFrame to ensure we're outside any render cycle
              requestAnimationFrame(() => {
                handleDocChanged(content);
              });
            });
          } else {
            // For non-document-changing transactions, still use RAF but no need for content extraction
            requestAnimationFrame(() => {
              view.updateState(newState);
            });
          }
        },
      });

      // Store the docId on the view instance for easier identification
      // @ts-ignore - Adding custom property to track document ID
      view.docId = docId;

      // Store the view
      viewRef.current = view;

      // Focus the editor after initialization, but only if no other element has focus
      setTimeout(() => {
        // Check if any input or contentEditable is currently focused
        const activeElement = document.activeElement;
        const isInputFocused =
          activeElement &&
          (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.getAttribute('contenteditable') === 'true');

        // Only focus the editor if no other input element is focused
        if (view && !isInputFocused) {
          view.focus();
        }
      }, 100);

      setIsInitialized(true);
      console.log('ProseMirror initialized for docId:', docId);
    } catch (error) {
      console.error('Error initializing ProseMirror editor:', error);
      toast.error(
        'Error initializing document editor. Please try refreshing the page.',
      );
      setIsInitialized(false);
    }

    return () => {
      // No need to cleanup on every dependency change - we'll handle this at the start of this effect
      // This prevents excessive editor destruction during renders
    };
  }, [docId, initialContent, handleDocChanged]);

  // Proper cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }

      // Clear any pending timeouts
      if (contentChangeTimeoutRef.current) {
        clearTimeout(contentChangeTimeoutRef.current);
      }

      // Cancel any pending debounced saves
      debouncedSave.cancel();
    };
  }, []);

  // Handle content updates if initialContent changes
  useEffect(() => {
    if (viewRef.current && initialContent && isInitialized) {
      console.log(
        `[RichTextEditor] initialContent changed for docId: ${docId}`,
        `${initialContent.substring(0, 50)}...`,
      );

      // Only update if the content is valid (not empty or placeholder)
      if (
        initialContent.trim() !== '' &&
        initialContent !== '<p></p>' &&
        !initialContent.includes('Start typing your document here...')
      ) {
        const contentElement = document.createElement('div');
        contentElement.innerHTML = initialContent;
        lastSavedContentRef.current = initialContent;

        const newState = EditorState.create({
          doc: DOMParser.fromSchema(docSchema).parse(contentElement),
          plugins: viewRef.current.state.plugins,
        });

        // Set a meta flag to prevent the change from triggering a save
        const transaction = viewRef.current.state.tr.setMeta('skipSave', true);
        transaction.setSelection(viewRef.current.state.selection);
        transaction.replaceWith(
          0,
          viewRef.current.state.doc.content.size,
          newState.doc.content,
        );

        viewRef.current.updateState(viewRef.current.state.apply(transaction));
        console.log(
          '[RichTextEditor] Updated editor content from new initialContent',
        );
      }
    }
  }, [initialContent, isInitialized, docId]);

  // Effect to handle streamed content updates
  useEffect(() => {
    const view = viewRef.current;

    // Check if timestamp is new and content exists
    if (
      view &&
      streamedContent &&
      streamTimestamp &&
      streamTimestamp !== lastProcessedTimestampRef.current
    ) {
      console.log(
        `[RichTextEditor] Applying streamed update for doc ${docId}, timestamp: ${streamTimestamp}`,
      );

      // Parse the streamed content - wrap in requestAnimationFrame to prevent React cycle violations
      requestAnimationFrame(() => {
        try {
          const parser = DOMParser.fromSchema(view.state.schema);
          // Create a temporary element to parse the HTML string
          const tempElement = document.createElement('div');
          tempElement.innerHTML = streamedContent.trim(); // Assuming HTML content
          const newDocNode = parser.parse(tempElement);

          // If parsing resulted in an empty/invalid node, log and skip
          if (!newDocNode || newDocNode.content.size === 0) {
            console.warn(
              '[RichTextEditor] Parsed streamed content resulted in empty node. Skipping update.',
            );
            return; // Don't apply empty update
          }

          // Create and dispatch transaction
          const tr = view.state.tr;
          // Replace the entire document content
          tr.replaceWith(0, view.state.doc.content.size, newDocNode.content);
          // Dispatch transaction without adding to undo history
          tr.setMeta('addToHistory', false);
          tr.setMeta('skipSave', true); // Don't trigger a save from this update

          // Update the editor state
          view.dispatch(tr);

          // Update the timestamp ref - needed for deduplication
          lastProcessedTimestampRef.current = streamTimestamp;

          // Also update the lastSavedContentRef to avoid unnecessary saves
          const contentElement = document.createElement('div');
          const fragment = DOMSerializer.fromSchema(
            docSchema,
          ).serializeFragment(newDocNode.content);
          contentElement.appendChild(fragment);
          lastSavedContentRef.current = contentElement.innerHTML;

          // If streaming was just completed, show a toast notification
          if (
            documentState.streamStatus === 'completed' &&
            documentState.lastStreamUpdate === streamTimestamp
          ) {
            console.log('[RichTextEditor] AI update completed');
          }
        } catch (parseError) {
          console.error(
            '[RichTextEditor] Error parsing streamed content:',
            parseError,
            'Content:',
            streamedContent,
          );

          // Use setTimeout to avoid React cycle violations
          setTimeout(() => {
            setStreamingError(
              docId,
              `Failed to parse AI update: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            );
            toast.error('Error applying AI update');
          }, 0);
        }
      });
    }
  }, [
    streamTimestamp,
    streamedContent,
    docId,
    documentState.streamStatus,
    documentState.lastStreamUpdate,
    setStreamingError,
  ]);

  // Effect to handle stream completion
  useEffect(() => {
    // When streaming is completed, update localStorage to track document version
    if (documentState.streamStatus === 'completed' && isInitialized) {
      try {
        // Store last updated timestamp in localStorage to track version
        localStorage.setItem(`doc-${docId}-lastUpdate`, Date.now().toString());
        console.log(
          `[RichTextEditor] Streaming completed for ${docId}, updated localStorage version`,
        );
      } catch (error) {
        console.error(
          '[RichTextEditor] Error saving version to localStorage:',
          error,
        );
      }
    }
  }, [documentState.streamStatus, docId, isInitialized]);

  return (
    <div className="editor-container prose dark:prose-invert max-w-none w-full min-h-[400px] bg-white dark:bg-gray-800 rounded shadow-sm relative">
      {documentState.streamStatus === 'streaming' && (
        <div className="editor-streaming-indicator">
          AI updating document...
        </div>
      )}
      <div ref={editorRef} className="w-full min-h-[400px]" />
      {documentState.streamStatus === 'error' &&
        documentState.errors?.stream && (
          <div className="p-2 mt-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded">
            Error: {documentState.errors.stream}
          </div>
        )}
    </div>
  );
}

// Helper for serializing ProseMirror document to DOM
const DOMSerializer = {
  fromSchema: (schema: Schema) => {
    return {
      serializeFragment: (fragment: any) => {
        const temp = document.createDocumentFragment();
        const nodes = fragment.content || fragment;

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          let domNode: Node | null = null;

          if (node.type.name === 'paragraph') {
            domNode = document.createElement('p');
            if (node.content) {
              domNode.appendChild(
                DOMSerializer.fromSchema(schema).serializeFragment(
                  node.content,
                ),
              );
            }
          } else if (node.type.name === 'text') {
            domNode = document.createTextNode(node.text);
          } else {
            domNode = document.createElement('div');
          }

          if (domNode) {
            temp.appendChild(domNode);
          }
        }

        return temp;
      },
    };
  },
};
