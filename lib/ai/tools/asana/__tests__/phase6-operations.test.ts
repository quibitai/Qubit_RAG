/**
 * Phase 6 Operations Tests - Complete Implementation
 * Tests for all 17 operations in the modern Asana tool
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

// Mock all API operations
vi.mock('../api-client/operations/tasks', () => ({
  createTask: vi.fn(),
  listTasks: vi.fn(),
  getTaskDetails: vi.fn(),
  findTaskGidByName: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getSubtasks: vi.fn(),
  addFollowerToTask: vi.fn(),
}));

vi.mock('../api-client/operations/projects', () => ({
  listProjects: vi.fn(),
  findProjectGidByName: vi.fn(),
  createProject: vi.fn(),
  getProjectDetails: vi.fn(),
}));

vi.mock('../api-client/operations/users', () => ({
  getUsersMe: vi.fn(),
  findUserGidByEmailOrName: vi.fn(),
  getUserDetails: vi.fn(),
  listWorkspaceUsers: vi.fn(),
}));

vi.mock('../api-client/operations/search', () => ({
  typeaheadSearch: vi.fn(),
}));

vi.mock('../api-client/operations/sections', () => ({
  getProjectSections: vi.fn(),
  createSectionInProject: vi.fn(),
  addTaskToSection: vi.fn(),
  findSectionGidByName: vi.fn(),
}));

// Mock formatters
vi.mock('../formatters/responseFormatter', () => ({
  formatTaskCreation: vi.fn(() => 'Task created successfully'),
  formatTaskDetails: vi.fn(() => 'Task details'),
  formatTaskUpdate: vi.fn(() => 'Task updated successfully'),
  formatTaskList: vi.fn(() => 'Task list'),
  formatProjectList: vi.fn(() => 'Project list'),
  formatProjectCreation: vi.fn(() => 'Project created successfully'),
  formatProjectDetails: vi.fn(() => 'Project details'),
  formatUserDetails: vi.fn(() => 'User details'),
  formatWorkspaceUsersList: vi.fn(() => 'Workspace users list'),
  formatSearchResults: vi.fn(() => 'Search results'),
  formatAddFollowerResponse: vi.fn(() => 'Follower added successfully'),
  formatSectionList: vi.fn(() => 'Section list'),
  formatSectionCreation: vi.fn(() => 'Section created successfully'),
  formatTaskMoveToSection: vi.fn(() => 'Task moved to section successfully'),
}));

// Mock context managers
vi.mock('../context/taskContext', () => ({
  taskContextManager: {
    getSessionId: vi.fn(() => 'session123'),
    addTaskContext: vi.fn(),
    addProjectContext: vi.fn(),
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

describe('ModernAsanaTool - Phase 6 Complete Operations', () => {
  let modernTool: ModernAsanaTool;
  let mockExtractor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    modernTool = new ModernAsanaTool('test-api-key', 'test-openai-key');
    mockExtractor = (modernTool as any).functionExtractor;
  });

  describe('Task Operations', () => {
    it('should handle get_task_details operation', async () => {
      const { findTaskGidByName, getTaskDetails } = await import(
        '../api-client/operations/tasks'
      );

      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
      });
      (getTaskDetails as any).mockResolvedValue({
        gid: 'task123',
        name: 'Test Task',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_task_details',
        parameters: { task_name: 'Test Task' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show me details for Test Task',
      });

      expect(result).toBe('Task details');
      expect(getTaskDetails).toHaveBeenCalledWith(
        expect.any(Object),
        'task123',
        undefined,
        'req123',
      );
    });

    it('should handle update_task operation', async () => {
      const { findTaskGidByName, updateTask } = await import(
        '../api-client/operations/tasks'
      );

      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
      });
      (updateTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Updated Task',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'update_task',
        parameters: { task_name: 'Test Task', notes: 'Updated notes' },
        confidence: 0.9,
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
        'req123',
      );
    });

    it('should handle complete_task operation', async () => {
      const { findTaskGidByName, updateTask } = await import(
        '../api-client/operations/tasks'
      );

      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
      });
      (updateTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Completed Task',
        completed: true,
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'complete_task',
        parameters: { task_name: 'Test Task' },
        confidence: 0.9,
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
        'req123',
      );
    });

    it('should handle delete_task operation', async () => {
      const { findTaskGidByName, deleteTask } = await import(
        '../api-client/operations/tasks'
      );

      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
      });
      (deleteTask as any).mockResolvedValue(true);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'delete_task',
        parameters: { task_name: 'Test Task' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Delete Test Task',
      });

      expect(result).toContain('Successfully deleted task');
      expect(deleteTask).toHaveBeenCalledWith(
        expect.any(Object),
        'task123',
        'req123',
      );
    });

    it('should handle add_subtask operation', async () => {
      const { findTaskGidByName, createTask } = await import(
        '../api-client/operations/tasks'
      );
      const { getUsersMe } = await import('../api-client/operations/users');

      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'parent123',
      });
      (getUsersMe as any).mockResolvedValue({ gid: 'user123' });
      (createTask as any).mockResolvedValue({
        gid: 'subtask123',
        name: 'New Subtask',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'add_subtask',
        parameters: {
          parent_task_name: 'Parent Task',
          subtask_name: 'New Subtask',
          assignee: 'me',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Add subtask to Parent Task',
      });

      expect(result).toBe('Task created successfully');
      expect(createTask).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'New Subtask',
          parent: 'parent123',
          assignee: 'user123',
        }),
        'req123',
      );
    });

    it('should handle list_subtasks operation', async () => {
      const { findTaskGidByName, getSubtasks } = await import(
        '../api-client/operations/tasks'
      );

      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'parent123',
      });
      (getSubtasks as any).mockResolvedValue([
        { gid: 'sub1', name: 'Subtask 1' },
        { gid: 'sub2', name: 'Subtask 2' },
      ]);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_subtasks',
        parameters: { parent_task_name: 'Parent Task' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show subtasks of Parent Task',
      });

      expect(result).toBe('Task list');
      expect(getSubtasks).toHaveBeenCalledWith(
        expect.any(Object),
        'parent123',
        undefined,
        'req123',
      );
    });

    it('should handle set_task_due_date operation', async () => {
      const { findTaskGidByName, updateTask } = await import(
        '../api-client/operations/tasks'
      );

      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
      });
      (updateTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Task with Due Date',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'set_task_due_date',
        parameters: { task_name: 'Test Task', due_date: 'tomorrow' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Set due date for Test Task to tomorrow',
      });

      expect(result).toBe('Task updated successfully');
      expect(updateTask).toHaveBeenCalledWith(
        expect.any(Object),
        'task123',
        { due_on: '2024-01-15' },
        'req123',
      );
    });

    it('should handle add_follower operation', async () => {
      const { findTaskGidByName, addFollowerToTask } = await import(
        '../api-client/operations/tasks'
      );
      const { findUserGidByEmailOrName } = await import(
        '../api-client/operations/users'
      );

      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
      });
      (findUserGidByEmailOrName as any).mockResolvedValue('user123');
      (addFollowerToTask as any).mockResolvedValue({
        gid: 'task123',
        name: 'Task with Follower',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'add_follower',
        parameters: {
          task_name: 'Test Task',
          user_identifier: 'john@example.com',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Add john@example.com as follower to Test Task',
      });

      expect(result).toBe('Follower added successfully');
      expect(addFollowerToTask).toHaveBeenCalledWith(
        expect.any(Object),
        'task123',
        'user123',
        'req123',
      );
    });
  });

  describe('Project Operations', () => {
    it('should handle list_projects operation', async () => {
      const { listProjects } = await import(
        '../api-client/operations/projects'
      );

      (listProjects as any).mockResolvedValue([
        { gid: 'proj1', name: 'Project 1' },
        { gid: 'proj2', name: 'Project 2' },
      ]);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_projects',
        parameters: {},
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show me all projects',
      });

      expect(result).toBe('Project list');
      expect(listProjects).toHaveBeenCalledWith(
        expect.any(Object),
        'workspace123',
        false,
        'req123',
      );
    });

    it('should handle create_project operation', async () => {
      const { createProject } = await import(
        '../api-client/operations/projects'
      );

      (createProject as any).mockResolvedValue({
        gid: 'proj123',
        name: 'New Project',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_project',
        parameters: {
          name: 'New Project',
          notes: 'Project description',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a new project called New Project',
      });

      expect(result).toBe('Project created successfully');
      expect(createProject).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'New Project',
          notes: 'Project description',
          workspace: 'workspace123',
          privacy_setting: 'public_to_workspace',
        }),
        'req123',
      );
    });

    it('should handle list_project_sections operation', async () => {
      const { findProjectGidByName } = await import(
        '../api-client/operations/projects'
      );
      const { getProjectSections } = await import(
        '../api-client/operations/sections'
      );

      (findProjectGidByName as any).mockResolvedValue('proj123');
      (getProjectSections as any).mockResolvedValue([
        { gid: 'sec1', name: 'To Do' },
        { gid: 'sec2', name: 'In Progress' },
      ]);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_project_sections',
        parameters: { project_name: 'Test Project' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show sections in Test Project',
      });

      expect(result).toBe('Section list');
      expect(getProjectSections).toHaveBeenCalledWith(
        expect.any(Object),
        'proj123',
        undefined,
        'req123',
      );
    });

    it('should handle create_project_section operation', async () => {
      const { findProjectGidByName } = await import(
        '../api-client/operations/projects'
      );
      const { createSectionInProject } = await import(
        '../api-client/operations/sections'
      );

      (findProjectGidByName as any).mockResolvedValue('proj123');
      (createSectionInProject as any).mockResolvedValue({
        gid: 'sec123',
        name: 'New Section',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_project_section',
        parameters: {
          project_name: 'Test Project',
          section_name: 'New Section',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a new section in Test Project',
      });

      expect(result).toBe('Section created successfully');
      expect(createSectionInProject).toHaveBeenCalledWith(
        expect.any(Object),
        { name: 'New Section', projectGid: 'proj123' },
        'req123',
      );
    });

    it('should handle move_task_to_section operation', async () => {
      const { findTaskGidByName } = await import(
        '../api-client/operations/tasks'
      );
      const { findProjectGidByName } = await import(
        '../api-client/operations/projects'
      );
      const { findSectionGidByName, addTaskToSection } = await import(
        '../api-client/operations/sections'
      );

      (findTaskGidByName as any).mockResolvedValue({
        type: 'found',
        gid: 'task123',
      });
      (findProjectGidByName as any).mockResolvedValue('proj123');
      (findSectionGidByName as any).mockResolvedValue('sec123');
      (addTaskToSection as any).mockResolvedValue({
        gid: 'task123',
        name: 'Moved Task',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'move_task_to_section',
        parameters: {
          task_name: 'Test Task',
          section_name: 'In Progress',
          project_name: 'Test Project',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Move Test Task to In Progress section',
      });

      expect(result).toBe('Task moved to section successfully');
      expect(addTaskToSection).toHaveBeenCalledWith(
        expect.any(Object),
        'sec123',
        'task123',
        'req123',
      );
    });
  });

  describe('User Operations', () => {
    it('should handle get_user_details operation for "me"', async () => {
      const { getUsersMe } = await import('../api-client/operations/users');

      (getUsersMe as any).mockResolvedValue({
        gid: 'user123',
        name: 'Current User',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_user_details',
        parameters: { user_identifier: 'me' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show my user details',
      });

      expect(result).toBe('User details');
      expect(getUsersMe).toHaveBeenCalledWith(expect.any(Object), 'req123');
    });

    it('should handle get_user_details operation for specific user', async () => {
      const { findUserGidByEmailOrName, getUserDetails } = await import(
        '../api-client/operations/users'
      );

      (findUserGidByEmailOrName as any).mockResolvedValue('user123');
      (getUserDetails as any).mockResolvedValue({
        gid: 'user123',
        name: 'John Doe',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_user_details',
        parameters: { user_name: 'John Doe' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show details for John Doe',
      });

      expect(result).toBe('User details');
      expect(getUserDetails).toHaveBeenCalledWith(
        expect.any(Object),
        'user123',
        'req123',
      );
    });

    it('should handle list_workspace_users operation', async () => {
      const { listWorkspaceUsers } = await import(
        '../api-client/operations/users'
      );

      (listWorkspaceUsers as any).mockResolvedValue([
        { gid: 'user1', name: 'User 1' },
        { gid: 'user2', name: 'User 2' },
      ]);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_workspace_users',
        parameters: {},
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show all workspace users',
      });

      expect(result).toBe('Workspace users list');
      expect(listWorkspaceUsers).toHaveBeenCalledWith(
        expect.any(Object),
        'workspace123',
        'req123',
      );
    });
  });

  describe('Search Operations', () => {
    it('should handle search_asana operation', async () => {
      const { typeaheadSearch } = await import(
        '../api-client/operations/search'
      );

      (typeaheadSearch as any).mockResolvedValue([
        { gid: 'task1', name: 'Search Result 1', resource_type: 'task' },
        { gid: 'proj1', name: 'Search Result 2', resource_type: 'project' },
      ]);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'search_asana',
        parameters: {
          query: 'design',
          resource_type: 'task',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Search for design tasks',
      });

      expect(result).toBe('Search results');
      expect(typeaheadSearch).toHaveBeenCalledWith(
        expect.any(Object),
        {
          workspaceGid: 'workspace123',
          query: 'design',
          resourceType: 'task',
        },
        'req123',
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle ambiguous task names', async () => {
      const { findTaskGidByName } = await import(
        '../api-client/operations/tasks'
      );

      (findTaskGidByName as any).mockResolvedValue({
        type: 'ambiguous',
        message: 'Multiple tasks found with name "Test"',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_task_details',
        parameters: { task_name: 'Test' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show details for Test task',
      });

      expect(result).toContain('Multiple tasks found with name "Test"');
    });

    it('should handle task not found', async () => {
      const { findTaskGidByName } = await import(
        '../api-client/operations/tasks'
      );

      (findTaskGidByName as any).mockResolvedValue({ type: 'not_found' });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_task_details',
        parameters: { task_name: 'Nonexistent Task' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show details for Nonexistent Task',
      });

      expect(result).toContain('Could not find task: Nonexistent Task');
    });

    it('should handle workspace not configured', async () => {
      const { getWorkspaceGid } = await import('../config');

      (getWorkspaceGid as any).mockReturnValue(null);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_tasks',
        parameters: {},
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'List my tasks',
      });

      expect(result).toContain('Asana workspace is not configured');
    });
  });
});
