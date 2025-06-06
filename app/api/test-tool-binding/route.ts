import type { NextRequest } from 'next/server';
import { getRequestLogger } from '@/lib/services/observabilityService';
import { createLangChainAgent } from '@/lib/services/langchainBridge';
import type { LangChainBridgeConfig } from '@/lib/services/langchainBridge';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { loadPrompt } from '@/lib/ai/prompts/loader';
import { createQueryClassifier } from '@/lib/services/queryClassifier';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';

export const runtime = 'nodejs';

/**
 * Diagnostic endpoint to test tool binding and calling in LangGraph
 * Tests both implicit tool calling (with prompts) and explicit tool calling
 */
export async function POST(req: NextRequest) {
  const logger = getRequestLogger(req);

  try {
    logger.info('Starting tool binding diagnostic test');

    // Set up artifact context for createDocument tool testing
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const mockDataStream = {
      write: (content: string) => {
        logger.info('[TestEndpoint] Mock dataStream write', {
          contentLength: content.length,
          preview: content.substring(0, 100),
        });
      },
      writeData: (data: any) => {
        logger.info('[TestEndpoint] Mock dataStream writeData', { data });
      },
      appendData: (data: any) => {
        logger.info('[TestEndpoint] Mock dataStream appendData', { data });
      },
    };

    // Set up global artifact context
    global.CREATE_DOCUMENT_CONTEXT = {
      dataStream: mockDataStream,
      session: mockSession,
      handlers: documentHandlersByArtifactKind,
      toolInvocationsTracker: [],
    };

    logger.info('Set up artifact context for testing', {
      hasGlobalContext: !!global.CREATE_DOCUMENT_CONTEXT,
      hasDataStream: !!global.CREATE_DOCUMENT_CONTEXT?.dataStream,
      hasSession: !!global.CREATE_DOCUMENT_CONTEXT?.session,
    });

    // Test 0: NEW - Classification Test
    const testInput =
      'Create a document about the benefits of artificial intelligence';
    const queryClassifier = createQueryClassifier(logger);
    const classificationResult = await queryClassifier.classifyQuery(testInput);

    logger.info('Classification test completed', {
      input: testInput,
      shouldUseLangChain: classificationResult.shouldUseLangChain,
      forceToolCall: classificationResult.forceToolCall,
      confidence: classificationResult.confidence,
      reasoning: classificationResult.reasoning,
    });

    // Create LangChain agent with LangGraph enabled
    const config: LangChainBridgeConfig = {
      selectedChatModel: 'gpt-4o',
      contextId: 'echo-tango-specialist',
      clientConfig: null,
      enableToolExecution: true,
      maxIterations: 3,
      verbose: true,
      enableLangGraph: true,
      langGraphPatterns: ['TOOL_OPERATION'], // Force LangGraph usage
      forceToolCall: classificationResult.forceToolCall, // NEW: Pass tool forcing directive
    };

    // Load the actual Echo Tango specialist prompt
    const systemPrompt = loadPrompt({
      modelId: 'echo-tango-specialist',
      contextId: 'echo-tango-specialist',
      clientConfig: null,
    });

    logger.info(
      'Creating LangChain agent for diagnostic test with actual specialist prompt',
    );
    const agent = await createLangChainAgent(systemPrompt, config, logger);

    // Test 1: Explicit tool instruction
    const explicitTestInput =
      'Use the tool "createDocument" with parameters: title "Test Document", content "This is a test to verify tool calling works."';

    logger.info('Test 1: Explicit tool instruction', {
      input: explicitTestInput,
    });

    let result1: any;
    if (agent.executionType === 'langgraph' && agent.langGraphWrapper) {
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(explicitTestInput),
      ];

      result1 = await agent.langGraphWrapper.invoke(messages);
    }

    // Test 2: Implicit tool calling with strong prompt
    const implicitTestInput =
      'Create a document with a report about the benefits of AI in creative agencies. Make it comprehensive and professional.';

    logger.info('Test 2: Implicit tool calling test', {
      input: implicitTestInput,
    });

    let result2: any;
    if (agent.executionType === 'langgraph' && agent.langGraphWrapper) {
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(implicitTestInput),
      ];

      result2 = await agent.langGraphWrapper.invoke(messages);
    }

    // Test 3: Check tool availability
    const toolInfo = {
      agentType: agent.executionType,
      toolCount: agent.tools.length,
      toolNames: agent.tools.map((t) => t.name),
      toolDescriptions: agent.tools.map((t) => ({
        name: t.name,
        description: t.description?.substring(0, 100) || 'No description',
      })),
    };

    logger.info('Tool binding diagnostic completed');

    // Clean up global context
    global.CREATE_DOCUMENT_CONTEXT = undefined;

    return new Response(
      JSON.stringify(
        {
          success: true,
          tests: {
            classificationTest: {
              input: testInput,
              result: classificationResult,
            },
            explicitToolTest: {
              input: explicitTestInput,
              result: result1
                ? {
                    messages: result1.messages?.length || 0,
                    lastMessage:
                      result1.messages?.[result1.messages.length - 1]
                        ?.content || 'No content',
                    hasToolCalls: !!result1.agent_outcome?.tool_calls?.length,
                    hasToolExecution:
                      result1.messages?.some(
                        (m: any) => m._getType?.() === 'tool',
                      ) || false,
                    messageTypes:
                      result1.messages?.map(
                        (m: any) => m._getType?.() || 'unknown',
                      ) || [],
                  }
                : 'No result',
            },
            implicitToolTest: {
              input: implicitTestInput,
              result: result2
                ? {
                    messages: result2.messages?.length || 0,
                    lastMessage:
                      result2.messages?.[result2.messages.length - 1]
                        ?.content || 'No content',
                    hasToolCalls: !!result2.agent_outcome?.tool_calls?.length,
                    hasToolExecution:
                      result2.messages?.some(
                        (m: any) => m._getType?.() === 'tool',
                      ) || false,
                    messageTypes:
                      result2.messages?.map(
                        (m: any) => m._getType?.() || 'unknown',
                      ) || [],
                    aiMessagesWithToolCalls:
                      result2.messages?.filter(
                        (m: any) =>
                          m._getType?.() === 'ai' &&
                          m.tool_calls &&
                          m.tool_calls.length > 0,
                      ).length || 0,
                  }
                : 'No result',
            },
            toolInfo,
          },
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    // Clean up global context on error
    global.CREATE_DOCUMENT_CONTEXT = undefined;

    logger.error('Tool binding diagnostic failed', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}
