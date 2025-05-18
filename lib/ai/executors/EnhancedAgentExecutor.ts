import type { AgentExecutor } from 'langchain/agents';
import { AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { DateTime } from 'luxon';

/**
 * Types of queries that always require fresh tool calls
 */
export enum ForceToolCallQueryType {
  Calendar = 'calendar',
  Tasks = 'tasks',
  Events = 'events',
  Asana = 'asana',
  Email = 'email',
  None = 'none',
}

/**
 * Configuration for the enhanced agent executor
 */
export interface EnhancedAgentExecutorConfig {
  /** Whether to enforce tool calls for specified query types */
  enforceToolCalls?: boolean;
  /** Specific tools to enforce for certain query types */
  enforcedTools?: Record<string, string[]>;
  /** Keywords to identify query types */
  queryTypeKeywords?: Record<string, string[]>;
  /** Maximum number of iterations to allow */
  maxIterations?: number;
  /** Whether to trace and log execution steps */
  verbose?: boolean;
}

/**
 * Default configuration for enforced tools
 */
const DEFAULT_ENFORCED_TOOLS: Record<string, string[]> = {
  [ForceToolCallQueryType.Calendar]: ['n8nMcpGateway'],
  [ForceToolCallQueryType.Tasks]: ['n8nMcpGateway'],
  [ForceToolCallQueryType.Events]: ['n8nMcpGateway'],
  [ForceToolCallQueryType.Asana]: ['nativeAsana'],
  [ForceToolCallQueryType.Email]: ['n8nMcpGateway'],
};

/**
 * Default keywords to identify query types
 */
const DEFAULT_QUERY_TYPE_KEYWORDS: Record<string, string[]> = {
  [ForceToolCallQueryType.Calendar]: [
    'calendar',
    'schedule',
    'meeting',
    'appointment',
    'event',
    'remind',
  ],
  [ForceToolCallQueryType.Tasks]: [
    'task',
    'todo',
    'to-do',
    'to do',
    'assignment',
    'project',
  ],
  [ForceToolCallQueryType.Events]: ['event', 'happening', 'scheduled'],
  [ForceToolCallQueryType.Asana]: ['asana', 'task', 'project'],
  [ForceToolCallQueryType.Email]: ['email', 'mail', 'message', 'inbox'],
};

/**
 * Schema for validating user input to detect forced tool call types
 */
export const QueryAnalysisSchema = z.object({
  queryType: z.enum([
    ForceToolCallQueryType.Calendar,
    ForceToolCallQueryType.Tasks,
    ForceToolCallQueryType.Events,
    ForceToolCallQueryType.Asana,
    ForceToolCallQueryType.Email,
    ForceToolCallQueryType.None,
  ]),
  confidence: z.number().min(0).max(1),
  requiresFreshData: z.boolean(),
  timeRelevant: z.boolean(),
  recommendedTools: z.array(z.string()),
  reasoning: z.string(),
});

/**
 * Detects the query type based on keywords and patterns
 * @param query The user query text
 * @param keywords Mapping of query types to relevant keywords
 * @returns The detected query type
 */
function detectQueryType(
  query: string,
  keywords: Record<string, string[]> = DEFAULT_QUERY_TYPE_KEYWORDS,
): ForceToolCallQueryType {
  // Convert to lowercase for case-insensitive matching
  const lowercaseQuery = query.toLowerCase();

  // Check each query type for keyword matches
  for (const [queryType, typeKeywords] of Object.entries(keywords)) {
    // If any keyword for this query type is found, return the query type
    if (typeKeywords.some((keyword) => lowercaseQuery.includes(keyword))) {
      return queryType as ForceToolCallQueryType;
    }
  }

  // No matches found
  return ForceToolCallQueryType.None;
}

/**
 * Enhances an AgentExecutor to enforce tool calls for specific query types,
 * and provide additional smarts for consistent handling of repeated queries.
 */
export class EnhancedAgentExecutor {
  private executor: AgentExecutor;
  private config: EnhancedAgentExecutorConfig;
  private enforcedTools: Record<string, string[]>;
  private queryTypeKeywords: Record<string, string[]>;

  /**
   * Creates a new EnhancedAgentExecutor
   * @param executor The base AgentExecutor to enhance
   * @param config Configuration options
   */
  constructor(
    executor: AgentExecutor,
    config: EnhancedAgentExecutorConfig = {},
  ) {
    this.executor = executor;
    this.config = {
      enforceToolCalls: true,
      maxIterations: executor.maxIterations || 10,
      verbose: executor.verbose || false,
      ...config,
    };

    this.enforcedTools = config.enforcedTools || DEFAULT_ENFORCED_TOOLS;
    this.queryTypeKeywords =
      config.queryTypeKeywords || DEFAULT_QUERY_TYPE_KEYWORDS;
  }

  /**
   * Detect the need for tool calls based on the user query
   * @param query The user's query
   * @returns Analysis of the query and required tools
   */
  private analyzeQuery(query: string) {
    const queryType = detectQueryType(query, this.queryTypeKeywords);
    const recommendedTools = this.enforcedTools[queryType] || [];
    const requiresFreshData = queryType !== ForceToolCallQueryType.None;

    // Time-relevant queries always need fresh data
    const timePatterns = [
      /today/i,
      /tomorrow/i,
      /yesterday/i,
      /next week/i,
      /this week/i,
      /on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /current/i,
      /upcoming/i,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
    ];
    const timeRelevant = timePatterns.some((pattern) => pattern.test(query));

    // Calculate confidence based on keyword matches and time relevance
    let confidence = 0;
    if (queryType !== ForceToolCallQueryType.None) {
      // Base confidence on the number of matching keywords
      const matchingKeywords = this.queryTypeKeywords[queryType].filter(
        (keyword) => query.toLowerCase().includes(keyword.toLowerCase()),
      ).length;
      confidence = Math.min(
        0.5 + matchingKeywords * 0.1 + (timeRelevant ? 0.3 : 0),
        1.0,
      );
    }

    return {
      queryType,
      confidence,
      requiresFreshData,
      timeRelevant,
      recommendedTools,
      reasoning: `Query identified as ${queryType} with ${confidence.toFixed(2)} confidence. ${
        timeRelevant ? 'Contains time-relevant terms. ' : ''
      }${requiresFreshData ? 'Requires fresh data. ' : ''}`,
    };
  }

  /**
   * Create a wrapper message to the LLM to enforce tool use
   * @param analysis Query analysis results
   * @returns A system message to inject before the query
   */
  private createToolUseEnforcementMessage(
    analysis: ReturnType<typeof this.analyzeQuery>,
  ) {
    // Only create enforcement message if we have required tools
    if (analysis.recommendedTools.length === 0) {
      return null;
    }

    const now = DateTime.now();
    const toolList = analysis.recommendedTools.join(', ');

    return new AIMessage({
      content: `[SYSTEM INSTRUCTION: The user's next query requires fresh, real-time data. You MUST use the ${toolList} tool to fetch current information. This is a NEW REQUEST at ${now.toLocaleString(DateTime.DATETIME_FULL)}, so do not rely on any previous results. Always invoke the tool and provide fresh data, not a placeholder response.]`,
    });
  }

  /**
   * Execute the agent with enhanced handling for tool calls
   * @param input Input parameters for the executor
   * @param callbacks Optional callbacks for the execution
   * @returns Result of the execution
   */
  async invoke(input: any, callbacks?: any) {
    // Extract the user query from the input
    const userQuery = input.input || '';

    // Analyze the query to detect if it needs tool enforcement
    const analysis = this.analyzeQuery(userQuery);

    // Modify chat history if enforcing tool calls is enabled
    if (this.config.enforceToolCalls && analysis.requiresFreshData) {
      // Create a tool use enforcement message
      const enforcementMessage = this.createToolUseEnforcementMessage(analysis);

      // Add the enforcement message to the chat history if one was created
      if (enforcementMessage && input.chat_history) {
        input.chat_history = [...input.chat_history, enforcementMessage];
      }

      // Log the modifications if verbose is enabled
      if (this.config.verbose) {
        console.log(`[EnhancedAgentExecutor] Query analysis:`, analysis);
        if (enforcementMessage) {
          console.log(
            '[EnhancedAgentExecutor] Added tool enforcement message to history',
          );
        }
      }
    }

    // Pass through to the original executor
    return this.executor.invoke(input, callbacks);
  }

  /**
   * Stream the agent execution with enhanced handling for tool calls
   * This maintains compatibility with the original AgentExecutor.stream method
   * @param input Input parameters for the executor
   * @param callbacks Optional callbacks for the execution
   * @returns Async iterable with execution chunks
   */
  async *stream(input: any, callbacks?: any): AsyncIterable<any> {
    // Extract the user query from the input
    const userQuery = input.input || '';

    // Analyze the query to detect if it needs tool enforcement
    const analysis = this.analyzeQuery(userQuery);

    // Modify chat history if enforcing tool calls is enabled
    if (this.config.enforceToolCalls && analysis.requiresFreshData) {
      // Create a tool use enforcement message
      const enforcementMessage = this.createToolUseEnforcementMessage(analysis);

      // Add the enforcement message to the chat history if one was created
      if (enforcementMessage && input.chat_history) {
        input.chat_history = [...input.chat_history, enforcementMessage];
      }

      // Log the modifications if verbose is enabled
      if (this.config.verbose) {
        console.log(
          `[EnhancedAgentExecutor] Query analysis (stream):`,
          analysis,
        );
        if (enforcementMessage) {
          console.log(
            '[EnhancedAgentExecutor] Added tool enforcement message to history for streaming',
          );
        }
      }
    }

    // Use a proper async iteration approach instead of yield*
    try {
      const stream = await this.executor.stream(input, callbacks);

      // Manually iterate through the stream and yield each chunk
      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      console.error('[EnhancedAgentExecutor] Error in stream method:', error);
      throw error;
    }
  }

  /**
   * Create an enhanced agent executor from an existing executor
   * @param executor The base agent executor
   * @param config Configuration for the enhanced executor
   * @returns An enhanced agent executor
   */
  static fromExecutor(
    executor: AgentExecutor,
    config: EnhancedAgentExecutorConfig = {},
  ): EnhancedAgentExecutor {
    return new EnhancedAgentExecutor(executor, config);
  }
}
