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
import {
  createDataStream,
  type DataStreamWriter,
  type Message as UIMessage,
} from 'ai';
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
import { getSystemPromptFor, orchestratorSystemPrompt } from '@/lib/ai/prompts';
import { modelMapping } from '@/lib/ai/models';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type {
  Serialized,
  SerializedConstructor,
} from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import { rawToMessage, RawMessage } from '@/lib/langchainHelpers';

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
            (err.stack &&
              err.stack.toLowerCase().includes(pattern.toLowerCase())),
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
    if (attachment.metadata && attachment.metadata.extractedContent) {
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

/**
 * POST handler for the Brain API
 */
export async function POST(req: NextRequest) {
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
      id,
      selectedChatModel,
      fileContext,
      // Extract the context variables from request (Task 0.4)
      activeBitContextId = null,
      activeDocId = null,
    } = reqBody;

    // Add detailed logging of request body
    console.log(
      '[Brain API] Received request. Body keys:',
      Object.keys(reqBody),
    ); // Log keys to confirm structure
    console.log(
      `[Brain API] Raw messages received (count: ${messages?.length || 0}):`,
      JSON.stringify(messages, null, 2),
    );
    console.log(
      `[Brain API] Chat ID: ${id}, Selected Model: ${selectedChatModel}, Active Bit: ${activeBitContextId}, Active Doc: ${activeDocId}`,
    );

    // Add specific diagnostics for message content types
    if (Array.isArray(messages)) {
      console.log('[Brain API DIAGNOSTIC] Message content types:');
      messages.forEach((msg, index) => {
        console.log(`[Brain API DIAGNOSTIC] Message ${index}:`, {
          role: msg.role,
          id: msg.id,
          contentType: typeof msg.content,
          isNull: msg.content === null,
          isArray: Array.isArray(msg.content),
          isObject: msg.content !== null && typeof msg.content === 'object',
          hasToolCalls: !!(
            msg.tool_calls &&
            Array.isArray(msg.tool_calls) &&
            msg.tool_calls.length > 0
          ),
          finishReason: msg.finish_reason || 'none',
        });

        // Log specific details for tool messages
        if (msg.role === 'tool') {
          console.log(
            `[Brain API DIAGNOSTIC] Tool message details for message ${index}:`,
            {
              toolName: msg.name,
              toolCallId: msg.tool_call_id,
              contentFirstChars:
                typeof msg.content === 'string'
                  ? msg.content.substring(0, 50) + '...'
                  : 'not a string',
            },
          );
        }
      });
    }

    // Add this line to process tool messages right after parsing
    const safeMessages = Array.isArray(messages)
      ? messages.map(ensureToolMessageContentIsString)
      : messages;

    // In a real implementation, you would get session using auth
    // For now, use a mock session for development purposes
    const session = {
      user: {
        id: 'test-user-id',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Expires in 24 hours
    } as const;

    // TASK 0.4: Always use Quibit orchestrator configuration
    // Always use 'chat-model-reasoning' ID instead of selectedChatModel
    const quibitModelId = 'chat-model-reasoning';
    console.log(
      `[Brain API] Using Quibit orchestrator (${quibitModelId}) regardless of selected model`,
    );

    // Extract the last message from the messages array
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
    const message = lastMessage.content;

    // --- Hybrid File Context Integration ---
    // If fileContext is present, merge its extractedText into the LLM prompt context
    let fileContextString = '';
    if (fileContext && fileContext.extractedText) {
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

    // Process any file attachments in the last message (legacy/other attachments)
    let attachmentContext = processAttachments(lastMessage);

    // Use all previous messages as history
    const history = safeMessages.slice(0, -1);

    // Log raw history before formatting
    console.log(
      `[Brain API] Raw history being passed to formatChatHistory (count: ${history?.length || 0}):`,
      JSON.stringify(history, null, 2),
    );

    // Add diagnostic check for each history message
    if (Array.isArray(history)) {
      history.forEach((histMsg, idx) => {
        if (histMsg && typeof histMsg === 'object') {
          console.log(`[Brain API] History message ${idx} structure:`, {
            keys: Object.keys(histMsg),
            role: histMsg.role,
            contentType: typeof histMsg.content,
            hasToolCalls: !!(
              histMsg.tool_calls && Array.isArray(histMsg.tool_calls)
            ),
          });
        } else {
          console.log(
            `[Brain API] Invalid history message at index ${idx}:`,
            histMsg,
          );
        }
      });
    }

    if (!message) {
      return NextResponse.json(
        {
          error: 'Missing required parameters: last message must have content',
        },
        { status: 400 },
      );
    }

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
    let combinedMessage = message;

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

    console.log(`[Brain API] Processing request for Quibit orchestrator`);
    console.log(`[Brain API] Final combined message: ${combinedMessage}`);

    if (fileContextString) {
      console.log(
        `[Brain API] Message includes file context from: ${fileContext?.filename ?? 'unknown'}`,
      );
    }
    if (attachmentContext) {
      console.log(
        `[Brain API] Message includes file attachments with extracted content`,
      );
    }
    console.log(`[Brain API] Chat ID: ${id}`);

    // TASK 0.4: Initialize LLM always using the Quibit orchestrator model
    const llm = initializeLLM(quibitModelId);

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

    // TASK 0.4: Always use the orchestratorSystemPrompt
    // Import directly from the prompts file rather than using getSystemPromptFor
    const systemPrompt = orchestratorSystemPrompt;
    console.log('[Brain API] Using orchestratorSystemPrompt for all requests');

    // --- Explicitly Create Agent Prompt Template ---
    // Define the messages explicitly with proper structure
    const agentPromptDefinition = [
      ['system', systemPrompt], // Use the orchestratorSystemPrompt directly
      new MessagesPlaceholder('chat_history'), // Standard placeholder for conversation history
      ['human', '{input}'], // Simple input variable for user message
      new MessagesPlaceholder('agent_scratchpad'), // Required for agent's internal reasoning/tools
    ];

    // Create the prompt with explicit type declaration
    const prompt = ChatPromptTemplate.fromMessages(agentPromptDefinition);
    // --- End Explicitly Create Agent Prompt Template ---

    // Create agent and executor
    const agent = await createOpenAIToolsAgent({
      llm,
      tools,
      prompt,
    });

    const agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: true,
      callbacks: [new DebugCallbackHandler() as unknown as BaseCallbackHandler],
    });

    // Format chat history
    const chat_history = formatChatHistory(history);

    // Defensive log: check that all are proper instances
    chat_history.forEach((msg, i) => {
      if (!(msg instanceof HumanMessage || msg instanceof AIMessage)) {
        console.error(
          '[Brain API] Message at index',
          i,
          'is not a LangChain message instance:',
          msg,
        );
      }
    });

    // Log the formatted chat history without JSON.stringify (which causes serialization)
    console.log(
      `[Brain API] Formatted chat_history for Langchain (count: ${chat_history?.length}):`,
    );
    // Log details without serializing the objects
    chat_history.forEach((msg, i) => {
      console.log(
        `[Brain API] Message ${i}:`,
        `Type: ${msg instanceof HumanMessage ? 'HumanMessage' : 'AIMessage'}`,
        `Content: ${
          typeof msg.content === 'string'
            ? msg.content.length > 50
              ? msg.content.substring(0, 50) + '...'
              : msg.content
            : 'Non-string content'
        }`,
      );
    });

    // Add a check for message content types after formatting
    chat_history.forEach((msg, index) => {
      if (typeof msg.content !== 'string') {
        console.warn(
          `[Brain API WARN] Formatted history message ${index} has non-string content:`,
          typeof msg.content,
        );
      }
    });

    // Log the formatted history for debugging
    console.log(
      '[Brain API] Formatted chat history length:',
      chat_history.length,
    );

    let result: any;

    // Execute agent
    try {
      console.log(
        `[Brain API] Invoking agent with message: ${combinedMessage}`,
      );
      if (attachmentContext) {
        console.log(
          `[Brain API] Including extracted content from ${lastMessage.attachments?.length || 0} attachments`,
        );
      }

      // If chat history is empty or has errors, use a new empty array to prevent issues
      const safeHistory = chat_history.length > 0 ? chat_history : [];

      // Apply tool message content stringification to any tool messages in history
      const sanitizedHistory = safeHistory.map((message) => {
        // First apply our standard message content safety
        let safeMessage = message;

        if (message && typeof message === 'object' && 'content' in message) {
          // Apply multiple safety layers to ensure string content
          if (typeof message.content === 'object' && message.content !== null) {
            console.log(
              '[Brain API] Sanitizing object content in history message',
            );

            if (typeof message.content.map === 'function') {
              // If content has a map function, it's likely an array of something
              console.log(
                '[Brain API] Content appears to be an array, converting to string',
              );
              safeMessage = {
                ...message,
                content: JSON.stringify(message.content),
              };
            } else {
              // Regular object content
              safeMessage = {
                ...message,
                content:
                  typeof message.content === 'string'
                    ? message.content
                    : JSON.stringify(message.content),
              };
            }
          } else if (typeof message.content !== 'string') {
            // Ensure non-object non-string content is converted to string
            console.log('[Brain API] Converting non-string content to string');
            safeMessage = {
              ...message,
              content: String(message.content || ''),
            };
          }
        }

        // Final safety check
        return ensureStringContent(safeMessage);
      });

      // Force reinstantiation of message objects to ensure they are proper class instances
      // This is critical to prevent serialization issues that cause MessagePlaceholder errors
      const finalSafeHistory = sanitizedHistory.map((msg) => {
        if (msg instanceof HumanMessage) {
          // Always create a fresh instance to ensure it's a real class instance
          return new HumanMessage({ content: String(msg.content) });
        }

        if (msg instanceof AIMessage) {
          // Always create a fresh instance to ensure it's a real class instance
          return new AIMessage({ content: String(msg.content) });
        }

        // If we somehow get a non-instance (should never happen with the above checks)
        console.error(
          '[Brain API] Unknown message type in final history check:',
          msg,
        );
        return msg;
      });

      // Final verification - log instance check WITHOUT serializing
      finalSafeHistory.forEach((msg, i) => {
        console.log(
          `[Brain API] Final message ${i} instance check:`,
          `Is HumanMessage: ${msg instanceof HumanMessage}`,
          `Is AIMessage: ${msg instanceof AIMessage}`,
        );
      });

      console.log(
        '[Brain API] Final history check complete, proceeding with invoke',
      );

      // DIRECT CLASS INSTANTIATION: Create fresh instances immediately before invoke
      // This prevents any serialization issues by bypassing intermediate steps
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

      // Log the direct instances we're about to use
      directInstances.forEach((msg, i) => {
        const contentPreview =
          typeof msg.content === 'string'
            ? `${msg.content.substring(0, 30)}...`
            : 'Complex content';

        console.log(
          `[Brain API] Direct instance ${i}: Is HumanMessage: ${msg instanceof HumanMessage}, Is AIMessage: ${msg instanceof AIMessage}, Content: ${contentPreview}`,
        );
      });

      // Execute the agent with the validated message and DIRECT instances
      result = await agentExecutor.invoke({
        input: combinedMessage,
        chat_history: directInstances as (HumanMessage | AIMessage)[],
      });

      console.log(`[Brain API] Agent execution complete`);
      console.log('[Brain API] Agent Result Output:', result.output);
    } catch (err) {
      console.error('[Brain API] Agent execution error:', err);
      console.error('[Brain API] Agent execution error CATCH block:', err);

      // Log history without serializing to prevent class instance loss
      console.error('[Brain API] History state AT TIME OF ERROR:');
      chat_history.forEach((msg, i) => {
        console.error(
          `[Brain API] History item ${i}:`,
          `Type: ${
            msg instanceof HumanMessage
              ? 'HumanMessage'
              : msg instanceof AIMessage
                ? 'AIMessage'
                : 'Unknown'
          }`,
          `Content: ${
            typeof msg.content === 'string'
              ? msg.content.length > 50
                ? msg.content.substring(0, 50) + '...'
                : msg.content
              : 'Non-string content'
          }`,
        );
      });

      if (err instanceof Error && err.stack) {
        console.error('[Brain API] Error Stack:', err.stack);
      }

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
        console.error(
          '[Brain API DEBUG] "content.map" error detected. Inspecting history passed to invoke.',
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
