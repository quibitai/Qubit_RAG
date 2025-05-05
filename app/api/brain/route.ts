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
import type { Message as UIMessage } from 'ai';
import { auth } from '@/app/(auth)/auth';

// Import tools and utilities
import { orchestratorSystemPrompt } from '@/lib/ai/prompts';
import { modelMapping } from '@/lib/ai/models';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import { rawToMessage, type RawMessage } from '@/lib/langchainHelpers';
import { availableTools } from '@/lib/ai/tools/index';

// Import database functions and types
import { db } from '@/lib/db';
import { sql } from '@/lib/db/client';
import { chat, message } from '@/lib/db/schema';
import { saveMessages } from '@/lib/db/queries';
import type { DBMessage } from '@/lib/db/schema';
import { randomUUID } from 'node:crypto';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { ChatRepository } from '@/lib/db/repositories/chatRepository';

// Helper function to create a custom LangChain streaming handler
function createLangChainStreamHandler({
  onCompletion,
}: { onCompletion?: (response: string) => Promise<void> } = {}) {
  // Track the complete response for onCompletion callback
  let completeResponse = '';

  // Create a custom handler that extends BaseCallbackHandler
  class CompletionCallbackHandler extends BaseCallbackHandler {
    name = 'CompletionCallbackHandler';

    handleLLMNewToken(token: string) {
      completeResponse += token;
    }

    handleLLMEnd() {
      if (onCompletion) {
        onCompletion(completeResponse).catch((err) => {
          console.error(
            '[LangChainStream] Error in onCompletion callback:',
            err,
          );
        });
      }
    }
  }

  return { handlers: [new CompletionCallbackHandler()] };
}

// Create Tavily search tool directly
const tavilySearch = new TavilySearchResults({
  maxResults: 7,
});

// Temporary flag to bypass authentication for testing
const BYPASS_AUTH_FOR_TESTING = true;

// Define types for handler methods to match BaseCallbackHandler
interface AgentAction {
  tool: string;
  toolInput: string | object;
  log: string;
}

interface AgentFinish {
  returnValues: {
    output: string;
  };
  log: string;
}

interface ChainValues {
  [key: string]: any;
}

// Debug callback handler for tracing the message flow
class DebugCallbackHandler extends BaseCallbackHandler {
  name = 'DebugCallbackHandler';

  handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ): void | Promise<void> {
    console.log(`[Callback] handleLLMStart: ${runId}`, {
      llm: llm.id || llm.name || 'unknown',
      prompts,
    });
  }

  handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ): void | Promise<void> {
    console.log(`[Callback] handleChatModelStart: ${runId}`, {
      llm: llm.id || llm.name || 'unknown',
    });
    console.log(
      '[Callback] Messages sent to LLM:',
      JSON.stringify(messages, null, 2),
    );

    // Specifically check for message content that might cause errors
    try {
      for (const msgGroup of messages) {
        for (const msg of msgGroup) {
          const contentType = typeof msg.content;
          if (contentType === 'object') {
            console.log(
              '[Callback ALERT] Found message with object content:',
              msg,
            );
          }

          // Deep check for tool messages with non-string content
          if (
            msg.additional_kwargs?.tool_call_id ||
            msg.name ||
            (msg as any).type === 'tool'
          ) {
            console.log('[Callback ALERT] Found tool message:', {
              contentType,
              name: msg.name,
              toolCallId: msg.additional_kwargs?.tool_call_id,
              content: msg.content,
            });
          }
        }
      }
    } catch (e) {
      console.error('[Callback] Error checking messages:', e);
    }
  }

  handleLLMEnd(output: LLMResult, runId: string): void | Promise<void> {
    console.log(`[Callback] handleLLMEnd: ${runId}`, { output });

    // Check if output contains tool calls
    try {
      const generations = output.generations;
      generations.forEach((genList, i) => {
        genList.forEach((gen, j) => {
          const genMessage = gen as any;
          if (genMessage.message?.additional_kwargs?.tool_calls) {
            console.log(
              `[Callback] Tool calls found in generation [${i}][${j}]:`,
              genMessage.message.additional_kwargs.tool_calls,
            );
          }

          // Log generation completion reason
          if (genMessage.message?.additional_kwargs?.finish_reason) {
            console.log(
              `[Callback] Generation [${i}][${j}] finish_reason:`,
              genMessage.message.additional_kwargs.finish_reason,
            );
          }
        });
      });
    } catch (e) {
      console.error('[Callback] Error checking LLM output for tool calls:', e);
    }
  }

  handleLLMError(err: Error, runId: string): void | Promise<void> {
    console.error(`[Callback] handleLLMError: ${runId}`, { err });
    console.error(`[Callback] LLM Error Message: ${err.message}`);
    console.error(`[Callback] LLM Error Name: ${err.name}`);
    console.error(`[Callback] LLM Error Stack: ${err.stack}`);

    // Enhanced error classification
    const errorMap = {
      rateLimit: ['rate', 'limit', 'too many', '429', 'requests per min'],
      tokenLimit: ['token', 'context', 'length', 'too long', 'maximum'],
      formatError: [
        'format',
        'invalid',
        'json',
        'parse',
        'schema',
        'malformed',
      ],
      toolError: [
        'tool',
        'function',
        'not found',
        'argument',
        'parameter',
        'schema',
      ],
      authError: ['auth', 'key', 'credential', '401', 'permission'],
    };

    const errorType = Object.entries(errorMap).find(([_, patterns]) =>
      patterns.some((pattern) =>
        err.message.toLowerCase().includes(pattern.toLowerCase()),
      ),
    );

    if (errorType) {
      console.error(`[Callback] DETECTED ERROR CATEGORY: ${errorType[0]}`);
    }

    // Special handling for tool-related errors
    if (err.message.includes('tool') || err.message.includes('function')) {
      console.error(
        `[Callback] PROBABLE TOOL ERROR - Check tool definitions and usage`,
      );
    }
  }

  handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runType?: string,
    runName?: string,
  ): void | Promise<void> {
    console.log(
      `[Callback] handleChainStart: ${chain.id || chain.name || 'unknown'} (${runId})`,
      {
        inputs,
      },
    );
  }

  handleChainEnd(outputs: ChainValues, runId: string): void | Promise<void> {
    console.log(`[Callback] handleChainEnd: ${runId}`, { outputs });
  }

  handleChainError(err: Error, runId: string): void | Promise<void> {
    console.error(`[Callback] handleChainError: ${runId}`, { err });
    console.error(`[Callback] Chain Error Message: ${err.message}`);
    console.error(`[Callback] Chain Error Name: ${err.name}`);
    console.error(`[Callback] Chain Error Stack: ${err.stack}`);

    // More specific error pattern detection for chains
    const chainErrorPatterns = {
      iterationError: ['map', 'iterate', 'array', 'foreach', 'for each'],
      messageFormatError: [
        'message',
        'content',
        'field',
        'expected string',
        'not a string',
      ],
      parsingError: ['parse', 'json', 'stringify', 'deserialize'],
      toolCallError: ['tool', 'function', 'call', 'args', 'arguments'],
      agentError: ['agent', 'executor', 'execution', 'thought', 'action'],
    };

    // Check for specific error patterns
    Object.entries(chainErrorPatterns).forEach(([errorType, patterns]) => {
      if (
        patterns.some(
          (pattern) =>
            err.message.toLowerCase().includes(pattern.toLowerCase()) ||
            err.stack?.toLowerCase().includes(pattern.toLowerCase()),
        )
      ) {
        console.error(`[Callback] DETECTED CHAIN ERROR TYPE: ${errorType}`);
      }
    });

    // Additional context for message format errors
    if (
      err.message.toLowerCase().includes('message') ||
      err.message.toLowerCase().includes('content')
    ) {
      console.error(`[Callback] POSSIBLE MESSAGE FORMAT ERROR IN CHAIN`);

      // Extract specific function names from stack trace for more context
      if (err.stack) {
        const relevantFrames = [
          'formatChatHistory',
          'convertToLangChainMessage',
          'toRawMessage',
          'sanitizeMessages',
          'ensureToolMessageContentIsString',
        ];

        relevantFrames.forEach((frame) => {
          if (err.stack?.includes(frame)) {
            console.error(`[Callback] Error appears in function: ${frame}`);
          }
        });
      }
    }
  }

  handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ): void | Promise<void> {
    console.log(
      `[Callback] handleToolStart: ${tool.id || tool.name || 'unknown'} (${runId})`,
      {
        input,
      },
    );

    // Add detailed logging of tool input
    console.log(`[Tool:${tool.id || tool.name}] Input type: ${typeof input}`);
    try {
      console.log(
        `[Tool:${tool.id || tool.name}] Detailed input:`,
        JSON.stringify(input, null, 2),
      );

      // Log tool input parameters more explicitly
      if (typeof input === 'object' && input !== null) {
        console.log(
          `[Tool:${tool.id || tool.name}] Input keys:`,
          Object.keys(input),
        );

        // Validate required tool parameters
        const toolId = tool.id || tool.name;
        if (toolId && typeof toolId === 'string') {
          // This could be expanded to check for required parameters based on tool type
          console.log(`[Tool:${toolId}] Validating input parameters...`);
        }
      }
    } catch (e) {
      console.error(
        `[Tool:${tool.id || tool.name}] Error stringifying input:`,
        e,
      );
      console.log(`[Tool:${tool.id || tool.name}] Raw input:`, input);
    }
  }

  handleToolEnd(output: string, runId: string): void | Promise<void> {
    console.log(`[Callback] handleToolEnd: ${runId}`, { output });

    // Check if tool output might be an object that needs stringification
    if (typeof output === 'object') {
      console.log(
        '[Callback ALERT] Tool returned object output instead of string:',
        output,
      );

      // Additional diagnostic info for object outputs
      console.log('[Callback] Tool output keys:', Object.keys(output));

      // Fix the constructor access to avoid type errors
      if (output && typeof output === 'object') {
        console.log(
          '[Callback] Tool output constructor:',
          (output as any).constructor?.name,
        );
      }

      try {
        console.log(
          '[Callback] Tool output stringified:',
          JSON.stringify(output, null, 2),
        );
      } catch (e) {
        console.error('[Callback] Failed to stringify tool output:', e);
      }
    }
  }

  handleToolError(err: Error, runId: string): void | Promise<void> {
    console.error(`[Callback] handleToolError: ${runId}`, { err });
    console.error(`[Callback] Tool Error Message: ${err.message}`);
    console.error(`[Callback] Tool Error Name: ${err.name}`);
    console.error(`[Callback] Tool Error Stack: ${err.stack}`);

    // Categorize specific tool error types
    const toolErrorCategories = {
      parameterError: [
        'parameter',
        'argument',
        'missing',
        'required',
        'input',
        'invalid',
      ],
      formatError: ['format', 'json', 'parse', 'stringify', 'object'],
      accessError: ['permission', 'denied', 'unauthorized', 'access', '403'],
      networkError: [
        'network',
        'timeout',
        'connection',
        'unavailable',
        'endpoint',
        'fetch',
      ],
    };

    Object.entries(toolErrorCategories).forEach(([category, patterns]) => {
      if (
        patterns.some((pattern) =>
          err.message.toLowerCase().includes(pattern.toLowerCase()),
        )
      ) {
        console.error(`[Callback] IDENTIFIED TOOL ERROR CATEGORY: ${category}`);
      }
    });

    // Log error properties
    console.error(
      `[Callback] Tool Error Properties:`,
      Object.getOwnPropertyNames(err),
    );
  }

  handleAgentAction(action: AgentAction, runId: string): void | Promise<void> {
    console.log(`[Callback] handleAgentAction: ${runId}`, { action });

    // Add specific logging for agent tool selection
    console.log(`[Agent] Selected tool: ${action.tool}`);
    console.log(`[Agent] Tool input:`, action.toolInput);
  }

  handleAgentEnd(action: AgentFinish, runId: string): void | Promise<void> {
    console.log(`[Callback] handleAgentEnd: ${runId}`, { action });

    // Log agent output and reasoning
    console.log(`[Agent] Final output: ${action.returnValues.output}`);
  }
}

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

