/**
 * Simple LangGraph Wrapper - PROPERLY IMPLEMENTED WITH LANGGRAPH API
 *
 * Provides a true LangGraph implementation with proper state management,
 * node definitions, and TypeScript compatibility.
 */

import type { ChatOpenAI } from '@langchain/openai';
import {
  type AIMessage,
  type ToolMessage,
  type BaseMessage,
  ToolMessage as ToolMessageClass,
} from '@langchain/core/messages';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { RequestLogger } from '../../services/observabilityService';
import { v4 as uuidv4 } from 'uuid';

// UI message type with proper metadata
interface UIMessage {
  id: string;
  name: string;
  props: Record<string, any>;
  metadata?: {
    message_id?: string;
    toolCallId?: string;
    toolName?: string;
  };
}

/**
 * Graph State Annotation - properly defined for LangGraph
 */
const GraphStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[] = [], y: BaseMessage[] = []) => x.concat(y),
    default: () => [],
  }),
  input: Annotation<string>({
    reducer: (x?: string, y?: string) => y ?? x ?? '',
    default: () => '',
  }),
  agent_outcome: Annotation<AIMessage | undefined>({
    reducer: (x?: AIMessage, y?: AIMessage) => y ?? x,
    default: () => undefined,
  }),
  ui: Annotation<UIMessage[]>({
    reducer: (x: UIMessage[] = [], y: UIMessage[] = []) => {
      const existingIds = new Set(x.map((ui) => ui.id));
      const filtered = y.filter((ui) => !existingIds.has(ui.id));
      return [...x, ...filtered];
    },
    default: () => [],
  }),
  _lastToolExecutionResults: Annotation<any[]>({
    reducer: (x: any[] = [], y: any[] = []) => [...x, ...y],
    default: () => [],
  }),
});

type GraphState = typeof GraphStateAnnotation.State;

/**
 * Configuration for the LangGraph wrapper
 */
export interface LangGraphWrapperConfig {
  systemPrompt: string;
  llm: ChatOpenAI;
  tools: any[];
  logger: RequestLogger;
  forceToolCall?: { name: string } | 'required' | null;
}

/**
 * SimpleLangGraphWrapper - Proper LangGraph Implementation
 */
export class SimpleLangGraphWrapper {
  private config: LangGraphWrapperConfig;
  private llm: ChatOpenAI;
  private tools: any[];
  private logger: RequestLogger;
  private graph: any; // Use any for the compiled graph to avoid complex type issues

  constructor(config: LangGraphWrapperConfig) {
    this.config = config;
    this.llm = config.llm;
    this.tools = config.tools;
    this.logger = config.logger;

    // Initialize and compile the LangGraph immediately
    this.graph = this.initializeAndCompileGraph();
  }

  /**
   * Initialize and compile the LangGraph with proper state and nodes
   */
  private initializeAndCompileGraph(): any {
    try {
      this.logger.info('Initializing LangGraph with proper state management', {
        toolCount: this.tools.length,
        model: this.llm.modelName,
      });

      // Create the graph builder using the annotation
      const workflow = new StateGraph(GraphStateAnnotation);

      // Add nodes with consistent string identifiers
      workflow.addNode('agent', this.callModelNode.bind(this));
      workflow.addNode('tools', this.executeToolsNode.bind(this));

      // Add edges using START and proper node names - using type assertions to bypass API incompatibilities
      (workflow as any).addEdge(START, 'agent');

      // Add conditional edge from agent
      (workflow as any).addConditionalEdges(
        'agent',
        this.shouldExecuteTools.bind(this),
        {
          use_tools: 'tools',
          finish: END,
        },
      );

      // Add edge from tools back to agent
      (workflow as any).addEdge('tools', 'agent');

      // Compile the graph
      const compiledGraph = workflow.compile();

      this.logger.info('LangGraph compiled successfully', {
        nodes: ['agent', 'tools'],
        edges: [
          'START->agent',
          'agent->tools (conditional)',
          'agent->END (conditional)',
          'tools->agent',
        ],
      });

      return compiledGraph;
    } catch (error) {
      this.logger.error('Failed to initialize LangGraph', { error });
      throw error;
    }
  }

