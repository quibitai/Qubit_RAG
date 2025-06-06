import { smoothStream, streamText, type DataStreamWriter } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { saveDocument } from '@/lib/db/queries';
import { logger } from '@/lib/logger';
import type { CreateDocumentCallbackProps } from '@/lib/types';

// --- MOCK IMPLEMENTATION FOR TESTING ---
// This mock simulates the behavior of the real streamText function
// for isolated testing without making actual API calls.
const mockStreamText = ({ prompt }: { prompt: string }) => {
  async function* generator() {
    const text =
      'This is a simulated stream of text chunks from the mock LLM. Each word is a separate delta.';
    const words = text.split(' ');
    for (const word of words) {
      await new Promise((resolve) => setTimeout(resolve, 20)); // Simulate network latency
      yield { type: 'text-delta', textDelta: `${word} ` };
    }
  }

  return {
    fullStream: generator(),
    // Add other properties that the real streamText might return if needed
  };
};

const IS_TEST_ENVIRONMENT = process.env.NODE_ENV === 'test';

// Helper function to correctly format data for useChat().data
async function sendArtifactDataToClient(
  dataStream: DataStreamWriter,
  dataObject: any,
): Promise<void> {
  // Ensure the dataObject is stringified and wrapped in an array, then prefixed with '2:'
  const streamChunk = `2:${JSON.stringify([dataObject])}\n` as const;
  try {
    await dataStream.write(streamChunk);
    // Only log important events to reduce noise
    if (
      dataObject.type === 'artifact-start' ||
      dataObject.type === 'finish' ||
      dataObject.type === 'error'
    ) {
      console.log(
        `[ArtifactHandler:${dataObject?.kind || dataObject?.type || 'UNKNOWN_KIND_TYPE'}] Streamed: type "${dataObject.type}"`,
      );
    }
  } catch (error) {
    console.error(
      `[ArtifactHandler:${dataObject?.kind || dataObject?.type || 'UNKNOWN_KIND_TYPE'}] ERROR streaming to client UI:`,
      error,
      'Attempted object:',
      dataObject,
    );
    // Don't throw the error to prevent breaking the entire stream
  }
}

