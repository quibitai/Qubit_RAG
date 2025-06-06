import type { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { logger } from '../logger';

/**
 * ObservabilityService
 *
 * Provides comprehensive logging, monitoring, and observability features
 * for the RAG system, including token usage tracking and performance metrics.
 *
 * Log Level Control:
 * - Set LOG_LEVEL=0 for errors only (production recommended)
 * - Set LOG_LEVEL=1 for errors and warnings
 * - Set LOG_LEVEL=2 for errors, warnings, and essential info
 * - Set LOG_LEVEL=3 for all logs including debug details
 *
 * Category Control:
 * - Set DISABLE_LOGS="ObservabilityService,LangGraph" to disable specific categories
 * - Set OBSERVABILITY_QUIET=true to reduce routine operational logs
 */

export interface RequestLogger {
  correlationId: string;
  startTime: number;
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, error?: any) => void;
  logTokenUsage: (usage: TokenUsage) => void;
  logPerformanceMetrics: (metrics: PerformanceMetrics) => void;
  finalize: () => RequestSummary;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  provider: string;
  cost?: number;
}

export interface PerformanceMetrics {
  requestDuration: number;
  streamingDuration?: number;
  tokenGenerationRate?: number;
  memoryUsage?: number;
  toolExecutionTime?: number;
}

export interface RequestSummary {
  correlationId: string;
  duration: number;
  success: boolean;
  tokenUsage?: TokenUsage;
  metrics?: PerformanceMetrics;
  events: LogEvent[];
}

export interface LogEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

/**
 * Configuration for observability logging behavior
 */
interface ObservabilityConfig {
  enableDetailedLogging: boolean;
  enablePerformanceLogging: boolean;
  enableEventCountLogging: boolean;
  enableTokenLogging: boolean;
}

/**
 * Get observability configuration from environment
 */
function getObservabilityConfig(): ObservabilityConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const isQuietMode = process.env.OBSERVABILITY_QUIET === 'true';
  const logLevel = process.env.LOG_LEVEL
    ? Number.parseInt(process.env.LOG_LEVEL, 10)
    : isProduction
      ? 0
      : 2;

  return {
    enableDetailedLogging: !isQuietMode && logLevel >= 3,
    enablePerformanceLogging: !isQuietMode && logLevel >= 2,
    enableEventCountLogging: !isQuietMode && logLevel >= 2,
    enableTokenLogging: !isQuietMode && logLevel >= 1,
  };
}

/**
 * Creates a request-scoped logger with correlation tracking
 */
export function getRequestLogger(req: NextRequest): RequestLogger {
  const correlationId = `req_${nanoid(10)}_${Date.now()}`;
  const startTime = performance.now();
  const events: LogEvent[] = [];
  const config = getObservabilityConfig();
  let tokenUsage: TokenUsage | undefined;
  let performanceMetrics: PerformanceMetrics | undefined;

  const logEvent = (level: LogEvent['level'], message: string, data?: any) => {
    const event: LogEvent = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    events.push(event);

    // Use the centralized logger instead of direct console logging
    // This respects LOG_LEVEL and DISABLE_LOGS environment variables
    const contextualMessage = `[${correlationId}] ${message}`;
    const logData = {
      correlationId,
      data,
      timestamp: event.timestamp,
      userAgent: req?.headers?.get('user-agent') || 'unknown',
      ip:
        req?.headers?.get('x-forwarded-for') ||
        req?.headers?.get('x-real-ip') ||
        'unknown',
    };

    switch (level) {
      case 'info':
        logger.info(
          'ObservabilityService',
          contextualMessage,
          config.enableDetailedLogging ? logData : undefined,
        );
        break;
      case 'warn':
        logger.warn('ObservabilityService', contextualMessage, logData);
        break;
      case 'error':
        logger.error('ObservabilityService', contextualMessage, logData);
        break;
    }
  };

  return {
    correlationId,
    startTime,

    info: (message: string, data?: any) => {
      // Filter routine operational messages in quiet mode
      if (!config.enableDetailedLogging && isRoutineMessage(message)) {
        return;
      }
      logEvent('info', message, data);
    },

    warn: (message: string, data?: any) => logEvent('warn', message, data),

    error: (message: string, error?: any) => {
      const errorData =
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error;
      logEvent('error', message, errorData);
    },

    logTokenUsage: (usage: TokenUsage) => {
      tokenUsage = usage;
      if (config.enableTokenLogging) {
        logEvent('info', 'Token usage recorded', usage);
      }
    },

    logPerformanceMetrics: (metrics: PerformanceMetrics) => {
      performanceMetrics = metrics;
      if (config.enablePerformanceLogging) {
        logEvent('info', 'Performance metrics recorded', metrics);
      }
    },

    finalize: (): RequestSummary => {
      const duration = performance.now() - startTime;
      const success = !events.some((e) => e.level === 'error');

      const summary: RequestSummary = {
        correlationId,
        duration,
        success,
        tokenUsage,
        metrics: performanceMetrics,
        events,
      };

      // Only log completion details if enabled or if there were errors/warnings
      const hasImportantEvents = events.some(
        (e) => e.level === 'error' || e.level === 'warn',
      );
      if (config.enableEventCountLogging || hasImportantEvents) {
        logEvent('info', 'Request completed', {
          duration: `${duration.toFixed(2)}ms`,
          success,
          eventCount: events.length,
          ...(hasImportantEvents && {
            importantEventCount: events.filter((e) => e.level !== 'info')
              .length,
          }),
        });
      }

      return summary;
    },
  };
}

