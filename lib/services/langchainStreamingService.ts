/**
 * LangChainStreamingService
 *
 * Handles streaming callback handlers, token streaming logic, tool invocation tracking,
 * and message saving functionality for LangChain agents.
 * Target: ~140 lines as per roadmap specifications.
 */

import type { RequestLogger } from './observabilityService';
import type { LangChainAgent } from './langchainBridge';

/**
 * Streaming configuration for LangChain
 */
export interface LangChainStreamingConfig {
  enableTokenStreaming?: boolean;
  enableToolTracking?: boolean;
  enableMessageSaving?: boolean;
  bufferSize?: number;
  flushInterval?: number;
  verbose?: boolean;
}

/**
 * Streaming callback data
 */
export interface StreamingCallbackData {
  type: 'token' | 'tool_start' | 'tool_end' | 'agent_action' | 'agent_finish';
  content?: string;
  toolName?: string;
  toolInput?: any;
  toolOutput?: any;
  timestamp: number;
  metadata?: any;
}

/**
 * Streaming metrics
 */
export interface StreamingMetrics {
  totalTokens: number;
  streamingDuration: number;
  toolInvocations: number;
  averageTokenRate: number;
  bufferFlushes: number;
}

/**
 * LangChainStreamingService class
 *
 * Provides centralized streaming management for LangChain agents
 */
export class LangChainStreamingService {
  private logger: RequestLogger;
  private config: LangChainStreamingConfig;
  private streamingMetrics: StreamingMetrics;
  private callbackBuffer: StreamingCallbackData[];
  private startTime: number;

  constructor(logger: RequestLogger, config: LangChainStreamingConfig = {}) {
    this.logger = logger;
    this.config = {
      enableTokenStreaming: true,
      enableToolTracking: true,
      enableMessageSaving: true,
      bufferSize: 100,
      flushInterval: 1000,
      verbose: false,
      ...config,
    };

    this.streamingMetrics = {
      totalTokens: 0,
      streamingDuration: 0,
      toolInvocations: 0,
      averageTokenRate: 0,
      bufferFlushes: 0,
    };

    this.callbackBuffer = [];
    this.startTime = 0;
  }

  /**
   * Create streaming callbacks for LangChain agent
   */
  public createStreamingCallbacks(): any[] {
    this.startTime = performance.now();

    this.logger.info('Creating LangChain streaming callbacks', {
      enableTokenStreaming: this.config.enableTokenStreaming,
      enableToolTracking: this.config.enableToolTracking,
      bufferSize: this.config.bufferSize,
    });

    const callbacks: any[] = [];

    // Token streaming callback
    if (this.config.enableTokenStreaming) {
      callbacks.push({
        handleLLMNewToken: (token: string) => {
          this.handleTokenStream(token);
        },
        handleLLMStart: () => {
          this.handleStreamStart();
        },
        handleLLMEnd: () => {
          this.handleStreamEnd();
        },
      });
    }

    // Tool tracking callback
    if (this.config.enableToolTracking) {
      callbacks.push({
        handleToolStart: (tool: any, input: any) => {
          this.handleToolStart(tool, input);
        },
        handleToolEnd: (output: any) => {
          this.handleToolEnd(output);
        },
        handleToolError: (error: any) => {
          this.handleToolError(error);
        },
      });
    }

    // Agent action callback
    callbacks.push({
      handleAgentAction: (action: any) => {
        this.handleAgentAction(action);
      },
      handleAgentEnd: (result: any) => {
        this.handleAgentEnd(result);
      },
    });

    return callbacks;
  }

  /**
   * Handle token streaming
   */
  private handleTokenStream(token: string): void {
    this.streamingMetrics.totalTokens++;

    const callbackData: StreamingCallbackData = {
      type: 'token',
      content: token,
      timestamp: performance.now(),
    };

    this.addToBuffer(callbackData);

    if (this.config.verbose) {
      this.logger.info('Token streamed', {
        token: token.substring(0, 50),
        totalTokens: this.streamingMetrics.totalTokens,
      });
    }
  }

  /**
   * Handle stream start
   */
  private handleStreamStart(): void {
    this.startTime = performance.now();
    this.logger.info('LangChain streaming started');
  }

  /**
   * Handle stream end
   */
  private handleStreamEnd(): void {
    this.streamingMetrics.streamingDuration =
      performance.now() - this.startTime;
    this.streamingMetrics.averageTokenRate =
      this.streamingMetrics.totalTokens /
      (this.streamingMetrics.streamingDuration / 1000);

    this.logger.info('LangChain streaming completed', {
      duration: `${this.streamingMetrics.streamingDuration.toFixed(2)}ms`,
      totalTokens: this.streamingMetrics.totalTokens,
      averageTokenRate: `${this.streamingMetrics.averageTokenRate.toFixed(2)} tokens/sec`,
    });

    this.flushBuffer();
  }

  /**
   * Handle tool start
   */
  private handleToolStart(tool: any, input: any): void {
    this.streamingMetrics.toolInvocations++;

    const callbackData: StreamingCallbackData = {
      type: 'tool_start',
      toolName: tool.name || 'unknown',
      toolInput: input,
      timestamp: performance.now(),
    };

    this.addToBuffer(callbackData);

    this.logger.info('Tool execution started', {
      toolName: tool.name,
      input:
        typeof input === 'object'
          ? JSON.stringify(input).substring(0, 100)
          : input,
    });
  }

  /**
   * Handle tool end
   */
  private handleToolEnd(output: any): void {
    const callbackData: StreamingCallbackData = {
      type: 'tool_end',
      toolOutput: output,
      timestamp: performance.now(),
    };

    this.addToBuffer(callbackData);

    this.logger.info('Tool execution completed', {
      outputLength: typeof output === 'string' ? output.length : 'non-string',
    });
  }

