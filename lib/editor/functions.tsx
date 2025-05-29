'use client';

import { defaultMarkdownSerializer } from 'prosemirror-markdown';
import { DOMParser, type Node } from 'prosemirror-model';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';

import { documentSchema } from './config';
import { createSuggestionWidget, type UISuggestion } from './suggestions';

export const buildDocumentFromContent = async (content: string) => {
  console.log(
    '[buildDocumentFromContent] ASYNC VERSION - Input content length:',
    content?.length || 0,
  );
  console.log(
    '[buildDocumentFromContent] ASYNC VERSION - Input content preview:',
    content?.substring(0, 200) || 'empty',
  );

  // If content is empty or undefined, create a simple paragraph
  if (!content || content.trim() === '') {
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Content is empty, creating default paragraph',
    );
    const parser = DOMParser.fromSchema(documentSchema);
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = '<p>No content available</p>';
    const result = parser.parse(tempContainer);
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Empty content result:',
      result,
    );
    return result;
  }

  const parser = DOMParser.fromSchema(documentSchema);

  try {
    // Use remark to convert markdown to HTML properly
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Starting remark processing...',
    );
    const result = await remark()
      .use(remarkGfm)
      .use(remarkHtml)
      .process(content);

    const htmlString = result.toString();
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Remark HTML output length:',
      htmlString.length,
    );
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Remark HTML preview:',
      htmlString.substring(0, 300),
    );

    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = htmlString;

    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Temp container innerHTML:',
      tempContainer.innerHTML.substring(0, 300),
    );
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Temp container children count:',
      tempContainer.children.length,
    );

    const parsedDoc = parser.parse(tempContainer);
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - ProseMirror document created',
    );
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Document content size:',
      parsedDoc.content.size,
    );
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Document child count:',
      parsedDoc.content.childCount,
    );
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Document JSON:',
      JSON.stringify(parsedDoc.toJSON(), null, 2),
    );

    return parsedDoc;
  } catch (error) {
    console.error(
      '[buildDocumentFromContent] ASYNC VERSION - Error parsing content:',
      error,
    );
    // Fallback: treat as plain text
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = `<p>${content.replace(/\n/g, '<br>')}</p>`;
    const fallbackDoc = parser.parse(tempContainer);
    console.log(
      '[buildDocumentFromContent] ASYNC VERSION - Fallback document created, content size:',
      fallbackDoc.content.size,
    );
    return fallbackDoc;
  }
};

export const buildContentFromDocument = (document: Node) => {
  const result = defaultMarkdownSerializer.serialize(document);
  console.log(
    '[buildContentFromDocument] Serialized content length:',
    result.length,
  );
  console.log(
    '[buildContentFromDocument] Serialized content preview:',
    result.substring(0, 100),
  );
  return result;
};

export const createDecorations = (
  suggestions: Array<UISuggestion>,
  view: EditorView,
) => {
  const decorations: Array<Decoration> = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: 'suggestion-highlight',
        },
        {
          suggestionId: suggestion.id,
          type: 'highlight',
        },
      ),
    );

    decorations.push(
      Decoration.widget(
        suggestion.selectionStart,
        (view) => {
          const { dom } = createSuggestionWidget(suggestion, view);
          return dom;
        },
        {
          suggestionId: suggestion.id,
          type: 'widget',
        },
      ),
    );
  }

  return DecorationSet.create(view.state.doc, decorations);
};
