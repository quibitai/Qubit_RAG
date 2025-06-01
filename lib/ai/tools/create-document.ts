import { generateUUID } from '@/lib/utils';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { artifactKinds } from '@/lib/artifacts/server';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';

// Global context interface
interface CreateDocumentContext {
  dataStream?: any;
  session?: any;
  handlers?: any[];
  toolInvocationsTracker?: Array<{
    type: 'tool-invocation';
    toolInvocation: {
      toolName: string;
      toolCallId: string;
      state: 'call' | 'result';
      args?: any;
      result?: any;
    };
  }>;
}

// Global context object that will be set by the brain route
declare global {
  var CREATE_DOCUMENT_CONTEXT: CreateDocumentContext | undefined;
}

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
    const id = generateUUID();
    const toolCallId = generateUUID(); // Generate a unique ID for this tool call

    console.log(
      `[CREATE_DOCUMENT_TOOL EXECUTE_START] Called with title: "${title}", kind: "${kind}", generated ID: ${id}`,
    );

    if (contentPrompt) {
      console.log(
        `[CREATE_DOCUMENT_TOOL] Content prompt provided (${contentPrompt.length} chars): "${contentPrompt.substring(0, 50)}${contentPrompt.length > 50 ? '...' : ''}"`,
      );
    }

    // Check if we have global context from the brain route
    const context = global.CREATE_DOCUMENT_CONTEXT;
    if (!context || !context.dataStream || !context.session) {
      console.error(
        '[CREATE_DOCUMENT_TOOL] No global context available - falling back to placeholder response',
      );
      // Return placeholder response if no context
      const result = {
        id,
        title,
        kind,
        contentPrompt,
        message: `Document artifact of kind '${kind}' titled '${title}' requested with ID ${id}. Content generation process initiated.`,
      };
      return JSON.stringify(result);
    }

    console.log(
      `[CREATE_DOCUMENT_TOOL] Global context available - proceeding with actual document creation`,
    );

    // MANUALLY TRACK TOOL CALL START
    if (context.toolInvocationsTracker) {
      context.toolInvocationsTracker.push({
        type: 'tool-invocation',
        toolInvocation: {
          toolName: 'createDocument',
          toolCallId: toolCallId,
          state: 'call',
          args: { title, kind, contentPrompt },
        },
      });
      console.log(
        `[CREATE_DOCUMENT_TOOL] Added tool call to tracker with ID: ${toolCallId}`,
      );
    }

    // Find the appropriate handler based on kind
    const handler = documentHandlersByArtifactKind.find((h) => h.kind === kind);

    if (!handler || typeof handler.onCreateDocument !== 'function') {
      console.error(
        `[CREATE_DOCUMENT_TOOL CRITICAL] No handler found for artifact kind '${kind}' or onCreateDocument is not a function.`,
      );
      const errorResult = {
        id,
        title,
        kind,
        error: `No handler found for kind '${kind}'`,
      };

      // MANUALLY TRACK TOOL CALL ERROR RESULT
      if (context.toolInvocationsTracker) {
        context.toolInvocationsTracker.push({
          type: 'tool-invocation',
          toolInvocation: {
            toolName: 'createDocument',
            toolCallId: toolCallId,
            state: 'result',
            result: errorResult,
          },
        });
        console.log(
          `[CREATE_DOCUMENT_TOOL] Added tool error result to tracker`,
        );
      }

      return JSON.stringify(errorResult);
    }

    console.log(
      `[CREATE_DOCUMENT_TOOL] Handler "${handler.kind}" found. Calling onCreateDocument...`,
    );

    try {
      // Call the handler with the global context
      const handlerResult = await handler.onCreateDocument({
        id,
        title,
        dataStream: context.dataStream,
        session: context.session,
        initialContentPrompt: contentPrompt,
      });

      console.log(
        `[CREATE_DOCUMENT_TOOL] ${handler.kind} handler.onCreateDocument completed successfully. Result:`,
        handlerResult,
      );

      const successResult = {
        id,
        title,
        kind,
        message: `Document artifact of kind '${kind}' titled '${title}' created successfully with ID ${id}.`,
        content: handlerResult,
      };

      // MANUALLY TRACK TOOL CALL SUCCESS RESULT
      if (context.toolInvocationsTracker) {
        context.toolInvocationsTracker.push({
          type: 'tool-invocation',
          toolInvocation: {
            toolName: 'createDocument',
            toolCallId: toolCallId,
            state: 'result',
            result: successResult,
          },
        });
        console.log(
          `[CREATE_DOCUMENT_TOOL] Added tool success result to tracker`,
        );
      }

      return JSON.stringify(successResult);
    } catch (handlerError) {
      console.error(
        `[CREATE_DOCUMENT_TOOL ERROR] Error during ${kind} handler.onCreateDocument call:`,
        handlerError,
      );
      const errorResult = {
        id,
        title,
        kind,
        error:
          handlerError instanceof Error
            ? handlerError.message
            : 'Unknown error',
      };

      // MANUALLY TRACK TOOL CALL ERROR RESULT
      if (context.toolInvocationsTracker) {
        context.toolInvocationsTracker.push({
          type: 'tool-invocation',
          toolInvocation: {
            toolName: 'createDocument',
            toolCallId: toolCallId,
            state: 'result',
            result: errorResult,
          },
        });
        console.log(
          `[CREATE_DOCUMENT_TOOL] Added tool error result to tracker`,
        );
      }

      return JSON.stringify(errorResult);
    }
  },
});

// Example of how the tool's output might be used by the agent:
// const toolResultString = await createDocumentTool.call({ title: "My Doc", kind: "text" });
// const toolResultObject = JSON.parse(toolResultString);
// console.log(toolResultObject.id);
// const toolMessage = new ToolMessage({ content: toolResultString, tool_call_id: "some_id" });
