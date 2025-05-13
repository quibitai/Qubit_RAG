import { smoothStream, streamText } from 'ai';
import type { DataStreamWriter } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { updateDocumentPrompt } from '@/lib/ai/prompts/tools/documents';
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

export const textDocumentHandler = createDocumentHandler<'text'>({
  kind: 'text',
  onCreateDocument: async ({
    id: docId,
    title,
    dataStream,
    initialContentPrompt,
    session,
  }) => {
    let draftContent = '';

    console.log(
      `[textDocumentHandler] onCreateDocument for ID: ${docId}, Title: "${title}"`,
    );

    // 1. Save initial document placeholder to DB
    const userId = session?.user?.id;
    if (!userId) {
      console.error(
        '[textDocumentHandler] User ID missing in session during onCreateDocument.',
      );
      await sendArtifactDataToClient(dataStream, {
        type: 'error',
        error: 'User not authenticated for document creation.',
      });
      // Cannot close the stream from here as it's managed by the caller
      throw new Error('User not authenticated');
    }

    try {
      await saveDocument({
        id: docId,
        title: title,
        content: '', // Initial empty content
        kind: 'text',
        userId: userId,
      });
      console.log(`[textDocumentHandler] Initial document ${docId} saved.`);
    } catch (dbError) {
      console.error(
        `[textDocumentHandler] Failed to save initial document ${docId}:`,
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
      kind: 'text',
      title,
    });
    await sendArtifactDataToClient(dataStream, { type: 'id', content: docId });
    await sendArtifactDataToClient(dataStream, {
      type: 'title',
      content: title,
    });
    await sendArtifactDataToClient(dataStream, {
      type: 'kind',
      content: 'text',
    });
    console.log(
      `[textDocumentHandler] Streamed metadata for ${docId} using 2: prefix.`,
    );

    // 3. Stream Content
    const promptToUse = initialContentPrompt || title;

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system:
        'Write about the given topic. Markdown is supported. Use headings wherever appropriate.',
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: promptToUse,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { textDelta } = delta;

        draftContent += textDelta;

        await sendArtifactDataToClient(dataStream, {
          type: 'text-delta',
          content: textDelta,
        });
      }
    }

    // Update DB with final content
    await saveDocument({
      id: docId,
      title: title,
      content: draftContent,
      kind: 'text',
      userId,
    });
    console.log(
      `[textDocumentHandler] Document ${docId} updated with generated content.`,
    );

    // 4. Send a finish event
    await sendArtifactDataToClient(dataStream, {
      type: 'finish',
    });
    console.log(
      `[textDocumentHandler] Stream finished for ${docId} using 2: prefix.`,
    );

    // Return the content and indicate document was already saved
    return `${draftContent}<!-- DOCUMENT_ALREADY_SAVED -->`;
  },
  onUpdateDocument: async ({ document, description, dataStream, session }) => {
    console.log(
      `[textDocumentHandler] onUpdateDocument started for doc ID: ${document.id}`,
    );
    let finalModifiedContent = '';

    try {
      // 1. Prepare prompt for editing LLM with explicit Markdown requirements
      const editingPrompt = `Instruction: ${description}

Apply the instruction above to the following document content. Use Markdown syntax EXCLUSIVELY for any requested formatting (e.g., bold, italics, headers, lists). Output ONLY the complete, raw, modified document content. Do NOT include any commentary, preamble, explanations, or markdown code fences (\`\`\`) before or after the content.

ORIGINAL CONTENT:
${document.content || ''}
MODIFIED CONTENT (Markdown Only):`;

      console.log(
        '[textDocumentHandler DEBUG] Sending Editing Prompt to LLM:\n---\n',
        editingPrompt,
        '\n---',
      ); // Log the prompt itself

      // 2. Call LLM and stream the result
      const { fullStream } = streamText({
        model: myProvider.languageModel('artifact-model'),
        system: editingPrompt,
        // Use word-by-word chunking for a smoother editing experience
        experimental_transform: smoothStream({ chunking: 'word' }),
        prompt: '', // Using system for the prompt as it's more comprehensive
      });

      console.log(`[textDocumentHandler] Streaming updates to client...`);

      // 3. Stream deltas back to client via dataStream
      for await (const delta of fullStream) {
        const { type } = delta;

        if (type === 'text-delta') {
          const { textDelta } = delta;
          finalModifiedContent += textDelta;

          // Stream each delta to the client for real-time updates
          // The client will accumulate these updates
          await sendArtifactDataToClient(dataStream, {
            type: 'document-update-delta',
            docId: document.id,
            content: textDelta,
          });
        }
      }

      console.log(
        `[textDocumentHandler] Finished streaming updates for doc ID: ${document.id}`,
      );

      // Ensure content isn't empty after streaming
      if (finalModifiedContent.trim() === '') {
        throw new Error(
          'LLM returned empty content after modification attempt.',
        );
      }

      // 4. Save the *final* modified content to DB *after* streaming
      const userId = session?.user?.id;
      if (!userId) throw new Error('Authentication error: User ID missing.');

      // Log the exact content about to be saved
      console.log(
        '[textDocumentHandler DEBUG] Final content STRING being passed to saveDocument:\n---\n',
        finalModifiedContent.trim(),
        '\n---',
      );

      console.log(
        `[textDocumentHandler] Saving updated version to database for doc ID: ${document.id}`,
      );

      // Save the document to the database
      await saveDocument({
        id: document.id,
        title: document.title,
        content: finalModifiedContent.trim(),
        kind: document.kind,
        userId: userId,
      });

      console.log(
        `[textDocumentHandler] Database save complete for doc ID: ${document.id}`,
      );

      // Return the final content (required by createDocumentHandler structure)
      return finalModifiedContent.trim();
    } catch (error: any) {
      console.error(
        `[textDocumentHandler] Error during onUpdateDocument for ID ${document.id}:`,
        error,
      );

      // Try to write error to the stream if possible
      try {
        await sendArtifactDataToClient(dataStream, {
          type: 'error',
          message: `Failed to update document: ${error.message}`,
          docId: document.id,
        });
      } catch (streamError) {
        console.error(
          '[textDocumentHandler] Could not write error to stream:',
          streamError,
        );
      }

      throw error; // Re-throw
    } finally {
      console.log(
        `[textDocumentHandler] onUpdateDocument finished for doc ID: ${document.id}`,
      );
    }
  },
});
