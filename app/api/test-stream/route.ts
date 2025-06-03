import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST() {
  try {
    console.log('[test-stream] Starting minimal streaming test');

    const result = streamText({
      model: openai('gpt-4o-mini'), // Use the same model as your main system
      prompt:
        'Count from 1 to 10 slowly, inserting "..." between each number. Make it take about 10 seconds by adding some explanation for each number.',
    });

    console.log(
      '[test-stream] Created streamText result, calling toDataStreamResponse()',
    );

    // Directly return the Vercel AI SDK's Response object
    const response = result.toDataStreamResponse();

    console.log('[test-stream] Response created successfully');

    return response;
  } catch (error) {
    console.error('[test-stream] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to stream',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
