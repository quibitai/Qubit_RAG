/**
 * Performance Comparison Service
 *
 * Provides capabilities to compare performance between modern and legacy
 * brain API implementations with detailed metrics and analysis.
 */

import type { RequestLogger } from './observabilityService';
import type { LangChainMetrics } from './langchainBridge';

/**
 * Performance metrics for brain API operations
 */
export interface BrainAPIMetrics {
  // Timing metrics
  totalDuration: number;
  validationTime: number;
  promptLoadingTime: number;
  toolSelectionTime: number;
  agentCreationTime: number;
  executionTime: number;
  streamingSetupTime: number;

  // Resource metrics
  toolCount: number;
  messageCount: number;
  promptLength: number;
  outputLength: number;

  // Implementation details
  implementation: 'modern' | 'legacy';
  model: string;
  contextId: string | null;
  enabledFeatures: string[];

  // Success metrics
  success: boolean;
  errorType?: string;
  correlationId: string;
}

/**
 * Comparison result between implementations
 */
export interface PerformanceComparison {
  modern: BrainAPIMetrics | null;
  legacy: BrainAPIMetrics | null;
  comparison: {
    speedImprovement: number; // Percentage
    toolEfficiency: number; // Tools used vs available
    successRate: number; // Success rate comparison
    memoryUsage?: number; // Memory comparison if available
    features: {
      modernOnly: string[];
      legacyOnly: string[];
      shared: string[];
    };
  };
  recommendation: {
    preferredImplementation: 'modern' | 'legacy' | 'equal';
    confidence: number; // 0-1
    reasoning: string[];
    considerations: string[];
  };
  timestamp: string;
  correlationId: string;
}

/**
 * Performance tracking context
 */
export interface PerformanceContext {
  startTime: number;
  checkpoints: Map<string, number>;
  metrics: Partial<BrainAPIMetrics>;
  logger: RequestLogger;
}

/**
 * Create a performance tracking context
 */
export function createPerformanceContext(
  implementation: 'modern' | 'legacy',
  correlationId: string,
  logger: RequestLogger,
): PerformanceContext {
  return {
    startTime: performance.now(),
    checkpoints: new Map(),
    metrics: {
      implementation,
      correlationId,
      success: false,
      enabledFeatures: [],
    },
    logger,
  };
}

/**
 * Record a performance checkpoint
 */
export function recordCheckpoint(
  context: PerformanceContext,
  name: string,
  additionalData?: Record<string, any>,
): void {
  const currentTime = performance.now();
  const elapsed = currentTime - context.startTime;

  context.checkpoints.set(name, elapsed);

  context.logger.info(`Performance checkpoint: ${name}`, {
    elapsed: `${elapsed.toFixed(2)}ms`,
    implementation: context.metrics.implementation,
    correlationId: context.metrics.correlationId,
    ...additionalData,
  });
}

/**
 * Complete performance tracking and generate metrics
 */
export function completePerformanceTracking(
  context: PerformanceContext,
  success: boolean,
  outputData?: {
    outputLength?: number;
    toolCount?: number;
    messageCount?: number;
    promptLength?: number;
    model?: string;
    contextId?: string | null;
    enabledFeatures?: string[];
    errorType?: string;
  },
): BrainAPIMetrics {
  const totalDuration = performance.now() - context.startTime;

  const metrics: BrainAPIMetrics = {
    // Timing metrics from checkpoints
    totalDuration,
    validationTime: context.checkpoints.get('validation') || 0,
    promptLoadingTime: context.checkpoints.get('prompt_loading') || 0,
    toolSelectionTime: context.checkpoints.get('tool_selection') || 0,
    agentCreationTime: context.checkpoints.get('agent_creation') || 0,
    executionTime: context.checkpoints.get('execution') || 0,
    streamingSetupTime: context.checkpoints.get('streaming_setup') || 0,

    // Resource metrics
    toolCount: outputData?.toolCount || 0,
    messageCount: outputData?.messageCount || 0,
    promptLength: outputData?.promptLength || 0,
    outputLength: outputData?.outputLength || 0,

    // Implementation details
    implementation: context.metrics.implementation || 'modern',
    model: outputData?.model || 'unknown',
    contextId: outputData?.contextId || null,
    enabledFeatures: outputData?.enabledFeatures || [],

    // Success metrics
    success,
    errorType: outputData?.errorType,
    correlationId: context.metrics.correlationId || 'unknown',
  };

  context.logger.info('Performance tracking completed', {
    totalDuration: `${totalDuration.toFixed(2)}ms`,
    success,
    implementation: metrics.implementation,
    toolCount: metrics.toolCount,
    outputLength: metrics.outputLength,
  });

  return metrics;
}

