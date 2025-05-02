import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { document } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * SSE endpoint for document updates
 * Returns a stream of server-sent events for document updates.
 * This allows real-time notifications when a document is being updated
 * by the AI or other sources.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    // Authenticate the user
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const userId = session.user.id;
    const { docId } = await params;

    // Verify the document exists and user has access
    if (docId !== 'new') {
      const docs = await db
        .select()
        .from(document)
        .where(eq(document.id, docId))
        .limit(1);

      if (!docs || docs.length === 0) {
        return new NextResponse('Document not found', { status: 404 });
      }

      // Check if user has permission to access this document
      if (docs[0].userId !== userId) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    // Set up server-sent events stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection established message
        const initialMessage = {
          type: 'connection-established',
          docId,
          message: 'Connected to document updates stream',
        };

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(initialMessage)}\n\n`),
        );

        // Set up ping interval to keep connection alive
        const pingInterval = setInterval(() => {
          const pingMessage = {
            type: 'ping',
            timestamp: Date.now(),
          };

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(pingMessage)}\n\n`),
          );
        }, 30000); // Send ping every 30 seconds

        // Clean up on close
        req.signal.addEventListener('abort', () => {
          clearInterval(pingInterval);
        });
      },
    });

    // Return the SSE stream
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    console.error('Error setting up document listen stream:', error);
    return new NextResponse(
      `Internal Server Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 },
    );
  }
}
