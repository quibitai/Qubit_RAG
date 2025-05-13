import { z } from 'zod';
import { streamObject } from 'ai';
import type { DataStreamWriter } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import {
  codePrompt,
  updateDocumentPrompt,
} from '@/lib/ai/prompts/tools/documents';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { saveDocument } from '@/lib/db/queries';

// Helper function to correctly format data for useChat().data
async function sendArtifactDataToClient(
  dataStream: DataStreamWriter,
  dataObject: any,
): Promise<void> {
  // Ensure the dataObject is stringified and wrapped in an array, then prefixed with '2:'
  const streamChunk = `2:${JSON.stringify([dataObject])}\n` as const;
  // Log exactly what is about to be sent and its intended type for the UI
  console.log(
    `[ArtifactHandler:${dataObject?.kind || dataObject?.type || 'UNKNOWN_KIND_TYPE'}] Attempting to stream to client UI: ${streamChunk.trim()}`,
  );
  try {
    await dataStream.write(streamChunk);
    console.log(
      `[ArtifactHandler:${dataObject?.kind || dataObject?.type || 'UNKNOWN_KIND_TYPE'}] Successfully streamed to client UI: type "${dataObject.type}"`,
    );
  } catch (error) {
    console.error(
      `[ArtifactHandler:${dataObject?.kind || dataObject?.type || 'UNKNOWN_KIND_TYPE'}] ERROR streaming to client UI:`,
      error,
      'Attempted object:',
      dataObject,
    );
  }
}

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
      await sendArtifactDataToClient(dataStream, {
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
      await sendArtifactDataToClient(dataStream, {
        type: 'error',
        error: 'Failed to initialize document in database.',
      });
      throw dbError;
    }

    // 2. Stream Metadata (after initial save)
    await sendArtifactDataToClient(dataStream, {
      type: 'artifact-start',
      kind: 'code',
      title,
    });
    await sendArtifactDataToClient(dataStream, { type: 'id', content: docId });
    await sendArtifactDataToClient(dataStream, {
      type: 'title',
      content: title,
    });
    await sendArtifactDataToClient(dataStream, {
      type: 'kind',
      content: 'code',
    });
    console.log(
      `[codeDocumentHandler] Streamed metadata for ${docId} using 2: prefix.`,
    );

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
          await sendArtifactDataToClient(dataStream, {
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
    await sendArtifactDataToClient(dataStream, {
      type: 'finish',
    });
    console.log(
      `[codeDocumentHandler] Stream finished for ${docId} using 2: prefix.`,
    );

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
          await sendArtifactDataToClient(dataStream, {
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
