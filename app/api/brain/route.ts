/**
 * Brain API Route - Modern Implementation (Production)
 *
 * 🚀 FULL ROLLOUT COMPLETE: 100% modern implementation active
 * Legacy system archived, emergency rollback available via feature flags
 */

import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { getClientConfig } from '@/lib/db/queries';

// Modern implementation services
import {
  processBrainRequest,
  type BrainOrchestratorConfig,
} from '@/lib/services/brainOrchestrator';
import { isFeatureEnabled } from '@/lib/config/featureFlags';

/**
 * Main POST handler - 100% modern implementation
 */
export async function POST(req: NextRequest) {
  const startTime = performance.now();

  try {
    // Get user session
    const session = await auth();

    // Get client configuration
    const clientConfig = session?.user?.clientId
      ? await getClientConfig(session.user.clientId)
      : null;

    // Configure the brain orchestrator
    const config: BrainOrchestratorConfig = {
      clientConfig,
      enableCaching: isFeatureEnabled('enablePerformanceMetrics'),
      enableToolExecution: true,
      maxTools: 26,
      streamingEnabled: true,
      enableLangChainBridge: true, // Use LangChain bridge by default
    };

    // Process the request through our modern pipeline
    const result = await processBrainRequest(req, config);

    if (result.success && result.stream) {
      // Handle AgentExecutor stream properly
      // Create a proper data stream response using the Vercel AI SDK protocol

      if ('pipeThrough' in result.stream) {
        // It's already a ReadableStream (from modern pipeline)
        return new Response(result.stream as ReadableStream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Correlation-ID': result.correlationId,
            'X-Processing-Time': `${result.processingTime.toFixed(2)}ms`,
            'X-Implementation': 'modern-hybrid',
            'X-Rollout-Status': 'production-100-percent',
          },
        });
      } else {
        // It's an AsyncIterable from LangChain AgentExecutor
        // Convert to proper Vercel AI SDK data stream protocol manually
        const asyncIterable = result.stream as AsyncIterable<any>;

        const textEncoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              let hasEmittedContent = false;

              for await (const chunk of asyncIterable) {
                console.log(
                  '[BrainAPI] Agent execution chunk type:',
                  typeof chunk,
                  Object.keys(chunk || {}),
                );

                // Handle different types of agent execution events
                if (chunk && typeof chunk === 'object') {
                  // Look for the final output in agent execution
                  if (chunk.output && typeof chunk.output === 'string') {
                    // Stream the output as text using the Vercel AI SDK protocol
                    // Format: 0:"text content"\n
                    const textData = `0:${JSON.stringify(chunk.output)}\n`;
                    controller.enqueue(textEncoder.encode(textData));
                    hasEmittedContent = true;
                    break;
                  }
                  // Handle direct string chunks
                  else if (typeof chunk === 'string') {
                    const textData = `0:${JSON.stringify(chunk)}\n`;
                    controller.enqueue(textEncoder.encode(textData));
                    hasEmittedContent = true;
                  }
                  // Handle chunks with content field
                  else if (chunk.content && typeof chunk.content === 'string') {
                    const textData = `0:${JSON.stringify(chunk.content)}\n`;
                    controller.enqueue(textEncoder.encode(textData));
                    hasEmittedContent = true;
                  }
                  // Handle intermediate steps if needed
                  else if (chunk.intermediate_steps || chunk.log) {
                    // These are tool execution steps - we might want to stream progress updates
                    // For now, we'll just log them and wait for the final output
                    continue;
                  }
                }
              }

              // If no content was emitted, provide a fallback
              if (!hasEmittedContent) {
                console.warn(
                  '[BrainAPI] No content found in agent stream, providing fallback',
                );
                const fallbackMessage =
                  'I apologize, but I encountered an issue processing your request. Please try again.';
                const textData = `0:${JSON.stringify(fallbackMessage)}\n`;
                controller.enqueue(textEncoder.encode(textData));
              }

              // End the stream with a finish message (required by Vercel AI SDK)
              const finishData = `d:${JSON.stringify({
                finishReason: 'stop',
                usage: {
                  promptTokens: 0,
                  completionTokens: 0,
                  totalTokens: 0,
                },
              })}\n`;
              controller.enqueue(textEncoder.encode(finishData));

              controller.close();
            } catch (error) {
              console.error('[BrainAPI] Error processing agent stream:', error);

              // Send error in the correct format
              const errorMessage =
                'Sorry, I encountered an error while processing your request.';
              const textData = `0:${JSON.stringify(errorMessage)}\n`;
              controller.enqueue(textEncoder.encode(textData));

              // Still need to end properly
              const finishData = `d:${JSON.stringify({
                finishReason: 'error',
                usage: {
                  promptTokens: 0,
                  completionTokens: 0,
                  totalTokens: 0,
                },
              })}\n`;
              controller.enqueue(textEncoder.encode(finishData));

              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'x-vercel-ai-data-stream': 'v1',
            'X-Correlation-ID': result.correlationId,
            'X-Processing-Time': `${result.processingTime.toFixed(2)}ms`,
            'X-Implementation': 'modern-hybrid',
            'X-Rollout-Status': 'production-100-percent',
          },
        });
      }
    } else {
      // Handle error response
      return result.error;
    }
  } catch (error) {
    console.error('[BrainAPI] Processing error:', error);

    // Return structured error response
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Brain API processing failed',
        correlationId: crypto.randomUUID(),
        implementation: 'modern',
        timestamp: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'X-Implementation': 'modern',
          'X-Rollout-Status': 'production-100-percent',
        },
      },
    );
  }
}

/**
 * Health check and system status endpoint
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode');

  if (mode === 'health') {
    return NextResponse.json({
      status: 'healthy',
      implementation: 'modern',
      rolloutStatus: 'production-100-percent',
      features: {
        modernAPI: true, // Always true in production
        detailedLogging: isFeatureEnabled('enableDetailedLogging'),
        performanceMetrics: isFeatureEnabled('enablePerformanceMetrics'),
        abTesting: isFeatureEnabled('enableA11yTesting'),
      },
      legacySystem: {
        archived: true,
        emergencyRollbackAvailable: true,
        archiveLocation: 'archive/legacy-brain-api/',
      },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(
    {
      error: 'Method not allowed',
      supportedMethods: ['POST'],
      healthCheck: '?mode=health',
    },
    {
      status: 405,
    },
  );
}