/**
 * Compare two performance metrics
 */
export function comparePerformance(
  modern: BrainAPIMetrics | null,
  legacy: BrainAPIMetrics | null,
  correlationId: string,
): PerformanceComparison {
  // Calculate speed improvement
  let speedImprovement = 0;
  if (modern && legacy && legacy.totalDuration > 0) {
    speedImprovement =
      ((legacy.totalDuration - modern.totalDuration) / legacy.totalDuration) *
      100;
  }

  // Calculate tool efficiency
  let toolEfficiency = 0;
  if (modern && modern.toolCount > 0) {
    toolEfficiency = modern.toolCount; // Simple metric for now
  }

  // Calculate success rate
  let successRate = 0;
  if (modern && legacy) {
    const modernSuccess = modern.success ? 1 : 0;
    const legacySuccess = legacy.success ? 1 : 0;
    successRate = (modernSuccess / Math.max(legacySuccess, 1)) * 100;
  }

  // Analyze features
  const modernFeatures = modern?.enabledFeatures || [];
  const legacyFeatures = legacy?.enabledFeatures || [];
  const modernOnly = modernFeatures.filter((f) => !legacyFeatures.includes(f));
  const legacyOnly = legacyFeatures.filter((f) => !modernFeatures.includes(f));
  const shared = modernFeatures.filter((f) => legacyFeatures.includes(f));

  // Generate recommendation
  let preferredImplementation: 'modern' | 'legacy' | 'equal' = 'equal';
  let confidence = 0.5;
  const reasoning: string[] = [];
  const considerations: string[] = [];

  if (modern && legacy) {
    if (modern.success && !legacy.success) {
      preferredImplementation = 'modern';
      confidence = 0.9;
      reasoning.push('Modern implementation succeeded while legacy failed');
    } else if (!modern.success && legacy.success) {
      preferredImplementation = 'legacy';
      confidence = 0.9;
      reasoning.push('Legacy implementation succeeded while modern failed');
    } else if (modern.success && legacy.success) {
      if (speedImprovement > 20) {
        preferredImplementation = 'modern';
        confidence = 0.8;
        reasoning.push(
          `Modern implementation is ${speedImprovement.toFixed(1)}% faster`,
        );
      } else if (speedImprovement < -20) {
        preferredImplementation = 'legacy';
        confidence = 0.7;
        reasoning.push(
          `Legacy implementation is ${Math.abs(speedImprovement).toFixed(1)}% faster`,
        );
      }

      if (modernOnly.length > legacyOnly.length) {
        reasoning.push(
          `Modern implementation has ${modernOnly.length} additional features`,
        );
        confidence = Math.min(confidence + 0.1, 0.95);
      }
    }
  } else if (modern && !legacy) {
    preferredImplementation = 'modern';
    confidence = 0.6;
    reasoning.push('Only modern implementation available for comparison');
  } else if (!modern && legacy) {
    preferredImplementation = 'legacy';
    confidence = 0.6;
    reasoning.push('Only legacy implementation available for comparison');
  }

  // Add considerations
  if (modern && modern.toolCount > 10) {
    considerations.push('High tool count may impact performance');
  }
  if (modern && modern.outputLength > 5000) {
    considerations.push('Large output may indicate verbose responses');
  }
  if (speedImprovement > -10 && speedImprovement < 10) {
    considerations.push('Performance difference is minimal');
  }

  return {
    modern,
    legacy,
    comparison: {
      speedImprovement,
      toolEfficiency,
      successRate,
      features: {
        modernOnly,
        legacyOnly,
        shared,
      },
    },
    recommendation: {
      preferredImplementation,
      confidence,
      reasoning,
      considerations,
    },
    timestamp: new Date().toISOString(),
    correlationId,
  };
}

/**
 * Log performance comparison results
 */
