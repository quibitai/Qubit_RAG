/**
 * LangGraph Integration Tests
 *
 * Tests for the SimpleLangGraphWrapper integration with the existing architecture
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SimpleLangGraphWrapper,
  createLangGraphWrapper,
  shouldUseLangGraph,
} from '../index';
import type { LangGraphWrapperConfig } from '../simpleLangGraphWrapper';

// Mock the logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('LangGraph Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock environment variable
    process.env.OPENAI_API_KEY = 'test-key';
  });

  describe('shouldUseLangGraph', () => {
    it('should return true for complex patterns', () => {
      const complexPatterns = ['TOOL_OPERATION', 'MULTI_STEP', 'REASONING'];
      expect(shouldUseLangGraph(complexPatterns)).toBe(true);
    });

    it('should return false for simple patterns', () => {
      const simplePatterns = ['SIMPLE_QUERY', 'BASIC_RESPONSE'];
      expect(shouldUseLangGraph(simplePatterns)).toBe(false);
    });

    it('should return false for empty patterns', () => {
      expect(shouldUseLangGraph([])).toBe(false);
    });
  });

  describe('SimpleLangGraphWrapper', () => {
    let config: LangGraphWrapperConfig;

    beforeEach(() => {
      config = {
        systemPrompt: 'Test system prompt',
        selectedChatModel: 'gpt-4o-mini',
        contextId: 'test-context',
        enableToolExecution: true,
        maxIterations: 5,
        verbose: false,
        logger: mockLogger as any,
        tools: [],
      };
    });

    it('should create wrapper successfully', () => {
      const wrapper = createLangGraphWrapper(config);
      expect(wrapper).toBeInstanceOf(SimpleLangGraphWrapper);
    });

    it('should initialize with correct configuration', () => {
      const wrapper = createLangGraphWrapper(config);
      const retrievedConfig = wrapper.getConfig();

      expect(retrievedConfig.systemPrompt).toBe('Test system prompt');
      expect(retrievedConfig.selectedChatModel).toBe('gpt-4o-mini');
      expect(retrievedConfig.contextId).toBe('test-context');
      expect(retrievedConfig.enableToolExecution).toBe(true);
    });

    it('should log initialization without tools', () => {
      createLangGraphWrapper(config);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'LangGraph wrapper initialized without tools',
        expect.objectContaining({
          model: 'gpt-4o-mini',
          contextId: 'test-context',
        }),
      );
    });

    it('should handle tools when provided', () => {
      const toolsConfig = {
        ...config,
        tools: [{ name: 'testTool', description: 'Test tool' }],
      };

      createLangGraphWrapper(toolsConfig);

      // Should attempt to bind tools
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('Factory Functions', () => {
    it('should export required functions', () => {
      expect(typeof createLangGraphWrapper).toBe('function');
      expect(typeof shouldUseLangGraph).toBe('function');
    });

    it('should handle createGraphForPatterns', async () => {
      const { createGraphForPatterns } = await import('../index');

      const patterns = ['TOOL_OPERATION'];
      const config = {
        systemPrompt: 'Test prompt',
        logger: mockLogger as any,
        tools: [],
      };

      const graph = createGraphForPatterns(patterns, config);
      expect(graph).toBeInstanceOf(SimpleLangGraphWrapper);
    });
  });
});
