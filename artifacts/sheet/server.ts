import { myProvider } from '@/lib/ai/providers';
import {
  sheetPrompt,
  updateDocumentPrompt,
} from '@/lib/ai/prompts/tools/documents';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { streamObject } from 'ai';
import type { DataStreamWriter } from 'ai';
import { z } from 'zod';

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

export const sheetDocumentHandler = createDocumentHandler<'sheet'>({
  kind: 'sheet',
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamObject({
      model: myProvider.languageModel('artifact-model'),
      system: sheetPrompt,
      prompt: title,
      schema: z.object({
        csv: z.string().describe('CSV data'),
      }),
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'object') {
        const { object } = delta;
        const { csv } = object;

        if (csv) {
          await sendArtifactDataToClient(dataStream, {
            type: 'sheet-delta',
            content: csv,
          });

          draftContent = csv;
        }
      }
    }

    await sendArtifactDataToClient(dataStream, {
      type: 'sheet-delta',
      content: draftContent,
    });

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamObject({
      model: myProvider.languageModel('artifact-model'),
      system: updateDocumentPrompt(document.content, 'sheet'),
      prompt: description,
      schema: z.object({
        csv: z.string(),
      }),
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'object') {
        const { object } = delta;
        const { csv } = object;

        if (csv) {
          await sendArtifactDataToClient(dataStream, {
            type: 'sheet-delta',
            content: csv,
          });

          draftContent = csv;
        }
      }
    }

    return draftContent;
  },
});
