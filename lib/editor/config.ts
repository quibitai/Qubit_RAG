import { textblockTypeInputRule } from 'prosemirror-inputrules';
import { Schema } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { Plugin } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { MutableRefObject } from 'react';

import { buildContentFromDocument } from './functions';

export const documentSchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block'),
  marks: schema.spec.marks,
});

export function headingRule(level: number) {
  return textblockTypeInputRule(
    new RegExp(`^(#{1,${level}})\\s$`),
    documentSchema.nodes.heading,
    () => ({ level }),
  );
}

export const handleTransaction = ({
  transaction,
  editorRef,
  onSaveContent,
}: {
  transaction: Transaction;
  editorRef: MutableRefObject<EditorView | null>;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
}) => {
  if (!editorRef || !editorRef.current) return;

  const newState = editorRef.current.state.apply(transaction);
  editorRef.current.updateState(newState);

  if (transaction.docChanged && !transaction.getMeta('no-save')) {
    const updatedContent = buildContentFromDocument(newState.doc);

    if (transaction.getMeta('no-debounce')) {
      onSaveContent(updatedContent, false);
    } else {
      onSaveContent(updatedContent, true);
    }
  }
};

// Plugin to handle link clicks
export const linkClickPlugin = new Plugin({
  props: {
    handleClick(view, pos, event) {
      const { schema } = view.state;
      const { doc } = view.state;
      const clickPos = view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });

      if (!clickPos) return false;

      const $pos = doc.resolve(clickPos.pos);
      const link = $pos.marks().find((mark) => mark.type === schema.marks.link);

      if (link?.attrs.href) {
        // Open link in new tab
        window.open(link.attrs.href, '_blank', 'noopener,noreferrer');
        return true;
      }

      return false;
    },

    handleDOMEvents: {
      click: (view, event) => {
        const target = event.target as HTMLElement;

        // Check if the clicked element is a link
        if (target.tagName === 'A' && target.getAttribute('href')) {
          const href = target.getAttribute('href');
          if (href) {
            event.preventDefault();
            window.open(href, '_blank', 'noopener,noreferrer');
            return true;
          }
        }

        return false;
      },
    },
  },
});
