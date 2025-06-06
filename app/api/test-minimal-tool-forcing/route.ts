/**
 * Minimal Tool Forcing Test
 *
 * This endpoint tests LLM tool calling with the simplest possible setup:
 * - Direct ChatOpenAI usage (no LangGraph)
 * - Simple tool schema
 * - Multiple models and tool_choice formats
 * - Detailed logging
 */

import type { NextRequest } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { HumanMessage } from '@langchain/core/messages';

export async function POST(req: NextRequest) {
  console.log('\n=== MINIMAL TOOL FORCING TEST START ===');

  try {
    const body = await req.json();
    const {
      prompt = 'Create a simple document about cats',
      model = 'gpt-4.1-mini',
      toolChoice = 'createSimpleDocument',
    } = body;

    console.log('Test parameters:', { prompt, model, toolChoice });

    // Create a very simple tool with minimal schema
    const simpleDocumentTool = new DynamicStructuredTool({
      name: 'createSimpleDocument',
      description: 'Creates a simple document with a title and content',
      schema: z.object({
        title: z.string().describe('The title of the document'),
        content: z.string().describe('The content of the document'),
      }),
      func: async ({ title, content }) => {
        console.log(
          `[SIMPLE_TOOL_EXECUTED] Title: "${title}", Content: "${content.substring(0, 100)}..."`,
        );
        return `Document created successfully: "${title}" with ${content.length} characters`;
      },
    });

    // Test multiple models
    const modelsToTest = [model]; // Start with requested model
    if (model === 'gpt-4.1-mini') {
      modelsToTest.push('gpt-4', 'gpt-3.5-turbo-1106', 'gpt-4o');
    }

    const results = [];

    for (const testModel of modelsToTest) {
      console.log(`\n--- Testing model: ${testModel} ---`);

      try {
        // Initialize LLM
        const llm = new ChatOpenAI({
          modelName: testModel,
          temperature: 0.1,
          apiKey: process.env.OPENAI_API_KEY,
        });

        console.log(`LLM initialized for ${testModel}`);

        // Test different tool_choice formats
        const toolChoiceFormats = [
          { name: 'tool_name', value: toolChoice },
          { name: 'required', value: 'required' },
          {
            name: 'openai_format',
            value: { type: 'function', function: { name: toolChoice } },
          },
        ];

        for (const format of toolChoiceFormats) {
          console.log(
            `\n  Testing tool_choice format: ${format.name} = ${JSON.stringify(format.value)}`,
          );

          try {
            // Bind tools with tool_choice
            const llmWithTools = llm.bindTools([simpleDocumentTool], {
              tool_choice: format.value,
            });

            console.log(
              `  Tools bound successfully with tool_choice: ${JSON.stringify(format.value)}`,
            );

            // Create message
            const messages = [new HumanMessage(prompt)];
            console.log(`  Sending message to ${testModel}: "${prompt}"`);

            // Invoke LLM
            const response = await llmWithTools.invoke(messages);

            console.log(`  Response from ${testModel}:`, {
              content:
                typeof response.content === 'string'
                  ? response.content.substring(0, 200)
                  : response.content,
              hasToolCalls:
                !!response.tool_calls && response.tool_calls.length > 0,
              toolCallCount: response.tool_calls?.length || 0,
              toolCalls:
                response.tool_calls?.map((tc) => ({
                  name: tc.name,
                  id: tc.id,
                  args: tc.args,
                })) || [],
            });

            results.push({
              model: testModel,
              toolChoiceFormat: format.name,
              toolChoiceValue: format.value,
              success: true,
              hasToolCalls:
                !!response.tool_calls && response.tool_calls.length > 0,
              toolCallCount: response.tool_calls?.length || 0,
              responseContentLength:
                typeof response.content === 'string'
                  ? response.content.length
                  : 0,
              responsePreview:
                typeof response.content === 'string'
                  ? response.content.substring(0, 100)
                  : String(response.content),
              toolCalls:
                response.tool_calls?.map((tc) => ({
                  name: tc.name,
                  args: tc.args,
                })) || [],
            });

            // If tool calls detected, this format works!
            if (response.tool_calls && response.tool_calls.length > 0) {
              console.log(
                `  ✅ SUCCESS: ${testModel} with ${format.name} produced ${response.tool_calls.length} tool call(s)`,
              );

              // Execute the tool calls to verify they work
              for (const toolCall of response.tool_calls) {
                console.log(
                  `  Executing tool call: ${toolCall.name} with args:`,
                  toolCall.args,
                );
                const toolResult = await simpleDocumentTool.invoke({
                  title: toolCall.args.title,
                  content: toolCall.args.content,
                });
                console.log(`  Tool result:`, toolResult);
              }
            } else {
              console.log(
                `  ❌ FAILED: ${testModel} with ${format.name} produced NO tool calls despite tool_choice`,
              );
            }
          } catch (bindError) {
            console.error(`  Error with ${format.name} format:`, bindError);
            results.push({
              model: testModel,
              toolChoiceFormat: format.name,
              toolChoiceValue: format.value,
              success: false,
              error:
                bindError instanceof Error
                  ? bindError.message
                  : String(bindError),
            });
          }
        }
      } catch (modelError) {
        console.error(`Error with model ${testModel}:`, modelError);
        results.push({
          model: testModel,
          success: false,
          error:
            modelError instanceof Error
              ? modelError.message
              : String(modelError),
        });
      }
    }

    console.log('\n=== MINIMAL TOOL FORCING TEST COMPLETE ===');
    console.log('Summary:', results);

    return new Response(
      JSON.stringify(
        {
          success: true,
          message: 'Minimal tool forcing test completed',
          testParameters: { prompt, model, toolChoice },
          results,
          summary: {
            totalTests: results.length,
            successfulBindings: results.filter((r) => r.success).length,
            successfulToolCalls: results.filter(
              (r) => r.success && r.hasToolCalls,
            ).length,
            modelsWithToolCalls: [
              ...new Set(
                results.filter((r) => r.hasToolCalls).map((r) => r.model),
              ),
            ],
            workingFormats: results
              .filter((r) => r.hasToolCalls)
              .map((r) => ({ model: r.model, format: r.toolChoiceFormat })),
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
    console.error('=== MINIMAL TOOL FORCING TEST ERROR ===', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
