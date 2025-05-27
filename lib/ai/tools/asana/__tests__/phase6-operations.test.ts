/**
 * Phase 6 - Complete Operation Implementation Tests
 * Tests for all implemented operations in the modern Asana tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModernAsanaTool } from '../modernAsanaTool';
import { ASANA_FUNCTION_SCHEMAS } from '../schemas/functionSchemas';

// Mock the API client and operations
vi.mock('../api-client', () => ({
  createAsanaClient: vi.fn(() => ({
    request: vi.fn(),
    createResource: vi.fn(),
  })),
}));

vi.mock('../api-client/operations/tasks', () => ({
  findTaskGidByName: vi.fn(),
  getTaskDetails: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getSubtasks: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
}));

vi.mock('../api-client/operations/projects', () => ({
  listProjects: vi.fn(),
}));

vi.mock('../intent-parser/llmFunctionExtractor', () => ({
  LLMFunctionExtractor: vi.fn().mockImplementation(() => ({
    isLikelyAsanaRequest: vi.fn(() => true),
    extractFunctionCall: vi.fn(),
  })),
}));

vi.mock('../context/contextResolver', () => ({
  contextResolver: {
    resolveParameters: vi.fn((sessionId, functionName, params) => ({
      resolved: params,
      resolutions: [],
    })),
  },
}));

vi.mock('../context/conversationContext', () => ({
  conversationContextManager: {
    addMessage: vi.fn(),
    getConversationContext: vi.fn(() => ({})),
    addOperation: vi.fn(),
    addTaskContext: vi.fn(),
    addProjectContext: vi.fn(),
    addUserContext: vi.fn(),
  },
}));

vi.mock('../formatters/responseFormatter', () => ({
  formatTaskDetails: vi.fn(() => 'Task details formatted'),
  formatTaskUpdate: vi.fn(() => 'Task updated successfully'),
  formatTaskList: vi.fn(() => 'Task list formatted'),
  formatProjectList: vi.fn(() => 'Project list formatted'),
}));

describe('Phase 6 - Complete Operation Implementation', () => {
  let modernTool: ModernAsanaTool;
  let mockExtractor: any;

  beforeEach(() => {
    modernTool = new ModernAsanaTool();
    mockExtractor = (modernTool as any).functionExtractor;
  });

  describe('Task Operations', () => {
    it('should handle get_task_details operation', async () => {
      const { findTaskGidByName, getTaskDetails } = await import(
        '../api-client/operations/tasks'
      );

      // Mock successful task lookup
      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
        name: 'Test Task',
      });

      // Mock task details response
      (getTaskDetails as any).mockResolvedValue({
        gid: 'task123',
        name: 'Test Task',
        completed: false,
      });

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_task_details',
        parameters: { task_name: 'Test Task' },
        confidence: 0.95,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show me details for Test Task',
      });

      expect(result).toBe('Task details formatted');
      expect(findTaskGidByName).toHaveBeenCalledWith(
        expect.any(Object),
        'Test Task',
        'workspace123',
        undefined,
        false,
        expect.any(String),
      );
      expect(getTaskDetails).toHaveBeenCalledWith(
        expect.any(Object),
        'task123',
        undefined,
        expect.any(String),
      );
    });

    it('should handle update_task operation', async () => {
      const { findTaskGidByName, updateTask } = await import(
        '../api-client/operations/tasks'
      );

      // Mock successful task lookup
      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
        name: 'Test Task',
      });

      // Mock task update response
      (updateTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Test Task',
        notes: 'Updated notes',
      });

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'update_task',
        parameters: {
          task_name: 'Test Task',
          notes: 'Updated notes',
        },
        confidence: 0.95,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Update Test Task with new notes',
      });

      expect(result).toBe('Task updated successfully');
      expect(updateTask).toHaveBeenCalledWith(
        expect.any(Object),
        'task123',
        { notes: 'Updated notes' },
        expect.any(String),
      );
    });

    it('should handle complete_task operation', async () => {
      const { findTaskGidByName, updateTask } = await import(
        '../api-client/operations/tasks'
      );

      // Mock successful task lookup
      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
        name: 'Test Task',
      });

      // Mock task completion response
      (updateTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Test Task',
        completed: true,
      });

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'complete_task',
        parameters: { task_name: 'Test Task' },
        confidence: 0.95,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Mark Test Task as complete',
      });

      expect(result).toBe('Task updated successfully');
      expect(updateTask).toHaveBeenCalledWith(
        expect.any(Object),
        'task123',
        { completed: true },
        expect.any(String),
      );
    });

    it('should handle delete_task operation', async () => {
      const { findTaskGidByName, deleteTask } = await import(
        '../api-client/operations/tasks'
      );

      // Mock successful task lookup
      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
        name: 'Test Task',
      });

      // Mock successful deletion
      (deleteTask as any).mockResolvedValue(true);

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'delete_task',
        parameters: { task_name: 'Test Task' },
        confidence: 0.95,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Delete Test Task',
      });

      expect(result).toContain('Successfully deleted task "Test Task"');
      expect(deleteTask).toHaveBeenCalledWith(
        expect.any(Object),
        'task123',
        expect.any(String),
      );
    });

    it('should handle list_subtasks operation', async () => {
      const { findTaskGidByName, getSubtasks } = await import(
        '../api-client/operations/tasks'
      );

      // Mock successful parent task lookup
      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'parent123',
        name: 'Parent Task',
      });

      // Mock subtasks response
      (getSubtasks as any).mockResolvedValue([
        { gid: 'sub1', name: 'Subtask 1' },
        { gid: 'sub2', name: 'Subtask 2' },
      ]);

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_subtasks',
        parameters: { parent_task_name: 'Parent Task' },
        confidence: 0.95,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show subtasks of Parent Task',
      });

      expect(result).toBe('Task list formatted');
      expect(getSubtasks).toHaveBeenCalledWith(
        expect.any(Object),
        'parent123',
        undefined,
        expect.any(String),
      );
    });
  });

  describe('Project Operations', () => {
    it('should handle list_projects operation', async () => {
      const { listProjects } = await import(
        '../api-client/operations/projects'
      );

      // Mock projects response
      (listProjects as any).mockResolvedValue([
        { gid: 'proj1', name: 'Project 1' },
        { gid: 'proj2', name: 'Project 2' },
      ]);

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_projects',
        parameters: {},
        confidence: 0.95,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show me all projects',
      });

      expect(result).toBe('Project list formatted');
      expect(listProjects).toHaveBeenCalledWith(
        expect.any(Object),
        'workspace123',
        false,
        expect.any(String),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle ambiguous task name resolution', async () => {
      const { findTaskGidByName } = await import(
        '../api-client/operations/tasks'
      );

      // Mock ambiguous task lookup
      (findTaskGidByName as any).mockResolvedValue({
        type: 'ambiguous',
        message: 'Multiple tasks found with that name',
      });

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_task_details',
        parameters: { task_name: 'Ambiguous Task' },
        confidence: 0.95,
      });

      const tool = modernTool.createTool();

      const result = await tool.func({
        action_description: 'Show details for Ambiguous Task',
      });

      expect(result).toContain('Multiple tasks found with that name');
    });

    it('should handle task not found', async () => {
      const { findTaskGidByName } = await import(
        '../api-client/operations/tasks'
      );

      // Mock task not found
      (findTaskGidByName as any).mockResolvedValue({
        type: 'not_found',
      });

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_task_details',
        parameters: { task_name: 'Nonexistent Task' },
        confidence: 0.95,
      });

      const tool = modernTool.createTool();

      const result = await tool.func({
        action_description: 'Show details for Nonexistent Task',
      });

      expect(result).toContain('Could not find task: Nonexistent Task');
    });

    it('should handle missing workspace configuration', async () => {
      // Temporarily clear the workspace environment variable
      const originalWorkspace = process.env.ASANA_DEFAULT_WORKSPACE_GID;
      process.env.ASANA_DEFAULT_WORKSPACE_GID = '';

      const { listTasks } = await import('../api-client/operations/tasks');

      // Mock listTasks to throw an error when workspace is not configured
      (listTasks as any).mockRejectedValue(
        new Error('Workspace GID not configured'),
      );

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_tasks',
        parameters: {},
        confidence: 0.95,
      });

      const tool = modernTool.createTool();

      const result = await tool.func({
        action_description: 'List my tasks',
      });

      expect(result).toContain('Workspace GID not configured');

      // Restore the workspace environment variable
      if (originalWorkspace) {
        process.env.ASANA_DEFAULT_WORKSPACE_GID = originalWorkspace;
      }
    });
  });

  describe('Context Integration', () => {
    it('should track operations in conversation context', async () => {
      const { conversationContextManager } = await import(
        '../context/conversationContext'
      );
      const { findTaskGidByName, getTaskDetails } = await import(
        '../api-client/operations/tasks'
      );

      // Mock successful task lookup and details
      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
        name: 'Test Task',
      });

      (getTaskDetails as any).mockResolvedValue({
        gid: 'task123',
        name: 'Test Task',
        completed: false,
      });

      // Mock LLM extraction
      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_task_details',
        parameters: { task_name: 'Test Task' },
        confidence: 0.95,
      });

      const tool = modernTool.createTool();
      await tool.func({
        action_description: 'Show me details for Test Task',
        session_id: 'test-session',
      });

      expect(conversationContextManager.addMessage).toHaveBeenCalledWith(
        'test-session',
        'user',
        'Show me details for Test Task',
        expect.any(Object),
      );

      expect(conversationContextManager.addOperation).toHaveBeenCalledWith(
        'test-session',
        expect.objectContaining({
          type: 'get_task_details',
          success: true,
        }),
      );
    });
  });
});
