import type { NextRequest } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { createDocumentTool } from '@/lib/ai/tools/create-document';

export const runtime = 'nodejs';

/**
 * Simple test to verify LangChain.js tool_choice works with our exact tools
 */
export async function POST(req: NextRequest) {
  try {
    console.log('Testing LangChain.js tool_choice directly...');

    // Use the exact same model and tool as our main system
    const llm = new ChatOpenAI({
      model: 'gpt-4.1-mini',
      temperature: 0,
    });

    // Get the exact same tool we use in the system
    const tools = [createDocumentTool];

    // Test 1: Without tool_choice (should not call tools)
    const llmWithoutForcing = llm.bindTools(tools);
    const responseWithoutForcing = await llmWithoutForcing.invoke([
      new HumanMessage('Create a document about artificial intelligence'),
    ]);

    // Test 2: With tool_choice = "required" (should call tools)
    const llmWithRequired = llm.bindTools(tools, {
      tool_choice: 'required',
    });
    const responseWithRequired = await llmWithRequired.invoke([
      new HumanMessage('Create a document about artificial intelligence'),
    ]);

    // Test 3: With tool_choice = specific tool name (should call specific tool)
    const llmWithSpecific = llm.bindTools(tools, {
      tool_choice: 'createDocument',
    });
    const responseWithSpecific = await llmWithSpecific.invoke([
      new HumanMessage('Create a document about artificial intelligence'),
    ]);

    return new Response(
      JSON.stringify(
        {
          success: true,
          tests: {
            withoutForcing: {
              hasToolCalls: !!responseWithoutForcing.tool_calls?.length,
              toolCallCount: responseWithoutForcing.tool_calls?.length || 0,
              content: responseWithoutForcing.content
                ?.toString()
                .substring(0, 200),
            },
            withRequired: {
              hasToolCalls: !!responseWithRequired.tool_calls?.length,
              toolCallCount: responseWithRequired.tool_calls?.length || 0,
              content: responseWithRequired.content
                ?.toString()
                .substring(0, 200),
              toolCalls: responseWithRequired.tool_calls || [],
            },
            withSpecific: {
              hasToolCalls: !!responseWithSpecific.tool_calls?.length,
              toolCallCount: responseWithSpecific.tool_calls?.length || 0,
              content: responseWithSpecific.content
                ?.toString()
                .substring(0, 200),
              toolCalls: responseWithSpecific.tool_calls || [],
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
    console.error('LangChain tool_choice test failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
