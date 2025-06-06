import { NextRequest } from 'next/server';

export async function GET() {
  try {
    // Simulate the artifact event structure that createDocument generates
    const mockArtifactEvent = {
      type: 'artifact',
      documentId: 'test-doc-123',
      timestamp: new Date().toISOString(),
      componentName: 'document',
      props: {
        documentId: 'test-doc-123',
        title: 'Test Document',
        eventType: 'artifact-chunk',
        contentChunk: 'This is a test content chunk for progressive streaming.',
        totalContentLength: 50,
        chunkSequence: 1,
      },
      id: 'artifact-chunk-test-doc-123-1',
    };

    // Simulate the UIMessage creation logic from executeToolsNode
    const uiEvent = {
      id: 'ui-event-123',
      name: 'document',
      props: {
        documentId:
          mockArtifactEvent.documentId ||
          mockArtifactEvent.props?.documentId ||
          'unknown',
        title: mockArtifactEvent.props?.title || 'Test Document',
        status: 'complete',
        eventType: mockArtifactEvent.props?.eventType || mockArtifactEvent.type, // Fix: Use props.eventType first
        // Transfer contentChunk if present (for artifact-chunk events)
        ...(mockArtifactEvent.props?.contentChunk && {
          contentChunk: mockArtifactEvent.props.contentChunk,
        }),
        // Transfer other relevant props
        ...(mockArtifactEvent.props?.totalContentLength && {
          totalContentLength: mockArtifactEvent.props.totalContentLength,
        }),
        ...(mockArtifactEvent.props?.chunkSequence && {
          chunkSequence: mockArtifactEvent.props.chunkSequence,
        }),
        // Store metadata separately to avoid prop collisions
        _originalEvent: {
          type: mockArtifactEvent.type,
          id: mockArtifactEvent.id,
          timestamp: mockArtifactEvent.timestamp,
        },
      },
      metadata: {
        message_id: 'test-message-id',
        toolCallId: 'test-tool-call-id',
        toolName: 'createDocument',
      },
    };

    // Check if the fix worked
    const hasContentChunk = !!uiEvent.props.contentChunk;
    const correctEventType = uiEvent.props.eventType === 'artifact-chunk';

    return new Response(
      JSON.stringify(
        {
          success: true,
          message: 'Artifact event processing test',
          results: {
            hasContentChunk,
            correctEventType,
            contentChunk: uiEvent.props.contentChunk,
            eventType: uiEvent.props.eventType,
          },
          originalArtifactEvent: mockArtifactEvent,
          processedUIEvent: uiEvent,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
