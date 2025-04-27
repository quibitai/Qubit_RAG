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
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { createDataStream, type DataStreamWriter } from 'ai';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';
import { generateUUID } from '@/lib/utils';
import type { ArtifactKind } from '@/components/artifact';
// import { auth } from '@/app/(auth)/auth'; // Keep commented out for now

// Import tools and utilities
import {
  listDocumentsTool,
  getFileContentsTool,
  searchInternalKnowledgeBase,
  createDocumentTool,
  requestSuggestionsTool,
  getWeatherTool,
} from '@/lib/ai/tools';
import { tavilyExtractTool } from '@/lib/ai/tools/tavilyExtractTool';
import { getSystemPromptFor } from '@/lib/ai/prompts';
import { modelMapping } from '@/lib/ai/models';

// Create Tavily search tool directly
const tavilySearch = new TavilySearchResults({
  maxResults: 7,
});

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
 * Safely stringify content of any type
 *
 * @param content - Content to stringify (could be object, string, etc.)
 * @returns String representation of content
 */
function stringifyContent(content: any): string {
  if (content === null || content === undefined) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  // Handle objects by converting to JSON string
  if (typeof content === 'object') {
    try {
      return JSON.stringify(content);
    } catch (e) {
      console.error('[Brain API] Error stringifying object content:', e);
      return '[Object content could not be stringified]';
    }
  }

  // Handle other types
  return String(content);
}

/**
 * Convert a serialized LangChain message or raw message object to proper LangChain message instances
 *
 * @param msg - Message to convert (could be serialized LangChain message or raw object)
 * @returns Proper LangChain message instance
 */
function convertToLangChainMessage(msg: any): HumanMessage | AIMessage | null {
  try {
    // Case 1: It's already a proper LangChain message instance
    if (
      msg instanceof HumanMessage ||
      msg instanceof AIMessage ||
      msg instanceof ToolMessage
    ) {
      // For ToolMessage, always convert to AIMessage with stringified content
      if (msg instanceof ToolMessage) {
        return new AIMessage(`Tool Response: ${stringifyContent(msg.content)}`);
      }

      // For other message types with object content, stringify the content
      if (typeof msg.content === 'object') {
        if (msg instanceof HumanMessage) {
          return new HumanMessage(stringifyContent(msg.content));
        } else {
          return new AIMessage(stringifyContent(msg.content));
        }
      }

      // If it's already a proper message with string content, return it directly
      return msg;
    }

    // Case 2: It's a serialized LangChain message (has lc_namespace and lc_serializable)
    if (
      msg?.lc_namespace &&
      Array.isArray(msg.lc_namespace) &&
      msg.lc_namespace.includes('langchain_core') &&
      msg.lc_namespace.includes('messages')
    ) {
      // Check what type of message it is based on class name in namespace
      const content =
        typeof msg.content === 'object'
          ? stringifyContent(msg.content)
          : msg.content;

      if (msg.lc_kwargs?.content || msg.content) {
        if (
          msg.lc_kwargs?.name === 'human' ||
          (msg.lc_namespace.length > 2 &&
            msg.lc_namespace[2] === 'HumanMessage')
        ) {
          return new HumanMessage(content);
        } else {
          // For all other types (AI, Tool, System), convert to AIMessage for safety
          return new AIMessage(content);
        }
      }

      // If we can't determine the message type, default to AIMessage
      console.warn(
        '[Brain API] Unknown serialized LangChain message type, defaulting to AIMessage',
      );
      return new AIMessage(
        stringifyContent(msg.content || '') || 'Unknown message',
      );
    }

    // Case 3: It's a raw message object (has role and content)
    if (msg?.role && msg?.content !== undefined) {
      if (msg.role === 'user' || msg.role === 'human') {
        return new HumanMessage(stringifyContent(msg.content));
      } else if (msg.role === 'assistant' || msg.role === 'ai') {
        return new AIMessage(stringifyContent(msg.content));
      } else if (msg.role === 'tool') {
        return new AIMessage(`Tool Response: ${stringifyContent(msg.content)}`);
      } else if (msg.role === 'system') {
        // Convert system messages to AI messages with prefix
        return new AIMessage(`System: ${stringifyContent(msg.content)}`);
      } else {
        console.warn(
          `[Brain API] Unknown message role: ${msg.role}, treating as AIMessage`,
        );
        return new AIMessage(stringifyContent(msg.content));
      }
    }

    // Case 4: It's an unknown format but has some content we can extract
    if (msg?.content !== undefined) {
      console.warn(
        '[Brain API] Unknown message format with content, defaulting to AIMessage',
      );
      return new AIMessage(stringifyContent(msg.content));
    }

    // If we got here, we don't know how to handle this message
    console.error(
      '[Brain API] Cannot convert to LangChain message:',
      JSON.stringify(msg),
    );
    return null;
  } catch (err) {
    console.error(
      '[Brain API] Error converting message:',
      err,
      'Message was:',
      JSON.stringify(msg),
    );
    return null;
  }
}

