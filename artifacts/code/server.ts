import { z } from 'zod';
import { streamObject } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import {
  codePrompt,
  updateDocumentPrompt,
} from '@/lib/ai/prompts/tools/documents';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { saveDocument } from '@/lib/db/queries';

export const codeDocumentHandler = createDocumentHandler<'code'>({
  kind: 'code',
  onCreateDocument: async ({
    id: docId,
    title,
    dataStream,
    initialContentPrompt,
    session,
  }) => {
    let draftContent = '';

    console.log(
      `[codeDocumentHandler] onCreateDocument for ID: ${docId}, Title: "${title}"`,
    );

    // 1. Save initial document placeholder to DB
    const userId = session?.user?.id;
    if (!userId) {
      console.error(
        '[codeDocumentHandler] User ID missing in session during onCreateDocument.',
      );
      dataStream.writeData({
        type: 'error',
        error: 'User not authenticated for document creation.',
      });
      throw new Error('User not authenticated');
    }

    try {
      await saveDocument({
        id: docId,
        title: title,
        content: '', // Initial empty content
        kind: 'code',
        userId: userId,
      });
      console.log(`[codeDocumentHandler] Initial document ${docId} saved.`);
    } catch (dbError) {
      console.error(
        `[codeDocumentHandler] Failed to save initial document ${docId}:`,
        dbError,
      );
      dataStream.writeData({
        type: 'error',
        error: 'Failed to initialize document in database.',
      });
      throw dbError;
    }

    // 2. Stream Metadata (after initial save)
    dataStream.writeData({ type: 'artifact-start', kind: 'code', title });
    dataStream.writeData({ type: 'id', content: docId });
    dataStream.writeData({ type: 'title', content: title });
    dataStream.writeData({ type: 'kind', content: 'code' });
    console.log(`[codeDocumentHandler] Streamed metadata for ${docId}`);

    // 3. Stream Content
    const promptToUse = initialContentPrompt || title;

    const { fullStream } = streamObject({
      model: myProvider.languageModel('artifact-model'),
      system: codePrompt,
      prompt: promptToUse,
      schema: z.object({
        code: z.string(),
      }),
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'object') {
        const { object } = delta;
        const { code } = object;

        if (code) {
          dataStream.writeData({
            type: 'code-delta',
            content: code ?? '',
          });

          draftContent = code;
        }
      }
    }

    // Update DB with final content
    await saveDocument({
      id: docId,
      title: title,
      content: draftContent,
      kind: 'code',
      userId,
    });
    console.log(
      `[codeDocumentHandler] Document ${docId} updated with generated content.`,
    );

    // 4. Notify client that we're finished
    dataStream.writeData({
      type: 'finish',
    });
    console.log(`[codeDocumentHandler] Stream finished for ${docId}`);

    // Return the content and indicate document was already saved
    return `${draftContent}/* DOCUMENT_ALREADY_SAVED */`;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamObject({
      model: myProvider.languageModel('artifact-model'),
      system: updateDocumentPrompt(document.content, 'code'),
      prompt: description,
      schema: z.object({
        code: z.string(),
      }),
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'object') {
        const { object } = delta;
        const { code } = object;

        if (code) {
          dataStream.writeData({
            type: 'code-delta',
            content: code ?? '',
          });

          draftContent = code;
        }
      }
    }

    return draftContent;
  },
});