/**
 * Determines if a message is routine operational info that can be filtered in quiet mode
 */
function isRoutineMessage(message: string): boolean {
  const routinePatterns = [
    'Node completed:',
    'Processed \\d+ events',
    'event processing completed',
    'Stream processing completed',
    'Found \\d+ UI events',
    'Invoking LangGraph',
    'LangGraph invocation completed',
    'Creating LangChain agent',
    'LLM initialized successfully',
    'Agent created successfully',
  ];

  return routinePatterns.some((pattern) =>
    new RegExp(pattern, 'i').test(message),
  );
}

/**
 * Tracks token usage across multiple model calls
 */
export class TokenUsageTracker {
  private usage: TokenUsage[] = [];

  add(tokenUsage: TokenUsage): void {
    this.usage.push(tokenUsage);
  }

  getTotalUsage(): TokenUsage {
    if (this.usage.length === 0) {
      return {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model: 'unknown',
        provider: 'unknown',
      };
    }

    return this.usage.reduce((total, current) => ({
      promptTokens: total.promptTokens + current.promptTokens,
      completionTokens: total.completionTokens + current.completionTokens,
      totalTokens: total.totalTokens + current.totalTokens,
      model: total.model === current.model ? total.model : 'multiple',
      provider:
        total.provider === current.provider ? total.provider : 'multiple',
      cost: (total.cost || 0) + (current.cost || 0),
    }));
  }

  getUsageByModel(): Record<string, TokenUsage> {
    const byModel: Record<string, TokenUsage> = {};

    for (const usage of this.usage) {
      const key = `${usage.provider}:${usage.model}`;
      if (!byModel[key]) {
        byModel[key] = { ...usage };
      } else {
        byModel[key].promptTokens += usage.promptTokens;
        byModel[key].completionTokens += usage.completionTokens;
        byModel[key].totalTokens += usage.totalTokens;
        byModel[key].cost = (byModel[key].cost || 0) + (usage.cost || 0);
      }
    }

    return byModel;
  }

  reset(): void {
    this.usage = [];
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private startTime: number;
  private checkpoints: Record<string, number> = {};

  constructor() {
    this.startTime = performance.now();
  }

  checkpoint(name: string): void {
    this.checkpoints[name] = performance.now() - this.startTime;
  }

  getDuration(checkpoint?: string): number {
    if (checkpoint && this.checkpoints[checkpoint]) {
      return this.checkpoints[checkpoint];
    }
    return performance.now() - this.startTime;
  }

  getMetrics(): PerformanceMetrics {
    const duration = this.getDuration();
    return {
      requestDuration: duration,
      streamingDuration: this.checkpoints.streaming,
      toolExecutionTime: this.checkpoints.toolExecution,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
    };
  }
}

/**
 * System health monitoring
 */
export function getSystemHealth(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  memory: { used: number; free: number; percentage: number };
  uptime: number;
} {
  const memoryUsage = process.memoryUsage();
  const totalMemory = memoryUsage.heapTotal;
  const usedMemory = memoryUsage.heapUsed;
  const freeMemory = totalMemory - usedMemory;
  const memoryPercentage = (usedMemory / totalMemory) * 100;

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (memoryPercentage > 90) {
    status = 'unhealthy';
  } else if (memoryPercentage > 75) {
    status = 'degraded';
  }

  return {
    status,
    memory: {
      used: Math.round(usedMemory / 1024 / 1024), // MB
      free: Math.round(freeMemory / 1024 / 1024), // MB
      percentage: Math.round(memoryPercentage),
    },
    uptime: Math.round(process.uptime()),
  };
}