/**
 * Format chat history for Langchain
 *
 * @param history - Chat history from the request
 * @returns Formatted history array for Langchain
 */
function formatChatHistory(history: any[] = []) {
  if (!history || !Array.isArray(history)) {
    console.warn(
      '[Brain API] Chat history is not an array, returning empty array',
    );
    return [];
  }

  // Log the entire history for debugging
  console.log('[Brain API] Processing history with length:', history.length);

  // Map history items to proper LangChain messages
  const convertedMessages = history
    .filter(Boolean)
    .map((msg, index) => {
      try {
        // Log each message type to identify potential issues
        console.log(
          `[Brain API] Processing message ${index} type:`,
          typeof msg,
          msg?.role || 'unknown role',
        );

        // Convert using our robust conversion function
        return convertToLangChainMessage(msg);
      } catch (err) {
        console.error('[Brain API] Error in formatChatHistory:', err);
        return null;
      }
    })
    .filter(Boolean); // Remove any null messages

  console.log(
    `[Brain API] Successfully converted ${convertedMessages.length} of ${history.length} messages`,
  );
  return convertedMessages;
}

/**
 * Sanitize messages before passing to LangChain
 * Ensures all message content is string-based to avoid content.map errors
 *
 * @param messages - Array of messages to sanitize
 * @returns Sanitized messages
 */