  /**
   * LLM Interaction Node
   * Handles LLM calls with tools bound
   */
  private async callModelNode(state: GraphState): Promise<Partial<GraphState>> {
    try {
      this.logger.info('[LangGraph Agent] Calling LLM...', {
        messageCount: state.messages.length,
        hasTools: this.tools.length > 0,
        toolCount: this.tools.length,
        forceToolCall: this.config.forceToolCall,
      });

      // Enhanced tool binding diagnostics
      if (this.tools.length > 0) {
        const toolNames = this.tools.map((t) => t.name || 'unnamed');
        this.logger.info('[LangGraph Agent] Available tools for binding:', {
          toolNames,
          toolDetails: this.tools.map((t) => ({
            name: t.name,
            description: t.description?.substring(0, 100) || 'No description',
            hasSchema: !!t.schema,
          })),
        });
      } else {
        this.logger.warn(
          '[LangGraph Agent] NO TOOLS AVAILABLE - This explains why no tools are called!',
        );
      }

      // Bind tools to LLM for structured tool calling
      let llmWithTools = this.llm.bindTools(this.tools);

      // Get current messages from state
      const currentMessages = state.messages;

      // Check if this is the first agent call (no AI messages yet) or if we've already executed tools
      const hasAIResponses = currentMessages.some((m) => m._getType() === 'ai');
      const hasToolExecutions = currentMessages.some(
        (m) => m._getType() === 'tool',
      );

      // NEW: Apply tool forcing from QueryClassifier - bind with tool_choice
      if (this.config.forceToolCall && !hasToolExecutions) {
        this.logger.info(
          '[LangGraph Agent] 🚀 APPLYING TOOL FORCING from QueryClassifier',
          {
            forceToolCall: this.config.forceToolCall,
            reason: 'Tool forcing directive from classifier',
          },
        );

        let toolChoiceOption: any = undefined;

        if (
          typeof this.config.forceToolCall === 'object' &&
          this.config.forceToolCall !== null &&
          'name' in this.config.forceToolCall
        ) {
          // Force a specific tool (e.g., createDocument)
          const toolName = this.config.forceToolCall.name;
          const targetTool = this.tools.find((t) => t.name === toolName);
          if (targetTool) {
            this.logger.info(
              `[LangGraph Agent] Forcing specific tool: ${toolName}`,
            );
            toolChoiceOption = toolName; // LangChain.js expects just the tool name for specific tool forcing
          } else {
            this.logger.warn(
              `[LangGraph Agent] Requested tool '${toolName}' not found in available tools. Using 'required' instead.`,
            );
            toolChoiceOption = 'required';
          }
        } else if (this.config.forceToolCall === 'required') {
          // Force any tool call
          this.logger.info(
            '[LangGraph Agent] Forcing any tool call (required)',
          );
          toolChoiceOption = 'required';
        }

        if (toolChoiceOption) {
          // Re-bind tools with tool_choice option
          // Try different formats to see which one works
          this.logger.info(
            `[LangGraph Agent] Attempting to bind tools with tool_choice: ${toolChoiceOption}`,
          );

          try {
            // First try: just the tool name (as per docs)
            llmWithTools = this.llm.bindTools(this.tools, {
              tool_choice: toolChoiceOption,
            });
            this.logger.info(
              '[LangGraph Agent] ✅ Successfully bound tools with tool_choice (name format):',
              {
                tool_choice: toolChoiceOption,
              },
            );
          } catch (error) {
            this.logger.error(
              '[LangGraph Agent] Failed to bind with tool name, trying OpenAI format:',
              error,
            );

            // Fallback: try OpenAI format
            if (
              typeof toolChoiceOption === 'string' &&
              toolChoiceOption !== 'required'
            ) {
              llmWithTools = this.llm.bindTools(this.tools, {
                tool_choice: {
                  type: 'function',
                  function: { name: toolChoiceOption },
                },
              });
              this.logger.info(
                '[LangGraph Agent] ✅ Successfully bound tools with tool_choice (OpenAI format)',
              );
            } else {
              llmWithTools = this.llm.bindTools(this.tools, {
                tool_choice: 'required',
              });
              this.logger.info(
                '[LangGraph Agent] ✅ Successfully bound tools with tool_choice (required)',
              );
            }
          }
        }
      } else {
        this.logger.info('[LangGraph Agent] No tool forcing applied', {
          hasForceToolCall: !!this.config.forceToolCall,
          hasToolExecutions,
          reason: this.config.forceToolCall
            ? 'Already executed tools'
            : 'No force directive',
        });
      }

      // Log the actual messages being sent to LLM for diagnosis
      this.logger.info('[LangGraph Agent] Messages being sent to LLM:', {
        messageCount: currentMessages.length,
        lastMessage: (() => {
          const lastMsg = currentMessages[currentMessages.length - 1];
          if (!lastMsg?.content) return 'No content';
          if (typeof lastMsg.content === 'string') {
            return lastMsg.content.substring(0, 200);
          }
          return 'Complex content type';
        })(),
        hasSystemMessage: currentMessages.some(
          (m) => m._getType() === 'system',
        ),
        messageTypes: currentMessages.map((m) => m._getType()),
        toolChoiceApplied: !!this.config.forceToolCall && !hasToolExecutions,
      });

      // Invoke LLM with current conversation
      const response = await llmWithTools.invoke(currentMessages);

      this.logger.info('[LangGraph Agent] LLM Response:', {
        hasToolCalls: (response.tool_calls?.length ?? 0) > 0,
        toolCallCount: response.tool_calls?.length || 0,
        responseLength:
          typeof response.content === 'string' ? response.content.length : 0,
        responsePreview:
          typeof response.content === 'string'
            ? response.content.substring(0, 200)
            : 'Non-string content',
      });

      // Enhanced tool call logging
      if (response.tool_calls && response.tool_calls.length > 0) {
        this.logger.info('Tool calls detected', {
          tools: response.tool_calls.map((tc) => ({
            name: tc.name,
            id: tc.id,
            args: tc.args,
          })),
        });
      } else {
        // Only warn about missing tool calls if we actually expected them
        const toolForcingWasApplied =
          !!this.config.forceToolCall && !hasToolExecutions;
        const isInitialCall = !hasAIResponses; // First LLM call in the conversation

        if (toolForcingWasApplied && isInitialCall) {
          // This is problematic - we forced tools but didn't get any on the initial call
          this.logger.warn(
            '[LangGraph Agent] ⚠️ NO TOOL CALLS DETECTED despite tool forcing on initial call - This indicates a tool forcing issue!',
            {
              responseContentLength:
                typeof response.content === 'string'
                  ? response.content.length
                  : 0,
              availableToolCount: this.tools.length,
              modelName: this.llm.modelName,
              forceToolCall: this.config.forceToolCall,
              hasAIResponses,
              hasToolExecutions,
            },
          );
        } else if (hasToolExecutions && !isInitialCall) {
          // This is normal - final conversational response after tools were executed
          this.logger.info(
            '[LangGraph Agent] ✅ Final conversational response (no tool calls expected after tool execution)',
            {
              responseLength:
                typeof response.content === 'string'
                  ? response.content.length
                  : 0,
              responsePreview:
                typeof response.content === 'string'
                  ? response.content.substring(0, 100)
                  : 'Non-string content',
            },
          );
        } else {
          // No tool forcing applied, no tools expected - normal conversational response
          this.logger.info(
            '[LangGraph Agent] ✅ Conversational response (no tools expected)',
            {
              responseLength:
                typeof response.content === 'string'
                  ? response.content.length
                  : 0,
              toolForcingApplied: toolForcingWasApplied,
            },
          );
        }
      }

      return {
        messages: [response],
        agent_outcome: response,
      };
    } catch (error) {
      this.logger.error('Error in agent node', { error });
      throw error;
    }
  }

