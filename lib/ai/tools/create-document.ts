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
  cleanupTimeout?: NodeJS.Timeout;
}

// Artifact event types
interface ArtifactEvent {
  type: string;
  documentId: string;
  timestamp: string;
  [key: string]: any; // Allow additional properties
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

    // Initialize local artifact events collection with proper typing
    const localArtifactEvents: ArtifactEvent[] = [];

    console.log(
      `[CREATE_DOCUMENT_TOOL EXECUTE_START] Called with title: "${title}", kind: "${kind}", generated ID: ${id}, toolCallId: ${toolCallId}`,
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

      // Create a fallback artifact event for when context is not available
      const fallbackArtifactEvent = {
        type: 'artifact-placeholder',
        documentId: id,
        title: title,
        kind: kind,
        status: 'fallback',
        message: 'Document creation initiated without streaming context',
        timestamp: new Date().toISOString(),
      };
      localArtifactEvents.push(fallbackArtifactEvent);

      const summaryForLLM = `Document '${title}' of type '${kind}' with ID '${id}' was requested for creation. Content generation process was initiated but no streaming context was available.`;

      const toolResult = {
        summaryForLLM: summaryForLLM,
        _isQubitArtifactToolResult: true,
        quibitArtifactEvents: localArtifactEvents,
        // Legacy fields for backward compatibility
        id,
        title,
        kind,
        contentPrompt,
        message: summaryForLLM,
      };

      console.log(
        `[CREATE_DOCUMENT_TOOL] Returning fallback result with ${localArtifactEvents.length} artifact events`,
      );
      return JSON.stringify(toolResult);
    }

    console.log(
      `[CREATE_DOCUMENT_TOOL] Global context available - proceeding with actual document creation`,
    );

    // Track the initial state of the global tracker to capture events for this tool invocation
    const initialTrackerLength = context.toolInvocationsTracker?.length || 0;
    console.log(
      `[CREATE_DOCUMENT_TOOL] Initial global tracker length: ${initialTrackerLength}`,
    );

    // MANUALLY TRACK TOOL CALL START in global tracker (for backward compatibility)
    if (context.toolInvocationsTracker) {
      const startEvent = {
        type: 'tool-invocation' as const,
        toolInvocation: {
          toolName: 'createDocument',
          toolCallId: toolCallId,
          state: 'call' as const,
          args: { title, kind, contentPrompt },
        },
      };
      context.toolInvocationsTracker.push(startEvent);
      console.log(
        `[CREATE_DOCUMENT_TOOL] Added tool call start to global tracker with ID: ${toolCallId}`,
      );
    }

    // Create artifact-start event
    const artifactStartEvent = {
      type: 'artifact',
      documentId: id,
      timestamp: new Date().toISOString(),
      componentName: 'document',
      props: {
        documentId: id,
        title: title,
        kind: kind,
        eventType: 'artifact-start',
        status: 'streaming',
      },
      id: `artifact-start-${id}`,
    };
    localArtifactEvents.push(artifactStartEvent);
    console.log(
      `[CREATE_DOCUMENT_TOOL] Added artifact-start event for document ${id}`,
    );

    // Find the appropriate handler based on kind
    const handler = documentHandlersByArtifactKind.find((h) => h.kind === kind);

    if (!handler || typeof handler.onCreateDocument !== 'function') {
      console.error(
        `[CREATE_DOCUMENT_TOOL CRITICAL] No handler found for artifact kind '${kind}' or onCreateDocument is not a function.`,
      );

      // Create artifact error event
      const artifactErrorEvent = {
        type: 'artifact-error',
        documentId: id,
        title: title,
        kind: kind,
        error: `No handler found for kind '${kind}'`,
        timestamp: new Date().toISOString(),
      };
      localArtifactEvents.push(artifactErrorEvent);

      const errorResult = {
        id,
        title,
        kind,
        error: `No handler found for kind '${kind}'`,
      };

      // MANUALLY TRACK TOOL CALL ERROR RESULT in global tracker
      if (context.toolInvocationsTracker) {
        context.toolInvocationsTracker.push({
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolName: 'createDocument',
            toolCallId: toolCallId,
            state: 'result' as const,
            result: errorResult,
          },
        });
        console.log(
          `[CREATE_DOCUMENT_TOOL] Added tool error result to global tracker`,
        );
      }

