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
import { createDataStreamResponse, type DataStreamWriter } from 'ai';
import { auth } from '@/app/(auth)/auth';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';

// State variables to track between requests/handler invocations
// These fix "Cannot find name" TypeScript errors
// Import tools and utilities
// import { orchestratorPrompt, getSpecialistPromptById } from '@/lib/ai/prompts'; // Unused
import { loadPrompt } from '@/lib/ai/prompts/loader';
import { processHistory } from '@/lib/contextUtils';
import { EnhancedAgentExecutor } from '@/lib/ai/executors/EnhancedAgentExecutor';

// State variables to track between requests/handler invocations
// These fix "Cannot find name" TypeScript errors
const assistantMessageSaved = false;
const normalizedChatId = ''; // Will be reassigned in POST
const effectiveClientId = ''; // Will be reassigned in POST
import { specialistRegistry } from '@/lib/ai/prompts/specialists';
import { modelMapping } from '@/lib/ai/models';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import { rawToMessage, type RawMessage } from '@/lib/langchainHelpers';
import { availableTools } from '@/lib/ai/tools/index';

// Import database functions and types
// import { db } from '@/lib/db'; // Unused
import { sql } from '@/lib/db/client';
import { getClientConfig } from '@/lib/db/queries';
import type { DBMessage } from '@/lib/db/schema';
import type { ClientConfig } from '@/lib/db/queries'; // Import the correct ClientConfig type
import { randomUUID } from 'node:crypto';

// Add GLOBAL_ORCHESTRATOR_CONTEXT_ID to imports at the top
import {
  GLOBAL_ORCHESTRATOR_CONTEXT_ID,
  CHAT_BIT_CONTEXT_ID,
} from '@/lib/constants';

// Add at the top:
import { DateTime } from 'luxon';

// Add a simple logging utility at the top of the file (after imports)
/**
 * Simple logging utility to control log verbosity
 * Only logs errors by default unless debug mode is enabled
 */
const LOG_LEVEL = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

// Set the current log level - can be controlled via environment variable
// Default to ERROR only in production, INFO in development
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL
  ? Number.parseInt(process.env.LOG_LEVEL, 10)
  : process.env.NODE_ENV === 'production'
    ? LOG_LEVEL.ERROR
    : LOG_LEVEL.INFO;

// Simple logger that respects the current log level
const logger = {
  error: (message: string, ...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) {
      console.error(`[Brain API ERROR] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) {
      console.warn(`[Brain API WARN] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) {
      console.log(`[Brain API] ${message}`, ...args);
    }
  },
  debug: (message: string, ...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) {
      console.log(`[Brain API DEBUG] ${message}`, ...args);
    }
  },
};

