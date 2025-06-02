/**
 * LangChainToolService Unit Tests
 *
 * Testing Milestone 4-5: LangChain tool service tests
 * - Tool selection logic
 * - Client configuration handling
 * - Tool metadata and categorization
 * - Performance testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RequestLogger } from '../observabilityService';
import type { ClientConfig } from '@/lib/db/queries';

// Mock the tools module to avoid server-only imports
vi.mock('@/lib/ai/tools/index', () => ({
  availableTools: [
    { name: 'searchTool', description: 'Search for information' },
    { name: 'documentTool', description: 'Create and manage documents' },
    { name: 'asanaTool', description: 'Manage Asana tasks and projects' },
    { name: 'weatherTool', description: 'Get weather information' },
    { name: 'calendarTool', description: 'Manage calendar events' },
  ],
}));

import {
  LangChainToolService,
  createLangChainToolService,
  selectLangChainTools,
  LangChainToolCategory,
  type LangChainToolConfig,
} from '../langchainToolService';

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

// Mock client config
const mockClientConfig: ClientConfig = {
  id: 'test-client-id',
  name: 'Test Client',
  client_display_name: 'Test Client Display',
  configJson: {
    tool_configs: {
      testTool: { setting: 'value' },
    },
  },
};

describe('LangChainToolService', () => {
  let toolService: LangChainToolService;

  beforeEach(() => {
    vi.clearAllMocks();
    toolService = new LangChainToolService(mockLogger);
  });

  describe('selectTools', () => {
    it('should select all tools by default', () => {
      const result = toolService.selectTools();

      expect(result.tools).toBeDefined();
      expect(result.totalAvailable).toBeGreaterThan(0);
      expect(result.selected).toBe(result.tools.length);
      expect(result.selectionTime).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.appliedFilters)).toBe(true);
      expect(typeof result.clientSpecificConfigs).toBe('boolean');
    });

    it('should return empty tools when tool execution is disabled', () => {
      const config: LangChainToolConfig = {
        enableToolExecution: false,
      };

      const toolService = new LangChainToolService(mockLogger, config);
      const result = toolService.selectTools();

      expect(result.tools).toEqual([]);
      expect(result.selected).toBe(0);
      expect(result.appliedFilters).toContain('tool_execution_disabled');
    });

    it('should limit tools when maxTools is specified', () => {
      const config: LangChainToolConfig = {
        maxTools: 3,
      };

      const toolService = new LangChainToolService(mockLogger, config);
      const result = toolService.selectTools();

      expect(result.tools.length).toBeLessThanOrEqual(3);
      expect(result.appliedFilters).toContain('count_limiting');
    });

    it('should apply client-specific configurations', () => {
      const config: LangChainToolConfig = {
        clientConfig: mockClientConfig,
      };

      const toolService = new LangChainToolService(mockLogger, config);
      const result = toolService.selectTools();

      expect(result.clientSpecificConfigs).toBe(true);
      expect(result.appliedFilters).toContain('client_filtering');
    });

    it('should apply context filtering', () => {
      const config: LangChainToolConfig = {
        contextId: 'test-context-id',
      };

      const toolService = new LangChainToolService(mockLogger, config);
      const result = toolService.selectTools();

      expect(result.appliedFilters).toContain('context_filtering');
    });

    it('should apply custom tool filters', () => {
      const config: LangChainToolConfig = {
        toolFilters: ['search', 'document'],
      };

      const toolService = new LangChainToolService(mockLogger, config);
      const result = toolService.selectTools();

      expect(result.appliedFilters).toContain('custom_filters');
      // Verify filtered tools contain the keywords
      result.tools.forEach((tool) => {
        const toolFilters = config.toolFilters || [];
        const containsFilter = toolFilters.some(
          (filter) =>
            tool.name.toLowerCase().includes(filter.toLowerCase()) ||
            tool.description?.toLowerCase().includes(filter.toLowerCase()),
        );
        expect(containsFilter).toBe(true);
      });
    });
  });

  describe('tool metadata and categorization', () => {
    it('should categorize tools correctly', () => {
      // Get tools by different categories
      const ragTools = toolService.getToolsByCategory(
        LangChainToolCategory.RAG,
      );
      const documentTools = toolService.getToolsByCategory(
        LangChainToolCategory.DOCUMENT,
      );
      const asanaTools = toolService.getToolsByCategory(
        LangChainToolCategory.ASANA,
      );

      expect(Array.isArray(ragTools)).toBe(true);
      expect(Array.isArray(documentTools)).toBe(true);
      expect(Array.isArray(asanaTools)).toBe(true);
    });

    it('should provide tool metadata', () => {
      const result = toolService.selectTools();

      if (result.tools.length > 0) {
        const firstTool = result.tools[0];
        const metadata = toolService.getToolMetadata(firstTool.name);

        expect(metadata).toBeDefined();
        expect(metadata?.name).toBe(firstTool.name);
        expect(metadata?.category).toBeDefined();
        expect(typeof metadata?.priority).toBe('number');
      }
    });

    it('should return undefined for non-existent tool metadata', () => {
      const metadata = toolService.getToolMetadata('non-existent-tool');
      expect(metadata).toBeUndefined();
    });
  });

  describe('performance and logging', () => {
    it('should log tool selection process', () => {
      toolService.selectTools();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting LangChain tool selection',
        expect.objectContaining({
          enableToolExecution: true,
          maxTools: 26,
        }),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'LangChain tool selection completed',
        expect.objectContaining({
          totalAvailable: expect.any(Number),
          selected: expect.any(Number),
          selectionTime: expect.any(String),
          appliedFilters: expect.any(Array),
          tools: expect.any(Array),
        }),
      );
    });

    it('should track selection performance', () => {
      const result = toolService.selectTools();

      expect(result.selectionTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.selectionTime).toBe('number');
    });
  });

  describe('convenience functions', () => {
    it('should create service with createLangChainToolService', () => {
      const service = createLangChainToolService(mockLogger);
      expect(service).toBeInstanceOf(LangChainToolService);
    });

    it('should work with selectLangChainTools utility', () => {
      const config: LangChainToolConfig = {
        maxTools: 3,
      };

      const result = selectLangChainTools(mockLogger, config);

      expect(result.tools.length).toBeLessThanOrEqual(3);
      expect(result.totalAvailable).toBeGreaterThan(0);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle empty tool filters gracefully', () => {
      const config: LangChainToolConfig = {
        toolFilters: [],
      };

      const toolService = new LangChainToolService(mockLogger, config);
      const result = toolService.selectTools();

      // Should not apply custom filters for empty array
      expect(result.appliedFilters).not.toContain('custom_filters');
    });

    it('should handle client config without tool_configs', () => {
      const configWithoutTools: ClientConfig = {
        id: 'test-client-id',
        name: 'Test Client',
        client_display_name: 'Test Client Display',
        configJson: {},
      };

      const config: LangChainToolConfig = {
        clientConfig: configWithoutTools,
      };

      const toolService = new LangChainToolService(mockLogger, config);
      const result = toolService.selectTools();

      expect(result.clientSpecificConfigs).toBe(false);
    });

    it('should handle undefined context gracefully', () => {
      const config: LangChainToolConfig = {
        contextId: undefined,
      };

      const toolService = new LangChainToolService(mockLogger, config);
      const result = toolService.selectTools();

      expect(result.appliedFilters).not.toContain('context_filtering');
    });

    it('should handle maxTools of 0', () => {
      const config: LangChainToolConfig = {
        maxTools: 0,
      };

      const toolService = new LangChainToolService(mockLogger, config);
      const result = toolService.selectTools();

      expect(result.tools).toEqual([]);
      expect(result.selected).toBe(0);
    });
  });
});
