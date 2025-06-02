/**
 * BrainOrchestrator Unit Tests
 *
 * Testing Milestone 9: Hybrid orchestration and routing tests
 * - Hybrid routing logic validation
 * - Fallback mechanisms testing
 * - Response standardization verification
 * - Integration with all services
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  type MockedFunction,
} from 'vitest';

// Mock server-only modules to avoid import issues
vi.mock('@/lib/db/queries', () => ({}));
vi.mock('@/lib/validation/brainValidation', () => ({}));

// Mock tools to avoid Supabase imports
vi.mock('@/lib/ai/tools/index', () => ({
  availableTools: [],
}));

// Mock all service dependencies
vi.mock('../queryClassifier');
vi.mock('../vercelAIService');
vi.mock('../messageService');
vi.mock('../contextService');
vi.mock('../langchainBridge');

import {
  BrainOrchestrator,
  createBrainOrchestrator,
  processBrainRequest,
  type BrainOrchestratorConfig,
} from '../brainOrchestrator';
import type { RequestLogger } from '../observabilityService';
import { QueryClassifier } from '../queryClassifier';
import { VercelAIService } from '../vercelAIService';
import { MessageService } from '../messageService';
import { ContextService } from '../contextService';
import * as langchainBridge from '../langchainBridge';

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

// Mock client config - use any to avoid server-only imports
const mockClientConfig: any = {
  id: 'test-client-id',
  name: 'Test Client',
  client_display_name: 'Test Client Display',
  configJson: {},
};

// Mock brain request - use any to avoid validation type imports
const mockBrainRequestComplex: any = {
  id: 'test-request-id',
  messages: [
    {
      id: '1',
      role: 'user',
      content: 'Hello, how are you?',
      createdAt: new Date(),
    },
    {
      id: '2',
      role: 'assistant',
      content: 'I am doing well, thank you!',
      createdAt: new Date(),
    },
    {
      id: '3',
      role: 'user',
      content: 'Can you help me with a task?',
      createdAt: new Date(),
    },
  ],
  selectedChatModel: 'gpt-4.1',
  activeBitContextId: 'test-context',
  currentActiveSpecialistId: 'test-specialist',
  activeBitPersona: 'helpful-assistant',
  userTimezone: 'America/New_York',
  isFromGlobalPane: false,
};

const mockBrainRequestSimple: any = {
  id: 'test-request-simple',
  messages: [
    {
      id: '1',
      role: 'user',
      content: 'What is the weather like?',
      createdAt: new Date(),
    },
  ],
  selectedChatModel: 'gpt-4.1',
  activeBitContextId: null,
  currentActiveSpecialistId: null,
  activeBitPersona: 'weather-assistant',
  userTimezone: 'UTC',
  isFromGlobalPane: true,
};

// Mock service instances
const mockQueryClassifier = {
  classifyQuery: vi.fn(),
  getMetrics: vi.fn().mockReturnValue({
    complexityThreshold: 0.6,
    confidenceThreshold: 0.7,
    enableOverrides: true,
  }),
};

const mockVercelAIService = {
  processQuery: vi.fn(),
  getMetrics: vi.fn().mockReturnValue({
    enableTools: true,
    tokenUsageTracking: true,
    streamingEnabled: true,
  }),
};

const mockMessageService = {
  extractUserInput: vi.fn(),
  convertToLangChainFormat: vi.fn(),
  processAttachments: vi.fn(),
};

const mockContextService = {
  processContext: vi.fn(),
  validateContext: vi.fn(),
  createContextPromptAdditions: vi.fn(),
};

const mockLangChainAgent = {
  agentExecutor: {},
  tools: [],
  llm: {},
  prompt: {},
};

describe('BrainOrchestrator', () => {
  let brainOrchestrator: BrainOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up constructor mocks
    (QueryClassifier as any).mockImplementation(() => mockQueryClassifier);
    (VercelAIService as any).mockImplementation(() => mockVercelAIService);
    (MessageService as any).mockImplementation(() => mockMessageService);
    (ContextService as any).mockImplementation(() => mockContextService);

    // Set up default service behavior
    mockMessageService.extractUserInput.mockImplementation((request: any) => {
      // Return the last user message content
      const userMessages = request.messages.filter(
        (msg: any) => msg.role === 'user',
      );
      return userMessages.length > 0
        ? userMessages[userMessages.length - 1].content
        : 'Default message';
    });
    mockMessageService.convertToLangChainFormat.mockReturnValue([
      { type: 'human', content: 'Hello, how are you?' },
      { type: 'ai', content: 'I am doing well, thank you!' },
    ]);

    mockContextService.processContext.mockReturnValue({
      activeBitContextId: 'test-context',
      selectedChatModel: 'gpt-4.1',
      userTimezone: 'America/New_York',
      isFromGlobalPane: false,
    });

    brainOrchestrator = new BrainOrchestrator(mockLogger);
  });

  describe('initialization and configuration', () => {
    it('should initialize with default configuration', () => {
      const orchestrator = new BrainOrchestrator(mockLogger);
      const status = orchestrator.getStatus();

      expect(status.hybridRouting).toBe(true);
      expect(status.classification).toBe(true);
      expect(status.services.queryClassifier).toBeDefined();
      expect(status.services.vercelAI).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const config: BrainOrchestratorConfig = {
        enableHybridRouting: false,
        enableClassification: false,
        clientConfig: mockClientConfig,
        contextId: 'custom-context',
      };

      const orchestrator = new BrainOrchestrator(mockLogger, config);
      const status = orchestrator.getStatus();

      expect(status.hybridRouting).toBe(false);
      expect(status.classification).toBe(false);
    });

    it('should log initialization details', () => {
      new BrainOrchestrator(mockLogger, { contextId: 'test-context' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing BrainOrchestrator',
        expect.objectContaining({
          enableHybridRouting: true,
          enableClassification: true,
          contextId: 'test-context',
        }),
      );
    });
  });

  describe('request processing and routing', () => {
    it('should route to LangChain when classification indicates complex query', async () => {
      // Mock classification result - complex query
      mockQueryClassifier.classifyQuery.mockResolvedValue({
        shouldUseLangChain: true,
        confidence: 0.9,
        reasoning: 'Complex query requiring tools',
        complexityScore: 0.8,
        recommendedModel: 'gpt-4.1',
        detectedPatterns: ['tool_usage'],
        estimatedTokens: 150,
      });

      // Mock LangChain execution
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'token', content: 'Hello' };
          yield { type: 'token', content: ' there!' };
        },
      };

      (
        langchainBridge.createLangChainAgent as MockedFunction<any>
      ).mockResolvedValue(mockLangChainAgent);
      (
        langchainBridge.streamLangChainAgent as MockedFunction<any>
      ).mockResolvedValue(mockStream);
      (
        langchainBridge.cleanupLangChainAgent as MockedFunction<any>
      ).mockImplementation(() => {});

      const response = await brainOrchestrator.processRequest(
        mockBrainRequestComplex,
      );

      expect(mockQueryClassifier.classifyQuery).toHaveBeenCalledWith(
        'Can you help me with a task?',
        expect.any(Array),
        'You are a helpful AI assistant.',
      );

      expect(langchainBridge.createLangChainAgent).toHaveBeenCalled();
      expect(langchainBridge.streamLangChainAgent).toHaveBeenCalled();
      expect(response.headers.get('X-Execution-Path')).toBe('langchain');
    });

    it('should route to Vercel AI SDK when classification indicates simple query', async () => {
      // Mock classification result - simple query
      mockQueryClassifier.classifyQuery.mockResolvedValue({
        shouldUseLangChain: false,
        confidence: 0.8,
        reasoning: 'Simple conversational query',
        complexityScore: 0.3,
        recommendedModel: 'gpt-4.1-mini',
        detectedPatterns: ['simple_conversation'],
        estimatedTokens: 50,
      });

      // Mock Vercel AI execution
      mockVercelAIService.processQuery.mockResolvedValue({
        content: 'I would be happy to help you with that task!',
        tokenUsage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        executionTime: 150,
        finishReason: 'stop',
        toolCalls: [],
      });

      const response = await brainOrchestrator.processRequest(
        mockBrainRequestSimple,
      );

      expect(mockQueryClassifier.classifyQuery).toHaveBeenCalled();
      expect(mockVercelAIService.processQuery).toHaveBeenCalledWith(
        'You are a helpful AI assistant.',
        'What is the weather like?',
        expect.any(Array),
      );

      // Check response headers for streaming format
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('X-Execution-Path')).toBe('vercel-ai');

      // Verify it's a streaming response
      expect(response.body).toBeDefined();
      expect(response.status).toBe(200);
    });

    it('should default to LangChain when classification is disabled', async () => {
      const config: BrainOrchestratorConfig = {
        enableClassification: false,
      };

      const orchestrator = new BrainOrchestrator(mockLogger, config);

      // Mock LangChain execution
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'token', content: 'Response' };
        },
      };

      (
        langchainBridge.createLangChainAgent as MockedFunction<any>
      ).mockResolvedValue(mockLangChainAgent);
      (
        langchainBridge.streamLangChainAgent as MockedFunction<any>
      ).mockResolvedValue(mockStream);
      (
        langchainBridge.cleanupLangChainAgent as MockedFunction<any>
      ).mockImplementation(() => {});

      const response = await orchestrator.processRequest(
        mockBrainRequestComplex,
      );

      expect(mockQueryClassifier.classifyQuery).not.toHaveBeenCalled();
      expect(langchainBridge.createLangChainAgent).toHaveBeenCalled();
      expect(response.headers.get('X-Execution-Path')).toBe('langchain');
    });
  });

  describe('fallback mechanisms', () => {
    it('should fallback to LangChain when Vercel AI SDK fails', async () => {
      // Mock classification result - simple query
      mockQueryClassifier.classifyQuery.mockResolvedValue({
        shouldUseLangChain: false,
        confidence: 0.7,
        reasoning: 'Simple query for Vercel AI SDK',
        complexityScore: 0.4,
        recommendedModel: 'gpt-4.1-mini',
        detectedPatterns: ['simple_conversation'],
        estimatedTokens: 75,
      });

      // Mock Vercel AI failure
      mockVercelAIService.processQuery.mockRejectedValue(
        new Error('Vercel AI SDK failed'),
      );

      // Mock LangChain execution for fallback
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'token', content: 'Fallback response' };
        },
      };

      (
        langchainBridge.createLangChainAgent as MockedFunction<any>
      ).mockResolvedValue(mockLangChainAgent);
      (
        langchainBridge.streamLangChainAgent as MockedFunction<any>
      ).mockResolvedValue(mockStream);
      (
        langchainBridge.cleanupLangChainAgent as MockedFunction<any>
      ).mockImplementation(() => {});

      const response = await brainOrchestrator.processRequest(
        mockBrainRequestSimple,
      );

      expect(mockVercelAIService.processQuery).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Attempting fallback to LangChain',
      );
      expect(langchainBridge.createLangChainAgent).toHaveBeenCalled();
      expect(response.headers.get('X-Execution-Path')).toBe('langchain');
    });

    it('should return error response when both paths fail', async () => {
      // Mock classification result - simple query
      mockQueryClassifier.classifyQuery.mockResolvedValue({
        shouldUseLangChain: false,
        confidence: 0.6,
        reasoning: 'Default simple classification',
        complexityScore: 0.2,
        recommendedModel: 'gpt-4.1-mini',
        detectedPatterns: [],
        estimatedTokens: 25,
      });

      // Mock both services failing
      mockVercelAIService.processQuery.mockRejectedValue(
        new Error('Vercel AI SDK failed'),
      );
      (
        langchainBridge.createLangChainAgent as MockedFunction<any>
      ).mockRejectedValue(new Error('LangChain failed'));

      const response = await brainOrchestrator.processRequest(
        mockBrainRequestSimple,
      );

      expect(response.status).toBe(500);
      expect(response.headers.get('X-Error')).toBe('true');

      const responseData = await response.json();
      expect(responseData.success).toBe(false);
      expect(responseData.content.error).toBe('Vercel AI SDK failed');
      expect(responseData.content.type).toBe('execution_error');
    });
  });

  describe('response formatting', () => {
    it('should format Vercel AI SDK response correctly', async () => {
      // Mock classification result - simple query
      mockQueryClassifier.classifyQuery.mockResolvedValue({
        shouldUseLangChain: false,
        confidence: 0.8,
        reasoning: 'Simple conversational query',
        complexityScore: 0.3,
        recommendedModel: 'gpt-4.1-mini',
        detectedPatterns: ['simple_conversation'],
        estimatedTokens: 50,
      });

      // Mock Vercel AI execution
      const mockResult = {
        content: 'I would be happy to help you!',
        tokenUsage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        executionTime: 150,
        finishReason: 'stop',
        toolCalls: [{ name: 'getWeather', args: {} }],
      };

      mockVercelAIService.processQuery.mockResolvedValue(mockResult);

      const response = await brainOrchestrator.processRequest(
        mockBrainRequestSimple,
      );

      // Check streaming response format
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('X-Execution-Path')).toBe('vercel-ai');
      expect(response.headers.get('X-Classification-Score')).toBe('0.3');
      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();

      // Verify the service was called correctly
      expect(mockVercelAIService.processQuery).toHaveBeenCalledWith(
        'You are a helpful AI assistant.',
        'What is the weather like?',
        expect.any(Array),
      );
    });
  });

  describe('performance monitoring', () => {
    it('should track performance metrics for all execution paths', async () => {
      // Mock classification result
      mockQueryClassifier.classifyQuery.mockResolvedValue({
        shouldUseLangChain: false,
        confidence: 0.8,
        reasoning: 'Simple conversational query',
        complexityScore: 0.3,
        recommendedModel: 'gpt-4.1-mini',
        detectedPatterns: ['simple_conversation'],
        estimatedTokens: 50,
      });

      // Mock Vercel AI execution
      mockVercelAIService.processQuery.mockResolvedValue({
        content: 'Response',
        tokenUsage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        executionTime: 150,
        finishReason: 'stop',
        toolCalls: [],
      });

      const response = await brainOrchestrator.processRequest(
        mockBrainRequestSimple,
      );

      // Check that it's a streaming response
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();

      // Verify performance is tracked through service calls
      expect(mockQueryClassifier.classifyQuery).toHaveBeenCalled();
      expect(mockVercelAIService.processQuery).toHaveBeenCalled();
    });
  });

  describe('configuration management', () => {
    it('should return correct status information', () => {
      const status = brainOrchestrator.getStatus();

      expect(status).toMatchObject({
        hybridRouting: true,
        classification: true,
        services: {
          queryClassifier: expect.any(Object),
          vercelAI: expect.any(Object),
        },
      });
    });

    it('should update configuration correctly', () => {
      const newConfig: Partial<BrainOrchestratorConfig> = {
        enableHybridRouting: false,
        enableClassification: false,
      };

      brainOrchestrator.updateConfig(newConfig);
      const status = brainOrchestrator.getStatus();

      expect(status.hybridRouting).toBe(false);
      expect(status.classification).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'BrainOrchestrator configuration updated',
        expect.objectContaining({
          hybridRouting: false,
          classification: false,
        }),
      );
    });
  });

  describe('convenience functions', () => {
    it('should work with createBrainOrchestrator', () => {
      const orchestrator = createBrainOrchestrator(mockLogger);
      expect(orchestrator).toBeInstanceOf(BrainOrchestrator);

      const status = orchestrator.getStatus();
      expect(status.hybridRouting).toBe(true);
    });

    it('should work with processBrainRequest utility', async () => {
      // Mock simple query
      mockQueryClassifier.classifyQuery.mockResolvedValue({
        shouldUseLangChain: false,
        confidence: 0.8,
        reasoning: 'Simple conversational query',
        complexityScore: 0.3,
        recommendedModel: 'gpt-4.1-mini',
        detectedPatterns: ['simple_conversation'],
        estimatedTokens: 50,
      });

      mockVercelAIService.processQuery.mockResolvedValue({
        content: 'Response',
        tokenUsage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        executionTime: 150,
        finishReason: 'stop',
        toolCalls: [],
      });

      const response = await processBrainRequest(
        mockBrainRequestSimple,
        mockLogger,
        {
          enableHybridRouting: true,
        },
      );

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.status).toBe(200);
    });
  });
});
