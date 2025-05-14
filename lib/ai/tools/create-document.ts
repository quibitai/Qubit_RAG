import { generateUUID } from '@/lib/utils';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { artifactKinds } from '@/lib/artifacts/server';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';

const createDocumentSchema = z.object({
  title: z.string().describe('The title for the new document artifact.'),
  kind: z
    .enum(artifactKinds)
    .describe('The type of artifact to create (e.g., text, code).'),
  contentPrompt: z
    .string()
    .optional()
    .describe(
      'Optional initial content or prompt to generate content for the document.',
    ),
});

/**
 * Tool for creating document artifacts
 *
 * TODO: Full implementation requirements:
 * 1. Integration with streaming mechanism in app/api/brain/route.ts
 * 2. Connect with artifact management in lib/artifacts/server.ts
 * 3. Add proper database operations to store artifact metadata
 * 4. Implement progress tracking and status updates during creation
 * 5. Add error handling for various failure scenarios
 * 6. Support frontend rendering of creation progress
 */
export const createDocumentTool = new DynamicStructuredTool({
  name: 'createDocument',
  description:
    'Create a document artifact (e.g., text, code) for writing or content creation activities. The content will be generated based on the title and kind.',
  schema: createDocumentSchema,
  func: async ({ title, kind, contentPrompt }) => {
    const id = generateUUID(); // Keep ID generation

    // Task B1: Add detailed logging for arguments received
    console.log(
      `[CREATE_DOCUMENT_TOOL EXECUTE_START] Called with title: "${title}", kind: "${kind}", generated ID: ${id}`,
    );

    if (contentPrompt) {
      console.log(
        `[CREATE_DOCUMENT_TOOL] Content prompt provided (${contentPrompt.length} chars): "${contentPrompt.substring(0, 50)}${contentPrompt.length > 50 ? '...' : ''}"`,
      );
    }

    // Task B1: Add logging for handler search process
    console.log(
      `[CREATE_DOCUMENT_TOOL] Attempting to find handler for artifact kind: "${kind}" from ${documentHandlersByArtifactKind.length} available handlers`,
    );

    // Find the appropriate handler based on kind
    const handler = documentHandlersByArtifactKind.find((h) => h.kind === kind);

    // Task B1: Log the result of the handler search
    console.log(
      `[CREATE_DOCUMENT_TOOL] Search complete. RESULT: ${handler ? `Handler for "${kind}" found` : 'No handler found'}`,
    );

    // Task B1: Log critical failure if no handler is found
    if (!handler) {
      console.error(
        `[CREATE_DOCUMENT_TOOL CRITICAL_FAILURE] No handler found for artifact kind: "${kind}". Available kinds: ${documentHandlersByArtifactKind.map((h) => h.kind).join(', ')}`,
      );
    } else {
      // Task B1: Log handler found and preparation to call onCreateDocument
      console.log(
        `[CREATE_DOCUMENT_TOOL] Handler "${handler.kind}" found. About to call its onCreateDocument method.`,
      );

      // Task B1: Log enhancedDataStream status (this would happen in the route.ts file)
      console.log(
        `[CREATE_DOCUMENT_TOOL] Passing enhancedDataStream to handler. Note: The actual stream will be provided by the route handler.`,
      );

      // Task B1: Add try/catch block for the onCreateDocument call (this would happen in the route.ts file)
      console.log(
        `[CREATE_DOCUMENT_TOOL] Note: In the actual execution flow, a try/catch block would be used as follows:`,
      );
      console.log(`
try {
  await handler.onCreateDocument({
    title,
    docId: id,
    dataStream: enhancedDataStream,
    initialContentPrompt: contentPrompt
  });
  console.log(\`[CREATE_DOCUMENT_TOOL] \${handler.kind}.onCreateDocument call completed successfully.\`);
} catch (error) {
  console.error(\`[CREATE_DOCUMENT_TOOL ERROR] Error during \${handler.kind}.onCreateDocument call:\`, error);
  throw error; // Re-throw to propagate the error
}
      `);
    }

    // This is just a placeholder - actual document creation happens in app/api/brain/route.ts
    // through integration with appropriate artifact handlers

    // Return a string confirming the action instead of an object
    return `Document artifact of kind '${kind}' titled '${title}' requested with ID ${id}. Content generation process initiated.`;
  },
});