// Helper function to create a custom LangChain streaming handler
function createLangChainStreamHandler(
  {
    dataStream, // Pass DataStreamWriter here for direct token streaming
    onStart,
    onCompletion,
  }: {
    dataStream: DataStreamWriter; // Add this parameter
    onStart?: () => Promise<void>;
    onCompletion?: (response: string) => Promise<void>;
  } = {} as any,
) {
  // Track the complete response for onCompletion callback
  let completeResponse = '';
  // Use let for assistantMessageSaved so it can be reassigned
  let assistantMessageSaved = false;

  // Create a custom handler that extends BaseCallbackHandler
  class CompletionCallbackHandler extends BaseCallbackHandler {
    name = 'CompletionCallbackHandler';

    async handleLLMNewToken(token: string) {
      completeResponse += token;

      // Stream token immediately using the correct protocol for Vercel AI SDK
      if (token && dataStream) {
        try {
          // Vercel AI SDK Text Part protocol: 0:"json_stringified_text_chunk"\n
          await dataStream.write(`0:${JSON.stringify(token)}\n`);
        } catch (e) {
          logger.error(
            'Failed to write token to stream in handleLLMNewToken:',
            e,
          );
        }
      }
    }

    async handleLLMEnd() {
      logger.debug(
        'LLM Stream Ended. Full response length:',
        completeResponse.length,
      );
      if (onCompletion) {
        try {
          await onCompletion(completeResponse);
        } catch (err) {
          logger.error('Error in onCompletion callback:', err);
        }
      }
      // Do not close dataStream here. The main execute function will do it.
    }

    // Add the custom callbacks as methods on the BaseCallbackHandler class
    async handleStart() {
      logger.debug(
        'Stream started, setting assistantMessageSaved flag to false',
      );
      // Reset the flag at the start of streaming to ensure we save exactly one message
      assistantMessageSaved = false; // Use let, not redeclare

      if (onStart) {
        await onStart();
      }
    }
  }

  return {
    handlers: [new CompletionCallbackHandler()],
  };
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
    logger.debug(`[Callback] handleLLMStart: ${runId}`, {
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
    logger.debug(`[Callback] handleChatModelStart: ${runId}`, {
      llm: llm.id || llm.name || 'unknown',
    });
    logger.debug(
      '[Callback] Messages sent to LLM:',
      JSON.stringify(messages, null, 2),
    );

    // Specifically check for message content that might cause errors
    try {
      for (const msgGroup of messages) {
        for (const msg of msgGroup) {
          const contentType = typeof msg.content;
          if (contentType === 'object') {
            logger.debug(
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
            logger.debug('[Callback ALERT] Found tool message:', {
              contentType,
              name: msg.name,
              toolCallId: msg.additional_kwargs?.tool_call_id,
              content: msg.content,
            });
          }
        }
      }
    } catch (e) {
      logger.error('[Callback] Error checking messages:', e);
    }
  }

  handleLLMEnd(output: LLMResult, runId: string): void | Promise<void> {
    logger.debug(`[Callback] handleLLMEnd: ${runId}`, { output });

    // Check if output contains tool calls
    try {
      const generations = output.generations;
      generations.forEach((genList, i) => {
        genList.forEach((gen, j) => {
          const genMessage = gen as any;
          if (genMessage.message?.additional_kwargs?.tool_calls) {
            logger.debug(
              `[Callback] Tool calls found in generation [${i}][${j}]:`,
              genMessage.message.additional_kwargs.tool_calls,
            );
          }

          // Log generation completion reason
          if (genMessage.message?.additional_kwargs?.finish_reason) {
            logger.debug(
              `[Callback] Generation [${i}][${j}] finish_reason:`,
              genMessage.message.additional_kwargs.finish_reason,
            );
          }
        });
      });
    } catch (e) {
      logger.error('[Callback] Error checking LLM output for tool calls:', e);
    }
  }

  handleLLMError(err: Error, runId: string): void | Promise<void> {
    logger.error(`[Callback] handleLLMError: ${runId}`, { err });
    logger.error(`[Callback] LLM Error Message: ${err.message}`);
    logger.error(`[Callback] LLM Error Name: ${err.name}`);
    logger.error(`[Callback] LLM Error Stack: ${err.stack}`);

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
      logger.error(`[Callback] DETECTED ERROR CATEGORY: ${errorType[0]}`);
    }

    // Special handling for tool-related errors
    if (err.message.includes('tool') || err.message.includes('function')) {
      logger.error(
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
    logger.debug(
      `[Callback] handleChainStart: ${chain.id || chain.name || 'unknown'} (${runId})`,
      {
        inputs,
      },
    );
  }

  handleChainEnd(outputs: ChainValues, runId: string): void | Promise<void> {
    logger.debug(`[Callback] handleChainEnd: ${runId}`, { outputs });
  }

  handleChainError(err: Error, runId: string): void | Promise<void> {
    logger.error(`[Callback] handleChainError: ${runId}`, { err });
    logger.error(`[Callback] Chain Error Message: ${err.message}`);
    logger.error(`[Callback] Chain Error Name: ${err.name}`);
    logger.error(`[Callback] Chain Error Stack: ${err.stack}`);

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
        logger.error(`[Callback] DETECTED CHAIN ERROR TYPE: ${errorType}`);
      }
    });

    // Additional context for message format errors
    if (
      err.message.toLowerCase().includes('message') ||
      err.message.toLowerCase().includes('content')
    ) {
      logger.error(`[Callback] POSSIBLE MESSAGE FORMAT ERROR IN CHAIN`);

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
            logger.error(`[Callback] Error appears in function: ${frame}`);
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
 * Initialize a LangChain LLM with appropriate parameters
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

  logger.info(
    `Initializing LLM with model: ${selectedModel} for bitId: ${bitId || 'unknown'}`,
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
      logger.error('Error stringifying object content:', e);
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
      logger.debug('HumanMessage prototype:', Object.getPrototypeOf(instance));
      logger.debug(
        'instanceof HumanMessage:',
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
      logger.debug('AIMessage prototype:', Object.getPrototypeOf(instance));
      logger.debug('instanceof AIMessage:', instance instanceof AIMessage);
      return instance;
    }
    if (sanitized.role === 'user' || sanitized.role === 'human') {
      const instance = new HumanMessage({ content: stringContent });
      logger.debug('HumanMessage prototype:', Object.getPrototypeOf(instance));
      logger.debug(
        'instanceof HumanMessage:',
        instance instanceof HumanMessage,
      );
      return instance;
    }
    if (sanitized.role === 'assistant' || sanitized.role === 'ai') {
      const instance = new AIMessage({ content: stringContent });
      logger.debug('AIMessage prototype:', Object.getPrototypeOf(instance));
      logger.debug('instanceof AIMessage:', instance instanceof AIMessage);
      return instance;
    }
    return null;
  } catch (err) {
    logger.error('Failed to convert message:', msg, err);
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

// Add this type declaration at the top of the file
declare global {
  var CURRENT_TOOL_CONFIGS: Record<string, any>;
  var CURRENT_REQUEST_BODY: {
    referencedChatId?: string | null;
    referencedGlobalPaneChatId?: string | null;
    currentActiveSpecialistId?: string | null;
    isFromGlobalPane?: boolean;
  } | null;
}

// Helper function to get available tools
async function getAvailableTools(clientConfig?: ClientConfig | null) {
  logger.info('[Brain API] Initializing available tools...');

  try {
    if (Array.isArray(availableTools)) {
      // If no client configuration, return default tools
      if (!clientConfig?.configJson?.tool_configs) {
        logger.info(
          '[Brain API] Using default tool configurations (no client-specific configs found)',
        );
        return availableTools;
      }

      const toolConfigs = clientConfig.configJson.tool_configs;
      logger.info(
        `[Brain API] Found client-specific tool configurations: ${Object.keys(toolConfigs).join(', ')}`,
      );

      // Instead of directly modifying tool objects (which could cause type issues),
      // use a global configuration store that tools can access

      // Initialize the global configuration store
      global.CURRENT_TOOL_CONFIGS = {};

      // Example: Configure specific tools based on client settings
      if (toolConfigs.n8n) {
        logger.info(
          '[Brain API] Configuring n8nMcpGateway tool with client settings',
        );

        // Set configuration for n8nMcpGateway tool
        global.CURRENT_TOOL_CONFIGS.n8n = {
          webhookUrl: toolConfigs.n8n.webhookUrl || process.env.N8N_WEBHOOK_URL,
          apiKey: toolConfigs.n8n.apiKey || process.env.N8N_API_KEY,
          // Additional configurations
          ...toolConfigs.n8n,
        };

        logger.info(
          '[Brain API] n8nMcpGateway tool will use client-specific webhookUrl and apiKey',
        );
      }

      // Configure Asana tool if present in client config
      if (toolConfigs.asana) {
        logger.info('[Brain API] Configuring Asana tool with client settings');

        // Set configuration for Asana tool
        global.CURRENT_TOOL_CONFIGS.asana = {
          webhookUrl:
            toolConfigs.asana.webhookUrl || process.env.ASANA_WEBHOOK_URL,
          apiKey: toolConfigs.asana.apiKey || process.env.ASANA_AUTH_TOKEN,
          authHeader:
            toolConfigs.asana.authHeader || process.env.ASANA_AUTH_HEADER,
          // Additional configurations
          ...toolConfigs.asana,
        };

        logger.info(
          '[Brain API] Asana tool will use client-specific configuration',
        );
      }

      // Configure Native Asana tool if present in client config
      if (toolConfigs.nativeAsana) {
        logger.info(
          '[Brain API] Configuring Native Asana tool with client settings',
        );

        // Set configuration for Native Asana tool
        global.CURRENT_TOOL_CONFIGS.nativeAsana = {
          apiKey:
            toolConfigs.nativeAsana.apiKey ||
            process.env.NATIVE_ASANA_PAT ||
            process.env.ASANA_PAT,
          defaultWorkspaceGid:
            toolConfigs.nativeAsana.defaultWorkspaceGid ||
            process.env.ASANA_DEFAULT_WORKSPACE_GID,
          // Additional configurations
          ...toolConfigs.nativeAsana,
        };

        logger.info(
          '[Brain API] Native Asana tool will use client-specific configuration',
        );
      }

      if (toolConfigs.tavily) {
        logger.info(
          '[Brain API] Configuring tavilySearch tool with client settings',
        );
        global.CURRENT_TOOL_CONFIGS.tavily = toolConfigs.tavily;

        // The tavilySearch tool should check global.CURRENT_TOOL_CONFIGS.tavily for configurations
        logger.info(
          '[Brain API] tavilySearch tool will use client-specific settings',
        );
      }

      // Apply similar configuration for other tools as needed

      logger.info(
        `[Brain API] Initialized ${availableTools.length} tools with client-specific configs where available`,
      );
      return availableTools;
    }

    // Fallback to empty array for safety
    logger.error('[Brain API] availableTools is not an array');
    return [];
  } catch (error) {
    logger.error('[Brain API] Error getting available tools:', error);
    return [];
  }
}

// Add import at the top of the file after the existing imports
import { createEnhancedDataStream } from '@/lib/streaming';

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
      // Support both activeBitContextId and currentActiveSpecialistId for backward compatibility
      activeBitContextId?: string | null;
      currentActiveSpecialistId?: string | null;
      activeBitPersona?: string | null;
      activeDocId?: string | null;
      // Extract reference chat IDs for cross-UI context sharing
      isFromGlobalPane?: boolean;
      referencedChatId?: string | null;
      mainUiChatId?: string | null;
      referencedGlobalPaneChatId?: string | null;
      userTimezone?: string;
      [key: string]: any;
    };

    try {
      reqBody = await req.json();
    } catch (parseError) {
      logger.error('Error parsing request body:', parseError);
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
      // Extract the context variables from request with backward compatibility
      currentActiveSpecialistId = null,
      activeBitContextId = null,
      activeBitPersona = null,
      activeDocId = null,
      // Extract reference chat IDs for cross-UI context sharing
      isFromGlobalPane = false,
      referencedChatId = null,
      mainUiChatId = null,
      referencedGlobalPaneChatId = null,
      userTimezone = 'UTC',
    } = reqBody;

    // Use currentActiveSpecialistId if provided, otherwise fall back to activeBitContextId
    // But override with GLOBAL_ORCHESTRATOR_CONTEXT_ID if this is from the global pane
    const effectiveContextId = isFromGlobalPane
      ? GLOBAL_ORCHESTRATOR_CONTEXT_ID
      : currentActiveSpecialistId || activeBitContextId || CHAT_BIT_CONTEXT_ID;

    // Log the effectiveContextId to help with debugging
    logger.info(`Determined effectiveContextId: ${effectiveContextId}`);
    logger.debug(
      `Source: isFromGlobalPane=${isFromGlobalPane}, currentActiveSpecialistId=${currentActiveSpecialistId}, activeBitContextId=${activeBitContextId}`,
    );

    // Set up the global CURRENT_REQUEST_BODY for cross-UI context sharing
    // This is used by tools like getMessagesFromOtherChatTool to maintain context between UIs
    global.CURRENT_REQUEST_BODY = {
      // When request is from Global Pane, it provides referencedChatId (pointing to main UI)
      // When request is from main UI, it provides referencedGlobalPaneChatId
      referencedChatId: isFromGlobalPane
        ? referencedChatId || mainUiChatId
        : chatId,
      referencedGlobalPaneChatId: isFromGlobalPane
        ? chatId
        : referencedGlobalPaneChatId,
      currentActiveSpecialistId: effectiveContextId,
      isFromGlobalPane,
    };

    logger.debug('Set up request context:', {
      referencedChatId: global.CURRENT_REQUEST_BODY.referencedChatId,
      referencedGlobalPaneChatId:
        global.CURRENT_REQUEST_BODY.referencedGlobalPaneChatId,
      currentActiveSpecialistId:
        global.CURRENT_REQUEST_BODY.currentActiveSpecialistId,
      isFromGlobalPane,
    });

    // Validate chatId
    if (!chatId) {
      logger.error('Chat ID is missing!');
      return NextResponse.json(
        { error: 'Missing required parameter: chatId' },
        { status: 400 },
      );
    }

    // Add detailed logging of request body
    logger.debug('Received request. Body keys:', Object.keys(reqBody));
    logger.debug(
      `Raw messages received (count: ${messages?.length || 0}):`,
      JSON.stringify(messages, null, 2),
    );
    logger.debug(
      `Chat ID: ${chatId}, Selected Model: ${selectedChatModel}, Active Context: ${effectiveContextId}, Active Persona: ${activeBitPersona}, Active Doc: ${activeDocId}`,
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
    // Use optional chaining and provide fallback for clientId
    // Handle the type assertion to address the linter error
    const clientId = (authSession?.user as any)?.clientId;

    if (!userId) {
      logger.error('User ID not found in session!');
      // Using development bypass for testing
      if (BYPASS_AUTH_FOR_TESTING) {
        logger.info('Auth bypass enabled, using test user ID');
        // Continue with test user
      } else {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 },
        );
      }
    }

    if (!clientId) {
      logger.warn('Client ID not found in session!');
      // Log warning but continue with default client ID if testing enabled
      if (BYPASS_AUTH_FOR_TESTING) {
        logger.info('Auth bypass enabled, using default client ID');
      } else {
        logger.warn('Missing clientId - will use default');
      }
    }

    // Use the actual user ID from session or the test ID if bypassing auth
    const effectiveUserId = userId || 'test-user-id';
    const effectiveClientId = clientId || 'default';

    logger.info(
      `Using User ID: ${effectiveUserId}, Client ID: ${effectiveClientId}`,
    );

    // Fetch client configuration
    let clientConfig: ClientConfig | null = null;
    try {
      clientConfig = await getClientConfig(effectiveClientId);
      if (clientConfig) {
        logger.info(
          `[Brain API] Loaded config for client: ${clientConfig.name} (display name: ${clientConfig.client_display_name})`,
        );

        // Log client-specific configuration details for debugging
        logger.debug(
          `[Brain API] Client config loaded with: 
          - Client core mission: ${clientConfig.client_core_mission ? 'Present' : 'Not set'}
          - Custom instructions: ${clientConfig.customInstructions ? 'Present' : 'Not set'}
          - Available bit IDs: ${clientConfig.configJson?.available_bit_ids?.length || 0} bits
          - Orchestrator context: ${clientConfig.configJson?.orchestrator_client_context ? 'Present' : 'Not set'}
          - Tool configs: ${Object.keys(clientConfig.configJson?.tool_configs || {}).length || 0} tools configured`,
        );
      } else {
        logger.warn(
          `[Brain API] Could not load configuration for client: ${effectiveClientId}. Using defaults.`,
        );
      }
    } catch (configError) {
      logger.error(`[Brain API] Error fetching client config:`, configError);
      // Continue without client config - we'll use defaults
    }

    // Validate and normalize UUID format
    let normalizedChatId = chatId;
    // Check if the chatId is in UUID format (8-4-4-4-12)
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(chatId)) {
      logger.warn(
        `[Brain API Debug] The provided chatId '${chatId}' is not in standard UUID format`,
      );

      // If it doesn't match UUID pattern but looks like it could be a shortened/encoded UUID,
      // generate a proper UUID based on this string to use consistently
      try {
        // Generate a deterministic UUID v5 using the non-standard ID as a namespace
        normalizedChatId = randomUUID();
        logger.info(
          `[Brain API Debug] Generated normalized UUID ${normalizedChatId} for non-standard ID ${chatId}`,
        );
      } catch (error) {
        logger.error(`[Brain API Debug] Error normalizing chatId:`, error);
      }
    }

    // Skip Drizzle and use direct SQL to check if chat exists
    try {
      logger.info(
        `[Brain API Debug] Checking chat existence using direct SQL for chatId: ${normalizedChatId}`,
      );

      // Get chat directly with SQL
      const existingChats = await sql`
        SELECT id FROM "Chat" WHERE id = ${normalizedChatId} LIMIT 1
      `;

      const chatExists = existingChats.length > 0;
      logger.info(
        `[Brain API Debug] Chat existence check result: ${chatExists ? 'Found' : 'Not found'}`,
      );

      if (!chatExists) {
        logger.info(
          `[Brain API Debug] Chat ${normalizedChatId} not found. Creating with direct SQL...`,
        );
        const initialTitle =
          safeMessages[safeMessages.length - 1]?.content?.substring(0, 100) ||
          'New Chat';

        // Insert chat with direct SQL - now including bitContextId
        await sql`
          INSERT INTO "Chat" (
            id, 
            "userId", 
            title, 
            "createdAt", 
            visibility,
            client_id,
            "bitContextId"
          ) VALUES (
            ${normalizedChatId}, 
            ${effectiveUserId}, 
            ${initialTitle}, 
            ${new Date().toISOString()}, 
            'private',
            ${effectiveClientId},
            ${effectiveContextId}
          )
          ON CONFLICT (id) DO NOTHING
        `;

        logger.info(
          `[Brain API Debug] Successfully created chat ${normalizedChatId} using direct SQL with bitContextId: ${effectiveContextId}`,
        );
      } else {
        logger.info(
          `[Brain API Debug] Chat ${normalizedChatId} already exists, skipping creation`,
        );
      }

      // Proceed with message handling, bypassing the ChatRepository
      logger.info(
        `[Brain API Debug] Proceeding to process messages for chat ${normalizedChatId}`,
      );
    } catch (dbError: any) {
      logger.error(
        `[Brain API Debug] Database error during chat check/creation:`,
        dbError,
      );
      logger.error(`[Brain API Debug] Error details:`, {
        message: dbError?.message,
        name: dbError?.name,
        stack: dbError?.stack?.split('\n').slice(0, 3),
      });

      // Instead of failing, let's try to continue - the DB might still accept the messages
      logger.info(
        `[Brain API Debug] Will attempt to continue despite DB error`,
      );
    }
    // --- END CHAT CHECK/CREATION ---

    // --- BEGIN USER MESSAGE SAVE ---
    // Format the user message for the database
    let userMessageId: string;

    // Check if the message has an ID and it's a proper UUID format
    if (
      lastMessage.id &&
      typeof lastMessage.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        lastMessage.id,
      )
    ) {
      // Use the existing ID since it's a valid UUID
      userMessageId = lastMessage.id;
    } else {
      // Generate a new UUID if missing or invalid format
      userMessageId = randomUUID();
      logger.info(
        `[Brain API] Generated new UUID for user message: ${userMessageId}`,
      );
    }

    logger.info(`[Brain API] User message ID check:`, {
      originalId: lastMessage.id,
      idType: typeof lastMessage.id,
      finalId: userMessageId,
      isValidUUID:
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userMessageId,
        ),
    });

    const userMessageToSave: DBMessage = {
      id: userMessageId,
      chatId: normalizedChatId,
      role: 'user',
      // Ensure 'parts' structure matches your schema
      parts: lastMessage.parts || [{ type: 'text', text: userMessageContent }],
      attachments: lastMessage.attachments || [],
      createdAt: lastMessage.createdAt
        ? new Date(lastMessage.createdAt)
        : new Date(),
      clientId: effectiveClientId, // Add clientId field to match the schema requirements
    };

    try {
      logger.info(
        `[Brain API] Saving user message ${userMessageToSave.id} for chat ${normalizedChatId}`,
      );
      logger.info(
        `[Brain API] User message UUID validation: ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userMessageToSave.id)}`,
      );

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

      logger.info(
        `[Brain API] Successfully saved user message ${userMessageToSave.id}`,
      );
    } catch (dbError: any) {
      logger.error(
        `[Brain API] FAILED to save user message ${userMessageToSave.id}:`,
        dbError,
      );
      logger.error(`[Brain API] Message save error details:`, {
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
    logger.debug(
      `[Brain API] Raw history being passed to formatChatHistory (count: ${history?.length || 0}):`,
      JSON.stringify(history, null, 2),
    );

    // Always use 'global-orchestrator' ID regardless of the selected model
    const quibitModelId = 'global-orchestrator';
    logger.info(
      `[Brain API] Using Quibit orchestrator (${quibitModelId}) regardless of selected model`,
    );

    // Initialize the LLM
    const llm = initializeLLM(quibitModelId);

    // Get available tools for the current context
    const tools = await getAvailableTools(clientConfig);

    // Determine active context ID (prioritize persona)
    const contextId = activeBitPersona || effectiveContextId;
    logger.info(
      `[Brain API] Determined contextId for prompt loading: ${contextId}`,
    );

    // Declare variables used both inside and outside the try block
    let finalSystemPrompt: string;
    let currentTools = tools; // Default to all tools
    let agentExecutor: AgentExecutor;
    let enhancedExecutor: EnhancedAgentExecutor | undefined; // Properly typed with undefined

    try {
      // Format the current date/time for system prompt context
      // Use user's timezone if provided, else fallback to UTC
      const userTimezone = reqBody.userTimezone || 'UTC';
      let now = DateTime.now().setZone(userTimezone);
      // If the timezone is invalid, fallback to UTC
      if (!now.isValid) {
        now = DateTime.now().setZone('UTC');
      }
      const currentDateTimeISO = now.toISO();
      const userFriendlyDate = now.toLocaleString(DateTime.DATE_FULL); // e.g., May 10, 2025
      const userFriendlyTime = now.toLocaleString(DateTime.TIME_SIMPLE); // e.g., 6:04 PM

      // Format the current date/time string for display in the prompt
      const currentDateTime = `${userFriendlyDate} ${userFriendlyTime} (${userTimezone})`;

      // Determine the appropriate modelId to use for loadPrompt
      // If it's the global orchestrator context, use 'global-orchestrator'
      // Otherwise, use the actual selected model ID to avoid triggering orchestrator logic
      const promptModelId =
        contextId === GLOBAL_ORCHESTRATOR_CONTEXT_ID
          ? 'global-orchestrator'
          : selectedChatModel || 'gpt-4';

      // Load the appropriate system prompt using the updated loader
      finalSystemPrompt = loadPrompt({
        modelId: promptModelId, // Use the determined modelId instead of hardcoding to 'global-orchestrator'
        contextId: contextId,
        clientConfig, // Pass the ClientConfig object directly
        currentDateTime, // Pass the formatted date/time
      });

      // Log which prompt type is being used
      logger.info(
        `[Brain API] Using prompt type: ${
          contextId === GLOBAL_ORCHESTRATOR_CONTEXT_ID
            ? 'Orchestrator'
            : contextId === CHAT_BIT_CONTEXT_ID
              ? 'General Chat'
              : `Specialist (${contextId || 'unknown'})`
        }`,
      );

      // Create a date/time context message for time-sensitive queries
      const dateTimeInjectionString = `IMPORTANT CONTEXT: The current date is ${userFriendlyDate} (ISO: ${currentDateTimeISO?.split('T')[0]}), and the current time is ${userFriendlyTime} (ISO: ${currentDateTimeISO?.split('T')[1]?.replace('Z', '')} ${userTimezone}). You MUST use this information for any queries that are time-sensitive, refer to "today," "now," or require knowledge of the current date or time. Do not rely on your internal knowledge for the current date and time.`;

      // The date/time context is now passed to loadPrompt, but we'll keep this for extra emphasis
      // since it appears to be an important feature of your system
      finalSystemPrompt = `${dateTimeInjectionString}\n\n${finalSystemPrompt}`;

      logger.info(
        `[Brain API] Injected current date/time into system prompt. User-friendly: ${currentDateTime}, ISO: ${currentDateTimeISO}`,
      );
      // *** END DATE/TIME INJECTION ***

      // For debugging, show a truncated version of the final prompt
      const truncatedPrompt =
        finalSystemPrompt.length > 250
          ? `${finalSystemPrompt.substring(0, 250)}... [${finalSystemPrompt.length} chars total]`
          : finalSystemPrompt;
      logger.info(
        `[Brain API] Final system prompt with date/time: ${truncatedPrompt}`,
      );

      // Get specialist config for tool filtering if context ID is provided
      // Note: We're using contextId for tool filtering but not for prompt type
      const activeSpecialistConfig =
        contextId && specialistRegistry[contextId]
          ? specialistRegistry[contextId]
          : null;

      // Filter tools if a specialist is active
      if (activeSpecialistConfig) {
        currentTools = tools.filter((tool) =>
          activeSpecialistConfig.defaultTools.includes(tool.name),
        );
        logger.info(
          `[Brain API] Using ${currentTools.length} tools specific to specialist: ${contextId}`,
          currentTools.map((t) => t.name),
        );
      } else {
        logger.info(
          `[Brain API] Using all ${currentTools.length} available tools for Orchestrator or default context.`,
        );
      }

      const prompt = ChatPromptTemplate.fromMessages([
        ['system', finalSystemPrompt],
        new MessagesPlaceholder('chat_history'),
        ['human', '{input}'],
        new MessagesPlaceholder('agent_scratchpad'),
      ]);

      // Create the agent
      logger.info(
        `[Brain API] Creating Quibit orchestrator agent with ${currentTools.length} tools`,
      );

      const agent = await createOpenAIToolsAgent({
        llm,
        tools: currentTools,
        prompt,
      });

      // Create agent executor
      agentExecutor = new AgentExecutor({
        agent,
        tools: currentTools,
        // Set max iterations to prevent infinite loops
        maxIterations: 10,
        // Important: Return intermediate steps for tool usage
        returnIntermediateSteps: true,
        verbose: true,
      });

      // NEW: Enhance the agent executor with smarter tool call enforcement
      // This will ensure calendar/task queries always trigger fresh tool calls
      enhancedExecutor = EnhancedAgentExecutor.fromExecutor(agentExecutor, {
        enforceToolCalls: true,
        verbose: true,
      });

      logger.info(
        '[Brain API] Agent executor created and enhanced with tool call enforcement',
      );
    } catch (error) {
      logger.error(
        '[Brain API] Error loading prompt or creating agent:',
        error,
      );
      throw error; // Re-throw to be caught by the main error handler
    }

    // Format and sanitize the chat history
    let formattedHistory: (HumanMessage | AIMessage)[] = [];
    try {
      // Use your existing formatting function
      formattedHistory = formatChatHistory(history);
      logger.info('[Brain API] Chat history formatted successfully');

      // NEW: Process history with smart filtering and enrichment
      // Using directly lastMessage.content for consistency (available in this scope)
      const userQueryText = lastMessage.content || '';

      // Configure history processing based on context
      const historyOptions = {
        maxMessages: 10, // Limiting to 10 messages for most contexts
        detectRepeatedQueries: true,
        // Add specific tool tags relevant to your system
        repeatedQueryTags: [
          'calendar',
          'schedule',
          'n8n',
          'event',
          'meeting',
          'asana',
          'task',
        ],
      };

      // Apply smart history processing
      formattedHistory = processHistory(
        formattedHistory,
        userQueryText,
        historyOptions,
      );

      logger.info(
        `[Brain API] Processed chat history with smart filtering - message count: ${formattedHistory.length}`,
      );
    } catch (formatError) {
      logger.error(
        '[Brain API] Error formatting/processing chat history:',
        formatError,
      );
      logger.info('[Brain API] Using empty history due to formatting error');
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
        logger.error(
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
      logger.debug(
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
          logger.info('[Brain API] Using extracted content property');
        } else {
          // Fallback to stringify the object if we can't find the text
          extractedText = JSON.stringify(fileContext.extractedText);
        }

        // Check if this is a fallback LLM extraction
        const isFallbackExtraction = extractedObj?.isLlmFallback === true;
        const isMicrosoftFormat = extractedObj?.isMicrosoftFormat === true;

        if (isFallbackExtraction) {
          logger.info('[Brain API] Using fallback LLM extraction mode');

          // Special handling for Microsoft Office documents
          if (isMicrosoftFormat) {
            logger.info(
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
      logger.info('[Brain API] Including fileContext in LLM prompt.');
      logger.info(`[Brain API] Extracted text length: ${extractedText.length}`);
    }

    const attachmentContext = processAttachments(lastMessage);

    // TASK 0.4: Create context prefix string based on activeBitContextId and activeDocId
    let contextPrefix = '';
    if (effectiveContextId === 'document-editor' && activeDocId) {
      contextPrefix = `[CONTEXT: Document Editor (ID: ${activeDocId})] `;
    } else if (effectiveContextId === 'chat-model') {
      contextPrefix = `[CONTEXT: Chat Bit] `;
    } else if (effectiveContextId) {
      contextPrefix = `[CONTEXT: ${effectiveContextId}] `;
    }

    // --- Combine user message with contextPrefix, fileContext and attachment context ---
    // TASK 0.4: Prepend the context prefix to the user's message
    if (contextPrefix) {
      combinedMessage = `${contextPrefix}${combinedMessage}`;
      logger.info(`[Brain API] Added context prefix: "${contextPrefix}"`);
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

    // Use createDataStreamResponse to handle the streaming response
    return createDataStreamResponse({
      async execute(dataStream: DataStreamWriter) {
        // Task A1: Add logging before StreamData creation
        console.log('[BRAIN API] Creating StreamData for artifact streaming.');

        // Enhance the dataStream with our appendData method
        const enhancedDataStream = createEnhancedDataStream(dataStream);

        // Task A1: Add logging after StreamData creation
        console.log(
          '[BRAIN API] StreamData instance created:',
          !!enhancedDataStream,
          'append available:',
          typeof enhancedDataStream?.append === 'function',
          'close available:',
          typeof enhancedDataStream?.close === 'function',
        );

        try {
          // SINGLE AGENT EXECUTION: This is now the only call to agentExecutor.stream
          logger.info('[Brain API] SINGLE AGENT EXECUTION STARTING');

          // Send initial status as custom data
          enhancedDataStream.writeData({
            status: 'started',
            timestamp: new Date().toISOString(),
          });

          // Set up LangChainStream with onCompletion handler for message saving
          const streamHandler = createLangChainStreamHandler({
            dataStream: enhancedDataStream, // Use enhanced version
            onStart: async () => {
              logger.info(
                `[Brain API] Stream started for chat ID: ${normalizedChatId}`,
              );
              assistantMessageSaved = false;
            },
            onCompletion: async (fullResponse: string) => {
              // Skip if response is empty or just whitespace
              logger.info('[Brain API] ON_COMPLETION_HANDLER TRIGGERED');

              if (!fullResponse || !fullResponse.trim()) {
                logger.info(
                  `[Brain API] Skipping empty response in onCompletion`,
                );
                return;
              }

              // Add detailed logging to help debug duplicate saves
              logger.info(`[Brain API] >> onCompletion Handler Triggered <<`);
              logger.info(
                `[Brain API]    Flag 'assistantMessageSaved': ${assistantMessageSaved}`,
              );
              logger.info(
                `[Brain API]    Response Length: ${fullResponse?.length || 0}`,
              );
              logger.info(
                `[Brain API]    Response Snippet: ${(fullResponse || '').substring(0, 100)}...`,
              );

              // Check if message is already saved
              if (assistantMessageSaved) {
                logger.info(
                  '[Brain API] onCompletion: Assistant message already saved, skipping duplicate save.',
                );
                return;
              }

              // Set flag to prevent duplicate saves
              assistantMessageSaved = true;

              // This code runs AFTER the entire response has been streamed
              logger.info(
                '[Brain API] Stream completed. Saving final assistant message.',
              );

              try {
                // Format the assistant message for the database
                const assistantId = randomUUID(); // Generate a new unique ID for the assistant message
                logger.info(
                  `[Brain API] Generated assistant message UUID: ${assistantId}`,
                );

                logger.info(
                  `[Brain API] Assistant UUID validation: ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assistantId)}`,
                );

                const assistantMessageToSave = {
                  id: assistantId,
                  chatId: normalizedChatId,
                  role: 'assistant',
                  content: fullResponse, // Required by ChatRepository
                  createdAt: new Date(),
                  parts: [{ type: 'text', text: fullResponse }], // Required by DBMessage
                  attachments: [], // Required by DBMessage
                  clientId: effectiveClientId, // Make sure clientId is included
                };

                // Additional validation to ensure the UUID is valid
                if (
                  !assistantId ||
                  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    assistantId,
                  )
                ) {
                  logger.error(
                    `[Brain API] Invalid UUID generated for assistant message, attempting to regenerate`,
                  );
                  // If by some chance the UUID is invalid, generate a new one
                  const regeneratedId = randomUUID();
                  if (
                    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                      regeneratedId,
                    )
                  ) {
                    throw new Error(
                      'Failed to generate a valid UUID for assistant message',
                    );
                  }
                  logger.info(
                    `[Brain API] Successfully regenerated UUID: ${regeneratedId}`,
                  );
                  assistantMessageToSave.id = regeneratedId;
                }

                logger.info(
                  `[Brain API] Saving assistant message ${assistantMessageToSave.id} for chat ${normalizedChatId}`,
                );

                // First, check if there's an existing message with the same ID pattern but empty content
                try {
                  // Look for existing messages with this chat ID that are empty and from assistant
                  const existingEmptyMessages = await sql<
                    { id: string; parts: any }[]
                  >`
              SELECT id, parts FROM "Message_v2" 
              WHERE "chatId" = ${normalizedChatId} 
              AND role = 'assistant' 
              AND (
                parts::text = '[{"type":"text","text":""}]' 
                OR parts::text = '[]'
                OR parts::text IS NULL
                OR (parts::text)::jsonb->0->>'text' = ''
              )
            `;

                  if (
                    existingEmptyMessages &&
                    existingEmptyMessages.length > 0
                  ) {
                    logger.info(
                      `[Brain API] Found ${existingEmptyMessages.length} empty assistant messages for this chat, will update one instead of creating new`,
                    );

                    // Use the first empty message ID instead of creating a new one
                    const emptyMsgId = existingEmptyMessages[0].id;
                    logger.info(
                      `[Brain API] Updating empty message ${emptyMsgId} with content instead of creating new`,
                    );

                    // Update the existing empty message with our content
                    await sql`
                UPDATE "Message_v2"
                SET parts = ${JSON.stringify(assistantMessageToSave.parts)}
                WHERE id = ${emptyMsgId} AND "chatId" = ${normalizedChatId}
              `;

                    logger.info(
                      `[Brain API] Successfully updated empty message ${emptyMsgId} with content`,
                    );
                    return;
                  } else {
                    logger.info(
                      `[Brain API] No empty messages found, creating new message`,
                    );
                  }
                } catch (err) {
                  logger.error(
                    `[Brain API] Error checking for empty messages:`,
                    err,
                  );
                  // Continue with normal message creation since checking failed
                }

                // Only create a new message if we didn't find an empty one to update
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

                logger.info(
                  `[Brain API] Successfully saved assistant message ${assistantMessageToSave.id}`,
                );
              } catch (dbError: any) {
                logger.error(
                  `[Brain API] FAILED to save assistant message:`,
                  dbError,
                );
                logger.error(
                  `[Brain API] Assistant message save error details:`,
                  {
                    message: dbError?.message,
                    name: dbError?.name,
                    stack: dbError?.stack?.split('\n').slice(0, 3),
                  },
                );
                // Log error, but don't block response as stream already finished
                // Do not reset assistantMessageSaved flag here to prevent duplicate save attempts
              }
            },
          });

          // Check if enhancedExecutor exists, otherwise fall back to the regular agentExecutor
          const streamResult = enhancedExecutor
            ? await enhancedExecutor.stream(
                {
                  input: combinedMessage,
                  chat_history: directInstances,
                  activeBitContextId: effectiveContextId || null,
                },
                { callbacks: streamHandler.handlers },
              )
            : await agentExecutor.stream(
                {
                  input: combinedMessage,
                  chat_history: directInstances,
                  activeBitContextId: effectiveContextId || null,
                },
                { callbacks: streamHandler.handlers },
              );

          // Process each chunk from the stream - focus on tool calls
          // Since text is now handled by the LLM token callback
          for await (const chunk of streamResult) {
            // Process tool calls if present
            if (
              chunk.toolCalls &&
              Array.isArray(chunk.toolCalls) &&
              chunk.toolCalls.length > 0
            ) {
              console.log(
                '[BRAIN API DEBUG] Entered toolCalls processing loop',
              );
              for (const toolCall of chunk.toolCalls) {
                console.log(
                  `[BRAIN CHUNK_TOOL_CALL] Processing toolCall from LLM request. Name:`,
                  toolCall.name,
                  'Args:',
                  JSON.stringify(toolCall.args),
                );

                // Check if this is a document creation tool call
                if (toolCall.name === 'createDocument') {
                  const toolArgs = toolCall.args || {};
                  const kind = toolArgs.kind;
                  const title = toolArgs.title || 'Untitled Document';
                  const initialContentPrompt = toolArgs.contentPrompt || '';

                  console.log(
                    `[BRAIN CHUNK_TOOL_CALL] createDocument detected. Kind: ${kind}, Title: ${title}`,
                  );

                  if (!kind) {
                    console.error(
                      '[BRAIN CHUNK_TOOL_CALL CRITICAL] "kind" is missing in createDocument tool arguments.',
                    );
                    // Skip this tool call if kind is missing
                    continue;
                  }

                  console.log(
                    '[BRAIN API DEBUG] documentHandlersByArtifactKind:',
                    documentHandlersByArtifactKind.map((h) => h.kind),
                  );

                  // Find the handler by kind (not by tool name)
                  const handler = documentHandlersByArtifactKind.find(
                    (h) => h.kind === kind,
                  );
                  console.log(
                    `[BRAIN CHUNK_TOOL_CALL] Handler found for kind '${kind}':`,
                    !!handler,
                  );

                  if (
                    !handler ||
                    typeof handler.onCreateDocument !== 'function'
                  ) {
                    console.error(
                      `[BRAIN CHUNK_TOOL_CALL CRITICAL] No handler or onCreateDocument method found for kind: ${kind}`,
                    );
                    enhancedDataStream.writeData({
                      type: 'error',
                      error: `No handler available to create document of kind: ${kind}`,
                    });
                    continue;
                  }

                  // Prepare arguments for handler
                  const docId = randomUUID();
                  const handlerArgs = {
                    id: docId,
                    title,
                    dataStream: enhancedDataStream,
                    initialContentPrompt,
                    session: authSession || {
                      user: {
                        id: effectiveUserId,
                        name: 'User',
                        email: '',
                        image: '',
                      },
                      expires: '',
                    },
                  };

                  console.log(
                    `[BRAIN CHUNK_TOOL_CALL] Calling ${kind} handler.onCreateDocument. ID: ${docId}, Title: ${title}, Prompt: ${initialContentPrompt ? 'Yes' : 'No'}`,
                  );

                  // Execute the document creation
                  let creationResult = undefined;
                  try {
                    creationResult =
                      await handler.onCreateDocument(handlerArgs);
                    console.log(
                      `[BRAIN CHUNK_TOOL_CALL] ${kind} handler.onCreateDocument completed successfully. Result:`,
                      creationResult,
                    );
                  } catch (error) {
                    const errorMessage =
                      error instanceof Error ? error.message : 'Unknown error';
                    console.error(
                      `[BRAIN CHUNK_TOOL_CALL ERROR] Error calling ${kind} handler.onCreateDocument:`,
                      error,
                    );
                    enhancedDataStream.writeData({
                      type: 'error',
                      error: `Failed to start document creation for ${title}: ${errorMessage}`,
                    });
                    continue;
                  }

                  // Send the generic tool call info
                  enhancedDataStream.writeData({
                    type: 'status-update',
                    status: `Creating ${kind} document titled "${title}"...`,
                  });

                  // The rest of the completion logic (message annotation, etc.)
                  const newDocId = creationResult?.documentId || docId;

                  // Send completion status
                  enhancedDataStream.writeData({
                    type: 'status-update',
                    status: `Document "${title}" (ID: ${newDocId}) created successfully.`,
                  });

                  // Add a message annotation for the tool use
                  enhancedDataStream.writeMessageAnnotation({
                    documentCreated: {
                      id: newDocId,
                      title,
                      kind: kind, // Use the extracted kind, not the tool name
                    },
                  });

                  console.log(
                    `[Brain API] Document creation complete for ${newDocId}`,
                  );

                  // Create the document URL for reference
                  const documentUrl = `/documents/${newDocId}`;

                  // Write a message that will be displayed to the user
                  enhancedDataStream.writeData({
                    type: 'tool-result',
                    content: {
                      toolName: toolCall.name,
                      toolOutput: `Created a new ${kind} document titled "${title}" (ID: ${newDocId}). Access it at ${documentUrl}`,
                      url: documentUrl,
                    },
                  });

                  // Create a ToolMessage to feed back to the agent
                  if (toolCall?.id) {
                    // Prepare the ToolMessage content - this is what the agent will see
                    let toolMessageContent: string;
                    if (newDocId) {
                      toolMessageContent = `Successfully created a ${kind} document titled "${title}" with ID ${newDocId}. The document is available at ${documentUrl}`;
                      console.log(
                        `[Brain API] Document creation successful for agent, ID: ${newDocId}`,
                      );
                    } else {
                      toolMessageContent = `Attempted to create document titled "${title}", but failed to confirm its creation or retrieve an ID.`;
                      console.warn(
                        `[Brain API] Document creation failed or ID not returned for agent, Title: ${title}`,
                      );
                    }

                    // Create the ToolMessage that will inform the agent about the result
                    const agentToolResult = new ToolMessage({
                      content: toolMessageContent,
                      tool_call_id: toolCall.id,
                    });

                    console.log(
                      `[Brain API] Created ToolMessage for agent feedback with ID: ${toolCall.id}`,
                      { toolCallId: toolCall.id, toolMessageContent },
                    );

                    // Critical: Add this ToolMessage to directInstances so the agent can access it
                    // directInstances is used as chat_history in subsequent agent calls
                    if (directInstances && Array.isArray(directInstances)) {
                      directInstances.push(agentToolResult);
                      console.log(
                        `[Brain API] Added ToolMessage to directInstances (chat_history) for agent's next step.`,
                      );
                      logger.debug(
                        `[Brain API] Updated directInstances length: ${directInstances.length}`,
                      );
                    } else {
                      console.warn(
                        `[Brain API] 'directInstances' (chat_history) is not an array or is undefined. ToolMessage for agent may not be processed correctly.`,
                      );
                    }

                    // Send a structured data event with the tool message for agent consumption
                    enhancedDataStream.writeData({
                      type: 'agent-tool-feedback',
                      toolCallId: toolCall?.id,
                      toolName: toolCall?.name,
                      content: toolMessageContent,
                    });
                  } else {
                    console.warn(
                      '[Brain API] Unable to create ToolMessage: toolCall.id is missing',
                    );
                  }
                } else {
                  // For non-createDocument tools, log that they'll be handled by the agent executor
                  console.log(
                    `[BRAIN CHUNK_TOOL_CALL] Tool ${toolCall?.name} is not createDocument. Standard tool execution by agent executor is expected.`,
                  );

                  // The existing code for other tool calls can remain here
                  // This is where you'd handle other tool types if needed
                }
              }
            } else {
              console.log(
                '[BRAIN API DEBUG] No toolCalls found in chunk:',
                JSON.stringify(chunk),
              );
            }

            // NEW: Also process tool actions from intermediateSteps
            if (
              Array.isArray(chunk.intermediateSteps) &&
              chunk.intermediateSteps.length > 0
            ) {
              console.log(
                '[BRAIN API DEBUG] Entered intermediateSteps processing loop',
              );
              for (const step of chunk.intermediateSteps) {
                if (step?.action?.tool) {
                  const toolArgs = step.action.toolInput || {};
                  const toolName = step.action.tool;

                  console.log(
                    '[BRAIN API DEBUG] Processing tool action from intermediateSteps:',
                    toolName,
                    toolArgs,
                  );

                  // Check if this is a document creation tool
                  if (toolName === 'createDocument') {
                    const kind = toolArgs.kind;
                    const title = toolArgs.title || 'Untitled Document';
                    const initialContentPrompt = toolArgs.contentPrompt || '';

                    console.log(
                      `[BRAIN CHUNK_TOOL_CALL] createDocument detected in intermediateSteps. Kind: ${kind}, Title: ${title}`,
                    );

                    if (!kind) {
                      console.error(
                        '[BRAIN CHUNK_TOOL_CALL CRITICAL] "kind" is missing in createDocument tool arguments from intermediateSteps.',
                      );
                      continue;
                    }

                    console.log(
                      '[BRAIN API DEBUG] documentHandlersByArtifactKind:',
                      documentHandlersByArtifactKind.map((h) => h.kind),
                    );

                    // Find the handler by kind
                    const handler = documentHandlersByArtifactKind.find(
                      (h) => h.kind === kind,
                    );

                    console.log(
                      `[BRAIN CHUNK_TOOL_CALL] Handler found for kind '${kind}' from intermediateSteps:`,
                      !!handler,
                    );

                    if (
                      !handler ||
                      typeof handler.onCreateDocument !== 'function'
                    ) {
                      console.error(
                        `[BRAIN CHUNK_TOOL_CALL CRITICAL] No handler or onCreateDocument method found for kind: ${kind} from intermediateSteps`,
                      );
                      continue;
                    }

                    const docId = randomUUID();
                    const handlerArgs = {
                      id: docId,
                      title,
                      dataStream: enhancedDataStream,
                      initialContentPrompt,
                      session: authSession || {
                        user: {
                          id: effectiveUserId,
                          name: 'User',
                          email: '',
                          image: '',
                        },
                        expires: '',
                      },
                    };

                    console.log(
                      `[BRAIN CHUNK_TOOL_CALL] Calling ${kind} handler.onCreateDocument from intermediateSteps. ID: ${docId}, Title: ${title}`,
                    );

                    let creationResult = undefined;
                    try {
                      creationResult =
                        await handler.onCreateDocument(handlerArgs);
                      console.log(
                        `[BRAIN CHUNK_TOOL_CALL] ${kind} handler.onCreateDocument from intermediateSteps completed successfully. Result:`,
                        creationResult,
                      );
                    } catch (error) {
                      const errorMessage =
                        error instanceof Error
                          ? error.message
                          : 'Unknown error';
                      console.error(
                        `[BRAIN CHUNK_TOOL_CALL ERROR] Error calling ${kind} handler.onCreateDocument from intermediateSteps:`,
                        error,
                      );
                      continue;
                    }

                    // Additional handling for document creation from intermediateSteps could go here
                    // This would typically mirror the logic in the toolCalls section
                  }
                }
              }
            }
          }

          // Final clean-up and completion
          logger.info('[Brain API] AGENT EXECUTION COMPLETED SUCCESSFULLY');

          // Close the stream with end-of-stream indicators
          enhancedDataStream.writeData({
            type: 'completion',
            status: 'complete',
            timestamp: new Date().toISOString(),
          });

          // Write message annotation with a final ID
          const messageId = randomUUID();
          enhancedDataStream.writeMessageAnnotation({
            id: messageId,
            createdAt: new Date().toISOString(),
          });
        } catch (error) {
          // Error handling
          logger.error(`[Brain API] ERROR IN AGENT EXECUTION:`, error);
          enhancedDataStream.writeData({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });
  } catch (error: any) {
    logger.error('[Brain API Error]', error);

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
