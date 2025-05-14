import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { experimental_generateImage } from 'ai';
import type { DataStreamWriter } from 'ai';

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

export const imageDocumentHandler = createDocumentHandler<'image'>({
  kind: 'image',
  onCreateDocument: async (args) => {
    console.log(
      '[SERVER IMAGE_HANDLER] onCreateDocument called with args:',
      JSON.stringify(args),
    );
    const { id: docId, title, dataStream, initialContentPrompt } = args;
    let draftContent = '';

    // Send artifact-start event (metadata)
    const startPayload = { type: 'artifact-start', kind: 'image', title };
    console.log(
      `[SERVER IMAGE_HANDLER SEND] Event: ${startPayload.type}, Payload:`,
      JSON.stringify(startPayload),
    );
    await sendArtifactDataToClient(dataStream, startPayload);

    const { image } = await experimental_generateImage({
      model: myProvider.imageModel('small-model'),
      prompt: title,
      n: 1,
    });

    draftContent = image.base64;

    // 2. Stream Metadata (for image, just the image-delta event)
    const imageDeltaPayload = { type: 'image-delta', content: image.base64 };
    console.log(
      `[SERVER IMAGE_HANDLER SEND] Event: ${imageDeltaPayload.type}, Payload:`,
      JSON.stringify(imageDeltaPayload),
    );
    await sendArtifactDataToClient(dataStream, imageDeltaPayload);

    return draftContent;
  },
  onUpdateDocument: async ({ description, dataStream }) => {
    let draftContent = '';

    const { image } = await experimental_generateImage({
      model: myProvider.imageModel('small-model'),
      prompt: description,
      n: 1,
    });

    draftContent = image.base64;

    await sendArtifactDataToClient(dataStream, {
      type: 'image-delta',
      content: image.base64,
    });

    return draftContent;
  },
});
