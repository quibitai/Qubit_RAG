'use client';

import 'prosemirror-view/style/prosemirror.css'; // Import ProseMirror base styles
import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import React, { useEffect, useRef, useState } from 'react';

import type { Suggestion } from '@/lib/db/schema';
import {
  documentSchema,
  handleTransaction,
  headingRule,
} from '@/lib/editor/config';
import {
  buildContentFromDocument,
  buildDocumentFromContent,
  createDecorations,
} from '@/lib/editor/functions';
import {
  projectWithPositions,
  suggestionsPlugin,
  suggestionsPluginKey,
} from '@/lib/editor/suggestions';

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Array<Suggestion>;
};

function PureEditor({
  content,
  onSaveContent,
  suggestions,
  status,
}: EditorProps) {
  const componentId = useRef(
    `editor-${Math.random().toString(36).substr(2, 9)}`,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isUserEditing, setIsUserEditing] = useState(false);
  const lastContentRef = useRef<string>('');

  console.log(
    `[${componentId.current}] PureEditor rendered with content length: ${content?.length || 0}, status: ${status}`,
  );

  useEffect(() => {
    let view: EditorView | null = null;
    const componentIdCurrent = componentId.current;
    console.log(
      `[${componentIdCurrent}] Mount effect. Initial content: "${content?.substring(0, 30)}..."`,
    );

    const initializeEditor = async () => {
      const container = containerRef.current;

      // CRITICAL: Prevent re-initialization if editor already exists
      if (editorRef.current || !container || isInitializing) {
        console.log(
          `[${componentIdCurrent}] Skipping initialization: editor exists=${!!editorRef.current}, container=${!!container}, isInitializing=${isInitializing}`,
        );
        return;
      }

      setIsInitializing(true);
      console.log(`[${componentIdCurrent}] Initializing ProseMirror editor...`);

      try {
        const initialDoc = await buildDocumentFromContent(content || '');
        const state = EditorState.create({
          doc: initialDoc,
          plugins: [
            ...exampleSetup({ schema: documentSchema, menuBar: false }),
            inputRules({
              rules: [
                headingRule(1),
                headingRule(2),
                headingRule(3),
                headingRule(4),
                headingRule(5),
                headingRule(6),
              ],
            }),
            suggestionsPlugin,
          ],
        });

        view = new EditorView(container, {
          state,
          dispatchTransaction: (transaction) => {
            if (transaction.docChanged && !transaction.getMeta('no-save')) {
              console.log(`[${componentIdCurrent}] User transaction detected.`);
              // Only flag as user editing if not currently streaming to avoid conflicts
              if (status !== 'streaming') {
                setIsUserEditing(true);
              } else {
                console.log(
                  `[${componentIdCurrent}] Transaction during streaming - not flagging as user edit.`,
                );
              }
            }
            handleTransaction({ transaction, editorRef, onSaveContent });
          },
          handleDOMEvents: {
            focus: () => {
              console.log(`[${componentIdCurrent}] Editor focused.`);
              if (status !== 'streaming') {
                setIsUserEditing(true);
              } else {
                console.log(
                  `[${componentIdCurrent}] Skipping user edit flag during streaming.`,
                );
              }
              return false;
            },
            blur: () => {
              console.log(`[${componentIdCurrent}] Editor blurred.`);
              const delay = status === 'streaming' ? 1000 : 200;
              setTimeout(() => setIsUserEditing(false), delay);
              return false;
            },
            click: () => {
              if (status === 'streaming') {
                console.log(
                  `[${componentIdCurrent}] Click during streaming - allowing view but not editing.`,
                );
                return false;
              }
              return false;
            },
          },
        });

        editorRef.current = view;
        lastContentRef.current = content || ''; // Initialize with initial content
        console.log(
          `[${componentIdCurrent}] Editor initialized. lastContentRef: "${lastContentRef.current.substring(0, 30)}..."`,
        );
      } catch (error) {
        console.error(
          `[${componentIdCurrent}] Error during EditorView creation:`,
          error,
        );
      } finally {
        setIsInitializing(false);
        console.log(`[${componentIdCurrent}] Initialization attempt finished.`);
      }
    };

    initializeEditor();

    return () => {
      console.log(`[${componentIdCurrent}] Cleanup: Destroying EditorView.`);
      if (view) {
        view.destroy();
        view = null;
      }
      if (editorRef.current) {
        editorRef.current = null;
      }
      console.log(
        `[${componentIdCurrent}] EditorView destroyed and refs cleaned up.`,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // IMPORTANT: Empty dependency array ensures this runs only once.

  useEffect(() => {
    const updateContent = async () => {
      const editorView = editorRef.current;
      const componentIdCurrent = componentId.current;

      console.log(
        `[${componentIdCurrent}] Content update check. UserEditing: ${isUserEditing}, Initializing: ${isInitializing}, Content: "${content?.substring(0, 30)}...", LastApplied: "${lastContentRef.current.substring(0, 30)}...", Status: ${status}`,
      );

      if (isUserEditing) {
        console.log(`[${componentIdCurrent}] Skip: User editing.`);
        return;
      }
      if (!editorView || !content || isInitializing) {
        console.log(
          `[${componentIdCurrent}] Skip: Editor not ready/no content/initializing.`,
        );
        return;
      }

      // If the content prop is already what we last successfully applied, do nothing.
      if (lastContentRef.current === content) {
        console.log(
          `[${componentIdCurrent}] Skip: Content prop matches last applied content.`,
        );
        return;
      }

      const currentDocText = buildContentFromDocument(editorView.state.doc);
      // If the editor's current text already matches the content prop, sync ref and skip.
      if (currentDocText === content) {
        console.log(
          `[${componentIdCurrent}] Skip: Editor document already matches content prop. Syncing lastContentRef.`,
        );
        lastContentRef.current = content;
        return;
      }

      const performUpdate = async (updateType: string) => {
        console.log(
          `[${componentIdCurrent}] (${updateType}) Updating editor. From "${currentDocText.substring(0, 30)}..." to "${content.substring(0, 30)}..."`,
        );
        try {
          const newDoc = await buildDocumentFromContent(content);
          const tr = editorView.state.tr.replaceWith(
            0,
            editorView.state.doc.content.size,
            newDoc.content,
          );
          tr.setMeta('no-save', true);
          editorView.dispatch(tr);
          lastContentRef.current = content; // Update ref *after* successful dispatch
          console.log(
            `[${componentIdCurrent}] (${updateType}) Update successful. lastContentRef: "${lastContentRef.current.substring(0, 30)}..."`,
          );
        } catch (e) {
          console.error(
            `[${componentIdCurrent}] (${updateType}) Error updating content:`,
            e,
          );
        }
      };

      if (status === 'idle') {
        // For idle, if editor content is longer, assume user edit and be very cautious.
        if (currentDocText.length > content.length) {
          console.log(
            `[${componentIdCurrent}] (Idle) Skip: Editor content longer, preserving user edit.`,
          );
          return;
        }
        // Debounce idle updates to catch rapid final updates
        const debounceAndUpdate = async () => {
          console.log(`[${componentIdCurrent}] (Idle) Debouncing update...`);
          await new Promise((resolve) => setTimeout(resolve, 250));
          if (isUserEditing || lastContentRef.current === content) {
            // Re-check
            console.log(
              `[${componentIdCurrent}] (Idle) Skip after debounce: Conditions changed.`,
            );
            return;
          }
          performUpdate('Idle-Debounced');
        };
        debounceAndUpdate();
      } else {
        // Streaming or other non-idle states
        performUpdate('Streaming');
      }
    };

    updateContent();
  }, [content, status, isUserEditing, isInitializing, componentId]);

  useEffect(() => {
    if (editorRef.current?.state.doc && content) {
      // Ensure suggestions is always an array to prevent map errors
      const safeSuggestions = suggestions || [];

      const projectedSuggestions = projectWithPositions(
        editorRef.current.state.doc,
        safeSuggestions,
      ).filter(
        (suggestion) => suggestion.selectionStart && suggestion.selectionEnd,
      );

      const decorations = createDecorations(
        projectedSuggestions,
        editorRef.current,
      );

      const transaction = editorRef.current.state.tr;
      transaction.setMeta(suggestionsPluginKey, { decorations });
      editorRef.current.dispatch(transaction);
    }
  }, [suggestions, content]);

  if (isInitializing) {
    return (
      <div className="relative prose dark:prose-invert flex items-center justify-center min-h-[200px]">
        <div className="text-muted-foreground">Loading editor...</div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Streaming indicator */}
      {status === 'streaming' && (
        <div className="absolute top-2 right-2 z-10 flex items-center space-x-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-md text-xs">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <span>Streaming...</span>
        </div>
      )}

      <div
        className="relative prose dark:prose-invert prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 max-w-none"
        ref={containerRef}
      />
    </div>
  );
}

export const Editor = PureEditor;
