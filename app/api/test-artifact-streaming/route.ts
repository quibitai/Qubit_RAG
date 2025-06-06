/**
 * Test Artifact Streaming
 *
 * This endpoint tests the artifact streaming functionality specifically,
 * focusing on the createDocument tool and progressive content delivery.
 */

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
 * Test endpoint for artifact streaming functionality
 */
export async function POST(req: NextRequest) {
  const logger = getRequestLogger(req);

  try {
    const body = await req.json();
    const {
      prompt = 'Create a detailed document covering the fundamentals of machine learning',
    } = body;

    logger.info('Starting artifact streaming test', { prompt });

    // Set up artifact context for createDocument tool testing
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const mockDataStream = {
      write: (content: string) => {
        logger.info('[ArtifactStreamTest] Mock dataStream write', {
          contentLength: content.length,
          preview: content.substring(0, 100),
        });
      },
      writeData: (data: any) => {
        logger.info('[ArtifactStreamTest] Mock dataStream writeData', { data });
      },
      appendData: (data: any) => {
        logger.info('[ArtifactStreamTest] Mock dataStream appendData', {
          data,
        });
      },
    };

    // Set up global artifact context
    global.CREATE_DOCUMENT_CONTEXT = {
      dataStream: mockDataStream,
      session: mockSession,
      handlers: documentHandlersByArtifactKind,
      toolInvocationsTracker: [],
    };

    logger.info('Set up artifact context for streaming test', {
      hasGlobalContext: !!global.CREATE_DOCUMENT_CONTEXT,
      hasDataStream: !!global.CREATE_DOCUMENT_CONTEXT?.dataStream,
      hasSession: !!global.CREATE_DOCUMENT_CONTEXT?.session,
    });

    // Step 1: Classification
    const queryClassifier = createQueryClassifier(logger);
    const classificationResult = await queryClassifier.classifyQuery(prompt);

    // Step 2: Tool Execution
    const config: LangChainBridgeConfig = {
      selectedChatModel: 'gpt-4.1-mini',
      contextId: 'echo-tango-specialist',
      clientConfig: null,
      enableToolExecution: true,
      maxIterations: 3,
      verbose: true,
      enableLangGraph: true,
      langGraphPatterns: ['TOOL_OPERATION'],
      forceToolCall: classificationResult.forceToolCall,
    };

    const systemPrompt = loadPrompt({
      modelId: 'echo-tango-specialist',
      contextId: 'echo-tango-specialist',
      clientConfig: null,
    });

    const agent = await createLangChainAgent(systemPrompt, config, logger);

    let toolExecutionResult: any;
    if (agent.executionType === 'langgraph' && agent.langGraphWrapper) {
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(prompt),
      ];

      toolExecutionResult = await agent.langGraphWrapper.invoke(messages);
    }

    // Analysis
    const hasToolExecution =
      toolExecutionResult?.messages?.some(
        (m: any) => m._getType?.() === 'tool',
      ) || false;

    const aiMessagesWithToolCalls =
      toolExecutionResult?.messages?.filter(
        (m: any) =>
          m._getType?.() === 'ai' && m.tool_calls && m.tool_calls.length > 0,
      ).length || 0;

    const verdict = {
      classificationWorking: !!classificationResult.forceToolCall,
      toolForcingWorking: aiMessagesWithToolCalls > 0,
      toolExecutionWorking: hasToolExecution,
      completeWorkflow:
        !!classificationResult.forceToolCall &&
        aiMessagesWithToolCalls > 0 &&
        hasToolExecution,
    };

    logger.info('Artifact streaming test completed', verdict);

    // Clean up global context
    global.CREATE_DOCUMENT_CONTEXT = undefined;

    return new Response(
      JSON.stringify({
        success: true,
        prompt,
        classification: classificationResult,
        execution: {
          messages: toolExecutionResult?.messages?.length || 0,
          messageTypes:
            toolExecutionResult?.messages?.map(
              (m: any) => m._getType?.() || 'unknown',
            ) || [],
          hasToolCalls:
            !!toolExecutionResult?.agent_outcome?.tool_calls?.length,
          hasToolExecution,
          aiMessagesWithToolCalls,
        },
        toolExecution: {
          hasToolExecution,
          aiMessagesWithToolCalls,
          messageCount: toolExecutionResult?.messages?.length || 0,
        },
        verdict,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    // Clean up global context on error
    global.CREATE_DOCUMENT_CONTEXT = undefined;

    logger.error('Artifact streaming test failed', error);

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
