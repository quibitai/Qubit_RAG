'use client';

import React, { useEffect, useRef, useState } from 'react';
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

  console.log(
    'RichTextEditor loaded for docId:',
    docId,
    'with initialContent:',
    initialContent ? `${initialContent.substring(0, 50)}...` : null,
  );

  // Create a debounced save function
  const debouncedSave = useRef(
    debounce((content: string) => {
      console.log('Debounced save triggered for docId:', docId);
      onSaveContent(content, true);
    }, 1000),
  ).current;

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // Initialize ProseMirror
  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      // Create a temporary element to parse HTML content
      const contentElement = document.createElement('div');

      // If we have initial content, use it; otherwise, use an empty paragraph
      if (initialContent) {
        contentElement.innerHTML = initialContent;
      } else {
        contentElement.innerHTML = '<p></p>';
      }

      // Create the initial editor state
      const state = EditorState.create({
        doc: DOMParser.fromSchema(docSchema).parse(contentElement),
        plugins: exampleSetup({ schema: docSchema }),
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

            // Trigger the debounced save
            debouncedSave(content);
          }
        },
      });

      setIsInitialized(true);
      console.log('ProseMirror initialized for docId:', docId);
    }

    return () => {
      // Cleanup on unmount
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [docId, initialContent, debouncedSave]);

  // Handle content updates if initialContent changes
  useEffect(() => {
    if (viewRef.current && initialContent && isInitialized) {
      const contentElement = document.createElement('div');
      contentElement.innerHTML = initialContent;

      const newState = EditorState.create({
        doc: DOMParser.fromSchema(docSchema).parse(contentElement),
        plugins: viewRef.current.state.plugins,
      });

      viewRef.current.updateState(newState);
    }
  }, [initialContent, isInitialized]);

  return (
    <div
      ref={editorRef}
      className="prose dark:prose-invert max-w-none min-h-[400px]"
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
