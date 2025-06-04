import {
  createLangChainAgent,
  streamLangChainAgent,
} from '@/lib/services/langchainBridge';
import type { RequestLogger } from '@/lib/services/observabilityService';
import { generateUUID } from '@/lib/utils';

// Create a simple test logger
const createTestLogger = (): RequestLogger => ({
  correlationId: `test-artifact-${generateUUID()}`,
  startTime: Date.now(),
  info: (msg: string, data?: any) =>
    console.log(`[TEST-ARTIFACT] ${msg}`, data || ''),
  error: (msg: string, data?: any) =>
    console.error(`[TEST-ARTIFACT] ${msg}`, data || ''),
  warn: (msg: string, data?: any) =>
    console.warn(`[TEST-ARTIFACT] ${msg}`, data || ''),
  logTokenUsage: (usage) => console.log('[TOKEN]', usage),
  logPerformanceMetrics: (metrics) => console.log('[PERF]', metrics),
  finalize: () => ({
    correlationId: 'test-artifact',
    duration: Date.now() - Date.now(),
    success: true,
    events: [],
  }),
});

export async function POST() {
  const logger = createTestLogger();

  try {
    // Initialize global context for artifact tracking
    if (!global.CREATE_DOCUMENT_CONTEXT) {
      global.CREATE_DOCUMENT_CONTEXT = {
        toolInvocationsTracker: [],
      };
    }

    logger.info('Starting artifact test');

    // Create a simple LangChain agent configured for LangGraph
    const agent = await createLangChainAgent(
      'You are a helpful assistant that creates documents when asked. Always use the createDocument tool when someone asks you to create any kind of document.',
      {
        contextId: null,
        enableToolExecution: true,
        enableLangGraph: true, // Force LangGraph usage
        maxIterations: 3,
        verbose: true,
      },
      logger,
    );

    // Simulate artifact creation by manually adding to tracker
    // This simulates what the createDocument tool would do
    const testArtifact = {
      type: 'tool-invocation' as const,
      toolInvocation: {
        toolName: 'createDocument',
        toolCallId: generateUUID(),
        state: 'result' as const,
        args: {
          title: 'Test Document',
          content:
            'This is a test document created by the artifact test endpoint.',
        },
        result: {
          documentId: generateUUID(),
          success: true,
          message: 'Document created successfully',
        },
      },
    };

    // Add to tracker to simulate tool execution
    if (global.CREATE_DOCUMENT_CONTEXT?.toolInvocationsTracker) {
      global.CREATE_DOCUMENT_CONTEXT.toolInvocationsTracker.push(testArtifact);
    }

    // Stream the response
    const response = await streamLangChainAgent(
      agent,
      'Please create a document titled "Test Document" with some sample content.',
      [],
      {
        contextId: null,
        enableToolExecution: true,
        enableLangGraph: true,
        maxIterations: 3,
        verbose: true,
      },
      logger,
    );

    return response;
  } catch (error) {
    logger.error('Test artifact endpoint failed', { error });

    return new Response(
      JSON.stringify({ error: 'Failed to test artifact generation' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
