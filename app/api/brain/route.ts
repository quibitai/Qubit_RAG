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

import { LangChainAdapter, type Message as UIMessage } from 'ai';

import { auth } from '@/app/(auth)/auth';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';
import { loadPrompt } from '@/lib/ai/prompts/loader';
import { processHistory } from '@/lib/contextUtils';
import { EnhancedAgentExecutor } from '@/lib/ai/executors/EnhancedAgentExecutor';
import { specialistRegistry } from '@/lib/ai/prompts/specialists';
import { modelMapping } from '@/lib/ai/models';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import { rawToMessage, type RawMessage } from '@/lib/langchainHelpers';
import { availableTools } from '@/lib/ai/tools/index';
import { sql } from '@/lib/db/client';
import { getClientConfig } from '@/lib/db/queries';
import type { DBMessage } from '@/lib/db/schema';
import type { ClientConfig } from '@/lib/db/queries';
import { randomUUID } from 'node:crypto';
import {
  GLOBAL_ORCHESTRATOR_CONTEXT_ID,
  CHAT_BIT_CONTEXT_ID,
} from '@/lib/constants';
import { DateTime } from 'luxon';

let assistantMessageSaved = false;

const LOG_LEVEL = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL
  ? Number.parseInt(process.env.LOG_LEVEL, 10)
  : process.env.NODE_ENV === 'production'
    ? LOG_LEVEL.ERROR
    : LOG_LEVEL.INFO;

