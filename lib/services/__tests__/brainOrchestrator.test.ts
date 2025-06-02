import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { BrainOrchestrator, processBrainRequest } from '../brainOrchestrator';

// Mock all the service dependencies
vi.mock('../validationService', () => ({
  validateRequest: vi.fn(),
  validateRequestSize: vi.fn(),
  validateContentType: vi.fn(),
}));

vi.mock('../errorService', () => ({
  validationError: vi.fn(),
  internalError: vi.fn(),
}));

vi.mock('../observabilityService', () => ({
  getRequestLogger: vi.fn(() => ({
    correlationId: 'test-123',
    startTime: Date.now(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logTokenUsage: vi.fn(),
    logPerformanceMetrics: vi.fn(),
    finalize: vi.fn(() => ({
      correlationId: 'test-123',
      duration: 100,
      success: true,
      events: [],
    })),
  })),
}));

vi.mock('../promptService', () => ({
  loadSystemPrompt: vi.fn(),
}));

vi.mock('../streamingService', () => ({
  createStreamingResponse: vi.fn(),
  getDefaultStreamingConfig: vi.fn(),
  validateStreamingConfig: vi.fn(),
}));

vi.mock('../modernToolService', () => ({
  selectRelevantTools: vi.fn(),
}));

describe('BrainOrchestrator', () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = new NextRequest('http://localhost:3000/api/brain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  });

  describe('BrainOrchestrator class', () => {
    it('should initialize with default config', () => {
      const orchestrator = new BrainOrchestrator(mockRequest);
      expect(orchestrator).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const config = {
        enableToolExecution: false,
        maxTools: 3,
        streamingEnabled: false,
      };

      const orchestrator = new BrainOrchestrator(mockRequest, config);
      expect(orchestrator).toBeDefined();
    });

    it('should handle successful request processing', async () => {
      // Mock successful validation
      const { validateRequest, validateRequestSize, validateContentType } =
        await import('../validationService');
      vi.mocked(validateRequestSize).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateContentType).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateRequest).mockResolvedValue({
        success: true,
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
          isFromGlobalPane: false,
          userTimezone: 'UTC',
        },
      });

      // Mock prompt loading
      const { loadSystemPrompt } = await import('../promptService');
      vi.mocked(loadSystemPrompt).mockResolvedValue({
        systemPrompt: 'You are a helpful assistant',
        contextId: null,
        modelId: 'gpt-4o-mini',
        config: {},
        cacheHit: false,
        loadTime: 10,
      });

      // Mock tool selection
      const { selectRelevantTools } = await import('../modernToolService');
      vi.mocked(selectRelevantTools).mockReturnValue([]);

      // Mock streaming config
      const { getDefaultStreamingConfig, validateStreamingConfig } =
        await import('../streamingService');
      vi.mocked(getDefaultStreamingConfig).mockReturnValue({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4000,
      });
      vi.mocked(validateStreamingConfig).mockReturnValue({ valid: true });

      // Mock streaming response
      const { createStreamingResponse } = await import('../streamingService');
      const mockStream = new ReadableStream();
      vi.mocked(createStreamingResponse).mockResolvedValue({
        stream: mockStream,
      });

      const orchestrator = new BrainOrchestrator(mockRequest);
      const result = await orchestrator.processRequest();

      expect(result.success).toBe(true);
      expect(result.stream).toBe(mockStream);
      expect(result.correlationId).toBe('test-123');
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle validation errors', async () => {
      // Mock validation failure
      const { validateRequestSize } = await import('../validationService');
      vi.mocked(validateRequestSize).mockReturnValue({
        success: false,
        errors: [{ field: 'size', message: 'Too large', code: 'TOO_LARGE' }],
      });

      // Mock error service
      const { validationError } = await import('../errorService');
      const mockErrorResponse = { error: 'Validation failed' };
      vi.mocked(validationError).mockReturnValue(mockErrorResponse as any);

      const orchestrator = new BrainOrchestrator(mockRequest);
      const result = await orchestrator.processRequest();

      expect(result.success).toBe(false);
      expect(result.error).toBe(mockErrorResponse);
    });

    it('should handle internal errors', async () => {
      // Mock services to throw errors
      const { validateRequestSize } = await import('../validationService');
      vi.mocked(validateRequestSize).mockImplementation(() => {
        throw new Error('Service failure');
      });

      // Mock error service
      const { internalError } = await import('../errorService');
      const mockErrorResponse = { error: 'Internal error' };
      vi.mocked(internalError).mockReturnValue(mockErrorResponse as any);

      const orchestrator = new BrainOrchestrator(mockRequest);
      const result = await orchestrator.processRequest();

      expect(result.success).toBe(false);
      expect(result.error).toBe(mockErrorResponse);
    });

    it('should handle tool execution when enabled', async () => {
      // Setup successful validation and prompt loading (same as successful test)
      const { validateRequest, validateRequestSize, validateContentType } =
        await import('../validationService');
      vi.mocked(validateRequestSize).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateContentType).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateRequest).mockResolvedValue({
        success: true,
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          messages: [
            { id: 'msg-1', role: 'user', content: 'Create a document' },
          ],
          isFromGlobalPane: false,
          userTimezone: 'UTC',
        },
      });

      const { loadSystemPrompt } = await import('../promptService');
      vi.mocked(loadSystemPrompt).mockResolvedValue({
        systemPrompt: 'You are a helpful assistant',
        contextId: null,
        modelId: 'gpt-4o-mini',
        config: {},
        cacheHit: false,
        loadTime: 10,
      });

      // Mock tool selection to return some tools
      const { selectRelevantTools } = await import('../modernToolService');
      const mockTools = [
        { name: 'createDocument', description: 'Create a document' },
      ];
      vi.mocked(selectRelevantTools).mockReturnValue(mockTools);

      // Mock streaming services
      const {
        getDefaultStreamingConfig,
        validateStreamingConfig,
        createStreamingResponse,
      } = await import('../streamingService');
      vi.mocked(getDefaultStreamingConfig).mockReturnValue({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4000,
      });
      vi.mocked(validateStreamingConfig).mockReturnValue({ valid: true });
      vi.mocked(createStreamingResponse).mockResolvedValue({
        stream: new ReadableStream(),
      });

      const orchestrator = new BrainOrchestrator(mockRequest, {
        enableToolExecution: true,
        maxTools: 5,
      });

      const result = await orchestrator.processRequest();

      expect(result.success).toBe(true);
      expect(selectRelevantTools).toHaveBeenCalledWith(
        'Create a document',
        expect.any(Object),
        5,
      );
    });

    it('should skip tool execution when disabled', async () => {
      // Setup successful validation and prompt loading
      const { validateRequest, validateRequestSize, validateContentType } =
        await import('../validationService');
      vi.mocked(validateRequestSize).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateContentType).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateRequest).mockResolvedValue({
        success: true,
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
          isFromGlobalPane: false,
          userTimezone: 'UTC',
        },
      });

      const { loadSystemPrompt } = await import('../promptService');
      vi.mocked(loadSystemPrompt).mockResolvedValue({
        systemPrompt: 'You are a helpful assistant',
        contextId: null,
        modelId: 'gpt-4o-mini',
        config: {},
        cacheHit: false,
        loadTime: 10,
      });

      const { selectRelevantTools } = await import('../modernToolService');

      // Mock streaming services
      const {
        getDefaultStreamingConfig,
        validateStreamingConfig,
        createStreamingResponse,
      } = await import('../streamingService');
      vi.mocked(getDefaultStreamingConfig).mockReturnValue({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4000,
      });
      vi.mocked(validateStreamingConfig).mockReturnValue({ valid: true });
      vi.mocked(createStreamingResponse).mockResolvedValue({
        stream: new ReadableStream(),
      });

      const orchestrator = new BrainOrchestrator(mockRequest, {
        enableToolExecution: false,
      });

      const result = await orchestrator.processRequest();

      expect(result.success).toBe(true);
      expect(selectRelevantTools).not.toHaveBeenCalled();
    });
  });

  describe('processBrainRequest convenience function', () => {
    it('should create orchestrator and process request', async () => {
      // Mock successful flow
      const { validateRequest, validateRequestSize, validateContentType } =
        await import('../validationService');
      vi.mocked(validateRequestSize).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateContentType).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateRequest).mockResolvedValue({
        success: true,
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
          isFromGlobalPane: false,
          userTimezone: 'UTC',
        },
      });

      const { loadSystemPrompt } = await import('../promptService');
      vi.mocked(loadSystemPrompt).mockResolvedValue({
        systemPrompt: 'You are a helpful assistant',
        contextId: null,
        modelId: 'gpt-4o-mini',
        config: {},
        cacheHit: false,
        loadTime: 10,
      });

      const { selectRelevantTools } = await import('../modernToolService');
      vi.mocked(selectRelevantTools).mockReturnValue([]);

      const {
        getDefaultStreamingConfig,
        validateStreamingConfig,
        createStreamingResponse,
      } = await import('../streamingService');
      vi.mocked(getDefaultStreamingConfig).mockReturnValue({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4000,
      });
      vi.mocked(validateStreamingConfig).mockReturnValue({ valid: true });
      vi.mocked(createStreamingResponse).mockResolvedValue({
        stream: new ReadableStream(),
      });

      const result = await processBrainRequest(mockRequest);

      expect(result.success).toBe(true);
      expect(result.correlationId).toBe('test-123');
    });

    it('should accept custom configuration', async () => {
      // Mock successful flow
      const { validateRequest, validateRequestSize, validateContentType } =
        await import('../validationService');
      vi.mocked(validateRequestSize).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateContentType).mockReturnValue({
        success: true,
        data: true,
      });
      vi.mocked(validateRequest).mockResolvedValue({
        success: true,
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
          isFromGlobalPane: false,
          userTimezone: 'UTC',
        },
      });

      const { loadSystemPrompt } = await import('../promptService');
      vi.mocked(loadSystemPrompt).mockResolvedValue({
        systemPrompt: 'You are a helpful assistant',
        contextId: null,
        modelId: 'gpt-4o-mini',
        config: {},
        cacheHit: false,
        loadTime: 10,
      });

      const { selectRelevantTools } = await import('../modernToolService');
      vi.mocked(selectRelevantTools).mockReturnValue([]);

      const {
        getDefaultStreamingConfig,
        validateStreamingConfig,
        createStreamingResponse,
      } = await import('../streamingService');
      vi.mocked(getDefaultStreamingConfig).mockReturnValue({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4000,
      });
      vi.mocked(validateStreamingConfig).mockReturnValue({ valid: true });
      vi.mocked(createStreamingResponse).mockResolvedValue({
        stream: new ReadableStream(),
      });

      const customConfig = {
        enableToolExecution: false,
        streamingEnabled: false,
      };

      const result = await processBrainRequest(mockRequest, customConfig);

      expect(result.success).toBe(true);
    });
  });
});
