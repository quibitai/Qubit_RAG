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
  onCreateDocument: async (args) => {
    console.log(
      '[SERVER CODE_HANDLER] onCreateDocument called with args:',
      JSON.stringify(args),
    );
    const { id: docId, title, dataStream, initialContentPrompt } = args;
    let draftContent = '';

    console.log(
      `[codeDocumentHandler] onCreateDocument for ID: ${docId}, Title: "${title}"`,
    );

    // 1. Save initial document placeholder to DB
    const userId = args.session?.user?.id;
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

    // --- LOGGING: Before initial DB save ---
    console.log(
      '[SERVER CODE_HANDLER SAVE] Attempting initial saveDocument with:',
      JSON.stringify({ docId, title, kind: 'code', userId }),
    );
    try {
      await saveDocument({
        id: docId,
        title: title,
        content: '', // Initial empty content
        kind: 'code',
        userId: userId,
      });
      // --- LOGGING: After successful DB save ---
      console.log(
        '[SERVER CODE_HANDLER SAVE] Initial saveDocument succeeded for docId:',
        docId,
      );
    } catch (dbError) {
      // --- LOGGING: On DB save error ---
      console.error(
        '[SERVER CODE_HANDLER SAVE] Initial saveDocument FAILED:',
        dbError,
      );
      await sendArtifactDataToClient(dataStream, {
        type: 'error',
        error: 'Failed to initialize document in database.',
      });
      throw dbError;
    }

    // 2. Stream Metadata (after initial save)
    const startPayload = { type: 'artifact-start', kind: 'code', title };
    console.log(
      `[SERVER CODE_HANDLER SEND] Event: ${startPayload.type}, Payload:`,
      JSON.stringify(startPayload),
    );
    await sendArtifactDataToClient(dataStream, startPayload);

    const idPayload = { type: 'id', content: docId };
    console.log(
      `[SERVER CODE_HANDLER SEND] Event: ${idPayload.type}, Payload:`,
      JSON.stringify(idPayload),
    );
    await sendArtifactDataToClient(dataStream, idPayload);

    const titlePayload = { type: 'title', content: title };
    console.log(
      `[SERVER CODE_HANDLER SEND] Event: ${titlePayload.type}, Payload:`,
      JSON.stringify(titlePayload),
    );
    await sendArtifactDataToClient(dataStream, titlePayload);

    const kindPayload = { type: 'kind', content: 'code' };
    console.log(
      `[SERVER CODE_HANDLER SEND] Event: ${kindPayload.type}, Payload:`,
      JSON.stringify(kindPayload),
    );
    await sendArtifactDataToClient(dataStream, kindPayload);
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
          const codeDeltaPayload = { type: 'code-delta', content: code ?? '' };
          console.log(
            `[SERVER CODE_HANDLER SEND] Event: ${codeDeltaPayload.type}, Payload:`,
            JSON.stringify(codeDeltaPayload),
          );
          await sendArtifactDataToClient(dataStream, codeDeltaPayload);

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
    const finishPayload = { type: 'finish' };
    console.log(
      `[SERVER CODE_HANDLER SEND] Event: ${finishPayload.type}, Payload:`,
      JSON.stringify(finishPayload),
    );
    await sendArtifactDataToClient(dataStream, finishPayload);
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