  /**
   * Handle tool error
   */
  private handleToolError(error: any): void {
    this.logger.error('Tool execution failed', error);
  }

  /**
   * Handle agent action
   */
  private handleAgentAction(action: any): void {
    const callbackData: StreamingCallbackData = {
      type: 'agent_action',
      metadata: {
        tool: action.tool,
        toolInput: action.toolInput,
        log: action.log,
      },
      timestamp: performance.now(),
    };

    this.addToBuffer(callbackData);

    if (this.config.verbose) {
      this.logger.info('Agent action', {
        tool: action.tool,
        inputLength: JSON.stringify(action.toolInput || {}).length,
      });
    }
  }

  /**
   * Handle agent end
   */
  private handleAgentEnd(result: any): void {
    const callbackData: StreamingCallbackData = {
      type: 'agent_finish',
      content: result.output || result.returnValues?.output,
      metadata: result,
      timestamp: performance.now(),
    };

    this.addToBuffer(callbackData);

    this.logger.info('Agent execution completed', {
      hasOutput: !!result.output,
      hasReturnValues: !!result.returnValues,
    });

    this.flushBuffer();
  }

  /**
   * Add callback data to buffer
   */
  private addToBuffer(data: StreamingCallbackData): void {
    this.callbackBuffer.push(data);

    if (this.callbackBuffer.length >= (this.config.bufferSize || 100)) {
      this.flushBuffer();
    }
  }

  /**
   * Flush callback buffer
   */
  private flushBuffer(): void {
    if (this.callbackBuffer.length === 0) return;

    this.streamingMetrics.bufferFlushes++;

    if (this.config.verbose) {
      this.logger.info('Flushing callback buffer', {
        bufferSize: this.callbackBuffer.length,
        flushCount: this.streamingMetrics.bufferFlushes,
      });
    }

    // Process buffered callbacks if needed
    this.processBufferedCallbacks();

    // Clear buffer
    this.callbackBuffer = [];
  }

  /**
   * Process buffered callbacks
   */
  private processBufferedCallbacks(): void {
    // Group callbacks by type for processing
    const groupedCallbacks = this.groupCallbacksByType();

    // Process each group
    for (const [type, callbacks] of Object.entries(groupedCallbacks)) {
      this.processCallbackGroup(type, callbacks);
    }
  }

  /**
   * Group callbacks by type
   */
  private groupCallbacksByType(): Record<string, StreamingCallbackData[]> {
    const grouped: Record<string, StreamingCallbackData[]> = {};

    for (const callback of this.callbackBuffer) {
      if (!grouped[callback.type]) {
        grouped[callback.type] = [];
      }
      grouped[callback.type].push(callback);
    }

    return grouped;
  }

  /**
   * Process callback group
   */
  private processCallbackGroup(
    type: string,
    callbacks: StreamingCallbackData[],
  ): void {
    switch (type) {
      case 'token':
        this.processTokenCallbacks(callbacks);
        break;
      case 'tool_start':
      case 'tool_end':
        this.processToolCallbacks(callbacks);
        break;
      case 'agent_action':
      case 'agent_finish':
        this.processAgentCallbacks(callbacks);
        break;
    }
  }

  /**
   * Process token callbacks
   */
  private processTokenCallbacks(callbacks: StreamingCallbackData[]): void {
    const totalTokens = callbacks.length;
    const content = callbacks.map((c) => c.content).join('');

    if (this.config.verbose) {
      this.logger.info('Processed token batch', {
        tokenCount: totalTokens,
        contentLength: content.length,
      });
    }
  }

  /**
   * Process tool callbacks
   */
  private processToolCallbacks(callbacks: StreamingCallbackData[]): void {
    const toolStarts = callbacks.filter((c) => c.type === 'tool_start').length;
    const toolEnds = callbacks.filter((c) => c.type === 'tool_end').length;

    this.logger.info('Processed tool batch', {
      toolStarts,
      toolEnds,
      totalCallbacks: callbacks.length,
    });
  }

  /**
   * Process agent callbacks
   */
  private processAgentCallbacks(callbacks: StreamingCallbackData[]): void {
    const actions = callbacks.filter((c) => c.type === 'agent_action').length;
    const finishes = callbacks.filter((c) => c.type === 'agent_finish').length;

    this.logger.info('Processed agent batch', {
      actions,
      finishes,
      totalCallbacks: callbacks.length,
    });
  }

  /**
   * Get streaming metrics
   */
  public getMetrics(): StreamingMetrics {
    return { ...this.streamingMetrics };
  }

  /**
   * Reset streaming metrics
   */
  public resetMetrics(): void {
    this.streamingMetrics = {
      totalTokens: 0,
      streamingDuration: 0,
      toolInvocations: 0,
      averageTokenRate: 0,
      bufferFlushes: 0,
    };
    this.callbackBuffer = [];
  }
}

/**
 * Convenience functions for streaming operations
 */

/**
 * Create a LangChainStreamingService instance with default configuration
 */
export function createLangChainStreamingService(
  logger: RequestLogger,
  config?: LangChainStreamingConfig,
): LangChainStreamingService {
  return new LangChainStreamingService(logger, config);
}

/**
 * Quick streaming callback creation utility
 */
export function createStreamingCallbacks(
  logger: RequestLogger,
  config?: LangChainStreamingConfig,
): any[] {
  const service = createLangChainStreamingService(logger, config);
  return service.createStreamingCallbacks();
}
