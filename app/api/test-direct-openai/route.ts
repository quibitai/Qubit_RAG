import type { NextRequest } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod';

export const runtime = 'nodejs';

/**
 * Test direct OpenAI function calling bypassing LangChain entirely
 */
export async function POST(req: NextRequest) {
  try {
    console.log('Testing direct OpenAI function calling...');

    // Test 1: Explicit function call instruction with toolChoice required
    const explicitResult = await generateText({
      model: openai('gpt-4o'),
      prompt:
        'Use the createDocument function to create a document with title "Test Doc" and content "Hello world"',
      tools: {
        createDocument: {
          description: 'Create a text document with a title and content',
          parameters: z.object({
            title: z.string().describe('The title of the document'),
            content: z.string().describe('The content of the document'),
          }),
        },
      },
      toolChoice: 'required',
    });

    // Test 2: Implicit function call
    const implicitResult = await generateText({
      model: openai('gpt-4o'),
      prompt: 'Create a document about artificial intelligence',
      tools: {
        createDocument: {
          description: 'Create a text document with a title and content',
          parameters: z.object({
            title: z.string().describe('The title of the document'),
            content: z.string().describe('The content of the document'),
          }),
        },
      },
    });

    return new Response(
      JSON.stringify(
        {
          success: true,
          tests: {
            explicitTest: {
              hasToolCalls: explicitResult.toolCalls?.length > 0,
              toolCallCount: explicitResult.toolCalls?.length || 0,
              toolCalls: explicitResult.toolCalls || [],
              text: explicitResult.text,
            },
            implicitTest: {
              hasToolCalls: implicitResult.toolCalls?.length > 0,
              toolCallCount: implicitResult.toolCalls?.length || 0,
              toolCalls: implicitResult.toolCalls || [],
              text: implicitResult.text,
            },
          },
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
    console.error('Direct OpenAI test failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
