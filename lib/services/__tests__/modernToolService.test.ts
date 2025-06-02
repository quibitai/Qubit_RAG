import { describe, it, expect, vi } from 'vitest';
import {
  categorizeTools,
  selectRelevantTools,
  getToolsByCategory,
  validateToolParameters,
  executeToolWithMonitoring,
  ToolCategory,
  type ToolContext,
} from '../modernToolService';
import type { RequestLogger } from '../observabilityService';

// Mock the tools module
vi.mock('@/lib/ai/tools', () => ({
  availableTools: [
    {
      name: 'createDocument',
      description: 'Create a new document',
      schema: { safeParse: vi.fn() },
      func: vi.fn(),
    },
    {
      name: 'searchInternalKnowledgeBase',
      description:
        'Search internal knowledge base ⚠️ Check uploaded content first',
      schema: { safeParse: vi.fn() },
      func: vi.fn(),
    },
    {
      name: 'asanaCreateTask',
      description: 'Create Asana task',
      schema: { safeParse: vi.fn() },
      func: vi.fn(),
    },
    {
      name: 'weatherTool',
      description: 'Get weather information',
      schema: { safeParse: vi.fn() },
      func: vi.fn(),
    },
  ],
}));

describe('ModernToolService', () => {
  const mockLogger: RequestLogger = {
    correlationId: 'test-123',
    startTime: Date.now(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logTokenUsage: vi.fn(),
    logPerformanceMetrics: vi.fn(),
    finalize: vi.fn(),
  };

  const mockContext: ToolContext = {
    hasDocumentAccess: true,
    hasUploadedContent: false,
    isFromGlobalPane: false,
    logger: mockLogger,
  };

  describe('categorizeTools', () => {
    it('should categorize tools correctly', () => {
      const categorized = categorizeTools();

      expect(categorized).toHaveLength(4);

      const docTool = categorized.find(
        (ct) => ct.tool.name === 'createDocument',
      );
      expect(docTool?.category).toBe(ToolCategory.DOCUMENT);
      expect(docTool?.priority).toBe(8);

      const searchTool = categorized.find(
        (ct) => ct.tool.name === 'searchInternalKnowledgeBase',
      );
      expect(searchTool?.category).toBe(ToolCategory.SEARCH);
      expect(searchTool?.priority).toBe(7);
      expect(searchTool?.contextRequirements).toContain(
        'check_uploaded_content',
      );

      const asanaTool = categorized.find(
        (ct) => ct.tool.name === 'asanaCreateTask',
      );
      expect(asanaTool?.category).toBe(ToolCategory.ASANA);
      expect(asanaTool?.priority).toBe(6);

      const weatherTool = categorized.find(
        (ct) => ct.tool.name === 'weatherTool',
      );
      expect(weatherTool?.category).toBe(ToolCategory.EXTERNAL);
      expect(weatherTool?.priority).toBe(4);
    });

    it('should sort tools by priority descending', () => {
      const categorized = categorizeTools();

      for (let i = 0; i < categorized.length - 1; i++) {
        expect(categorized[i].priority).toBeGreaterThanOrEqual(
          categorized[i + 1].priority,
        );
      }
    });
  });

  describe('selectRelevantTools', () => {
    it('should select document tool for document-related queries', () => {
      const tools = selectRelevantTools('create a document', mockContext, 1);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('createDocument');
    });

    it('should select search tool for search queries', () => {
      const tools = selectRelevantTools('search for information', mockContext);

      const hasSearchTool = tools.some(
        (t) => t.name === 'searchInternalKnowledgeBase',
      );
      expect(hasSearchTool).toBe(true);
    });

    it('should select asana tool for task queries', () => {
      const tools = selectRelevantTools('create a task in asana', mockContext);

      const hasAsanaTool = tools.some((t) => t.name === 'asanaCreateTask');
      expect(hasAsanaTool).toBe(true);
    });

    it('should always include document tool as fallback', () => {
      const tools = selectRelevantTools('random query', mockContext);

      const hasDocTool = tools.some((t) => t.name === 'createDocument');
      expect(hasDocTool).toBe(true);
    });

    it('should respect maxTools parameter', () => {
      const tools = selectRelevantTools(
        'search document asana weather',
        mockContext,
        2,
      );

      expect(tools).toHaveLength(2);
    });
  });

  describe('getToolsByCategory', () => {
    it('should return tools by category', () => {
      const documentTools = getToolsByCategory(ToolCategory.DOCUMENT);
      const searchTools = getToolsByCategory(ToolCategory.SEARCH);
      const asanaTools = getToolsByCategory(ToolCategory.ASANA);

      expect(documentTools).toHaveLength(1);
      expect(documentTools[0].name).toBe('createDocument');

      expect(searchTools).toHaveLength(1);
      expect(searchTools[0].name).toBe('searchInternalKnowledgeBase');

      expect(asanaTools).toHaveLength(1);
      expect(asanaTools[0].name).toBe('asanaCreateTask');
    });
  });

  describe('validateToolParameters', () => {
    it('should validate parameters using tool schema', () => {
      const mockTool = {
        schema: {
          safeParse: vi.fn().mockReturnValue({ success: true }),
        },
      };

      const result = validateToolParameters(mockTool, { test: 'value' });

      expect(result.valid).toBe(true);
      expect(mockTool.schema.safeParse).toHaveBeenCalledWith({ test: 'value' });
    });

    it('should return errors when validation fails', () => {
      const mockTool = {
        schema: {
          safeParse: vi.fn().mockReturnValue({
            success: false,
            error: {
              errors: [{ path: ['field'], message: 'Required' }],
            },
          }),
        },
      };

      const result = validateToolParameters(mockTool, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['field: Required']);
    });

    it('should return valid for tools without schema', () => {
      const mockTool = {};

      const result = validateToolParameters(mockTool, {});

      expect(result.valid).toBe(true);
    });
  });

  describe('executeToolWithMonitoring', () => {
    it('should execute tool successfully and log metrics', async () => {
      const mockTool = {
        name: 'testTool',
        func: vi.fn().mockResolvedValue('success result'),
      };

      const result = await executeToolWithMonitoring(
        mockTool,
        { test: 'param' },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success result');
      expect(result.toolName).toBe('testTool');
      expect(result.duration).toBeGreaterThan(0);

      expect(mockLogger.info).toHaveBeenCalledWith('Executing tool: testTool', {
        params: { test: 'param' },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Tool completed: testTool',
        expect.objectContaining({ success: true }),
      );
    });

    it('should handle tool execution errors', async () => {
      const mockTool = {
        name: 'testTool',
        func: vi.fn().mockRejectedValue(new Error('Tool failed')),
      };

      const result = await executeToolWithMonitoring(mockTool, {}, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool failed');
      expect(result.toolName).toBe('testTool');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Tool failed: testTool',
        expect.any(Error),
      );
    });

    it('should handle tools with execute method instead of func', async () => {
      const mockTool = {
        name: 'testTool',
        execute: vi.fn().mockResolvedValue('execute result'),
      };

      const result = await executeToolWithMonitoring(mockTool, {}, mockContext);

      expect(result.success).toBe(true);
      expect(result.result).toBe('execute result');
    });
  });
});