// Utility to sanitize message objects before constructing LangChain messages
function sanitizeMessageObject(obj: any) {
  return {
    content: obj.content ?? obj.lc_kwargs?.content ?? '',
    id: typeof obj.id === 'string' ? obj.id : undefined,
    name: typeof obj.name === 'string' ? obj.name : undefined,
    response_metadata:
      obj.response_metadata && typeof obj.response_metadata === 'object'
        ? obj.response_metadata
        : undefined,
    additional_kwargs:
      obj.additional_kwargs && typeof obj.additional_kwargs === 'object'
        ? obj.additional_kwargs
        : undefined,
    tool_calls: Array.isArray(obj.tool_calls) ? obj.tool_calls : undefined,
    invalid_tool_calls: Array.isArray(obj.invalid_tool_calls)
      ? obj.invalid_tool_calls
      : undefined,
    role: obj.role,
  };
}

function convertToLangChainMessage(msg: any): HumanMessage | AIMessage | null {
  try {
    const sanitized = sanitizeMessageObject(msg);
    const stringContent = stringifyContent(sanitized.content);

    if (
      msg?.lc_namespace &&
      Array.isArray(msg.lc_namespace) &&
      msg.lc_namespace.includes('HumanMessage')
    ) {
      const instance = new HumanMessage({
        content: stringContent,
        id: sanitized.id,
        name: sanitized.name,
        response_metadata: sanitized.response_metadata,
        additional_kwargs: sanitized.additional_kwargs,
      });
      console.log(
        '[DEBUG] HumanMessage prototype:',
        Object.getPrototypeOf(instance),
      );
      console.log(
        '[DEBUG] instanceof HumanMessage:',
        instance instanceof HumanMessage,
      );
      return instance;
    }
    if (
      msg?.lc_namespace &&
      Array.isArray(msg.lc_namespace) &&
      msg.lc_namespace.includes('AIMessage')
    ) {
      const instance = new AIMessage({
        content: stringContent,
        id: sanitized.id,
        name: sanitized.name,
        response_metadata: sanitized.response_metadata,
        additional_kwargs: sanitized.additional_kwargs,
        tool_calls: sanitized.tool_calls,
        invalid_tool_calls: sanitized.invalid_tool_calls,
      });
      console.log(
        '[DEBUG] AIMessage prototype:',
        Object.getPrototypeOf(instance),
      );
      console.log(
        '[DEBUG] instanceof AIMessage:',
        instance instanceof AIMessage,
      );
      return instance;
    }
    if (sanitized.role === 'user' || sanitized.role === 'human') {
      const instance = new HumanMessage({ content: stringContent });
      console.log(
        '[DEBUG] HumanMessage prototype:',
        Object.getPrototypeOf(instance),
      );
      console.log(
        '[DEBUG] instanceof HumanMessage:',
        instance instanceof HumanMessage,
      );
      return instance;
    }
    if (sanitized.role === 'assistant' || sanitized.role === 'ai') {
      const instance = new AIMessage({ content: stringContent });
      console.log(
        '[DEBUG] AIMessage prototype:',
        Object.getPrototypeOf(instance),
      );
      console.log(
        '[DEBUG] instanceof AIMessage:',
        instance instanceof AIMessage,
      );
      return instance;
    }
    return null;
  } catch (err) {
    console.error(
      '[convertToLangChainMessage] Failed to convert message:',
      msg,
      err,
    );
    return null;
  }
}

// Type guard for RawMessage
function isRawMessage(obj: any): obj is RawMessage {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.type === 'string' &&
    typeof obj.content === 'string'
  );
}

// Converts any legacy/serialized or role-based message object to minimal RawMessage shape
function toRawMessage(obj: any): RawMessage | null {
  if (!obj || typeof obj !== 'object') return null;
  if (typeof obj.type === 'string' && typeof obj.content === 'string') {
    // Already minimal shape
    return { type: obj.type, content: obj.content };
  }
  // Legacy LangChain serialized
  if (Array.isArray(obj.lc_namespace)) {
    if (obj.lc_namespace.includes('HumanMessage')) {
      return {
        type: 'human',
        content: obj.content ?? obj.lc_kwargs?.content ?? '',
      };
    }
    if (obj.lc_namespace.includes('AIMessage')) {
      return {
        type: 'ai',
        content: obj.content ?? obj.lc_kwargs?.content ?? '',
      };
    }
  }
  // Role-based fallback
  if (obj.role === 'user' || obj.role === 'human') {
    return { type: 'human', content: obj.content ?? '' };
  }
  if (obj.role === 'assistant' || obj.role === 'ai') {
    return { type: 'ai', content: obj.content ?? '' };
  }
  return null;
}