      const summaryForLLM = `Failed to create document '${title}' of type '${kind}' with ID '${id}'. Error: No handler found for kind '${kind}'.`;

      const toolResult = {
        summaryForLLM: summaryForLLM,
        _isQubitArtifactToolResult: true,
        quibitArtifactEvents: localArtifactEvents,
        // Legacy fields for backward compatibility
        ...errorResult,
      };

      console.log(
        `[CREATE_DOCUMENT_TOOL] Returning error result with ${localArtifactEvents.length} artifact events`,
      );
      return JSON.stringify(toolResult);
    }

    console.log(
      `[CREATE_DOCUMENT_TOOL] Handler "${handler.kind}" found. Calling onCreateDocument...`,
    );

    try {
      // Initialize content tracking for artifact events
      let capturedContent = '';
      let chunkCount = 0;

      console.log(
        `[CREATE_DOCUMENT_TOOL] Starting content generation with callback-based chunk tracking...`,
      );

      // Define chunk capture callback
      const onChunk = (chunk: string) => {
        console.log(
          `[CREATE_DOCUMENT_TOOL] Received chunk of length ${chunk.length}: "${chunk.substring(0, 50)}${chunk.length > 50 ? '...' : ''}"`,
        );

        chunkCount++;
        capturedContent += chunk;

        // Create artifact-chunk event for progressive display
        const artifactChunkEvent = {
          type: 'artifact',
          documentId: id,
          timestamp: new Date().toISOString(),
          componentName: 'document',
          props: {
            documentId: id,
            title: title,
            eventType: 'artifact-chunk',
            contentChunk: chunk,
            totalContentLength: capturedContent.length,
            chunkSequence: chunkCount,
          },
          id: `artifact-chunk-${id}-${chunkCount}`,
        };
        localArtifactEvents.push(artifactChunkEvent);

        console.log(
          `[CREATE_DOCUMENT_TOOL] Added artifact-chunk event #${chunkCount}: "${chunk.substring(0, 30)}${chunk.length > 30 ? '...' : ''}" (${chunk.length} chars, total: ${capturedContent.length})`,
        );
      };

      // Define completion callback
      const onComplete = (fullContent: string) => {
        console.log(
          `[CREATE_DOCUMENT_TOOL] Content generation complete. Final length: ${fullContent.length}`,
        );

        // Ensure captured content matches the full content
        if (capturedContent !== fullContent) {
          console.warn(
            `[CREATE_DOCUMENT_TOOL] Captured content length (${capturedContent.length}) differs from final content length (${fullContent.length}). Using final content.`,
          );
          capturedContent = fullContent;
        }
      };

      // Call the handler with callbacks for chunk capture
      const handlerResult = await handler.onCreateDocument({
        id,
        title,
        dataStream: context.dataStream,
        session: context.session,
        initialContentPrompt: contentPrompt,
        onChunk,
        onComplete,
      });

      console.log(
        `[CREATE_DOCUMENT_TOOL] ${handler.kind} handler.onCreateDocument completed successfully.`,
        {
          resultType: typeof handlerResult,
          resultDocumentId: handlerResult?.documentId || 'N/A',
          capturedChunks: chunkCount,
          capturedContentLength: capturedContent.length,
          artifactEventsGenerated: localArtifactEvents.length,
        },
      );

      // Create artifact-end event
      const artifactEndEvent = {
        type: 'artifact',
        documentId: id,
        timestamp: new Date().toISOString(),
        componentName: 'document',
        props: {
          documentId: id,
          title: title,
          kind: kind,
          eventType: 'artifact-end',
          status: 'completed',
          contentLength: capturedContent.length,
        },
        id: `artifact-end-${id}`,
      };
      localArtifactEvents.push(artifactEndEvent);
      console.log(
        `[CREATE_DOCUMENT_TOOL] Added artifact-end event for document ${id} with ${chunkCount} chunks captured`,
      );

      const successResult = {
        id,
        title,
        kind,
        message: `Document artifact of kind '${kind}' titled '${title}' created successfully with ID ${id}.`,
        content: capturedContent || '', // Use captured content
      };

      // MANUALLY TRACK TOOL CALL SUCCESS RESULT in global tracker
      if (context.toolInvocationsTracker) {
        context.toolInvocationsTracker.push({
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolName: 'createDocument',
            toolCallId: toolCallId,
            state: 'result' as const,
            result: successResult,
          },
        });
        console.log(
          `[CREATE_DOCUMENT_TOOL] Added tool success result to global tracker`,
        );
      }

      const summaryForLLM = `Document '${title}' of type '${kind}' with ID '${id}' was created successfully. ${capturedContent.length > 0 ? `Content contains ${capturedContent.length} characters.` : 'Content generated successfully.'}`;

      const toolResult = {
        summaryForLLM: summaryForLLM,
        _isQubitArtifactToolResult: true,
        quibitArtifactEvents: localArtifactEvents,
        // Legacy fields for backward compatibility
        ...successResult,
      };

      console.log(
        `[CREATE_DOCUMENT_TOOL] Tool execution completed successfully. Returning structured result:`,
      );
      console.log(`[CREATE_DOCUMENT_TOOL] - Document ID: ${id}`);
      console.log(`[CREATE_DOCUMENT_TOOL] - Title: ${title}`);
      console.log(`[CREATE_DOCUMENT_TOOL] - Kind: ${kind}`);
      console.log(
        `[CREATE_DOCUMENT_TOOL] - Artifact events collected: ${localArtifactEvents?.length || 0}`,
      );
      console.log(`[CREATE_DOCUMENT_TOOL] - Summary: ${summaryForLLM}`);
      console.log(
        `[CREATE_DOCUMENT_TOOL] - Structured result preview: ${JSON.stringify(toolResult).substring(0, 200)}...`,
      );

      return JSON.stringify(toolResult);
    } catch (handlerError) {
      console.error(
        `[CREATE_DOCUMENT_TOOL ERROR] Error during ${kind} handler.onCreateDocument call:`,
        handlerError,
      );

      // Create artifact error event
      const artifactErrorEvent = {
        type: 'artifact-error',
        documentId: id,
        title: title,
        kind: kind,
        error:
          handlerError instanceof Error
            ? handlerError.message
            : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
      localArtifactEvents.push(artifactErrorEvent);

      const errorResult = {
        id,
        title,
        kind,
        error:
          handlerError instanceof Error
            ? handlerError.message
            : 'Unknown error',
      };

      // MANUALLY TRACK TOOL CALL ERROR RESULT in global tracker
      if (context.toolInvocationsTracker) {
        context.toolInvocationsTracker.push({
          type: 'tool-invocation' as const,
          toolInvocation: {
            toolName: 'createDocument',
            toolCallId: toolCallId,
            state: 'result' as const,
            result: errorResult,
          },
        });
        console.log(
          `[CREATE_DOCUMENT_TOOL] Added tool error result to global tracker`,
        );
      }

      const summaryForLLM = `Failed to create document '${title}' of type '${kind}' with ID '${id}'. Error: ${handlerError instanceof Error ? handlerError.message : 'Unknown error'}`;

      const toolResult = {
        summaryForLLM: summaryForLLM,
        _isQubitArtifactToolResult: true,
        quibitArtifactEvents: localArtifactEvents,
        // Legacy fields for backward compatibility
        ...errorResult,
      };

      console.log(
        `[CREATE_DOCUMENT_TOOL] Returning error result with ${localArtifactEvents?.length || 0} artifact events due to handler error`,
      );
      return JSON.stringify(toolResult);
    }
  },
});

// Example of how the tool's output might be used by the agent:
// const toolResultString = await createDocumentTool.call({ title: "My Doc", kind: "text" });
// const toolResultObject = JSON.parse(toolResultString);
// console.log(toolResultObject.id);
// const toolMessage = new ToolMessage({ content: toolResultString, tool_call_id: "some_id" });
