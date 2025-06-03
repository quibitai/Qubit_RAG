/**
 * LangGraph Implementations Index
 *
 * Central export point for all LangGraph implementations and factory functions.
 * Provides a simple interface for creating graphs based on query patterns.
 */

export { BaseLangGraphFactory } from './base';
export type {
  LangGraphConfig,
  BaseGraphState,
  MultiStepReasoningState,
  KnowledgeRetrievalState,
  WorkflowState,
  GraphExecutionResult,
  ErrorRecoveryStrategy,
  InterruptionReason,
} from './types';

// Import the simple graph wrapper implementation for now
// We'll add more sophisticated graphs as we build them
export {
  SimpleLangGraphWrapper,
  createLangGraphWrapper,
} from './simpleLangGraphWrapper';
export type { LangGraphWrapperConfig } from './simpleLangGraphWrapper';

/**
 * Create a LangGraph based on query complexity and patterns
 *
 * This factory function will grow to support different graph types
 * based on the detected patterns from QueryClassifier
 */
export function createGraphForPatterns(
  patterns: string[],
  config: any,
): SimpleLangGraphWrapper {
  // For now, we'll use the simple wrapper for all patterns
  // In the future, this could route to:
  // - MultiStepReasoningGraph for MULTI_STEP patterns
  // - KnowledgeRetrievalGraph for KNOWLEDGE_RETRIEVAL patterns
  // - WorkflowGraph for WORKFLOW patterns
  // - etc.

  return createLangGraphWrapper(config);
}

/**
 * Determine if a query should use LangGraph based on patterns
 */
export function shouldUseLangGraph(patterns: string[]): boolean {
  // Criteria for using LangGraph:
  // - Complex tool operations
  // - Multi-step reasoning needed
  // - Workflow orchestration
  const complexPatterns = [
    'TOOL_OPERATION',
    'MULTI_STEP',
    'REASONING',
    'WORKFLOW',
    'KNOWLEDGE_RETRIEVAL',
  ];

  return patterns.some((pattern) =>
    complexPatterns.some((complex) => pattern.includes(complex)),
  );
}
