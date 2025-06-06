import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { v4 as uuidv4 } from 'uuid';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from '@/lib/artifacts/server';
import { logger } from '@/lib/logger';
import type { UIMessage } from '@/lib/types';
import type {
  CreateDocumentCallbackProps,
  DocumentStreamCallbacks,
} from '@/lib/types';
import { getContextVariable } from '@langchain/core/context';

// Define a schema for the tool's input
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
 * A structured tool for creating document artifacts (text, code, etc.).
 * This tool initiates the document creation process and is designed to work with a streaming architecture.
 * It uses a callback mechanism to collect artifact events (start, chunk, end) during content generation,
 * and returns these events in its final output for the orchestrator to stream to the client.
 */
export const createDocumentTool = new DynamicStructuredTool({
  name: 'createDocument',
  description:
    'Create a document artifact (e.g., text, code) for writing or content creation activities. The content will be generated based on the title and kind.',
  schema: createDocumentSchema,
  func: async ({ title, kind, contentPrompt }, runManager, config) => {
    const id = uuidv4(); // Generate a unique ID for the document
    const toolCallId = runManager?.runId || uuidv4();
    const localArtifactEvents: UIMessage[] = [];

    logger.info(
      'CREATE_DOCUMENT_TOOL',
      `Executing with title: "${title}", kind: "${kind}", ID: ${id}`,
      { toolCallId },
    );

    // Access context using getContextVariable, the modern LangChain way
    // ADD DEBUGGING TO SEE WHAT'S AVAILABLE
    logger.info(
      'CREATE_DOCUMENT_TOOL',
      'Attempting to access context variables...',
      {
        toolCallId,
        runManagerExists: !!runManager,
        runManagerRunId: runManager?.runId,
        // CHECK: Does runManager have any config or context properties?
        runManagerKeys: runManager ? Object.keys(runManager) : [],
        hasConfigParam: !!config,
        configKeys: config ? Object.keys(config) : [],
        hasConfigurable: config?.configurable ? 'yes' : 'no',
        configurableKeys: config?.configurable
          ? Object.keys(config.configurable)
          : [],
      },
    );

    let dataStream: any = null;
    let session: any = null;

    // TRY METHOD 1: getContextVariable (LangChain standard)
    try {
      dataStream = getContextVariable('dataStream');
      logger.info('CREATE_DOCUMENT_TOOL', 'dataStream context result:', {
        hasDataStream: !!dataStream,
        dataStreamType: typeof dataStream,
        dataStreamMethods: dataStream
          ? Object.keys(dataStream).filter(
              (k) => typeof dataStream[k] === 'function',
            )
          : [],
      });
    } catch (error) {
      logger.error(
        'CREATE_DOCUMENT_TOOL',
        'Error getting dataStream context:',
        error,
      );
    }

    try {
      session = getContextVariable('session');
      logger.info('CREATE_DOCUMENT_TOOL', 'session context result:', {
        hasSession: !!session,
        sessionType: typeof session,
        sessionUserId: session?.user?.id,
      });
    } catch (error) {
      logger.error(
        'CREATE_DOCUMENT_TOOL',
        'Error getting session context:',
        error,
      );
    }

    // TRY METHOD 2: Check if config parameter has the configurable properties
    if ((!dataStream || !session) && config?.configurable) {
      logger.info(
        'CREATE_DOCUMENT_TOOL',
        'Trying to get context from config.configurable...',
        {
          configurableKeys: Object.keys(config.configurable),
          hasDataStreamInConfig: !!config.configurable.dataStream,
          hasSessionInConfig: !!config.configurable.session,
        },
      );

      if (!dataStream && config.configurable.dataStream) {
        dataStream = config.configurable.dataStream;
        logger.info(
          'CREATE_DOCUMENT_TOOL',
          'Got dataStream from config.configurable',
        );
      }

      if (!session && config.configurable.session) {
        session = config.configurable.session;
        logger.info(
          'CREATE_DOCUMENT_TOOL',
          'Got session from config.configurable',
        );
      }
    }

    if (!dataStream || !session) {
      const errorMsg = 'Streaming context (dataStream/session) not available.';
      logger.error('CREATE_DOCUMENT_TOOL', errorMsg);
      // Return a structured error for the LLM and system
      return JSON.stringify({
        summaryForLLM: `Failed to create document '${title}'. Reason: ${errorMsg}`,
        _isQubitArtifactToolResult: true,
        quibitArtifactEvents: [
          {
            type: 'artifact',
            componentName: 'document',
            id: uuidv4(),
            props: {
              documentId: id,
              title,
              eventType: 'artifact-error',
              error: errorMsg,
            },
          },
        ],
      });
    }

    // --- Artifact Event Generation via Callbacks ---

    // 1. Push the start event immediately
    localArtifactEvents.push({
      type: 'artifact',
      componentName: 'document',
      id: uuidv4(),
      props: {
        documentId: id,
        title: title,
        kind: kind,
        eventType: 'artifact-start',
        status: 'streaming',
      },
    });
    logger.info('CREATE_DOCUMENT_TOOL', 'Pushed artifact-start event', {
      docId: id,
    });

    // 2. Define the callbacks that will populate the event array
    const streamCallbacks: DocumentStreamCallbacks = {
      onChunk: (chunk: string) => {
        logger.info(
          `[CREATE_DOCUMENT_TOOL] 'onChunk' callback received: "${
            typeof chunk === 'string' ? chunk.substring(0, 70) : String(chunk)
          }..." (Type: ${typeof chunk}, Length: ${chunk?.length})`,
          'Processing chunk',
        );
        if (typeof chunk === 'string' && chunk.length > 0) {
          const artifactChunkEvent: UIMessage = {
            type: 'artifact',
            componentName: 'document',
            id: uuidv4(),
            props: {
              documentId: id, // Ensure id is in scope
              title: title, // Ensure title is in scope
              eventType: 'artifact-chunk',
              contentChunk: chunk, // The actual chunk
            },
          };
          logger.info(
            '[CREATE_DOCUMENT_TOOL] Pushing artifact-chunk event:',
            JSON.stringify(artifactChunkEvent),
          );
          localArtifactEvents.push(artifactChunkEvent);
        } else {
          logger.warn(
            "[CREATE_DOCUMENT_TOOL] 'onChunk' callback: Received empty or invalid chunk. Not creating artifact-chunk event.",
            JSON.stringify({ chunk }),
          );
        }
      },
      onComplete: (finalContent: string) => {
        logger.info(
          'CREATE_DOCUMENT_TOOL',
          `Received onComplete callback. Final length: ${finalContent.length}`,
        );
        localArtifactEvents.push({
          type: 'artifact',
          componentName: 'document',
          id: uuidv4(),
          props: {
            documentId: id,
            title: title,
            eventType: 'artifact-end',
            status: 'complete',
            contentLength: finalContent.length,
          },
        });
      },
    };

    // 3. Find the correct handler and prepare its properties
    const handler = documentHandlersByArtifactKind.find((h) => h.kind === kind);
    if (!handler) {
      const errorMsg = `No handler found for artifact kind '${kind}'.`;
      logger.error('CREATE_DOCUMENT_TOOL', errorMsg);
      localArtifactEvents.push({
        type: 'artifact',
        componentName: 'document',
        id: uuidv4(),
        props: {
          documentId: id,
          title,
          eventType: 'artifact-error',
          error: errorMsg,
        },
      });
      return JSON.stringify({
        summaryForLLM: `Failed to create document '${title}'. Reason: ${errorMsg}`,
        _isQubitArtifactToolResult: true,
        quibitArtifactEvents: localArtifactEvents,
      });
    }

    const handlerProps: CreateDocumentCallbackProps = {
      id,
      title,
      dataStream,
      session,
      initialContentPrompt: contentPrompt,
      streamCallbacks: streamCallbacks, // Add the callbacks
    };

    // 4. Execute the handler, which will call our callbacks
    logger.info(
      'CREATE_DOCUMENT_TOOL',
      `Calling onCreateDocument for handler: ${handler.kind}`,
      { docId: id },
    );
    try {
      await handler.onCreateDocument(handlerProps);
    } catch (e: any) {
      const errorMsg = `Handler ${handler.kind} failed during execution: ${e.message}`;
      logger.error('CREATE_DOCUMENT_TOOL', errorMsg, e);
      localArtifactEvents.push({
        type: 'artifact',
        componentName: 'document',
        id: uuidv4(),
        props: {
          documentId: id,
          title,
          eventType: 'artifact-error',
          error: errorMsg,
        },
      });
    }

    // 5. Construct the final result for LangGraph
    const summaryForLLM = `Document '${title}' was created successfully. All content and events have been streamed.`;
    const toolResult = {
      summaryForLLM: summaryForLLM,
      _isQubitArtifactToolResult: true,
      quibitArtifactEvents: localArtifactEvents,
    };

    logger.info(
      'CREATE_DOCUMENT_TOOL',
      `Execution finished. Returning ${localArtifactEvents.length} artifact events.`,
      { docId: id },
    );

    return JSON.stringify(toolResult);
  },
});

// Example of how the tool's output might be used by the agent:
// const toolResultString = await createDocumentTool.call({ title: "My Doc", kind: "text" });
// const toolResultObject = JSON.parse(toolResultString);
// console.log(toolResultObject.id);
// const toolMessage = new ToolMessage({ content: toolResultString, tool_call_id: "some_id" });
