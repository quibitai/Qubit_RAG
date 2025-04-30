'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { exampleSetup } from 'prosemirror-example-setup';
import { marks, nodes } from 'prosemirror-schema-basic';
import debounce from 'lodash.debounce';

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
}

export default function RichTextEditor({
  initialContent,
  onSaveContent,
  docId,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastSavedContentRef = useRef<string>(initialContent || '');
  const contentChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  console.log(
    'RichTextEditor loaded for docId:',
    docId,
    'with initialContent:',
    initialContent ? `${initialContent.substring(0, 50)}...` : null,
  );

  // Create a debounced save function
  const debouncedSave = useCallback(
    debounce((content: string) => {
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
        onSaveContent(content, true);
      } else {
        console.log(
          '[RichTextEditor] No significant change detected, skipping save',
        );
      }
    }, 3000), // Increased debounce to 3 seconds for more stability
    [onSaveContent],
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
    `;

    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Initialize ProseMirror
  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
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
      viewRef.current = new EditorView(editorRef.current, {
        state,
        dispatchTransaction: (transaction) => {
          if (!viewRef.current) return;

          // Apply the transaction to create a new state
          const newState = viewRef.current.state.apply(transaction);

          // Update the editor with the new state
          viewRef.current.updateState(newState);

          // If the transaction changes the document, trigger a save
          if (transaction.docChanged) {
            // Extract content as HTML
            const contentElement = document.createElement('div');
            const fragment = DOMSerializer.fromSchema(
              docSchema,
            ).serializeFragment(newState.doc.content);
            contentElement.appendChild(fragment);
            const content = contentElement.innerHTML;

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
            // Use a longer initial delay to reduce save frequency during active typing
            contentChangeTimeoutRef.current = setTimeout(() => {
              console.log(
                '[RichTextEditor] Content change detected, scheduling debounced save',
              );
              debouncedSave(content);
            }, 1500); // Wait longer before triggering the debounced save
          }
        },
      });

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
        if (viewRef.current && !isInputFocused) {
          viewRef.current.focus();
        }
      }, 100);

      setIsInitialized(true);
      console.log('ProseMirror initialized for docId:', docId);
    }

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
  }, [docId, initialContent, debouncedSave]);

  // Handle content updates if initialContent changes
  useEffect(() => {
    if (viewRef.current && initialContent && isInitialized) {
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

        viewRef.current.updateState(newState);
      }
    }
  }, [initialContent, isInitialized]);

  return (
    <div
      ref={editorRef}
      className="prose dark:prose-invert max-w-none w-full min-h-[400px] bg-white dark:bg-gray-800 rounded shadow-sm"
    />
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
