/**
 * LangGraph Types and Interfaces
 *
 * Common types and interfaces for LangGraph implementations in the Quibit RAG system.
 * Provides typed state management and graph configuration options.
 */

import type { RequestLogger } from '@/lib/services/observabilityService';
import type { ClientConfig } from '@/lib/db/queries';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Base configuration for all LangGraphs
 */
export interface LangGraphConfig {
  selectedChatModel?: string;
  contextId?: string | null;
  clientConfig?: ClientConfig | null;
  enableToolExecution?: boolean;
  maxIterations?: number;
  verbose?: boolean;
  logger: RequestLogger;
}

/**
 * Base state interface that all graph states should extend
 */
export interface BaseGraphState {
  /** Conversation messages */
  messages: BaseMessage[];

  /** Current step in the workflow */
  currentStep?: string;

  /** Error information if any step fails */
  error?: {
    message: string;
    step: string;
    recoverable: boolean;
  };

  /** Results from tool executions */
  toolResults?: Record<string, any>;

  /** Planning information */
  plan?: {
    steps: string[];
    currentStepIndex: number;
    reasoning: string;
  };

  /** Final response content */
  finalResponse?: string;

  /** Metadata for observability */
  metadata?: {
    startTime: number;
    stepTimes: Record<string, number>;
    toolsUsed: string[];
    totalSteps: number;
  };
}

/**
 * Multi-step reasoning graph state
 */
export interface MultiStepReasoningState extends BaseGraphState {
  /** User's original query */
  originalQuery: string;

  /** Decomposed sub-questions */
  subQuestions?: string[];

  /** Answers to sub-questions */
  subAnswers?: Record<string, string>;

  /** Tools that need to be executed */
  pendingToolCalls?: Array<{
    toolName: string;
    parameters: Record<string, any>;
    reasoning: string;
  }>;

  /** Final synthesized answer */
  synthesizedAnswer?: string;
}

/**
 * Knowledge retrieval graph state
 */
export interface KnowledgeRetrievalState extends BaseGraphState {
  /** Search queries to execute */
  searchQueries?: string[];

  /** Retrieved knowledge chunks */
  retrievedKnowledge?: Array<{
    content: string;
    source: string;
    similarity: number;
    metadata: Record<string, any>;
  }>;

  /** Analysis of retrieved content */
  knowledgeAnalysis?: {
    relevantChunks: string[];
    gapsIdentified: string[];
    needsAdditionalSearch: boolean;
  };
}

/**
 * Workflow orchestration graph state
 */
export interface WorkflowState extends BaseGraphState {
  /** Workflow definition */
  workflow?: {
    id: string;
    name: string;
    steps: Array<{
      id: string;
      type: 'tool' | 'llm' | 'condition' | 'human';
      parameters: Record<string, any>;
      dependencies: string[];
    }>;
  };

  /** Step execution results */
  stepResults?: Record<string, any>;

  /** Current workflow status */
  workflowStatus?: 'planning' | 'executing' | 'completed' | 'failed';
}

/**
 * Graph execution result
 */
export interface GraphExecutionResult {
  /** Final state of the graph */
  finalState: BaseGraphState;

  /** Success indicator */
  success: boolean;

  /** Execution metrics */
  metrics: {
    totalTime: number;
    stepCount: number;
    toolCallCount: number;
    tokensUsed?: number;
  };

  /** Execution path taken */
  executionPath: string[];

  /** Stream of events for real-time updates */
  streamEvents?: AsyncIterable<any>;
}

/**
 * Graph node configuration
 */
export interface GraphNodeConfig {
  /** Node name/identifier */
  name: string;

  /** Function to execute for this node */
  func: (state: BaseGraphState) => Promise<Partial<BaseGraphState>>;

  /** Conditions for entering this node */
  condition?: (state: BaseGraphState) => boolean;

  /** Next nodes based on state */
  next?: string | ((state: BaseGraphState) => string | string[]);
}

/**
 * Error recovery strategies
 */
export type ErrorRecoveryStrategy =
  | 'retry'
  | 'skip'
  | 'fallback'
  | 'human_intervention'
  | 'abort';

/**
 * Graph interruption reasons
 */
export type InterruptionReason =
  | 'human_input_required'
  | 'approval_needed'
  | 'error_recovery'
  | 'max_iterations_reached';