const logger = {
  error: (message: string, ...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR)
      console.error(`[Brain API ERROR] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN)
      console.warn(`[Brain API WARN] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO)
      console.log(`[Brain API] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG)
      console.log(`[Brain API DEBUG] ${message}`, ...args);
  },
};

// New utility function as per user's correct diagnosis
function iteratorToStringStream(
  iter: AsyncIterable<string>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const it = iter[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const { value, done } = await it.next();
        if (done) {
          ctrl.close();
          return; // Explicitly return after closing
        }
        // value here is an SSE-formatted string from LangChainAdapter.toDataStream
        ctrl.enqueue(encoder.encode(value));
      } catch (err) {
        logger.error('Error in iteratorToStringStream pull:', err);
        ctrl.error(err);
      }
    },
    async cancel() {
      if (typeof it.return === 'function') {
        try {
          await it.return();
        } catch (err) {
          logger.error(
            'Error during iterator cleanup on cancel (iteratorToStringStream):',
            err,
          );
        }
      }
    },
  });
}

const tavilySearch = new TavilySearchResults({ maxResults: 7 });
const BYPASS_AUTH_FOR_TESTING = true;

interface AgentAction {
  tool: string;
  toolInput: string | object;
  log: string;
}
interface AgentFinish {
  returnValues: { output: string };
  log: string;
}
interface ChainValues {
  [key: string]: any;
}

class DebugCallbackHandler extends BaseCallbackHandler {
  name = 'DebugCallbackHandler';
  handleLLMStart(llm: Serialized, prompts: string[], runId: string): void {
    logger.debug(`[Callback] handleLLMStart: ${runId}`, {
      llm: llm.id || (llm as any).name || 'unknown',
      prompts,
    });
  }
  handleChatModelStart(
    llm: Serialized,
    messages: BaseMessage[][],
    runId: string,
  ): void {
    logger.debug(`[Callback] handleChatModelStart: ${runId}`, {
      llm: llm.id || (llm as any).name || 'unknown',
    });
    logger.debug(
      '[Callback] Messages sent to LLM:',
      JSON.stringify(messages, null, 2),
    );
  }
  handleLLMEnd(output: LLMResult, runId: string): void {
    logger.debug(`[Callback] handleLLMEnd: ${runId}`, { output });
  }
  handleLLMError(err: Error, runId: string): void {
    logger.error(`[Callback] handleLLMError: ${runId}`, err);
  }
  handleChainStart(
    chain: Serialized,
    inputs: ChainValues,
    runId: string,
  ): void {
    logger.debug(
      `[Callback] handleChainStart: ${(chain.id as any) || (chain as any).name || 'unknown'} (${runId})`,
      { inputs },
    );
  }
  handleChainEnd(outputs: ChainValues, runId: string): void {
    logger.debug(`[Callback] handleChainEnd: ${runId}`, { outputs });
  }
  handleChainError(err: Error, runId: string): void {
    logger.error(`[Callback] handleChainError: ${runId}`, err);
  }
  handleToolStart(tool: Serialized, input: string, runId: string): void {
    console.log(
      `[Callback] handleToolStart: ${(tool.id as any) || (tool as any).name || 'unknown'} (${runId})`,
      { input },
    );
  }
  handleToolEnd(output: string, runId: string): void {
    console.log(`[Callback] handleToolEnd: ${runId}`, { output });
  }
  handleToolError(err: Error, runId: string): void {
    console.error(`[Callback] handleToolError: ${runId}`, err);
  }
  handleAgentAction(action: AgentAction, runId: string): void {
    console.log(`[Callback] handleAgentAction: ${runId}`, action);
  }
  handleAgentEnd(action: AgentFinish, runId: string): void {
    console.log(`[Callback] handleAgentEnd: ${runId}`, action);
  }
}

function initializeLLM(bitId?: string) {
  let selectedModel: string;
  if (bitId && modelMapping[bitId]) selectedModel = modelMapping[bitId];
  else selectedModel = process.env.DEFAULT_MODEL_NAME || modelMapping.default;
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  logger.info(
    `Initializing LLM: ${selectedModel} for bitId: ${bitId || 'unknown'}`,
  );
  return new ChatOpenAI({
    modelName: selectedModel,
    temperature: 0.7,
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function stringifyContent(content: any): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    try {
      return JSON.stringify(content);
    } catch (e) {
      logger.error('Error stringifying object:', e);
      return '[Object could not be stringified]';
    }
  }
  return String(content);
}

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
    if (msg?.lc_namespace?.includes('HumanMessage'))
      return new HumanMessage({ ...sanitized, content: stringContent });
    if (msg?.lc_namespace?.includes('AIMessage'))
      return new AIMessage({ ...sanitized, content: stringContent });
    if (sanitized.role === 'user' || sanitized.role === 'human')
      return new HumanMessage({ content: stringContent });
    if (sanitized.role === 'assistant' || sanitized.role === 'ai')
      return new AIMessage({ content: stringContent });
    return null;
  } catch (err) {
    logger.error('Failed to convert message:', msg, err);
    return null;
  }
}

function isRawMessage(obj: any): obj is RawMessage {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.type === 'string' &&
    typeof obj.content === 'string'
  );
}

function toRawMessage(obj: any): RawMessage | null {
  if (!obj || typeof obj !== 'object') return null;
  if (isRawMessage(obj)) return obj;
  if (Array.isArray(obj.lc_namespace)) {
    if (obj.lc_namespace.includes('HumanMessage'))
      return {
        type: 'human',
        content: stringifyContent(obj.content ?? obj.lc_kwargs?.content),
      };
    if (obj.lc_namespace.includes('AIMessage'))
      return {
        type: 'ai',
        content: stringifyContent(obj.content ?? obj.lc_kwargs?.content),
      };
  }
  if (obj.role === 'user' || obj.role === 'human')
    return { type: 'human', content: stringifyContent(obj.content) };
  if (obj.role === 'assistant' || obj.role === 'ai')
    return { type: 'ai', content: stringifyContent(obj.content) };
  return null;
}

function formatChatHistory(history: any[] = []): (HumanMessage | AIMessage)[] {
  return (history || [])
    .map(toRawMessage)
    .filter((msg): msg is RawMessage => !!msg)
    .map((msg) => rawToMessage(msg))
    .filter((msg): msg is HumanMessage | AIMessage => {
      if (!(msg instanceof HumanMessage || msg instanceof AIMessage)) {
        console.error(`[ERROR] Invalid LangChain message instance`, msg);
        return false;
      }
      return true;
    });
}

function sanitizeMessages(messages: any[]): any[] {
  if (!Array.isArray(messages)) {
    logger.warn('[Brain API] sanitizeMessages: input not array');
    return [];
  }
  return messages
    .map((msg, index) => {
      if (!msg) return null;
      try {
        if (msg.lc_namespace || msg.lc_serializable)
          return convertToLangChainMessage(msg);
        const newMsg = { ...msg };
        if (newMsg.content && typeof newMsg.content === 'object')
          newMsg.content = stringifyContent(newMsg.content);
        if (newMsg.additional_kwargs?.tool_calls) {
          try {
            const toolCallsJson = JSON.stringify(
              newMsg.additional_kwargs.tool_calls,
            );
            newMsg.additional_kwargs.tool_calls = JSON.parse(toolCallsJson);
          } catch (e) {
            logger.error('[Brain API] Error sanitizing tool_calls:', e);
            newMsg.additional_kwargs = {
              ...newMsg.additional_kwargs,
              tool_calls: undefined,
            };
          }
        }
        return newMsg;
      } catch (e) {
        logger.error(`[Brain API] Error sanitizing message idx ${index}:`, e);
        return null;
      }
    })
    .filter(Boolean);
}

function ensureToolMessageContentIsString(message: UIMessage | any): any {
  if (!message || typeof message !== 'object') return message;
  const isToolMsg =
    message.constructor?.name === 'ToolMessage' ||
    message instanceof ToolMessage ||
    message.lc_namespace?.includes('ToolMessage') ||
    message.tool_call_id !== undefined ||
    message.role === 'tool' ||
    message.additional_kwargs?.name;
  if (isToolMsg) {
    logger.debug('[Brain API DEBUG] Tool message, ensuring string content...');
    try {
      const newMessage = JSON.parse(JSON.stringify(message));
      const contentToProcess = message.content;
      if (typeof contentToProcess === 'object' && contentToProcess !== null) {
        newMessage.content =
          contentToProcess.content !== undefined
            ? stringifyContent(contentToProcess.content)
            : JSON.stringify(contentToProcess);
      } else {
        newMessage.content = String(contentToProcess || '');
      }
      logger.debug(
        '[Brain API DEBUG] Final tool msg content preview:',
        `${String(newMessage.content).substring(0, 50)}...`,
      );
      return newMessage;
    } catch (error) {
      logger.error('[Brain API DEBUG] Error processing ToolMessage:', error);
      return {
        ...message,
        content:
          typeof message.content === 'string'
            ? message.content
            : 'Error processing tool content',
      };
    }
  }
  return message;
}

function ensureStringContent(msg: any): any {
  if (!msg) return msg;
  try {
    const newMsg = structuredClone(msg);
    if (newMsg.content !== undefined)
      newMsg.content = stringifyContent(newMsg.content);
    return newMsg;
  } catch (e) {
    const newMsgFallback = { ...msg };
    if (newMsgFallback.content !== undefined)
      newMsgFallback.content = stringifyContent(newMsgFallback.content);
    return newMsgFallback;
  }
}

function processAttachments(message: any): string {
  if (!message?.attachments?.length) return '';
  logger.info(
    `[Brain API] Processing ${message.attachments.length} attachments`,
  );
  return message.attachments
    .map((attachment: any, index: number) => {
      const fileName = attachment.name || 'unknown file';
      let extractedContent = attachment.metadata?.extractedContent;
      extractedContent = stringifyContent(extractedContent);
      if (extractedContent.length > 10000)
        extractedContent = `${extractedContent.substring(0, 10000)}... [truncated]`;
      return `\n\nFile attachment ${index + 1}: ${fileName}\nContent: ${extractedContent || 'N/A'}\n`;
    })
    .join('');
}

async function getAvailableTools(
  clientConfig?: ClientConfig | null,
): Promise<any[]> {
  logger.info('[Brain API] Initializing available tools...');
  if (!Array.isArray(availableTools)) {
    logger.error('[Brain API] availableTools is not an array');
    return [];
  }
  if (!clientConfig?.configJson?.tool_configs) {
    logger.info('[Brain API] Using default tool configurations.');
    return availableTools;
  }
  const toolConfigs = clientConfig.configJson.tool_configs;
  logger.info(
    `[Brain API] Client-specific tool configs: ${Object.keys(toolConfigs).join(', ')}`,
  );
  global.CURRENT_TOOL_CONFIGS = {};
  if (toolConfigs.n8n) {
    global.CURRENT_TOOL_CONFIGS.n8n = {
      webhookUrl: toolConfigs.n8n.webhookUrl || process.env.N8N_WEBHOOK_URL,
      apiKey: toolConfigs.n8n.apiKey || process.env.N8N_API_KEY,
      ...toolConfigs.n8n,
    };
    logger.info('[Brain API] n8nMcpGateway configured.');
  }
  if (toolConfigs.tavily) {
    global.CURRENT_TOOL_CONFIGS.tavily = toolConfigs.tavily;
    logger.info('[Brain API] tavilySearch configured.');
  }
  logger.info(`[Brain API] Initialized tools with client configs.`);
  return availableTools;
}

export const config = {
  runtime: 'edge',
  unstable_allowDynamic: ['**/node_modules/**'],
};

declare global {
  var CURRENT_TOOL_CONFIGS: Record<string, any>;
  var CURRENT_REQUEST_BODY: {
    referencedChatId?: string | null;
    referencedGlobalPaneChatId?: string | null;
    currentActiveSpecialistId?: string | null;
    isFromGlobalPane?: boolean;
  } | null;
}

type AdapterCallbacks = {
  onStart?: () => Promise<void>;
  onToken?: (token: string) => Promise<void>;
  onCompletion?: (completion: string) => Promise<void>;
  onFinal?: (completion: string) => Promise<void>;
};

// Utility: Convert AsyncIterable<string> to ReadableStream<string>
function asyncIterableToReadableStreamString(
  iterable: AsyncIterable<string>,
): ReadableStream<string> {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(
          typeof value === 'string' ? value : JSON.stringify(value),
        );
      }
    },
    cancel() {
      if (iterator.return) iterator.return();
    },
  });
}

// Utility: Convert ReadableStream<string> to AsyncIterable<string> (if needed)
async function* readableStreamToAsyncIterable(
  stream: ReadableStream<string>,
): AsyncIterable<string> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        yield value;
      } else {
        // Optionally: yield an empty string or throw an error
        yield '';
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: NextRequest) {
  assistantMessageSaved = false;
  try {
    let reqBody: {
      messages?: any[];
      id?: string;
      selectedChatModel?: string;
      fileContext?: any;
      activeBitContextId?: string | null;
      currentActiveSpecialistId?: string | null;
      activeBitPersona?: string | null;
      activeDocId?: string | null;
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

    const {
      messages,
      id: chatIdFromRequest,
      selectedChatModel,
      fileContext,
      currentActiveSpecialistId = null,
      activeBitContextId = null,
      activeBitPersona = null,
      activeDocId = null,
      isFromGlobalPane = false,
      referencedChatId = null,
      mainUiChatId = null,
      referencedGlobalPaneChatId = null,
      userTimezone = 'UTC',
    } = reqBody;

    if (!chatIdFromRequest) {
      logger.error('Chat ID missing!');
      return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
    }

    const safeMessagesInput = Array.isArray(messages)
      ? messages.map(ensureToolMessageContentIsString)
      : [];
    if (!safeMessagesInput?.length)
      return NextResponse.json({ error: 'Missing messages' }, { status: 400 });

    const lastMessage = safeMessagesInput[safeMessagesInput.length - 1];
    const userMessageContent = stringifyContent(lastMessage.content);
    const historyInput = safeMessagesInput.slice(0, -1);

    const authSession = await auth();
    const userId = authSession?.user?.id;
    const sessionClientId = (authSession?.user as any)?.clientId;
    if (!userId && !BYPASS_AUTH_FOR_TESTING) {
      logger.error('User ID not found!');
      return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    }
    const effectiveUserId = userId || 'test-user-id';
    const effectiveClientId = sessionClientId || 'default';
    logger.info(`User ID: ${effectiveUserId}, Client ID: ${effectiveClientId}`);

    const clientConfig = await getClientConfig(effectiveClientId);
    if (clientConfig)
      logger.info(`[Brain API] Loaded config for client: ${clientConfig.name}`);
    else
      logger.warn(
        `[Brain API] Could not load config for client: ${effectiveClientId}.`,
      );

    let currentNormalizedChatId = chatIdFromRequest;
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(currentNormalizedChatId)) {
      logger.warn(
        `Provided chatId '${currentNormalizedChatId}' not UUID. Generating new.`,
      );
      currentNormalizedChatId = randomUUID();
    }

    try {
      // 1. Ensure the Chat exists (ON CONFLICT DO NOTHING handles if it already does)
      await sql`
        INSERT INTO "Chat"(id, "userId", title, "createdAt", client_id, "bitContextId")
        VALUES (${currentNormalizedChatId}, ${effectiveUserId}, ${userMessageContent.substring(0, 100)}, ${new Date().toISOString()}, ${effectiveClientId}, ${activeBitContextId || CHAT_BIT_CONTEXT_ID})
        ON CONFLICT (id) DO NOTHING
      `;
      logger.info(
        `[Brain API] Ensured Chat row exists for ${currentNormalizedChatId}`,
      );

      // 2. Now it's safe to insert the user message
      const userMessageId =
        lastMessage.id && uuidPattern.test(lastMessage.id)
          ? lastMessage.id
          : randomUUID();
      await sql`
        INSERT INTO "Message_v2"(id, "chatId", role, parts, attachments, "createdAt", client_id)
        VALUES (${userMessageId}, ${currentNormalizedChatId}, 'user', ${JSON.stringify(lastMessage.parts || [{ type: 'text', text: userMessageContent }])} , ${JSON.stringify(lastMessage.attachments || [])}, ${new Date(lastMessage.createdAt || Date.now()).toISOString()}, ${effectiveClientId})
        ON CONFLICT (id) DO NOTHING
      `;
      logger.info(
        `[Brain API] User message ${userMessageId} saved for chat ${currentNormalizedChatId}`,
      );
    } catch (dbError: any) {
      if (dbError.code === '23505') {
        logger.warn(
          `[Brain API] Message or Chat already exists or conflict on save for chat ${currentNormalizedChatId}. Detail: ${dbError.detail}`,
        );
      } else if (dbError.code === '23503') {
        logger.error(
          `[Brain API] Foreign key violation for chat ${currentNormalizedChatId}. This should not happen if Chat is created first. Detail: ${dbError.detail}`,
        );
      } else {
        logger.error('[Brain API] DB Error chat/message ops:', dbError);
      }
    }

    const effectiveContextId = isFromGlobalPane
      ? GLOBAL_ORCHESTRATOR_CONTEXT_ID
      : currentActiveSpecialistId || activeBitContextId || CHAT_BIT_CONTEXT_ID;
    global.CURRENT_REQUEST_BODY = {
      referencedChatId: isFromGlobalPane
        ? referencedChatId || mainUiChatId
        : currentNormalizedChatId,
      referencedGlobalPaneChatId: isFromGlobalPane
        ? currentNormalizedChatId
        : referencedGlobalPaneChatId,
      currentActiveSpecialistId: effectiveContextId,
      isFromGlobalPane,
    };

    const llm = initializeLLM(effectiveContextId);
    const tools = await getAvailableTools(clientConfig);

    const now = DateTime.now().setZone(userTimezone);
    const currentDateTime = `${now.toLocaleString(DateTime.DATE_FULL)} ${now.toLocaleString(DateTime.TIME_SIMPLE)} (${userTimezone})`;
    const promptModelIdForLoadPrompt =
      effectiveContextId === GLOBAL_ORCHESTRATOR_CONTEXT_ID
        ? 'global-orchestrator'
        : selectedChatModel || 'gpt-4';
    const finalSystemPrompt = loadPrompt({
      modelId: promptModelIdForLoadPrompt,
      contextId: effectiveContextId,
      clientConfig,
      currentDateTime,
    });
    const dateTimeInjectionString = `IMPORTANT CONTEXT: The current date is ${now.toLocaleString(DateTime.DATE_FULL)} (ISO: ${now.toISODate()}), and the current time is ${now.toLocaleString(DateTime.TIME_SIMPLE)} (ISO: ${now.toISOTime()?.substring(0, 8)} ${userTimezone}). You MUST use this information for any queries that are time-sensitive.`;
    const fullSystemPrompt = `${dateTimeInjectionString}\n\n${finalSystemPrompt}`;

    const activeSpecialistConfig = specialistRegistry[effectiveContextId];
    const currentTools = activeSpecialistConfig
      ? tools.filter((tool) =>
          activeSpecialistConfig.defaultTools.includes((tool as any).name),
        )
      : tools;

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', fullSystemPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);
    const agent = await createOpenAIToolsAgent({
      llm,
      tools: currentTools,
      prompt: promptTemplate,
    });
    const baseAgentExecutor = new AgentExecutor({
      agent,
      tools: currentTools,
      returnIntermediateSteps: true,
      verbose: true,
      maxIterations: 10,
    });
    const finalExecutor = EnhancedAgentExecutor.fromExecutor(
      baseAgentExecutor,
      {
        enforceToolCalls: true,
        verbose: true,
      },
    );

    const formattedHistory = formatChatHistory(historyInput);
    const processedHistory = processHistory(
      formattedHistory,
      userMessageContent,
      {
        maxMessages: 10,
        detectRepeatedQueries: true,
        repeatedQueryTags: [
          'calendar',
          'schedule',
          'n8n',
          'event',
          'meeting',
          'asana',
          'task',
        ],
      },
    );
    const directInstances = processedHistory.map((msg) =>
      msg instanceof HumanMessage
        ? new HumanMessage({ content: stringifyContent(msg.content) })
        : new AIMessage({ content: stringifyContent(msg.content) }),
    );

    let combinedMessage = userMessageContent;
    const contextPrefix = `[CONTEXT: ${effectiveContextId}] `;
    combinedMessage = `${contextPrefix}${combinedMessage}`;
    const fileContextStringContent = fileContext?.extractedText
      ? `\n\nFILE CONTEXT:\nFilename: ${fileContext.filename}\nContent Type: ${fileContext.contentType}\nCONTENT:\n${stringifyContent(fileContext.extractedText)}\n### END FILE CONTEXT ###\n`
      : '';
    combinedMessage += fileContextStringContent;
    combinedMessage += processAttachments(lastMessage);

    const debugHandler = new DebugCallbackHandler();
    logger.info('[Brain API] Starting LangChain agent execution');

    const langChainAsyncIterable = await finalExecutor.stream(
      {
        input: combinedMessage,
        chat_history: directInstances,
        activeBitContextId: effectiveContextId || null,
      },
      { callbacks: [debugHandler] },
    );

    // Define adapterCallbacks if not already defined
    const adapterCallbacks = {
      onStart: async () => {
        logger.info(
          `[Brain API via Adapter] Stream started for chat ID: ${currentNormalizedChatId}`,
        );
        assistantMessageSaved = false;
      },
      onToken: async (token: string) => {
        /* logger.debug(`Token: ${token}`); */
      },
      onCompletion: async (completion: string) => {
        logger.info('[Brain API via Adapter] Stream completed.');
        if (!completion?.trim()) {
          logger.info(`Skipping empty response.`);
          return;
        }
        if (assistantMessageSaved) {
          logger.info(`Assistant message already saved.`);
          return;
        }
        assistantMessageSaved = true;
        logger.info('Saving final assistant message.');
        try {
          const assistantId = randomUUID();
          const assistantMessageToSave: Omit<DBMessage, 'content'> = {
            id: assistantId,
            chatId: currentNormalizedChatId,
            role: 'assistant',
            parts: [{ type: 'text', text: completion }],
            attachments: [],
            createdAt: new Date(),
            clientId: effectiveClientId,
          };
          await sql`INSERT INTO "Message_v2" (id, "chatId", role, parts, attachments, "createdAt", client_id) VALUES (${assistantMessageToSave.id}, ${assistantMessageToSave.chatId}, ${assistantMessageToSave.role}, ${JSON.stringify(assistantMessageToSave.parts)}, ${JSON.stringify(assistantMessageToSave.attachments)}, ${assistantMessageToSave.createdAt.toISOString()}, ${assistantMessageToSave.clientId}) ON CONFLICT (id) DO NOTHING`;
          logger.info(
            `Saved/updated assistant message for chat ${currentNormalizedChatId}`,
          );
        } catch (dbError: any) {
          if (dbError.code === '23505') {
            logger.warn(
              `[Brain API] Assistant message for chat ${currentNormalizedChatId} already exists or conflict on save. Detail: ${dbError.detail}`,
            );
          } else {
            logger.error(
              `FAILED to save assistant message for chat ${currentNormalizedChatId}:`,
              dbError,
            );
          }
        }
      },
    };

    // Create a properly formatted SSE stream from the LangChain async iterable
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = '';

        try {
          for await (const chunk of langChainAsyncIterable) {
            // Process the chunk
            const content =
              typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
            fullText += content;

            // Format as the AI SDK expects: data: code:JSON
            // The format is: data: 0:{"text":"content"}\n\n
            // Where 0 is the code for "text" type
            const formattedLine = `data: 0:${JSON.stringify({ text: content })}\n\n`;
            controller.enqueue(encoder.encode(formattedLine));

            // Check if chunk contains tool call information
            if (typeof chunk === 'object' && chunk !== null) {
              const chunkStr = JSON.stringify(chunk);
              if (
                chunkStr.includes('tool_call') ||
                chunkStr.includes('toolCall') ||
                chunkStr.includes('function_call')
              ) {
                logger.info('[Brain API] Tool call detected in stream');
                // Send tool call event in the format expected by the client
                // Code 7 is for tool calls based on the AI SDK
                const formattedToolCall = `data: 7:${JSON.stringify({ tool_call: chunk })}\n\n`;
                controller.enqueue(encoder.encode(formattedToolCall));
              }
            }
          }

          // Call onCompletion callback
          if (adapterCallbacks.onCompletion) {
            await adapterCallbacks.onCompletion(fullText);
          }
        } catch (error) {
          logger.error('[Brain API] Error in stream processing:', error);
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          // Code 3 is for errors based on the AI SDK
          const formattedError = `data: 3:${JSON.stringify(errorMessage)}\n\n`;
          controller.enqueue(encoder.encode(formattedError));
        } finally {
          controller.close();
        }
      },
    });

    // Return the Response with the proper SSE headers
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    logger.error('[Brain API Global Error]', error);
    if (error instanceof NextResponse) {
      throw error;
    }
    return NextResponse.json(
      {
        error: `An internal server error occurred: ${error.message || String(error)}`,
      },
      { status: 500 },
    );
  }
}
