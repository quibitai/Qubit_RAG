/**
 * Modern Asana Tool - CREATE_TASK Operation Tests
 * Tests the new confirmation dialog behavior and comprehensive task creation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModernAsanaTool } from '../modernAsanaTool';

// Mock all dependencies
vi.mock('../api-client', () => ({
  createAsanaClient: vi.fn(() => ({
    request: vi.fn(),
  })),
}));

vi.mock('../config', () => ({
  getWorkspaceGid: vi.fn(() => 'workspace123'),
}));

vi.mock('../types', () => ({
  generateRequestId: vi.fn(() => 'req123'),
}));

// Mock API operations
vi.mock('../api-client/operations/tasks', () => ({
  createTask: vi.fn(),
  findTaskGidByName: vi.fn(),
}));

vi.mock('../api-client/operations/projects', () => ({
  findProjectGidByName: vi.fn(),
}));

vi.mock('../api-client/operations/users', () => ({
  getUsersMe: vi.fn(),
  findUserGidByEmailOrName: vi.fn(),
}));

// Mock formatters
vi.mock('../formatters/responseFormatter', () => ({
  formatTaskCreation: vi.fn(() => 'Task created successfully'),
}));

// Mock context managers
vi.mock('../context/taskContext', () => ({
  taskContextManager: {
    getSessionId: vi.fn(() => 'session123'),
    addTaskContext: vi.fn(),
  },
}));

vi.mock('../context/conversationContext', () => ({
  conversationContextManager: {
    addMessage: vi.fn(),
    getConversationContext: vi.fn(() => ({})),
    addOperation: vi.fn(),
    addTaskContext: vi.fn(),
  },
}));

vi.mock('../context/contextResolver', () => ({
  contextResolver: {
    resolveParameters: vi.fn((sessionId, functionName, params) => ({
      resolved: params,
      resolutions: [],
    })),
  },
}));

// Mock LLM function extractor
vi.mock('../intent-parser/llmFunctionExtractor', () => ({
  LLMFunctionExtractor: vi.fn(() => ({
    isLikelyAsanaRequest: vi.fn(() => true),
    extractFunctionCall: vi.fn(),
  })),
}));

// Mock date parser
vi.mock('../utils/dateTimeParser', () => ({
  parseDateTime: vi.fn(() => ({
    success: true,
    formattedForAsana: { due_on: '2024-01-15' },
  })),
}));

describe('ModernAsanaTool - CREATE_TASK Operation', () => {
  let modernTool: ModernAsanaTool;
  let mockExtractor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    modernTool = new ModernAsanaTool('test-api-key', 'test-openai-key');
    mockExtractor = (modernTool as any).functionExtractor;
  });

  describe('Task Creation with Confirmation Dialog', () => {
    it('should show confirmation dialog for simple task creation', async () => {
      const { createTask } = await import('../api-client/operations/tasks');

      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Simple Task',
        permalink_url: 'https://app.asana.com/0/0/task123',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: { name: 'Simple Task' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task called Simple Task',
      });

      expect(result).toBe('Task created successfully');
      expect(createTask).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'Simple Task',
          workspace: 'workspace123',
        }),
        'req123',
      );
    });

    it('should handle task creation with notes', async () => {
      const { createTask } = await import('../api-client/operations/tasks');

      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Task with Notes',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: {
          name: 'Task with Notes',
          notes: 'These are detailed notes',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task with notes',
      });

      expect(result).toBe('Task created successfully');
      expect(createTask).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'Task with Notes',
          notes: 'These are detailed notes',
          workspace: 'workspace123',
        }),
        'req123',
      );
    });

    it('should handle task creation with project assignment', async () => {
      const { createTask } = await import('../api-client/operations/tasks');
      const { findProjectGidByName } = await import(
        '../api-client/operations/projects'
      );

      (findProjectGidByName as any).mockResolvedValue('project123');
      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Project Task',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: {
          name: 'Project Task',
          project_name: 'Development',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task in Development project',
      });

      expect(result).toBe('Task created successfully');
      expect(createTask).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'Project Task',
          projects: ['project123'],
          workspace: 'workspace123',
        }),
        'req123',
      );
    });

    it('should handle task creation with assignee "me"', async () => {
      const { createTask } = await import('../api-client/operations/tasks');
      const { getUsersMe } = await import('../api-client/operations/users');

      (getUsersMe as any).mockResolvedValue({ gid: 'user123' });
      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'My Task',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: {
          name: 'My Task',
          assignee: 'me',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task and assign it to me',
      });

      expect(result).toBe('Task created successfully');
      expect(createTask).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'My Task',
          assignee: 'user123',
          workspace: 'workspace123',
        }),
        'req123',
      );
    });

    it('should handle task creation with due date', async () => {
      const { createTask } = await import('../api-client/operations/tasks');

      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Task with Due Date',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: {
          name: 'Task with Due Date',
          due_date: 'tomorrow',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task due tomorrow',
      });

      expect(result).toBe('Task created successfully');
      expect(createTask).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'Task with Due Date',
          due_on: '2024-01-15',
          workspace: 'workspace123',
        }),
        'req123',
      );
    });

    it('should handle task creation with specific assignee', async () => {
      const { createTask } = await import('../api-client/operations/tasks');
      const { findUserGidByEmailOrName } = await import(
        '../api-client/operations/users'
      );

      (findUserGidByEmailOrName as any).mockResolvedValue('user456');
      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Assigned Task',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: {
          name: 'Assigned Task',
          assignee: 'john@example.com',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task and assign it to john@example.com',
      });

      expect(result).toBe('Task created successfully');
      expect(createTask).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'Assigned Task',
          assignee: 'user456',
          workspace: 'workspace123',
        }),
        'req123',
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle project not found gracefully', async () => {
      const { createTask } = await import('../api-client/operations/tasks');
      const { findProjectGidByName } = await import(
        '../api-client/operations/projects'
      );

      (findProjectGidByName as any).mockResolvedValue(null);
      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Task without Project',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: {
          name: 'Task without Project',
          project_name: 'Nonexistent Project',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task in nonexistent project',
      });

      expect(result).toBe('Task created successfully');
      // Should create task without project when project not found
      expect(createTask).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'Task without Project',
          workspace: 'workspace123',
          // No projects array should be included
        }),
        'req123',
      );
    });

    it('should handle user not found gracefully', async () => {
      const { createTask } = await import('../api-client/operations/tasks');
      const { findUserGidByEmailOrName } = await import(
        '../api-client/operations/users'
      );

      (findUserGidByEmailOrName as any).mockResolvedValue(null);
      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Unassigned Task',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: {
          name: 'Unassigned Task',
          assignee: 'nonexistent@example.com',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task and assign to nonexistent user',
      });

      expect(result).toBe('Task created successfully');
      // Should create task without assignee when user not found
      expect(createTask).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'Unassigned Task',
          workspace: 'workspace123',
          // No assignee should be included
        }),
        'req123',
      );
    });

    it('should handle API errors gracefully', async () => {
      const { createTask } = await import('../api-client/operations/tasks');

      (createTask as any).mockRejectedValue(new Error('API connection failed'));

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: { name: 'Failing Task' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task that will fail',
      });

      expect(result).toContain('I encountered an error processing');
      expect(result).toContain('API connection failed');
    });

    it('should handle workspace not configured', async () => {
      const { getWorkspaceGid } = await import('../config');

      (getWorkspaceGid as any).mockReturnValue(null);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: { name: 'Test Task' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a task',
      });

      expect(result).toContain('Asana workspace is not configured');
    });
  });

  describe('Context Integration', () => {
    it('should track created task in context', async () => {
      const { createTask } = await import('../api-client/operations/tasks');
      const { getWorkspaceGid } = await import('../config');

      // Ensure workspace is configured for this test
      (getWorkspaceGid as any).mockReturnValue('workspace123');

      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Context Task',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: { name: 'Context Task' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a context task',
      });

      expect(result).toBe('Task created successfully');
      expect(createTask).toHaveBeenCalled();

      // Get the mocked taskContextManager from the mock
      const { taskContextManager } = await import('../context/taskContext');
      expect(taskContextManager.addTaskContext).toHaveBeenCalledWith(
        'session123',
        'task123',
        'Context Task',
        'CREATE',
        undefined,
        undefined,
      );
    });

    it('should use session ID for context tracking', async () => {
      const { createTask } = await import('../api-client/operations/tasks');
      const { conversationContextManager } = await import(
        '../context/conversationContext'
      );

      (createTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Session Task',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_task',
        parameters: { name: 'Session Task' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      await tool.func({
        action_description: 'Create a session task',
        session_id: 'custom_session_123',
      });

      expect(conversationContextManager.addMessage).toHaveBeenCalledWith(
        'custom_session_123',
        'user',
        'Create a session task',
        expect.any(Object),
      );
    });
  });
});
