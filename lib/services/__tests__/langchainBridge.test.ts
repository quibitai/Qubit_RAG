import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLangChainAgent,
  streamLangChainAgent,
  cleanupLangChainAgent,
} from '../langchainBridge';
import type { RequestLogger } from '../observabilityService';

// Mock dependencies
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn(() => ({
    modelName: 'gpt-4',
    temperature: 0.7,
  })),
}));

vi.mock('langchain/agents', () => ({
  AgentExecutor: vi.fn(() => ({
    invoke: vi.fn(),
    stream: vi.fn(),
  })),
  createOpenAIToolsAgent: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: vi.fn(() => ({})),
  },
  MessagesPlaceholder: vi.fn(() => ({})),
}));

vi.mock('@/lib/ai/executors/EnhancedAgentExecutor', () => ({
  EnhancedAgentExecutor: {
    fromExecutor: vi.fn(() => ({
      invoke: vi.fn(),
      stream: vi.fn(),
    })),
  },
}));

vi.mock('@/lib/ai/tools/index', () => ({
  availableTools: [
    { name: 'mockTool1', description: 'Mock tool 1' },
    { name: 'mockTool2', description: 'Mock tool 2' },
  ],
}));

vi.mock('@/lib/ai/prompts/specialists', () => ({
  specialistRegistry: {
    'test-specialist': {
      defaultTools: ['mockTool1'],
    },
  },
}));

vi.mock('@/lib/ai/models', () => ({
  modelMapping: {
    'test-context': 'gpt-4-turbo',
    default: 'gpt-4',
  },
}));

