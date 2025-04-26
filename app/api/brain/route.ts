/**
 * Brain API Route
 *
 * Central orchestration endpoint for AI interactions using Langchain.
 * This route handles all AI requests, dynamically selecting tools based on the Bit context.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';

// Import tools and utilities
import {
  listDocumentsTool,
  getFileContentsTool,
  searchInternalKnowledgeBase,
  createDocumentTool,
  requestSuggestionsTool,
  updateDocumentTool,
  googleCalendarTool,
  tavilySearchTool,
} from '@/lib/ai/tools';
import { tavilyExtractTool } from '@/lib/ai/tools/tavilyExtractTool';
import { getSystemPromptFor } from '@/lib/ai/prompts';
import { modelMapping } from '@/lib/ai/models';

// Temporary flag to bypass authentication for testing
const BYPASS_AUTH_FOR_TESTING = true;

/**
 * Initialize LLM based on configuration/environment
 *
 * @param bitId - The ID of the Bit requesting LLM services
 * @returns Configured LLM instance
 */
function initializeLLM(bitId?: string) {
  // Use the model mapping to determine the correct model based on bitId
  // Fall back to environment variable or default model
  let selectedModel: string;

  if (bitId && modelMapping[bitId]) {
    selectedModel = modelMapping[bitId];
  } else {
    selectedModel = process.env.DEFAULT_MODEL_NAME || modelMapping.default;
  }

  // Check for required environment variables
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }

  console.log(
    `[Brain API] Initializing LLM with model: ${selectedModel} for bitId: ${bitId || 'unknown'}`,
  );

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

// Explicitly disable authentication middleware for testing
export const config = {
  runtime: 'edge',
  unstable_allowDynamic: ['**/node_modules/**'],
};

/**
 * POST handler for the Brain API
 */
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const { messages, id, selectedChatModel } = await req.json();

    // Extract the bitId from selectedChatModel or use a default
    const bitId = selectedChatModel || 'knowledge-base';

    // Extract the last message from the messages array
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        {
          error: 'Missing required parameters: messages array is required',
        },
        { status: 400 },
      );
    }

    const lastMessage = messages[messages.length - 1];
    const message = lastMessage.content;

    // Use all previous messages as history
    const history = messages.slice(0, -1);

    if (!message) {
      return NextResponse.json(
        {
          error: 'Missing required parameters: last message must have content',
        },
        { status: 400 },
      );
    }

    console.log(`[Brain API] Processing request for bitId: ${bitId}`);
    console.log(`[Brain API] Message: ${message}`);

    // Initialize LLM with the appropriate model for this bitId
    const llm = initializeLLM(bitId);

    // Configure tools with Supabase knowledge tools and Tavily tools
    const tools = [
      listDocumentsTool,
      getFileContentsTool,
      searchInternalKnowledgeBase,
      tavilySearchTool,
      tavilyExtractTool,
      createDocumentTool,
      requestSuggestionsTool,
      updateDocumentTool,
      googleCalendarTool,
    ];

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
    console.log('[Brain API] Agent Result Output:', result.output);

    if (typeof result.output !== 'string') {
      console.error('[Brain API] Agent output is not a string:', result.output);
      return new Response(
        JSON.stringify({ error: 'Agent response was not valid text.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Extract tool calls from the execution (if available)
    const toolCalls =
      result.intermediateSteps?.map(
        (step: {
          action: {
            tool: string;
            toolInput: any;
          };
          observation: any;
        }) => ({
          tool: step.action.tool,
          input: step.action.toolInput,
          output: step.observation,
        }),
      ) || [];

    console.log(
      '[Brain API] Tool calls:',
      toolCalls.length ? 'Found' : 'None',
      toolCalls.length ? `(${toolCalls.length} calls)` : '',
    );

    // Create a ReadableStream that yields the final output string
    // Format: '0:"text"\n' is the protocol format expected by the AI SDK
    const textEncoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        try {
          // First, output the tool calls as a separate message part with "data:" prefix
          if (toolCalls.length > 0) {
            // We'll send tool calls in a separate format that the front-end can process
            const debugData = {
              type: 'debug',
              toolCalls,
            };
            controller.enqueue(
              textEncoder.encode(`data: ${JSON.stringify(debugData)}\n\n`),
            );
          }

          // Then, output the actual text response in the expected AI SDK format
          const chunk = `0:${JSON.stringify(result.output)}\n`;
          controller.enqueue(textEncoder.encode(chunk));
          controller.close();
        } catch (error) {
          console.error('[Brain API] Stream Error:', error);
          controller.error(error);
        }
      },
    });

    // Return a simple text/plain response with the properly formatted data
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
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