  /**
   * Tool Execution Node
   * Handles execution of tools called by the LLM and captures artifact events
   * Now properly parses structured tool outputs and extracts artifact data
   */
  private async executeToolsNode(
    state: GraphState,
    config?: RunnableConfig,
  ): Promise<Partial<GraphState>> {
    this.logger.info('[LangGraph Tools] Starting tool execution...', {
      hasConfig: !!config,
      configurable: config?.configurable
        ? Object.keys(config.configurable)
        : [],
    });

    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      this.logger.warn(
        '[LangGraph Tools] No tool calls found in the last message.',
      );
      return {};
    }

    this.logger.info('[LangGraph Tools] Found tool calls:', {
      tool_calls: lastMessage.tool_calls.map((tc) => ({
        name: tc.name,
        args: tc.args,
        id: tc.id,
      })),
    });

    // --- Prepare tools and tool results array ---
    const toolsByName: Record<string, any> = Object.fromEntries(
      this.tools.map((tool) => [tool.name, tool]),
    );
    const toolExecutionResults: ToolMessage[] = [];
    const uiMessagesForStream: UIMessage[] = [];

    // --- Execute tool calls in parallel ---
    const toolPromises = lastMessage.tool_calls.map(async (toolCall) => {
      const { name: toolName, args: toolArgs, id: toolCallId } = toolCall;
      const targetTool = toolsByName[toolName];

      if (!targetTool) {
        this.logger.error(`[LangGraph Tools] Tool '${toolName}' not found!`);
        return new ToolMessageClass({
          content: `Error: Tool '${toolName}' not found.`,
          tool_call_id: toolCallId ?? uuidv4(),
          name: toolName,
        });
      }

      this.logger.info(`[LangGraph Tools] Executing tool: ${toolName}`, {
        toolCallId,
        args: toolArgs,
        hasConfig: !!config,
        contextKeys: config?.configurable
          ? Object.keys(config.configurable)
          : [],
        configDetails:
          toolName === 'createDocument'
            ? {
                hasDataStream: !!config?.configurable?.dataStream,
                hasSession: !!config?.configurable?.session,
                dataStreamType: typeof config?.configurable?.dataStream,
                sessionType: typeof config?.configurable?.session,
                runId: config?.runId,
              }
            : 'not createDocument tool',
      });

      try {
        // *** THE CORE FIX: Pass config to tool invocation ***
        // This allows tools to access context via getContextVariable
        const rawToolResultString = await targetTool.invoke(toolArgs, config);

        this.logger.info(`[LangGraph Tools] Raw result from '${toolName}':`, {
          result: `${rawToolResultString.substring(0, 300)}...`,
        });

        // --- Handle structured artifact tool results ---
        let summaryForLLM = rawToolResultString; // Default to the raw string
        try {
          const parsedResult = JSON.parse(rawToolResultString);

          if (parsedResult._isQubitArtifactToolResult) {
            this.logger.info(
              `[LangGraph Tools] Tool '${toolName}' is a Qubit Artifact tool. Processing events.`,
            );
            summaryForLLM =
              parsedResult.summaryForLLM ||
              `Tool ${toolName} executed successfully.`;

            // *** THE FIX IS HERE ***
            // The tool already created the correctly formatted UIMessage events.
            // We just need to extract them and add them to our stream queue.
            if (
              Array.isArray(parsedResult.quibitArtifactEvents) &&
              parsedResult.quibitArtifactEvents.length > 0
            ) {
              this.logger.info(
                '[LangGraph Tools] Found valid quibitArtifactEvents array.',
                { count: parsedResult.quibitArtifactEvents.length },
              );

              // Verify the first chunk to ensure contentChunk is present
              const firstChunk = parsedResult.quibitArtifactEvents.find(
                (e: any) => e.props?.eventType === 'artifact-chunk',
              );
              if (firstChunk) {
                this.logger.info(
                  '[LangGraph Tools] First artifact-chunk event has contentChunk:',
                  {
                    content: `${firstChunk.props.contentChunk.substring(0, 50)}...`,
                  },
                );
              }

              // Add the events from the tool directly to our stream queue
              uiMessagesForStream.push(...parsedResult.quibitArtifactEvents);
            } else {
              this.logger.warn(
                '[LangGraph Tools] Qubit Artifact tool did not return any quibitArtifactEvents.',
              );
            }
          }
        } catch (e) {
          // Not a JSON result, or not a Qubit Artifact tool.
          // This is expected for simple tools, so we just log it at a debug level.
          this.logger.info(
            `[LangGraph Tools] Tool '${toolName}' did not return structured JSON. Using raw output for LLM summary.`,
          );
        }

        // --- Create the ToolMessage for the LLM ---
        return new ToolMessageClass({
          content: summaryForLLM,
          tool_call_id: toolCallId ?? uuidv4(),
          name: toolName,
        });
      } catch (error: any) {
        this.logger.error(
          `[LangGraph Tools] Error executing tool '${toolName}':`,
          { error },
        );
        return new ToolMessageClass({
          content: `Error executing tool ${toolName}: ${error.message}`,
          tool_call_id: toolCallId ?? uuidv4(),
          name: toolName,
        });
      }
    });