describe('LangChain Bridge Service', () => {
  let mockLogger: RequestLogger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      correlationId: 'test-correlation-id',
      startTime: Date.now(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logTokenUsage: vi.fn(),
      logPerformanceMetrics: vi.fn(),
      finalize: vi.fn(),
    };

    // Mock environment variables
    process.env.OPENAI_API_KEY = 'test-api-key';
    process.env.DEFAULT_MODEL_NAME = 'gpt-4';
  });

  describe('createLangChainAgent', () => {
    it('should create agent with basic configuration', async () => {
      const config = {
        enableToolExecution: true,
        maxTools: 5,
      };

      const agent = await createLangChainAgent(
        'Test system prompt',
        config,
        mockLogger,
      );

      expect(agent).toBeDefined();
      expect(agent.agentExecutor).toBeDefined();
      expect(agent.tools).toBeDefined();
      expect(agent.llm).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating LangChain agent',
        expect.objectContaining({
          enableToolExecution: true,
          maxIterations: 10, // default
        }),
      );
    });

    it('should use specialist tools when contextId provided', async () => {
      const config = {
        contextId: 'test-specialist',
        enableToolExecution: true,
      };

      const agent = await createLangChainAgent(
        'Test system prompt',
        config,
        mockLogger,
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Specialist context detected',
        expect.objectContaining({
          contextId: 'test-specialist',
          toolCount: 1, // Should filter to just mockTool1
        }),
      );
    });

    it('should use custom model when selectedChatModel provided', async () => {
      const config = {
        selectedChatModel: 'gpt-4-turbo',
        enableToolExecution: false,
      };

      await createLangChainAgent('Test system prompt', config, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing LLM with model',
        expect.objectContaining({
          selectedModel: 'gpt-4-turbo',
          requestedModel: 'gpt-4-turbo',
        }),
      );
    });

    it('should limit tools when maxTools specified', async () => {
      const config = {
        maxTools: 1,
        enableToolExecution: true,
      };

      await createLangChainAgent('Test system prompt', config, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Limited tool count',
        expect.objectContaining({
          maxTools: 1,
          finalCount: 1,
        }),
      );
    });

    it('should handle missing OPENAI_API_KEY', async () => {
      delete process.env.OPENAI_API_KEY;

      const config = {};

      await expect(
        createLangChainAgent('Test prompt', config, mockLogger),
      ).rejects.toThrow('Missing OPENAI_API_KEY environment variable');
    });
  });

  describe('streamLangChainAgent', () => {
    it('should execute streaming successfully', async () => {
      const mockAgent = {
        agentExecutor: {
          stream: vi
            .fn()
            .mockResolvedValue([{ output: 'chunk1' }, { output: 'chunk2' }]),
        },
        enhancedExecutor: {
          stream: vi
            .fn()
            .mockResolvedValue([{ output: 'chunk1' }, { output: 'chunk2' }]),
        },
        tools: [],
        llm: {},
        prompt: {},
      };

      const config = {
        contextId: 'test-context',
      };

      const chatHistory = [{ type: 'human', content: 'Hello' }];

      const stream = await streamLangChainAgent(
        mockAgent,
        'Test input',
        chatHistory,
        config,
        mockLogger,
      );

      expect(stream).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting LangChain agent streaming',
        expect.objectContaining({
          inputLength: 10, // 'Test input'.length
          historyLength: 1,
          contextId: 'test-context',
        }),
      );
    });

    it('should handle streaming errors', async () => {
      const mockAgent = {
        agentExecutor: {
          stream: vi.fn().mockRejectedValue(new Error('Stream error')),
        },
        tools: [],
        llm: {},
        prompt: {},
      };

      const config = {};

      await expect(
        streamLangChainAgent(mockAgent, 'Test input', [], config, mockLogger),
      ).rejects.toThrow('Stream error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'LangChain agent streaming failed',
        expect.objectContaining({
          error: 'Stream error',
        }),
      );
    });
  });

  describe('cleanupLangChainAgent', () => {
    it('should cleanup resources and log completion', () => {
      const mockAgent = {
        agentExecutor: {},
        tools: [{ name: 'tool1' }, { name: 'tool2' }],
        llm: {},
        prompt: {},
      };

      // Set up global tool configs
      global.CURRENT_TOOL_CONFIGS = { test: 'config' };

      cleanupLangChainAgent(mockAgent, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaning up LangChain agent resources',
        expect.objectContaining({
          toolCount: 2,
        }),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'LangChain agent cleanup completed',
      );

      expect(global.CURRENT_TOOL_CONFIGS).toEqual({});
    });
  });

  describe('Error handling', () => {
    it('should handle tool selection errors gracefully', async () => {
      // Mock a scenario where tool selection fails
      const config = {
        contextId: 'nonexistent-specialist',
        enableToolExecution: true,
      };

      // This should not throw, but use available tools
      const agent = await createLangChainAgent(
        'Test prompt',
        config,
        mockLogger,
      );

      expect(agent).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Tool selection completed',
        expect.any(Object),
      );
    });

    it('should handle client config with tool configurations', async () => {
      const config = {
        clientConfig: {
          id: 'test-client',
          configJson: {
            tool_configs: {
              testTool: { setting: 'value' },
            },
          },
        },
        enableToolExecution: true,
      };

      await createLangChainAgent('Test prompt', config, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Setting up client-specific tool configurations',
      );
    });
  });

  describe('Performance logging', () => {
    it('should log detailed performance metrics', async () => {
      const config = {
        verbose: true,
        enableToolExecution: true,
      };

      await createLangChainAgent('Test prompt', config, mockLogger);

      // Should log initialization times
      expect(mockLogger.info).toHaveBeenCalledWith(
        'LLM initialized successfully',
        expect.objectContaining({
          initTime: expect.stringMatching(/\d+\.\d+ms/),
        }),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Tool selection completed',
        expect.objectContaining({
          selectionTime: expect.stringMatching(/\d+\.\d+ms/),
        }),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'LangChain agent created successfully',
        expect.objectContaining({
          totalSetupTime: expect.stringMatching(/\d+\.\d+ms/),
        }),
      );
    });
  });
});