export function logPerformanceComparison(
  comparison: PerformanceComparison,
  logger: RequestLogger,
): void {
  logger.info('Performance comparison completed', {
    modernDuration: comparison.modern?.totalDuration,
    legacyDuration: comparison.legacy?.totalDuration,
    speedImprovement: `${comparison.comparison.speedImprovement.toFixed(1)}%`,
    preferred: comparison.recommendation.preferredImplementation,
    confidence: comparison.recommendation.confidence,
    reasoning: comparison.recommendation.reasoning,
  });

  // Log detailed metrics if available
  if (comparison.modern) {
    logger.info('Modern implementation metrics', {
      implementation: 'modern',
      success: comparison.modern.success,
      totalDuration: comparison.modern.totalDuration,
      toolCount: comparison.modern.toolCount,
      features: comparison.modern.enabledFeatures,
    });
  }

  if (comparison.legacy) {
    logger.info('Legacy implementation metrics', {
      implementation: 'legacy',
      success: comparison.legacy.success,
      totalDuration: comparison.legacy.totalDuration,
      toolCount: comparison.legacy.toolCount,
      features: comparison.legacy.enabledFeatures,
    });
  }
}

/**
 * Generate performance report for monitoring
 */
export function generatePerformanceReport(
  comparisons: PerformanceComparison[],
): {
  summary: {
    totalComparisons: number;
    modernWins: number;
    legacyWins: number;
    ties: number;
    averageSpeedImprovement: number;
    modernSuccessRate: number;
    legacySuccessRate: number;
  };
  recommendations: {
    rolloutPercentage: number;
    confidence: number;
    blockers: string[];
    benefits: string[];
  };
} {
  const totalComparisons = comparisons.length;
  let modernWins = 0;
  let legacyWins = 0;
  let ties = 0;
  let totalSpeedImprovement = 0;
  let modernSuccesses = 0;
  let legacySuccesses = 0;
  let modernTotal = 0;
  let legacyTotal = 0;

  comparisons.forEach((comparison) => {
    switch (comparison.recommendation.preferredImplementation) {
      case 'modern':
        modernWins++;
        break;
      case 'legacy':
        legacyWins++;
        break;
      case 'equal':
        ties++;
        break;
    }

    totalSpeedImprovement += comparison.comparison.speedImprovement;

    if (comparison.modern) {
      modernTotal++;
      if (comparison.modern.success) modernSuccesses++;
    }
    if (comparison.legacy) {
      legacyTotal++;
      if (comparison.legacy.success) legacySuccesses++;
    }
  });

  const averageSpeedImprovement =
    totalComparisons > 0 ? totalSpeedImprovement / totalComparisons : 0;
  const modernSuccessRate = modernTotal > 0 ? modernSuccesses / modernTotal : 0;
  const legacySuccessRate = legacyTotal > 0 ? legacySuccesses / legacyTotal : 0;

  // Calculate rollout percentage recommendation
  let rolloutPercentage = 10; // Default conservative rollout
  let confidence = 0.5;
  const blockers: string[] = [];
  const benefits: string[] = [];

  if (modernSuccessRate < 0.95) {
    blockers.push(
      `Modern success rate is ${(modernSuccessRate * 100).toFixed(1)}% (below 95%)`,
    );
    rolloutPercentage = 5;
  }

  if (averageSpeedImprovement > 25) {
    benefits.push(
      `Average ${averageSpeedImprovement.toFixed(1)}% performance improvement`,
    );
    rolloutPercentage = Math.min(rolloutPercentage + 20, 50);
    confidence += 0.2;
  }

  if (modernWins > legacyWins * 2) {
    benefits.push(
      `Modern implementation wins ${((modernWins / totalComparisons) * 100).toFixed(1)}% of comparisons`,
    );
    rolloutPercentage = Math.min(rolloutPercentage + 15, 50);
    confidence += 0.1;
  }

  return {
    summary: {
      totalComparisons,
      modernWins,
      legacyWins,
      ties,
      averageSpeedImprovement,
      modernSuccessRate,
      legacySuccessRate,
    },
    recommendations: {
      rolloutPercentage: Math.min(rolloutPercentage, 50), // Cap at 50% for safety
      confidence: Math.min(confidence, 0.95),
      blockers,
      benefits,
    },
  };
}