function sanitizeMessages(messages: any[]) {
  if (!messages || !Array.isArray(messages)) {
    console.warn(
      '[Brain API] Messages to sanitize is not an array, returning empty array',
    );
    return [];
  }

  // For serialized LangChain messages (with lc_namespace), we need special handling
  // We'll create fresh LangChain message instances
  const hasSerializedMessages = messages.some(
    (msg) => msg?.lc_namespace || msg?.lc_serializable,
  );

  if (hasSerializedMessages) {
    console.log(
      '[Brain API] Detected serialized LangChain messages, converting to proper instances',
    );
    // Create fresh message instances for each message
    return messages
      .map((msg, index) => {
        try {
          return convertToLangChainMessage(msg);
        } catch (e) {
          console.error(`[Brain API] Error converting message ${index}:`, e);
          return null;
        }
      })
      .filter(Boolean); // Remove any null messages
  }

  // For regular messages, we'll just ensure content is string-based
  return messages
    .map((msg) => {
      // Skip null/undefined messages
      if (!msg) return null;

      try {
        // Clone the message to avoid modifying the original
        const newMsg = { ...msg };

        // If the message has a content property and it's an object, stringify it
        if (newMsg.content && typeof newMsg.content === 'object') {
          console.log('[Brain API] Sanitizing object content in message');
          newMsg.content = stringifyContent(newMsg.content);
        }

        // Handle tool calls separately if they exist
        if (newMsg.additional_kwargs?.tool_calls) {
          console.log(
            '[Brain API] Message has tool_calls, ensuring they are properly formatted',
          );
          try {
            // Ensure tool_calls is serializable
            const toolCallsJson = JSON.stringify(
              newMsg.additional_kwargs.tool_calls,
            );
            newMsg.additional_kwargs.tool_calls = JSON.parse(toolCallsJson);
          } catch (e) {
            console.error('[Brain API] Error sanitizing tool_calls:', e);
            // Create a new additional_kwargs object without tool_calls instead of using delete
            newMsg.additional_kwargs = {
              ...newMsg.additional_kwargs,
              tool_calls: undefined, // This will be ignored in serialization
            };
          }
        }

        return newMsg;
      } catch (e) {
        console.error('[Brain API] Error sanitizing message:', e);
        return null;
      }
    })
    .filter(Boolean); // Remove any null messages
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

    // In a real implementation, you would get session using auth
    // For now, use a mock session for development purposes
    const session = {
      user: {
        id: 'test-user-id',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Expires in 24 hours
    } as const;

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
      tavilySearch,
      tavilyExtractTool,
      createDocumentTool,
      requestSuggestionsTool,
      getWeatherTool,
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

    // Log the formatted history for debugging
    console.log(
      '[Brain API] Formatted chat history length:',
      chat_history.length,
    );

    let result: any;

    // Execute agent
    try {
      console.log(`[Brain API] Invoking agent with message: ${message}`);

      // If chat history is empty or has errors, use a new empty array to prevent issues
      const safeHistory = chat_history.length > 0 ? chat_history : [];

      // Log the history message types for debugging
      if (safeHistory.length > 0) {
        console.log('[Brain API] History message types:');
        safeHistory.forEach((msg, idx) => {
          if (msg) {
            console.log(`  [${idx}] ${msg.constructor.name}`);
          } else {
            console.log(`  [${idx}] null message`);
          }
        });
      }

      // Execute the agent with sanitized inputs
      result = await agentExecutor.invoke({
        input: message,
        chat_history: safeHistory,
        bitId, // Pass bitId in case prompt template uses it
      });

      console.log(`[Brain API] Agent execution complete`);
      console.log('[Brain API] Agent Result Output:', result.output);
    } catch (err) {
      console.error('[Brain API] Agent execution error:', err);

      // Handle specific error types
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Unknown error during agent execution';

      // Detailed logging for debugging message-related issues
      if (errorMessage.includes('message.content.map is not a function')) {
        console.error(
          '[Brain API] Content map error detected - likely object content in message',
        );
      } else if (errorMessage.includes('Unable to coerce message from array')) {
        console.error(
          '[Brain API] Message coercion error - incompatible message format in history',
        );
        // Log the history for debugging
        console.error(
          '[Brain API] History causing coercion errors:',
          JSON.stringify(
            chat_history
              .filter(Boolean)
              .map((m) => ({ type: m ? m.constructor.name : 'null' })),
          ),
        );
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          suggestion:
            'Try clearing your chat history and starting a new conversation.',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

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

    // Log specific tool types found for diagnostic purposes
    if (toolCalls.length > 0) {
      const toolTypes = toolCalls.map((call: { tool: string }) => call.tool);
      console.log('[Brain API] Tool types found:', toolTypes);

      // Check specifically for createDocument
      const createDocumentCalls = toolCalls.filter(
        (call: { tool: string }) => call.tool === 'createDocument',
      );
      if (createDocumentCalls.length > 0) {
        console.log(
          '[Brain API] Found createDocument calls:',
          JSON.stringify(createDocumentCalls, null, 2),
        );
      }
    }

    // --- Start: Artifact Handling Logic ---

    let artifactStreamResponse: Response | null = null;

    // Use toolCalls extracted above to find createDocument calls directly
    const createDocumentCall = toolCalls.find(
      (call: { tool: string }) => call.tool === 'createDocument',
    );

    if (createDocumentCall) {
      console.log(
        '[Brain API] Processing createDocument call from toolCalls:',
        JSON.stringify(createDocumentCall, null, 2),
      );
      const input = createDocumentCall.input;

      if (input && typeof input === 'object' && input.title && input.kind) {
        const { title, kind } = input as { title: string; kind: ArtifactKind };
        console.log(
          `[Brain API] SUCCESS: Processing createDocument call for: ${title} (Kind: ${kind}).`,
        );

        const id = generateUUID();
        const handler = documentHandlersByArtifactKind.find(
          (h) => h.kind === kind,
        );

        if (handler) {
          try {
            // Create data stream for the artifact generation
            const stream = createDataStream({
              execute: async (dataStream: DataStreamWriter) => {
                try {
                  console.log(
                    `[Brain API] Starting artifact generation for ${id} (${kind})`,
                  );

                  // Execute the document creation with the handler
                  await handler.onCreateDocument({
                    id,
                    title,
                    dataStream,
                    session,
                  });

                  console.log(
                    `[Brain API] Artifact generation for ${id} completed successfully`,
                  );
                } catch (streamError) {
                  console.error(
                    `[Brain API] Error during artifact generation for ${id}:`,
                    streamError,
                  );
                  throw streamError;
                }
              },
              onError: (error) => {
                console.error(`[Brain API] Artifact generation error:`, error);
                return `Error generating artifact: ${error instanceof Error ? error.message : String(error)}`;
              },
            });

            // Return the stream response immediately
            artifactStreamResponse = new Response(stream, {
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
            console.log(
              `[Brain API] Created Response with artifact stream for ${id}`,
            );
          } catch (setupError) {
            console.error(
              '[Brain API] Error setting up artifact stream:',
              setupError,
            );
            artifactStreamResponse = NextResponse.json(
              {
                error: `Error setting up artifact stream: ${setupError instanceof Error ? setupError.message : String(setupError)}`,
              },
              { status: 500 },
            );
          }
        } else {
          console.warn(
            `[Brain API] No artifact handler found for kind: ${kind}`,
          );
          artifactStreamResponse = NextResponse.json(
            {
              error: `Unsupported artifact kind: ${kind}`,
            },
            { status: 400 },
          );
        }
      } else {
        console.warn(
          '[Brain API] Invalid input for createDocument call:',
          JSON.stringify(input),
        );
        artifactStreamResponse = NextResponse.json(
          {
            error: 'Invalid input for createDocument: missing title or kind',
          },
          { status: 400 },
        );
      }
    } else if (
      Array.isArray(result.intermediateSteps) &&
      result.intermediateSteps.length > 0
    ) {
      // Fallback to checking intermediate steps directly if needed
      console.log(
        '[Brain API] No createDocument call found in toolCalls. Checking intermediate steps directly.',
      );
      console.log(
        '[Brain API Debug] Raw Intermediate Steps:',
        JSON.stringify(result.intermediateSteps, null, 2),
      );
    }

    // --- Return Final Response ---
    if (artifactStreamResponse) {
      // Return the artifact stream (or error response from setup)
      console.log('[Brain API] Returning artifact-specific response.');
      return artifactStreamResponse;
    } else if (typeof result.output === 'string') {
      // Fallback: No artifact handled, stream the agent's text output
      console.log(
        "[Brain API] No artifact stream generated, returning agent's final text output via ReadableStream.",
      );

      const textEncoder = new TextEncoder();
      const readableStream = new ReadableStream({
        start(controller) {
          try {
            // Include debug data if needed
            if (toolCalls.length > 0) {
              const debugData = { type: 'debug', toolCalls };
              controller.enqueue(
                textEncoder.encode(`data: ${JSON.stringify(debugData)}\n\n`),
              );
            }
            // Send the text using Vercel AI SDK format '0:"..."'
            const chunk = `0:${JSON.stringify(result.output)}\n`;
            controller.enqueue(textEncoder.encode(chunk));
            controller.close();
          } catch (error) {
            console.error('[Brain API] Fallback Text Stream Error:', error);
            controller.error(error);
          }
        },
      });
      return new Response(readableStream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    } else {
      // Final fallback if output isn't a string
      console.error(
        '[Brain API] Agent output unusable and no artifact stream:',
        result.output ? typeof result.output : 'undefined',
      );
      return NextResponse.json(
        { error: 'Agent returned invalid output.' },
        { status: 500 },
      );
    }

    // --- End: Artifact Handling Logic ---
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