    // --- Wait for all tool executions to complete ---
    const results = await Promise.all(toolPromises);
    toolExecutionResults.push(...results);

    this.logger.info('[LangGraph Tools] Finished all tool executions.', {
      toolExecutionResultCount: toolExecutionResults.length,
      uiMessagesForStreamCount: uiMessagesForStream.length,
    });

    // --- Return the results to be added to the graph state ---
    return {
      messages: toolExecutionResults,
      ui: uiMessagesForStream, // This will be streamed to the client
    };
  }

  /**
   * Conditional edge function
   * Determines whether to execute tools or end the conversation
   */
  private shouldExecuteTools(state: GraphState): 'use_tools' | 'finish' {
    const agentOutcome = state.agent_outcome;

    if (agentOutcome?.tool_calls && agentOutcome.tool_calls.length > 0) {
      this.logger.info(
        '[LangGraph Router] Tools found, routing to tools node',
        {
          toolCount: agentOutcome.tool_calls.length,
        },
      );
      return 'use_tools';
    } else {
      this.logger.info('[LangGraph Router] No tools found, routing to END');
      return 'finish';
    }
  }

  /**
   * Invoke the graph (for non-streaming use cases)
   */
  async invoke(
    inputMessages: BaseMessage[],
    config?: RunnableConfig,
  ): Promise<GraphState> {
    try {
      this.logger.info('Invoking LangGraph', {
        inputMessageCount: inputMessages.length,
      });

      // Create initial state with all required fields from GraphStateAnnotation
      const initialState: GraphState = {
        messages: inputMessages,
        input:
          inputMessages[inputMessages.length - 1]?.content?.toString() || '',
        agent_outcome: undefined, // Explicitly provide, matches annotation default
        ui: [], // Explicitly provide, matches annotation default
        _lastToolExecutionResults: [], // Explicitly provide, matches annotation default
      };

      // Invoke the compiled graph
      const finalState = await this.graph.invoke(initialState, config);

      this.logger.info('LangGraph invocation completed', {
        finalMessageCount: finalState.messages?.length || 0,
      });

      return finalState;
    } catch (error) {
      this.logger.error('Error invoking LangGraph', { error });
      throw error;
    }
  }

  /**
   * Stream the graph execution (for streaming use cases)
   * Returns AsyncIterable<StreamEvent> for LangChainAdapter
   */
  async *stream(
    inputMessages: BaseMessage[],
    config?: RunnableConfig,
  ): AsyncIterable<any> {
    try {
      this.logger.info('Streaming LangGraph execution', {
        inputMessageCount: inputMessages.length,
      });

      // Create initial state with all required fields from GraphStateAnnotation
      const initialState: GraphState = {
        messages: inputMessages,
        input:
          inputMessages[inputMessages.length - 1]?.content?.toString() || '',
        agent_outcome: undefined, // Explicitly provide, matches annotation default
        ui: [], // Explicitly provide, matches annotation default
        _lastToolExecutionResults: [], // Explicitly provide, matches annotation default
      };

      // Stream events from the compiled graph
      const streamEvents = this.graph.streamEvents(initialState, {
        ...config,
        version: 'v2',
      });

      // Yield each event for LangChainAdapter to process
      for await (const event of streamEvents) {
        yield event;
      }

      this.logger.info('LangGraph streaming completed');
    } catch (error) {
      this.logger.error('Error streaming LangGraph', { error });
      throw error;
    }
  }

  /**
   * Get configuration for compatibility with existing code
   */
  getConfig(): LangGraphWrapperConfig {
    return this.config;
  }
}

/**
 * Factory function to create a SimpleLangGraphWrapper instance
 */
export function createLangGraphWrapper(
  config: LangGraphWrapperConfig,
): SimpleLangGraphWrapper {
  return new SimpleLangGraphWrapper(config);
}
