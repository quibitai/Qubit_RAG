/**
 * Phase 1 Tests - Modern Asana Tool Foundation
 * Tests for LLM function calling, schemas, and basic operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Import Phase 1 components
import {
  ASANA_FUNCTION_SCHEMAS,
  type AsanaFunctionName,
} from '../schemas/functionSchemas';
import { LLMFunctionExtractor } from '../intent-parser/llmFunctionExtractor';
import { ModernAsanaTool, createModernAsanaTool } from '../modernAsanaTool';

// Import test utilities
import { setupAsanaTestEnv, clearAsanaTestEnv } from './mocks/mockSetup';
import * as configModule from '../config';
import * as taskOperations from '../api-client/operations/tasks';
import * as projectOperations from '../api-client/operations/projects';
import * as userOperations from '../api-client/operations/users';

// Mock external dependencies
vi.mock('../config');
vi.mock('../api-client/operations/tasks');
vi.mock('../api-client/operations/projects');
vi.mock('../api-client/operations/users');

describe('Phase 1 - Modern Asana Tool Foundation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupAsanaTestEnv();
    vi.mocked(configModule.getWorkspaceGid).mockReturnValue('workspace123');
  });

  afterEach(() => {
    clearAsanaTestEnv();
    vi.clearAllMocks();
  });

  describe('Function Schemas', () => {
    it('should have all required function schemas defined', () => {
      const expectedFunctions: AsanaFunctionName[] = [
        'list_tasks',
        'create_task',
        'update_task',
        'get_task_details',
        'delete_task',
        'complete_task',
        'add_subtask',
        'list_subtasks',
        'list_projects',
        'get_project_details',
        'create_project',
        'get_user_details',
        'list_workspace_users',
        'search_asana',
        'add_follower',
        'set_task_due_date',
        'list_project_sections',
        'create_project_section',
        'move_task_to_section',
      ];

      expectedFunctions.forEach((functionName) => {
        expect(ASANA_FUNCTION_SCHEMAS).toHaveProperty(functionName);
        expect(ASANA_FUNCTION_SCHEMAS[functionName]).toHaveProperty(
          'description',
        );
        expect(ASANA_FUNCTION_SCHEMAS[functionName]).toHaveProperty('schema');
      });
    });

    it('should validate list_tasks parameters correctly', () => {
      const schema = ASANA_FUNCTION_SCHEMAS.list_tasks.schema;

      // Valid parameters
      const validParams = {
        project_name: 'Marketing',
        assignee: 'me',
        completed: false,
      };
      expect(() => schema.parse(validParams)).not.toThrow();

      // Empty parameters should be valid
      expect(() => schema.parse({})).not.toThrow();

      // Invalid assignee should be caught
      const invalidParams = {
        assignee: 123, // should be string
      };
      expect(() => schema.parse(invalidParams)).toThrow();
    });

    it('should validate create_task parameters correctly', () => {
      const schema = ASANA_FUNCTION_SCHEMAS.create_task.schema;

      // Valid minimal parameters
      const validParams = {
        name: 'Test Task',
      };
      expect(() => schema.parse(validParams)).not.toThrow();

      // Valid full parameters
      const fullParams = {
        name: 'Test Task',
        project_name: 'Marketing',
        assignee: 'john@example.com',
        due_date: 'tomorrow',
        notes: 'Task description',
      };
      expect(() => schema.parse(fullParams)).not.toThrow();

      // Missing required name should fail
      expect(() => schema.parse({})).toThrow();
    });

    it('should validate get_project_details parameters correctly', () => {
      const schema = ASANA_FUNCTION_SCHEMAS.get_project_details.schema;

      // Valid with project_name
      expect(() => schema.parse({ project_name: 'Marketing' })).not.toThrow();

      // Valid with project_gid
      expect(() => schema.parse({ project_gid: '123456' })).not.toThrow();

      // Empty should be valid (schema allows optional parameters, business logic validates)
      expect(() => schema.parse({})).not.toThrow();
    });
  });

  describe('LLM Function Extractor', () => {
    let extractor: LLMFunctionExtractor;

    beforeEach(() => {
      // Mock OpenAI API calls to avoid real API usage in tests
      global.fetch = vi.fn();
    });

    it('should initialize with OpenAI API key', () => {
      expect(() => new LLMFunctionExtractor('test-key')).not.toThrow();
    });

    it('should throw error without OpenAI API key', () => {
      // Clear environment variable
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = '';

      expect(() => new LLMFunctionExtractor()).toThrow(
        'OpenAI API key is required',
      );

      // Restore environment variable
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    });

    it('should identify likely Asana requests', () => {
      const extractor = new LLMFunctionExtractor('test-key');

      expect(extractor.isLikelyAsanaRequest('create a task')).toBe(true);
      expect(extractor.isLikelyAsanaRequest('list my tasks')).toBe(true);
      expect(extractor.isLikelyAsanaRequest('show project details')).toBe(true);
      expect(extractor.isLikelyAsanaRequest('what is the weather today')).toBe(
        false,
      );
      expect(extractor.isLikelyAsanaRequest('hello world')).toBe(false);
    });

    it('should handle OpenAI API response for function extraction', async () => {
      const extractor = new LLMFunctionExtractor('test-key');

      // Mock successful OpenAI response
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  function_name: 'list_tasks',
                  parameters: { assignee: 'me' },
                  confidence: 0.95,
                  reasoning: 'User wants to list their tasks',
                }),
              },
            },
          ],
        }),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const result = await extractor.extractFunctionCall('show me my tasks');

      expect(result.functionName).toBe('list_tasks');
      expect(result.parameters).toEqual({ assignee: 'me', completed: false });
      expect(result.confidence).toBe(0.95);
    });

    it('should handle OpenAI API errors gracefully', async () => {
      const extractor = new LLMFunctionExtractor('test-key');

      // Mock API error
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const result = await extractor.extractFunctionCall('create a task');

      expect(result.functionName).toBe(null);
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Failed to parse');
    });
  });

  describe('Modern Tool Integration', () => {
    let modernTool: ModernAsanaTool;

    beforeEach(() => {
      // Mock OpenAI for the function extractor
      global.fetch = vi.fn();
      modernTool = new ModernAsanaTool('test-asana-key', 'test-openai-key');
    });

    it('should create DynamicStructuredTool instance', () => {
      const tool = modernTool.createTool();

      expect(tool.name).toBe('modernAsana');
      expect(tool.description).toContain('Modern Asana integration');
      expect(tool.schema).toBeDefined();
    });

    it('should handle list_tasks operation', async () => {
      // Mock successful function extraction
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  function_name: 'list_tasks',
                  parameters: { assignee: 'me' },
                  confidence: 0.95,
                  reasoning: 'User wants to list their tasks',
                }),
              },
            },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      // Mock task operations
      const mockTasks = [
        { gid: 'task1', name: 'Test Task 1', completed: false },
        { gid: 'task2', name: 'Test Task 2', completed: false },
      ];
      vi.mocked(taskOperations.listTasks).mockResolvedValue(mockTasks);

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'show me my tasks',
      });

      expect(result).toContain('Test Task 1');
      expect(result).toContain('Test Task 2');
      expect(taskOperations.listTasks).toHaveBeenCalled();
    });

    it('should handle create_task operation', async () => {
      // Mock successful function extraction
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  function_name: 'create_task',
                  parameters: { name: 'New Test Task' },
                  confidence: 0.95,
                  reasoning: 'User wants to create a task',
                }),
              },
            },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      // Mock task creation
      const mockTask = {
        gid: 'task123',
        name: 'New Test Task',
        permalink_url: 'https://app.asana.com/0/workspace123/task123',
      };
      vi.mocked(taskOperations.createTask).mockResolvedValue(mockTask);
      vi.mocked(userOperations.getUsersMe).mockResolvedValue({
        gid: 'user123',
        name: 'Test User',
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'create a task called "New Test Task"',
      });

      expect(result).toContain('New Test Task');
      expect(taskOperations.createTask).toHaveBeenCalled();
    });

    it('should handle get_project_details operation', async () => {
      // Mock successful function extraction
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  function_name: 'get_project_details',
                  parameters: { project_name: 'Marketing' },
                  confidence: 0.95,
                  reasoning: 'User wants project details',
                }),
              },
            },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      // Mock project operations
      vi.mocked(projectOperations.findProjectGidByName).mockResolvedValue(
        'project123',
      );
      const mockProject = {
        gid: 'project123',
        name: 'Marketing',
        permalink_url: 'https://app.asana.com/0/workspace123/project123',
      };
      vi.mocked(projectOperations.getProjectDetails).mockResolvedValue(
        mockProject,
      );

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'show me details for Marketing project',
      });

      expect(result).toContain('Marketing');
      expect(projectOperations.findProjectGidByName).toHaveBeenCalled();
      expect(projectOperations.getProjectDetails).toHaveBeenCalled();
    });

    it('should handle non-Asana requests gracefully', async () => {
      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'what is the weather today',
      });

      expect(result).toContain("doesn't appear to be an Asana-related request");
    });

    it('should handle extraction failures gracefully', async () => {
      // Mock failed function extraction
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  function_name: null,
                  parameters: {},
                  confidence: 0,
                  reasoning: 'Could not identify Asana operation',
                }),
              },
            },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'create something in asana but unclear what',
      });

      expect(result).toContain('Could not identify Asana operation');
    });
  });

  describe('Factory Function', () => {
    it('should create modern tool via factory function', () => {
      const tool = createModernAsanaTool('test-asana-key', 'test-openai-key');

      expect(tool.name).toBe('modernAsana');
      expect(tool.description).toContain('Modern Asana integration');
    });
  });

  describe('Tool Registry Integration', () => {
    it('should export modern tool from index', async () => {
      const { createModernAsanaTool } = await import('../index');
      expect(createModernAsanaTool).toBeDefined();
      expect(typeof createModernAsanaTool).toBe('function');
    });
  });
});
