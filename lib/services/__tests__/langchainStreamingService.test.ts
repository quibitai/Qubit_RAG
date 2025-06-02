/**
 * LangChainStreamingService Unit Tests
 *
 * Testing Milestone 6: LangChain streaming service tests
 * - Streaming callback creation and handling
 * - Token streaming logic
 * - Tool invocation tracking
 * - Metrics collection and performance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LangChainStreamingService,
  createLangChainStreamingService,
  createStreamingCallbacks,
  type LangChainStreamingConfig,
} from '../langchainStreamingService';
import type { RequestLogger } from '../observabilityService';

// Mock logger
const mockLogger: RequestLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  correlationId: 'test-correlation-id',
  startTime: Date.now(),
  logTokenUsage: vi.fn(),
  logPerformanceMetrics: vi.fn(),
  finalize: vi.fn().mockReturnValue({
    correlationId: 'test-correlation-id',
    duration: 100,
    success: true,
    events: [],
  }),
};

describe('LangChainStreamingService', () => {
  let streamingService: LangChainStreamingService;

  beforeEach(() => {
    vi.clearAllMocks();
    streamingService = new LangChainStreamingService(mockLogger);
  });

  describe('createStreamingCallbacks', () => {
    it('should create streaming callbacks with default configuration', () => {
      const callbacks = streamingService.createStreamingCallbacks();

      expect(Array.isArray(callbacks)).toBe(true);
      expect(callbacks.length).toBeGreaterThan(0);
    });

    it('should create callbacks with token streaming enabled', () => {
      const config: LangChainStreamingConfig = {
        enableTokenStreaming: true,
      };

      const streamingService = new LangChainStreamingService(
        mockLogger,
        config,
      );
      const callbacks = streamingService.createStreamingCallbacks();

      // Should have token streaming callback
      const hasTokenCallback = callbacks.some((cb) => cb.handleLLMNewToken);
      expect(hasTokenCallback).toBe(true);
    });

    it('should create callbacks with tool tracking enabled', () => {
      const config: LangChainStreamingConfig = {
        enableToolTracking: true,
      };

      const streamingService = new LangChainStreamingService(
        mockLogger,
        config,
      );
      const callbacks = streamingService.createStreamingCallbacks();

      // Should have tool tracking callbacks
      const hasToolCallbacks = callbacks.some(
        (cb) => cb.handleToolStart || cb.handleToolEnd,
      );
      expect(hasToolCallbacks).toBe(true);
    });

    it('should create agent callbacks by default', () => {
      const callbacks = streamingService.createStreamingCallbacks();

      // Should always have agent callbacks
      const hasAgentCallbacks = callbacks.some(
        (cb) => cb.handleAgentAction || cb.handleAgentEnd,
      );
      expect(hasAgentCallbacks).toBe(true);
    });
  });

  describe('token streaming', () => {
    it('should handle token streaming correctly', () => {
      const callbacks = streamingService.createStreamingCallbacks();
      const tokenCallback = callbacks.find((cb) => cb.handleLLMNewToken);

      if (tokenCallback) {
        // Simulate token streaming
        tokenCallback.handleLLMNewToken('Hello');
        tokenCallback.handleLLMNewToken(' world');

        const metrics = streamingService.getMetrics();
        expect(metrics.totalTokens).toBe(2);
      }
    });

    it('should track streaming start and end', () => {
      const callbacks = streamingService.createStreamingCallbacks();
      const tokenCallback = callbacks.find(
        (cb) => cb.handleLLMStart && cb.handleLLMEnd,
      );

      if (tokenCallback) {
        // Simulate streaming lifecycle
        tokenCallback.handleLLMStart();
        tokenCallback.handleLLMNewToken('test');
        tokenCallback.handleLLMEnd();

        const metrics = streamingService.getMetrics();
        expect(metrics.streamingDuration).toBeGreaterThanOrEqual(0);
        expect(metrics.averageTokenRate).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('tool tracking', () => {
    it('should handle tool start correctly', () => {
      const callbacks = streamingService.createStreamingCallbacks();
      const toolCallback = callbacks.find((cb) => cb.handleToolStart);

      if (toolCallback) {
        // Simulate tool start
        const mockTool = { name: 'testTool' };
        const mockInput = { query: 'test query' };

        toolCallback.handleToolStart(mockTool, mockInput);

        const metrics = streamingService.getMetrics();
        expect(metrics.toolInvocations).toBe(1);
      }
    });

    it('should handle tool end correctly', () => {
      const callbacks = streamingService.createStreamingCallbacks();
      const toolCallback = callbacks.find((cb) => cb.handleToolEnd);

      if (toolCallback) {
        // Simulate tool end
        const mockOutput = 'tool result';

        toolCallback.handleToolEnd(mockOutput);

        // Should log tool completion - check if the correct call was made
        const calls = vi.mocked(mockLogger.info).mock.calls;
        const toolCompletionCall = calls.find(
          (call) => call[0] === 'Tool execution completed',
        );
        expect(toolCompletionCall).toBeDefined();
        expect(toolCompletionCall?.[1]).toMatchObject({
          outputLength: 11,
        });
      }
    });

    it('should handle tool errors', () => {
      const callbacks = streamingService.createStreamingCallbacks();
      const toolCallback = callbacks.find((cb) => cb.handleToolError);

      if (toolCallback) {
        // Simulate tool error
        const mockError = new Error('Tool failed');

        toolCallback.handleToolError(mockError);

        // Should log error
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Tool execution failed',
          mockError,
        );
      }
    });
  });

  describe('agent tracking', () => {
    it('should handle agent actions', () => {
      const callbacks = streamingService.createStreamingCallbacks();
      const agentCallback = callbacks.find((cb) => cb.handleAgentAction);

      if (agentCallback) {
        // Simulate agent action
        const mockAction = {
          tool: 'testTool',
          toolInput: { query: 'test' },
          log: 'Agent thought process',
        };

        agentCallback.handleAgentAction(mockAction);

        // Should handle action properly (no errors)
        expect(mockLogger.error).not.toHaveBeenCalled();
      }
    });

    it('should handle agent end', () => {
      const callbacks = streamingService.createStreamingCallbacks();
      const agentCallback = callbacks.find((cb) => cb.handleAgentEnd);

      if (agentCallback) {
        // Simulate agent end
        const mockResult = {
          output: 'Final response',
          returnValues: { output: 'Final response' },
        };

        agentCallback.handleAgentEnd(mockResult);

        // Should log completion
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Agent execution completed',
          expect.objectContaining({
            hasOutput: true,
            hasReturnValues: true,
          }),
        );
      }
    });
  });

  describe('metrics and performance', () => {
    it('should initialize metrics correctly', () => {
      const metrics = streamingService.getMetrics();

      expect(metrics.totalTokens).toBe(0);
      expect(metrics.streamingDuration).toBe(0);
      expect(metrics.toolInvocations).toBe(0);
      expect(metrics.averageTokenRate).toBe(0);
      expect(metrics.bufferFlushes).toBe(0);
    });

    it('should reset metrics', () => {
      const callbacks = streamingService.createStreamingCallbacks();
      const tokenCallback = callbacks.find((cb) => cb.handleLLMNewToken);

      if (tokenCallback) {
        // Add some metrics
        tokenCallback.handleLLMNewToken('test');

        let metrics = streamingService.getMetrics();
        expect(metrics.totalTokens).toBe(1);

        // Reset metrics
        streamingService.resetMetrics();

        metrics = streamingService.getMetrics();
        expect(metrics.totalTokens).toBe(0);
      }
    });

    it('should track buffer flushes', () => {
      const config: LangChainStreamingConfig = {
        bufferSize: 2, // Small buffer for testing
      };

      const streamingService = new LangChainStreamingService(
        mockLogger,
        config,
      );
      const callbacks = streamingService.createStreamingCallbacks();
      const tokenCallback = callbacks.find((cb) => cb.handleLLMNewToken);

      if (tokenCallback) {
        // Add tokens to trigger buffer flush
        tokenCallback.handleLLMNewToken('token1');
        tokenCallback.handleLLMNewToken('token2');
        tokenCallback.handleLLMNewToken('token3'); // Should trigger flush

        const metrics = streamingService.getMetrics();
        expect(metrics.bufferFlushes).toBeGreaterThan(0);
      }
    });
  });

  describe('configuration options', () => {
    it('should respect disabled token streaming', () => {
      const config: LangChainStreamingConfig = {
        enableTokenStreaming: false,
      };

      const streamingService = new LangChainStreamingService(
        mockLogger,
        config,
      );
      const callbacks = streamingService.createStreamingCallbacks();

      // Should not have token callbacks
      const hasTokenCallback = callbacks.some((cb) => cb.handleLLMNewToken);
      expect(hasTokenCallback).toBe(false);
    });

    it('should respect disabled tool tracking', () => {
      const config: LangChainStreamingConfig = {
        enableToolTracking: false,
      };

      const streamingService = new LangChainStreamingService(
        mockLogger,
        config,
      );
      const callbacks = streamingService.createStreamingCallbacks();

      // Should not have tool callbacks
      const hasToolCallbacks = callbacks.some(
        (cb) => cb.handleToolStart || cb.handleToolEnd,
      );
      expect(hasToolCallbacks).toBe(false);
    });

    it('should use custom buffer size', () => {
      const config: LangChainStreamingConfig = {
        bufferSize: 50,
      };

      const streamingService = new LangChainStreamingService(
        mockLogger,
        config,
      );

      // Should accept custom buffer size without errors
      expect(streamingService).toBeInstanceOf(LangChainStreamingService);
    });
  });

  describe('convenience functions', () => {
    it('should create service with createLangChainStreamingService', () => {
      const service = createLangChainStreamingService(mockLogger);
      expect(service).toBeInstanceOf(LangChainStreamingService);
    });

    it('should work with createStreamingCallbacks utility', () => {
      const config: LangChainStreamingConfig = {
        enableTokenStreaming: true,
        enableToolTracking: true,
      };

      const callbacks = createStreamingCallbacks(mockLogger, config);

      expect(Array.isArray(callbacks)).toBe(true);
      expect(callbacks.length).toBeGreaterThan(0);
    });
  });

  describe('logging and observability', () => {
    it('should log callback creation', () => {
      streamingService.createStreamingCallbacks();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating LangChain streaming callbacks',
        expect.objectContaining({
          enableTokenStreaming: true,
          enableToolTracking: true,
          bufferSize: expect.any(Number),
        }),
      );
    });

    it('should handle verbose logging', () => {
      const config: LangChainStreamingConfig = {
        verbose: true,
      };

      const streamingService = new LangChainStreamingService(
        mockLogger,
        config,
      );
      const callbacks = streamingService.createStreamingCallbacks();
      const tokenCallback = callbacks.find((cb) => cb.handleLLMNewToken);

      if (tokenCallback) {
        tokenCallback.handleLLMNewToken('test token');

        // Should log token details in verbose mode
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Token streamed',
          expect.objectContaining({
            token: expect.any(String),
            totalTokens: expect.any(Number),
          }),
        );
      }
    });
  });
});
