/**
 * Brain API Route
 *
 * Central orchestration endpoint for AI interactions using Langchain.
 * This route handles all AI requests, dynamically selecting tools based on the Bit context.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

// Import tools and utilities
import { listDocumentsTool } from '@/lib/ai/tools';
import { getSystemPromptFor } from '@/lib/ai/prompts';

/**
 * Initialize LLM based on configuration/environment
 *
 * @param modelName - Optional override for the model to use
 * @returns Configured LLM instance
 */
function initializeLLM(modelName?: string) {
  const selectedModel =
    modelName || process.env.DEFAULT_MODEL_NAME || 'gpt-4-turbo';

  // Check for required environment variables
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }

  // Initialize OpenAI Chat model
  return new ChatOpenAI({
    modelName: selectedModel,
    temperature: 0.7,
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Format chat history for Langchain
 *
 * @param history - Chat history from the request
 * @returns Formatted history array for Langchain
 */
function formatChatHistory(history: any[] = []) {
  return history.map((msg) => {
    // Support both 'user'/'assistant' and 'human'/'ai' role formats
    if (msg.role === 'user' || msg.role === 'human') {
      return new HumanMessage(msg.content);
    } else {
      return new AIMessage(msg.content);
    }
  });
}

/**
 * POST handler for the Brain API
 */
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const { bitId, message, history, context } = await req.json();

    if (!bitId || !message) {
      return NextResponse.json(
        {
          error: 'Missing required parameters: bitId and message are required',
        },
        { status: 400 },
      );
    }

    console.log(`[Brain API] Processing request for bitId: ${bitId}`);

    // Initialize LLM
    const llm = initializeLLM();

    // Configure tools (currently just listDocumentsTool)
    // TODO: Replace with dynamic tool selection based on bitId
    const tools = [listDocumentsTool];

    // Get system prompt for the requested Bit
    const systemPrompt = getSystemPromptFor(bitId);

    // Create prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    // Create agent and executor
    const agent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt,
    });

    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: process.env.NODE_ENV === 'development',
    });

    // Format chat history
    const chat_history = formatChatHistory(history);

    // Execute agent
    console.log(`[Brain API] Invoking agent with message: ${message}`);
    const result = await agentExecutor.invoke({
      input: message,
      chat_history,
      bitId, // Pass bitId in case prompt template uses it
    });

    console.log(`[Brain API] Agent execution complete`);

    // TODO: Add logic to persist the message and response to history

    // Return the result
    return NextResponse.json({ output: result.output });
  } catch (error: any) {
    console.error('[Brain API Error]', error);

    return NextResponse.json(
      { error: `An internal error occurred: ${error.message}` },
      { status: 500 },
    );
  }
}

/**
 * This /api/brain route is designed to eventually supersede existing chat routes
 * like /app/api/chat/route.ts. No deletion of old routes is needed in this phase.
 * We will fully test and migrate functionality before removing older routes.
 */
