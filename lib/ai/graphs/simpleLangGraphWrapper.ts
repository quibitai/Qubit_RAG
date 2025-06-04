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
      });

      // Bind tools to LLM for structured tool calling
      const llmWithTools = this.llm.bindTools(this.tools);

      // Get current messages from state
      const currentMessages = state.messages;

      // Invoke LLM with current conversation
      const response = await llmWithTools.invoke(currentMessages);

      this.logger.info('[LangGraph Agent] LLM Response:', {
        hasToolCalls: (response.tool_calls?.length ?? 0) > 0,
        toolCallCount: response.tool_calls?.length || 0,
        responseLength:
          typeof response.content === 'string' ? response.content.length : 0,
      });

      // Log tool calls if present
      if (response.tool_calls && response.tool_calls.length > 0) {
        this.logger.info('Tool calls detected', {
          tools: response.tool_calls.map((tc) => tc.name),
        });
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
  ): Promise<Partial<GraphState>> {
    try {
      const agentOutcome = state.agent_outcome;

      if (!agentOutcome?.tool_calls || agentOutcome.tool_calls.length === 0) {
        this.logger.warn(
          '[LangGraph Tools] executeToolsNode called but no tool calls found',
        );
        return { messages: [] };
      }

      this.logger.info('[LangGraph Tools] Executing tools...', {
        toolCallCount: agentOutcome.tool_calls.length,
        tools: agentOutcome.tool_calls.map((tc) => tc.name),
      });

      const toolMessages: ToolMessage[] = [];
      const uiEvents: UIMessage[] = [];
      const toolExecutionResults: Array<{
        toolName: string;
        toolCallId: string;
        summaryForLLM: string;
        quibitArtifactEvents: any[];
        executionStatus: 'success' | 'error';
      }> = [];

      // Execute each tool call
      for (const toolCall of agentOutcome.tool_calls) {
        let summaryForLLM = '';
        let quibitArtifactEvents: any[] = [];
        let executionStatus: 'success' | 'error' = 'error';

        try {
          this.logger.info(
            `[LangGraph Tools] Executing tool: ${toolCall.name}`,
            {
              toolCallId: toolCall.id,
              args: toolCall.args,
            },
          );

          // Find the tool function
          const tool = this.tools.find((t) => t.name === toolCall.name);
          if (!tool) {
            throw new Error(`Tool ${toolCall.name} not found`);
          }

          // Clear any existing artifact tracker before tool execution
          const initialTrackerLength =
            global.CREATE_DOCUMENT_CONTEXT?.toolInvocationsTracker?.length || 0;

          // Execute the tool
          const toolExecutionOutputString = await tool.invoke(toolCall.args);

          this.logger.info(
            `[LangGraph Tools] Tool execution completed: ${toolCall.name}`,
            {
              toolCallId: toolCall.id,
              rawOutputLength:
                typeof toolExecutionOutputString === 'string'
                  ? toolExecutionOutputString.length
                  : JSON.stringify(toolExecutionOutputString).length,
            },
          );

          // Parse tool output to extract structured data
          try {
            const parsedOutput = JSON.parse(toolExecutionOutputString);

            if (parsedOutput._isQubitArtifactToolResult === true) {
              // This is a structured tool result with artifact data
              summaryForLLM =
                parsedOutput.summaryForLLM || `Tool ${toolCall.name} executed.`;
              quibitArtifactEvents = parsedOutput.quibitArtifactEvents || [];
              executionStatus = 'success';

              this.logger.info(
                `[LangGraph Tools] Extracted artifact events for ${toolCall.name}`,
                {
                  count: quibitArtifactEvents.length,
                  summaryLength: summaryForLLM.length,
                  hasArtifacts: quibitArtifactEvents.length > 0,
                },
              );

              // Create UI events from artifact events
              for (const artifactEvent of quibitArtifactEvents) {
                const uiEvent: UIMessage = {
                  id: uuidv4(),
                  name: 'document', // Maps to DocumentComponent in ui.tsx
                  props: {
                    documentId: artifactEvent.documentId || 'unknown',
                    title:
                      artifactEvent.title || `Document from ${toolCall.name}`,
                    status: artifactEvent.status || 'complete',
                    eventType: artifactEvent.type,
                    artifactEvent: artifactEvent,
                  },
                  metadata: {
                    message_id: agentOutcome.id,
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                  },
                };
                uiEvents.push(uiEvent);
              }
            } else {
              // Handle tools that don't return the special structure (legacy or non-artifact tools)
              summaryForLLM =
                typeof parsedOutput === 'string'
                  ? parsedOutput
                  : JSON.stringify(parsedOutput);
              executionStatus = 'success';

              this.logger.info(
                `[LangGraph Tools] Tool ${toolCall.name} returned non-structured output`,
                {
                  outputType: typeof parsedOutput,
                  outputLength: summaryForLLM.length,
                },
              );
            }
          } catch (parseError) {
            // Tool output is not JSON or is malformed JSON
            summaryForLLM =
              typeof toolExecutionOutputString === 'string'
                ? toolExecutionOutputString
                : JSON.stringify(toolExecutionOutputString);
            executionStatus = 'success';

            this.logger.info(
              `[LangGraph Tools] Tool ${toolCall.name} returned non-JSON output`,
              {
                outputLength: summaryForLLM.length,
              },
            );
          }

          // Legacy: Check for artifact events in global tracker (for backward compatibility)
          const currentTrackerLength =
            global.CREATE_DOCUMENT_CONTEXT?.toolInvocationsTracker?.length || 0;
          const newLegacyArtifactEvents =
            currentTrackerLength > initialTrackerLength
              ? global.CREATE_DOCUMENT_CONTEXT?.toolInvocationsTracker?.slice(
                  initialTrackerLength,
                )
              : [];

          if (newLegacyArtifactEvents && newLegacyArtifactEvents.length > 0) {
            this.logger.info(
              `Tool ${toolCall.name} generated ${newLegacyArtifactEvents.length} legacy artifact events (global tracker)`,
            );

            // Convert legacy events and add to our quibitArtifactEvents if not already processed
            if (quibitArtifactEvents.length === 0) {
              for (const legacyEvent of newLegacyArtifactEvents) {
                const convertedEvent = {
                  type: 'legacy-artifact-event',
                  originalEvent: legacyEvent,
                  timestamp: new Date().toISOString(),
                };
                quibitArtifactEvents.push(convertedEvent);
              }
            }

            // Clear processed events from global tracker
            if (global.CREATE_DOCUMENT_CONTEXT?.toolInvocationsTracker) {
              global.CREATE_DOCUMENT_CONTEXT.toolInvocationsTracker.splice(
                0,
                currentTrackerLength,
              );
            }
          }

          // Create standard tool message with parsed summary for LLM
          const toolMessage = new ToolMessageClass({
            content: summaryForLLM,
            tool_call_id: toolCall.id ?? '',
          });

          toolMessages.push(toolMessage);
        } catch (error) {
          this.logger.error(
            `[LangGraph Tools] Tool execution failed: ${toolCall.name}`,
            {
              toolCallId: toolCall.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          );

          // Create error summary and tool message
          summaryForLLM = `Error executing ${toolCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          executionStatus = 'error';

          const errorMessage = new ToolMessageClass({
            content: summaryForLLM,
            tool_call_id: toolCall.id ?? '',
          });

          toolMessages.push(errorMessage);
        }

        // Record tool execution result for stream event data
        toolExecutionResults.push({
          toolName: toolCall.name,
          toolCallId: toolCall.id ?? '',
          summaryForLLM,
          quibitArtifactEvents,
          executionStatus,
        });

        this.logger.info(
          `[LangGraph Tools] Tool ${toolCall.name} execution summary`,
          {
            toolCallId: toolCall.id,
            summaryLength: summaryForLLM.length,
            artifactEventCount: quibitArtifactEvents.length,
            status: executionStatus,
            summaryPreview: summaryForLLM.substring(0, 100),
          },
        );
      }

      this.logger.info(`[LangGraph Tools] All tools executed`, {
        totalToolCalls: agentOutcome.tool_calls.length,
        toolMessagesCount: toolMessages.length,
        uiEventsCount: uiEvents.length,
        totalArtifactEvents: toolExecutionResults.reduce(
          (sum, result) => sum + result.quibitArtifactEvents.length,
          0,
        ),
      });

      // Return both messages, UI events, and tool execution results as part of graph state
      // The _lastToolExecutionResults will be accessible to LangGraph's on_tool_end event data
      return {
        messages: toolMessages,
        ui: uiEvents,
        _lastToolExecutionResults: toolExecutionResults,
      };
    } catch (error) {
      this.logger.error('Error in executeToolsNode', { error });
      throw error;
    }
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