function formatChatHistory(history: any[] = []): (HumanMessage | AIMessage)[] {
  // Map all messages through toRawMessage to ensure minimal shape
  const raws: RawMessage[] = (history || [])
    .map(toRawMessage)
    .filter((msg): msg is RawMessage => !!msg);

  const converted = raws
    .map((msg) => rawToMessage(msg))
    .filter((msg): msg is HumanMessage | AIMessage => !!msg);

  // Runtime check for prototype chain
  converted.forEach((msg, i) => {
    if (!(msg instanceof HumanMessage || msg instanceof AIMessage)) {
      console.error(
        `[ERROR] Message at index ${i} is not a valid LangChain message instance`,
        msg,
      );
      throw new Error(`Invalid message instance at index ${i}`);
    }
  });
  return converted;
  // Note: Only HumanMessage and AIMessage are supported here. Extend as needed for system/tool messages.
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

/**
 * Safe stringify for tool message content
 * This prevents "message.content.map is not a function" errors
 *
 * @param message - Message to process (could be LangChain message, UIMessage, or raw object)
 * @returns Processed message with string content for tool messages
 */
function ensureToolMessageContentIsString(message: UIMessage | any): any {
  // Skip if not a message
  if (!message || typeof message !== 'object') {
    return message;
  }

  // Log input message structure for debugging
  try {
    console.log(
      '[Brain API DEBUG] ensureToolMessageContentIsString input:',
      typeof message,
      message?.role || 'no role',
      typeof message?.content === 'object'
        ? 'content is object'
        : typeof message?.content,
    );

    // Attempt to log the full structure - but handle circular references gracefully
    try {
      console.log(
        '[Brain API DEBUG] Message structure:',
        JSON.stringify(message, null, 2),
      );
    } catch (jsonError) {
      console.log(
        '[Brain API DEBUG] Cannot stringify full message (may have circular refs)',
      );
    }
  } catch (logError) {
    console.log('[Brain API DEBUG] Error logging message details:', logError);
  }

  // More thorough detection of LangChain ToolMessage instances
  const isToolMessage =
    // Check constructor name
    (message?.constructor && message.constructor.name === 'ToolMessage') ||
    // Check if it's an actual instance of imported ToolMessage
    message instanceof ToolMessage ||
    // Check LangChain serialization properties
    (message?.lc_namespace &&
      Array.isArray(message.lc_namespace) &&
      message.lc_namespace.includes('langchain_core') &&
      message.lc_namespace.includes('messages') &&
      message.lc_namespace.includes('ToolMessage')) ||
    // Check for tool_call_id which is specific to ToolMessage
    message?.tool_call_id !== undefined ||
    // Check role property
    message?.role === 'tool' ||
    // Check additional_kwargs name property - use optional chaining
    message?.additional_kwargs?.name;

  if (isToolMessage) {
    console.log(
      '[Brain API DEBUG] Detected tool message, processing content...',
    );

    try {
      // Deep clone the message to avoid modifying the original
      let newMessage: Record<string, any> = {};
      try {
        newMessage = JSON.parse(JSON.stringify(message));
      } catch (e) {
        // Fallback for circular references
        console.log('[Brain API DEBUG] Clone failed, using shallow copy');
        newMessage = { ...message };
        if (message.content) {
          newMessage.content = message.content;
        }
      }

      // Handle nested content structure (when content is an object with a content property)
      if (typeof message.content === 'object' && message.content !== null) {
        // Check for nested content structure where content itself has a content property
        if (message.content.content !== undefined) {
          console.log(
            '[Brain API DEBUG] Detected nested content structure in ToolMessage',
          );

          if (typeof message.content.content === 'string') {
            // If the nested content is already a string, use that directly
            console.log(
              '[Brain API DEBUG] Using nested string content:',
              `${message.content.content.substring(0, 50)}...`,
            );
            newMessage.content = message.content.content;
          } else if (
            typeof message.content.content === 'object' &&
            message.content.content !== null
          ) {
            // If the nested content is an object, stringify it
            console.log(
              '[Brain API DEBUG] Converting nested object content to string',
            );
            newMessage.content = JSON.stringify(message.content.content);
          } else {
            // Otherwise stringify the entire content object
            console.log('[Brain API DEBUG] Stringifying entire content object');
            newMessage.content = JSON.stringify(message.content);
          }
        } else {
          // Regular object content
          console.log('[Brain API DEBUG] Stringifying regular object content');
          newMessage.content = JSON.stringify(message.content);
        }
      } else if (typeof message.content !== 'string') {
        // Convert other non-string content to string
        console.log(
          '[Brain API DEBUG] Converting non-string content to string',
        );
        newMessage.content = String(message.content || '');
      }

      console.log(
        '[Brain API DEBUG] Final tool message content type:',
        typeof newMessage.content,
      );
      console.log(
        '[Brain API DEBUG] Final content preview:',
        typeof newMessage.content === 'string'
          ? `${newMessage.content.substring(0, 50)}...`
          : `NON-STRING: ${typeof newMessage.content}`,
      );

      return newMessage;
    } catch (error) {
      console.error('[Brain API DEBUG] Error processing ToolMessage:', error);
      // Emergency fallback - return a cleaned object with string content
      const fallbackMessage = {
        ...message,
        content:
          typeof message.content === 'string'
            ? message.content
            : 'Error processing tool message content',
      };
      console.log(
        '[Brain API DEBUG] Using emergency fallback with content type:',
        typeof fallbackMessage.content,
      );
      return fallbackMessage;
    }
  }

  return message;
}

// Add this function before executing the agent
function ensureStringContent(msg: any): any {
  if (!msg) return msg;

  try {
    // Create a safe clone to avoid modifying the original
    const newMsg = structuredClone(msg);

    // Ensure content is a string
    if (newMsg.content !== undefined) {
      if (typeof newMsg.content === 'object' && newMsg.content !== null) {
        // For objects, stringify them
        newMsg.content = JSON.stringify(newMsg.content);
      } else if (typeof newMsg.content !== 'string') {
        // For other non-string types, convert to string
        newMsg.content = String(newMsg.content || '');
      }
    }

    return newMsg;
  } catch (e) {
    // If structuredClone fails (e.g., with circular references), use a simpler approach
    if (msg.content !== undefined) {
      if (typeof msg.content === 'object' && msg.content !== null) {
        return {
          ...msg,
          content: JSON.stringify(msg.content),
        };
      } else if (typeof msg.content !== 'string') {
        return {
          ...msg,
          content: String(msg.content || ''),
        };
      }
    }
    return msg;
  }
}

/**
 * Extracts and processes file attachments from messages
 * Ensures extracted content from files is properly integrated into the context
 */
function processAttachments(message: any): string {
  if (
    !message ||
    !message.attachments ||
    !Array.isArray(message.attachments) ||
    message.attachments.length === 0
  ) {
    return '';
  }

  console.log(
    `[Brain API] Processing ${message.attachments.length} attachments`,
  );

  let attachmentContext = '';

  message.attachments.forEach((attachment: any, index: number) => {
    console.log(
      `[Brain API] Processing attachment ${index + 1}: ${attachment.name}`,
    );

    // Extract file information
    const fileName = attachment.name || 'unknown file';
    const fileUrl = attachment.url || '';
    const fileType = attachment.contentType || 'unknown type';

    // Check if we have extracted content as metadata
    if (attachment.metadata?.extractedContent) {
      console.log(`[Brain API] Found extracted content for ${fileName}`);

      let extractedContent = attachment.metadata.extractedContent;

      // Ensure the extracted content is a string
      if (typeof extractedContent !== 'string') {
        try {
          extractedContent = JSON.stringify(extractedContent);
        } catch (e) {
          console.error(
            `[Brain API] Error stringifying extracted content: ${e}`,
          );
          extractedContent = 'Error processing file content';
        }
      }

      // Limit content length if needed to avoid context length issues
      if (extractedContent.length > 10000) {
        console.log(
          `[Brain API] Truncating long extracted content (${extractedContent.length} chars)`,
        );
        extractedContent = `${extractedContent.substring(0, 10000)}... [content truncated due to length]`;
      }

      // Add to context
      attachmentContext += `\n\nFile attachment ${index + 1}: ${fileName} (${fileType})\nContent: ${extractedContent}\n`;
    } else {
      // Just add reference without content
      attachmentContext += `\n\nFile attachment ${index + 1}: ${fileName} (${fileType})\nNo extracted content available. Reference URL: ${fileUrl}\n`;
    }
  });

  return attachmentContext;
}

// Explicitly disable authentication middleware for testing
export const config = {
  runtime: 'edge',
  unstable_allowDynamic: ['**/node_modules/**'],
};

// Helper function to get available tools
async function getAvailableTools() {
  try {
    // availableTools is an array in this codebase, not a function
    if (Array.isArray(availableTools)) {
      return availableTools;
    }
    // Fallback to empty array for safety
    console.error('[Brain API] availableTools is not an array');
    return [];
  } catch (error) {
    console.error('[Brain API] Error getting available tools:', error);
    return [];
  }
}

/**
 * POST handler for the Brain API
 */
export async function POST(req: NextRequest) {
  // Add flag to track assistant message saving status
  let assistantMessageSaved = false;

  try {
    // Parse request body - using let to allow reassignment
    let reqBody: {
      messages?: any[];
      id?: string;
      selectedChatModel?: string;
      fileContext?: {
        filename: string;
        contentType: string;
        url: string;
        extractedText: string;
      };
      // Add the new context variables from Task 0.3
      activeBitContextId?: string | null;
      activeDocId?: string | null;
      [key: string]: any;
    };

    try {
      reqBody = await req.json();
    } catch (parseError) {
      console.error('[Brain API] Error parsing request body:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse request body' },
        { status: 400 },
      );
    }

    // Extract data once we have the parsed body
    const {
      messages,
      id: chatId,
      selectedChatModel,
      fileContext,
      // Extract the context variables from request (Task 0.4)
      activeBitContextId = null,
      activeDocId = null,
    } = reqBody;

    // Validate chatId
    if (!chatId) {
      console.error('[Brain API] Chat ID is missing!');
      return NextResponse.json(
        { error: 'Missing required parameter: chatId' },
        { status: 400 },
      );
    }

    // Add detailed logging of request body
    console.log(
      '[Brain API] Received request. Body keys:',
      Object.keys(reqBody),
    );
    console.log(
      `[Brain API] Raw messages received (count: ${messages?.length || 0}):`,
      JSON.stringify(messages, null, 2),
    );
    console.log(
      `[Brain API] Chat ID: ${chatId}, Selected Model: ${selectedChatModel}, Active Bit: ${activeBitContextId}, Active Doc: ${activeDocId}`,
    );

    // Add this line to process tool messages right after parsing
    const safeMessages = Array.isArray(messages)
      ? messages.map(ensureToolMessageContentIsString)
      : messages;

    // Extract the last message from the messages array - this is the user's new message
    if (
      !safeMessages ||
      !Array.isArray(safeMessages) ||
      safeMessages.length === 0
    ) {
      return NextResponse.json(
        {
          error: 'Missing required parameters: messages array is required',
        },
        { status: 400 },
      );
    }

    const lastMessage = safeMessages[safeMessages.length - 1];
    const userMessageContent = lastMessage.content;

    // --- BEGIN CHAT CHECK/CREATION ---
    // Get current user session
    const authSession = await auth();
    const userId = authSession?.user?.id;
    const clientId = authSession?.user?.clientId;

    if (!userId) {
      console.error('[Brain API] User ID not found in session!');
      // Using development bypass for testing
      if (BYPASS_AUTH_FOR_TESTING) {
        console.log('[Brain API] Auth bypass enabled, using test user ID');
        // Continue with test user
      } else {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 },
        );
      }
    }

    if (!clientId) {
      console.error('[Brain API] Client ID not found in session!');
      // Log warning but continue with default client ID if testing enabled
      if (BYPASS_AUTH_FOR_TESTING) {
        console.log('[Brain API] Auth bypass enabled, using default client ID');
      } else {
        console.warn('[Brain API] Missing clientId - will use default');
      }
    }

    // Use the actual user ID from session or the test ID if bypassing auth
    const effectiveUserId = userId || 'test-user-id';
    const effectiveClientId = clientId || 'default';

    console.log(
      `[Brain API] Using User ID: ${effectiveUserId}, Client ID: ${effectiveClientId}`,
    );

    // Validate and normalize UUID format
    let normalizedChatId = chatId;
    // Check if the chatId is in UUID format (8-4-4-4-12)
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(chatId)) {
      console.log(
        `[Brain API Debug] The provided chatId '${chatId}' is not in standard UUID format`,
      );

      // If it doesn't match UUID pattern but looks like it could be a shortened/encoded UUID,
      // generate a proper UUID based on this string to use consistently
      try {
        // Generate a deterministic UUID v5 using the non-standard ID as a namespace
        normalizedChatId = randomUUID();
        console.log(
          `[Brain API Debug] Generated normalized UUID ${normalizedChatId} for non-standard ID ${chatId}`,
        );
      } catch (error) {
        console.error(`[Brain API Debug] Error normalizing chatId:`, error);
      }
    }

    // Skip Drizzle and use direct SQL to check if chat exists
    try {
      console.log(
        `[Brain API Debug] Checking chat existence using direct SQL for chatId: ${normalizedChatId}`,
      );

      // Get chat directly with SQL
      const existingChats = await sql`
        SELECT id FROM "Chat" WHERE id = ${normalizedChatId} LIMIT 1
      `;

      const chatExists = existingChats.length > 0;
      console.log(
        `[Brain API Debug] Chat existence check result: ${chatExists ? 'Found' : 'Not found'}`,
      );

      if (!chatExists) {
        console.log(
          `[Brain API Debug] Chat ${normalizedChatId} not found. Creating with direct SQL...`,
        );
        const initialTitle =
          safeMessages[safeMessages.length - 1]?.content?.substring(0, 100) ||
          'New Chat';

        // Insert chat with direct SQL
        await sql`
          INSERT INTO "Chat" (
            id, 
            "userId", 
            title, 
            "createdAt", 
            visibility,
            client_id
          ) VALUES (
            ${normalizedChatId}, 
            ${effectiveUserId}, 
            ${initialTitle}, 
            ${new Date().toISOString()}, 
            'private',
            ${effectiveClientId}
          )
          ON CONFLICT (id) DO NOTHING
        `;

        console.log(
          `[Brain API Debug] Successfully created chat ${normalizedChatId} using direct SQL`,
        );
      } else {
        console.log(
          `[Brain API Debug] Chat ${normalizedChatId} already exists, skipping creation`,
        );
      }

      // Proceed with message handling, bypassing the ChatRepository
      console.log(
        `[Brain API Debug] Proceeding to process messages for chat ${normalizedChatId}`,
      );
    } catch (dbError: any) {
      console.error(
        `[Brain API Debug] Database error during chat check/creation:`,
        dbError,
      );
      console.error(`[Brain API Debug] Error details:`, {
        message: dbError?.message,
        name: dbError?.name,
        stack: dbError?.stack?.split('\n').slice(0, 3),
      });

      // Instead of failing, let's try to continue - the DB might still accept the messages
      console.log(
        `[Brain API Debug] Will attempt to continue despite DB error`,
      );
    }
    // --- END CHAT CHECK/CREATION ---

    // --- BEGIN USER MESSAGE SAVE ---
    // Format the user message for the database
    const userMessageToSave: DBMessage = {
      id: lastMessage.id || randomUUID(),
      chatId: normalizedChatId,
      role: 'user',
      // Ensure 'parts' structure matches your schema
      parts: lastMessage.parts || [{ type: 'text', text: userMessageContent }],
      attachments: lastMessage.attachments || [],
      createdAt: lastMessage.createdAt
        ? new Date(lastMessage.createdAt)
        : new Date(),
    };

    try {
      console.log(
        `[Brain API] Saving user message ${userMessageToSave.id} for chat ${normalizedChatId}`,
      );

      // Use direct SQL to insert the message instead of chatRepository
      await sql`
        INSERT INTO "Message_v2" (
          id, 
          "chatId", 
          role, 
          parts, 
          attachments, 
          "createdAt",
          client_id
        ) VALUES (
          ${userMessageToSave.id}, 
          ${userMessageToSave.chatId}, 
          ${userMessageToSave.role}, 
          ${JSON.stringify(userMessageToSave.parts)}, 
          ${JSON.stringify(userMessageToSave.attachments)}, 
          ${userMessageToSave.createdAt.toISOString()},
          ${effectiveClientId}
        )
      `;

      console.log(
        `[Brain API] Successfully saved user message ${userMessageToSave.id}`,
      );
    } catch (dbError: any) {
      console.error(
        `[Brain API] FAILED to save user message ${userMessageToSave.id}:`,
        dbError,
      );
      console.error(`[Brain API] Message save error details:`, {
        message: dbError?.message,
        name: dbError?.name,
        stack: dbError?.stack?.split('\n').slice(0, 3),
      });
      // Continue processing even if DB save fails - don't halt the request
    }
    // --- END USER MESSAGE SAVE ---

    // Use all previous messages as history
    const history = safeMessages.slice(0, -1);

    // Log raw history before formatting
    console.log(
      `[Brain API] Raw history being passed to formatChatHistory (count: ${history?.length || 0}):`,
      JSON.stringify(history, null, 2),
    );

    // TASK 0.4: Always use 'chat-model-reasoning' ID instead of selectedChatModel
    const quibitModelId = 'chat-model-reasoning';
    console.log(
      `[Brain API] Using Quibit orchestrator (${quibitModelId}) regardless of selected model`,
    );

    // Initialize the LLM
    const llm = initializeLLM(quibitModelId);

    // Get available tools for the current context
    const tools = await getAvailableTools();

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', orchestratorSystemPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    // Create the agent
    console.log(
      `[Brain API] Creating Quibit orchestrator agent with ${tools.length} tools`,
    );

    const agent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt,
    });

    // Create agent executor
    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      // Set max iterations to prevent infinite loops
      maxIterations: 10,
      // Important: Return intermediate steps for tool usage
      returnIntermediateSteps: true,
      verbose: true,
    });

    console.log('[Brain API] Agent executor created');

    // Format and sanitize the chat history
    let formattedHistory: (HumanMessage | AIMessage)[] = [];
    try {
      // Use your existing formatting function
      formattedHistory = formatChatHistory(history);
      console.log('[Brain API] Chat history formatted successfully');
    } catch (formatError) {
      console.error('[Brain API] Error formatting chat history:', formatError);
      console.log('[Brain API] Using empty history due to formatting error');
      formattedHistory = [];
    }

    // Additional sanitization to force string content (keep for safety)
    const sanitizedHistory = formattedHistory.map((message) => {
      return message;
    });

    // Force reinstantiation of message objects to ensure they are proper class instances
    const finalSafeHistory = sanitizedHistory.map((msg) => {
      if (msg instanceof HumanMessage) {
        // Always create a fresh instance to ensure it's a real class instance
        return new HumanMessage({ content: String(msg.content) });
      }

      if (msg instanceof AIMessage) {
        // Always create a fresh instance to ensure it's a real class instance
        return new AIMessage({ content: String(msg.content) });
      }

      return msg;
    });

    // DIRECT CLASS INSTANTIATION: Create fresh instances immediately before invoke
    const directInstances = finalSafeHistory.map((msg) => {
      // Convert to raw message format first with explicit typing
      const rawMessage: RawMessage = {
        type: msg instanceof HumanMessage ? 'human' : 'ai',
        content:
          typeof msg?.content === 'string'
            ? msg.content
            : String(msg?.content || ''),
      };

      // Use the rawToMessage utility to create a properly typed instance
      const properInstance = rawToMessage(rawMessage);

      if (!properInstance) {
        console.error(
          '[Brain API] Failed to create proper message instance:',
          msg,
        );
        // Fallback: use direct instantiation with explicit type check
        if (msg instanceof HumanMessage) {
          return new HumanMessage({ content: String(msg?.content || '') });
        } else {
          return new AIMessage({ content: String(msg?.content || '') });
        }
      }

      return properInstance;
    });

    // Process the message with file context and other context variables
    let combinedMessage = userMessageContent;

    // --- Hybrid File Context Integration ---
    // If fileContext is present, merge its extractedText into the LLM prompt context
    let fileContextString = '';
    if (fileContext?.extractedText) {
      // Extract the text content from the nested object structure
      let extractedText = '';
      console.log(
        '[Brain API] File context structure:',
        JSON.stringify(fileContext, null, 2),
      );

      // Handle different possible structures of extractedText
      if (
        typeof fileContext.extractedText === 'object' &&
        fileContext.extractedText !== null
      ) {
        // Type assertion to help TypeScript understand our structure
        const extractedObj = fileContext.extractedText as Record<string, any>;

        if (extractedObj?.responseBody?.extractedText) {
          // Handle n8n webhook response structure
          extractedText = extractedObj.responseBody.extractedText;
        } else if (extractedObj?.success && extractedObj?.extractedText) {
          // Handle direct extraction response structure
          extractedText = extractedObj.extractedText;
        } else if (extractedObj?.extractedContent) {
          // Handle fallback extraction structure
          extractedText = extractedObj.extractedContent;
          console.log('[Brain API] Using extracted content property');
        } else {
          // Fallback to stringify the object if we can't find the text
          extractedText = JSON.stringify(fileContext.extractedText);
        }

        // Check if this is a fallback LLM extraction
        const isFallbackExtraction = extractedObj?.isLlmFallback === true;
        const isMicrosoftFormat = extractedObj?.isMicrosoftFormat === true;

        if (isFallbackExtraction) {
          console.log('[Brain API] Using fallback LLM extraction mode');

          // Special handling for Microsoft Office documents
          if (isMicrosoftFormat) {
            console.log(
              '[Brain API] Document is Microsoft Office format that LLM can process directly',
            );
            extractedText = `${extractedText}

[SYSTEM INSTRUCTION: This is a Microsoft Office document that you can process directly. As a GPT-4 model, you have native ability to understand Microsoft Office document formats. Do NOT try to use external tools to retrieve this file - instead analyze the document information provided above and respond directly to the user's request about this file. All necessary metadata is already provided.]`;
          } else {
            // Add standard fallback instructions for other file types
            extractedText = `${extractedText}

[SYSTEM INSTRUCTION: This file was processed using fallback extraction because the primary extraction service couldn't process it. Please do your best to interpret the file content and inform the user if you're unable to fully process this file type. If you can't effectively process this content, respond with: "I'm unable to properly process this file type. Please try uploading a different format like PDF, DOCX, TXT, or JSON."]`;
          }
        }
      } else if (typeof fileContext.extractedText === 'string') {
        // If it's already a string, use it directly
        extractedText = fileContext.extractedText;
      } else {
        // Unexpected type, convert to string for safety
        extractedText = String(fileContext.extractedText);
      }

      // Format the file context in a clear way that helps the LLM understand the content
      fileContextString = `

### FILE CONTEXT ###
Filename: ${fileContext.filename}
Content Type: ${fileContext.contentType}

CONTENT:
${extractedText}
### END FILE CONTEXT ###

`;
      console.log('[Brain API] Including fileContext in LLM prompt.');
      console.log(`[Brain API] Extracted text length: ${extractedText.length}`);
    }

    const attachmentContext = processAttachments(lastMessage);

    // TASK 0.4: Create context prefix string based on activeBitContextId and activeDocId
    let contextPrefix = '';
    if (activeBitContextId === 'document-editor' && activeDocId) {
      contextPrefix = `[CONTEXT: Document Editor (ID: ${activeDocId})] `;
    } else if (activeBitContextId === 'chat-model') {
      contextPrefix = `[CONTEXT: Chat Bit] `;
    } else if (activeBitContextId) {
      contextPrefix = `[CONTEXT: ${activeBitContextId}] `;
    }

    // --- Combine user message with contextPrefix, fileContext and attachment context ---
    // TASK 0.4: Prepend the context prefix to the user's message
    if (contextPrefix) {
      combinedMessage = `${contextPrefix}${combinedMessage}`;
      console.log(`[Brain API] Added context prefix: "${contextPrefix}"`);
    }

    // Create a file context instruction for the LLM if file context is present
    const fileContextInstruction = fileContextString
      ? `I've included the content of a file that you should reference when answering my question. Please use the information from this file to inform your response.`
      : '';

    if (fileContextString) {
      combinedMessage = `${fileContextInstruction}\n\n${combinedMessage}${fileContextString}`;
    } else if (attachmentContext) {
      combinedMessage = `${combinedMessage}\n\n### ATTACHED FILE CONTENT ###${attachmentContext}`;
    }

    // Set up LangChainStream with onCompletion handler for message saving
    const { handlers } = createLangChainStreamHandler({
      onCompletion: async (fullResponse: string) => {
        // Add detailed logging to help debug duplicate saves
        console.log(`[Brain API] >> onCompletion Handler Triggered <<`);
        console.log(
          `[Brain API]    Flag 'assistantMessageSaved': ${assistantMessageSaved}`,
        );
        console.log(
          `[Brain API]    Response Length: ${fullResponse?.length || 0}`,
        );
        console.log(
          `[Brain API]    Response Snippet: ${(fullResponse || '').substring(0, 100)}...`,
        );

        // Check if message is already saved
        if (assistantMessageSaved) {
          console.log(
            '[Brain API] onCompletion: Assistant message already saved, skipping duplicate save.',
          );
          return;
        }

        // Set flag to prevent duplicate saves
        assistantMessageSaved = true;

        // This code runs AFTER the entire response has been streamed
        console.log(
          '[Brain API] Stream completed. Saving final assistant message.',
        );

        try {
          // Format the assistant message for the database
          const assistantMessageToSave = {
            id: randomUUID(), // Generate a new unique ID for the assistant message
            chatId: normalizedChatId,
            role: 'assistant',
            content: fullResponse, // Required by ChatRepository
            createdAt: new Date(),
            parts: [{ type: 'text', text: fullResponse }], // Required by DBMessage
            attachments: [], // Required by DBMessage
          };

          console.log(
            `[Brain API] Saving assistant message ${assistantMessageToSave.id} for chat ${normalizedChatId}`,
          );

          // Use direct SQL instead of chatRepository
          await sql`
            INSERT INTO "Message_v2" (
              id, 
              "chatId", 
              role, 
              parts, 
              attachments, 
              "createdAt",
              client_id
            ) VALUES (
              ${assistantMessageToSave.id}, 
              ${assistantMessageToSave.chatId}, 
              ${assistantMessageToSave.role}, 
              ${JSON.stringify(assistantMessageToSave.parts)}, 
              ${JSON.stringify(assistantMessageToSave.attachments)}, 
              ${assistantMessageToSave.createdAt.toISOString()},
              ${effectiveClientId}
            )
          `;

          console.log(
            `[Brain API] Successfully saved assistant message ${assistantMessageToSave.id}`,
          );
        } catch (dbError: any) {
          console.error(
            `[Brain API] FAILED to save assistant message:`,
            dbError,
          );
          console.error(`[Brain API] Assistant message save error details:`, {
            message: dbError?.message,
            name: dbError?.name,
            stack: dbError?.stack?.split('\n').slice(0, 3),
          });
          // Log error, but don't block response as stream already finished
          // Do not reset assistantMessageSaved flag here to prevent duplicate save attempts
        }
      },
    });

    // Start the agent streaming execution
    agentExecutor
      .stream(
        {
          input: combinedMessage,
          chat_history: directInstances,
          activeBitContextId: activeBitContextId || null,
        },
        { callbacks: handlers },
      )
      .catch((error) => {
        console.error('[Brain API] Error in agent execution:', error);
      });

    // Implement custom streaming with a ReadableStream for character-by-character display
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Execute the agent and get the streaming result
          const streamResult = await agentExecutor.stream(
            {
              input: combinedMessage,
              chat_history: directInstances,
              activeBitContextId: activeBitContextId || null,
            },
            { callbacks: handlers },
          );

          // Process each chunk from the stream
          for await (const chunk of streamResult) {
            if (chunk.output && typeof chunk.output === 'string') {
              // Split long chunks into smaller pieces for more granular streaming
              const text = chunk.output;
              const chunkSize = 1; // Stream character by character for best effect

              // Process the text in smaller chunks to improve streaming responsiveness
              for (let i = 0; i < text.length; i += chunkSize) {
                const subChunk = text.slice(i, i + chunkSize);
                // Format using the AI SDK data stream format for text chunks
                const encoded = encoder.encode(
                  `0:${JSON.stringify(subChunk)}\n`,
                );
                controller.enqueue(encoded);

                // Reduced delay for faster streaming but still smooth
                await new Promise((resolve) => setTimeout(resolve, 2));
              }
            } else if (
              chunk.toolCalls &&
              Array.isArray(chunk.toolCalls) &&
              chunk.toolCalls.length > 0
            ) {
              // Debug information about tool calls - use type 2 for data
              const encoded = encoder.encode(
                `2:${JSON.stringify(chunk.toolCalls)}\n`,
              );
              controller.enqueue(encoded);
            }

            // Process intermediateSteps if they exist
            if (chunk.intermediateSteps && chunk.intermediateSteps.length > 0) {
              console.log(
                '[Brain API] Processing agent steps:',
                chunk.intermediateSteps.length,
              );
            }
          }

          // Send a finish message part at the end
          const finishMessage = encoder.encode(
            `d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`,
          );
          controller.enqueue(finishMessage);

          // Close the stream when done
          controller.close();
        } catch (error) {
          console.error('[Brain API] Error streaming agent result:', error);
          controller.error(error);
        }
      },
    });

    // Return the streaming response with the correct content type for SSE
    // and additional headers to prevent buffering
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform, no-store, must-revalidate',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
        'x-vercel-ai-data-stream': 'v1', // Add this header to indicate it's a data stream
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