export const textDocumentHandler = createDocumentHandler<'text'>({
  kind: 'text',
  onCreateDocument: async (args: CreateDocumentCallbackProps) => {
    logger.info(
      'SERVER TEXT_HANDLER',
      'onCreateDocument called with args:',
      JSON.stringify(args),
    );

    const {
      id: docId,
      title,
      dataStream,
      initialContentPrompt,
      session,
      streamCallbacks,
    } = args;

    let draftContent = '';

    // Add flag to track if finish event has been sent
    let streamFinishSent = false;
    let serverSideAccumulatedContentLength = 0;

    logger.info(
      'textDocumentHandler',
      `onCreateDocument for ID: ${docId}, Title: "${title}"`,
      {
        hasOnChunkCallback: typeof streamCallbacks?.onChunk === 'function',
        hasOnCompleteCallback:
          typeof streamCallbacks?.onComplete === 'function',
      },
    );

    // Validate user authentication
    if (!session?.user?.id) {
      await sendArtifactDataToClient(dataStream, {
        type: 'error',
        error: 'User not authenticated for document creation.',
      });
      // Cannot close the stream from here as it's managed by the caller
      throw new Error('User not authenticated');
    }

    // Skip initial empty save to prevent duplicate entries
    // Document will be saved once with final content after streaming
    logger.info(
      'SERVER TEXT_HANDLER',
      'Skipping initial empty save to prevent duplicates. Will save after content generation.',
    );

    // 2. Stream Metadata (without initial save)
    const startPayload = { type: 'artifact-start', kind: 'text', title };
    await sendArtifactDataToClient(dataStream, startPayload);

    const idPayload = { type: 'id', content: docId };
    await sendArtifactDataToClient(dataStream, idPayload);

    const titlePayload = { type: 'title', content: title };
    await sendArtifactDataToClient(dataStream, titlePayload);

    const kindPayload = { type: 'kind', content: 'text' };
    await sendArtifactDataToClient(dataStream, kindPayload);
    logger.info(
      'textDocumentHandler',
      `Streamed metadata for ${docId} using 2: prefix.`,
    );

    // 3. Stream Content
    const promptToUse = initialContentPrompt || title;
    logger.info(
      'SERVER TEXT_HANDLER',
      `About to call streamText with prompt: "${promptToUse.substring(
        0,
        100,
      )}..."`,
    );

    try {
      // Use mock implementation in test environment
      let fullStream: any;
      if (IS_TEST_ENVIRONMENT) {
        logger.info('SERVER TEXT_HANDLER', 'Using MOCK streamText for testing');
        const mockResult = mockStreamText({ prompt: promptToUse });
        fullStream = mockResult.fullStream;
      } else {
        logger.info(
          'SERVER TEXT_HANDLER',
          'Using REAL streamText with AI provider',
        );

        // Get the model instance and log its details
        const model = myProvider.languageModel('artifact-model');
        logger.info('TextDocHandler', 'Real streamText call starting', {
          modelName: (model as any).modelId || 'unknown',
          promptLength: promptToUse?.length || 0,
        });

        // Log the exact parameters being passed to streamText
        const streamTextParams = {
          model: model,
          system: `Write a comprehensive, well-researched document about the given topic. 

REQUIREMENTS:
- Use Markdown formatting with proper headings, lists, and emphasis
- Include a "Sources" or "References" section at the end with relevant links
- When citing specific facts, studies, or statistics, provide proper attribution
- Include links to authoritative sources (government agencies, academic institutions, reputable organizations)
- For topics requiring research, include at least 3-5 credible sources
- Use this format for references: [Source Name](URL) or numbered references
- If no direct web searches were conducted, include "Further Reading" section with relevant links

EXAMPLE REFERENCE FORMAT:
## Sources
1. [National Oceanic and Atmospheric Administration](https://www.noaa.gov/)
2. [U.S. Fish and Wildlife Service](https://www.fws.gov/)
3. [Academic Journal Article](https://example.com/article)

## Further Reading
- [Related Topic Resource](https://example.com/resource)
- [Additional Information](https://example.com/info)`,
          experimental_transform: smoothStream({ chunking: 'word' }),
          prompt: promptToUse,
        };

        try {
          const result = streamText(streamTextParams);
          fullStream = result.fullStream;
        } catch (streamTextError) {
          logger.error(
            'TextDocHandler',
            'streamText call failed:',
            streamTextError instanceof Error
              ? streamTextError.message
              : String(streamTextError),
          );
          throw streamTextError;
        }
      }

      logger.info(
        'SERVER TEXT_HANDLER',
        'streamText call successful, starting to iterate over fullStream...',
      );

      let deltaCount = 0;
      for await (const delta of fullStream) {
        deltaCount++;
        const { type } = delta;

        if (type === 'text-delta') {
          // Check if finish has already been sent - this should never happen
          if (streamFinishSent) {
            logger.warn(
              'SERVER TEXT_HANDLER WARN',
              'Attempting to send text-delta AFTER finish event was sent!',
            );
            continue; // Skip this delta if finish already sent
          }

          const contentChunk = delta.textDelta;
          draftContent += contentChunk;
          serverSideAccumulatedContentLength += contentChunk.length;

          // Report chunk to caller (createDocument) if callback is provided
          if (streamCallbacks?.onChunk) {
            if (typeof contentChunk === 'string' && contentChunk.length > 0) {
              logger.info(
                `[TextDocHandler] VALID CHUNK for reportChunkToCaller: "${contentChunk.substring(0, 70)}..." (Length: ${contentChunk.length})`,
                'No additional data',
              );
              streamCallbacks.onChunk(contentChunk);
            } else {
              logger.warn(
                '[TextDocHandler] INVALID or EMPTY chunk detected, not calling reportChunkToCaller.',
                JSON.stringify({ chunk: contentChunk }),
              );
            }
          }

          const textDeltaPayload = {
            type: 'text-delta',
            content: contentChunk,
          };
          await sendArtifactDataToClient(dataStream, textDeltaPayload);
        } else if (type === 'finish' || type === 'step-finish') {
          logger.info('SERVER TEXT_HANDLER', `Received ${type} event`);
        } else if (type === 'error') {
          logger.error(
            'TextDocHandler',
            'Received error delta from streamText',
            { error: delta.error },
          );
        }
      }

      logger.info(
        'SERVER TEXT_HANDLER',
        `Finished iterating over fullStream. Total deltas processed: ${deltaCount}, Final content length: ${serverSideAccumulatedContentLength}`,
      );

      // Report completion to caller (createDocument) if callback is provided
      if (streamCallbacks?.onComplete) {
        logger.info(
          'TextDocHandler',
          `Reporting completion to callback. (Total Length: ${draftContent.length})`,
        );
        streamCallbacks.onComplete(draftContent);
      }
    } catch (error) {
      logger.error(
        'SERVER TEXT_HANDLER ERROR',
        'Error during streamText call:',
        error,
      );

      // Send error to client
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      await sendArtifactDataToClient(dataStream, {
        type: 'error',
        error: `Content generation failed: ${errorMessage}`,
      });

      throw error;
    }

    // Update DB with final content
    await saveDocument({
      id: docId,
      title: title,
      content: draftContent,
      kind: 'text',
      userId: session?.user?.id,
    });
    logger.info(
      'textDocumentHandler',
      `Document ${docId} updated with generated content.`,
    );

    // 4. Send a finish event
    logger.info(
      'SERVER TEXT_HANDLER',
      `Sending 'finish' event. Final content length: ${serverSideAccumulatedContentLength}`,
    );
    const finishPayload = { type: 'finish' };
    await sendArtifactDataToClient(dataStream, finishPayload);

    // Set flag after sending finish
    streamFinishSent = true;

    logger.info(
      'textDocumentHandler',
      `Stream finished for ${docId} using 2: prefix.`,
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
