/**
 * Modern Asana Tool - Project Operations Tests
 * Comprehensive tests for project-related operations
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
vi.mock('../api-client/operations/projects', () => ({
  findProjectGidByName: vi.fn(),
  getProjectDetails: vi.fn(),
  createProject: vi.fn(),
  listProjects: vi.fn(),
}));

// Mock formatters
vi.mock('../formatters/responseFormatter', () => ({
  formatProjectDetails: vi.fn(() => 'Project details formatted'),
  formatProjectCreation: vi.fn(() => 'Project created successfully'),
  formatProjectList: vi.fn(() => 'Projects listed successfully'),
}));

// Mock context managers
vi.mock('../context/taskContext', () => ({
  taskContextManager: {
    getSessionId: vi.fn(() => 'session123'),
    addProjectContext: vi.fn(),
  },
}));

vi.mock('../context/conversationContext', () => ({
  conversationContextManager: {
    addMessage: vi.fn(),
    getConversationContext: vi.fn(() => ({})),
    addOperation: vi.fn(),
    addProjectContext: vi.fn(),
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

describe('ModernAsanaTool - Project Operations', () => {
  let modernTool: ModernAsanaTool;
  let mockExtractor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    modernTool = new ModernAsanaTool('test-api-key', 'test-openai-key');
    mockExtractor = (modernTool as any).functionExtractor;
  });

  describe('get_project_details Operation', () => {
    it('should get project details by name', async () => {
      const { findProjectGidByName, getProjectDetails } = await import(
        '../api-client/operations/projects'
      );

      (findProjectGidByName as any).mockResolvedValue('project123');
      (getProjectDetails as any).mockResolvedValue({
        gid: 'project123',
        name: 'Development Project',
        notes: 'Main development project',
        created_at: '2024-01-01T00:00:00.000Z',
        modified_at: '2024-01-15T12:00:00.000Z',
        owner: { gid: 'user123', name: 'John Doe' },
        team: { gid: 'team123', name: 'Engineering' },
        members: [
          { gid: 'user123', name: 'John Doe' },
          { gid: 'user456', name: 'Jane Smith' },
        ],
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_project_details',
        parameters: { project_name: 'Development Project' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show me details for Development Project',
      });

      expect(result).toBe('Project details formatted');
      expect(findProjectGidByName).toHaveBeenCalledWith(
        expect.any(Object),
        'Development Project',
        'workspace123',
        'req123',
      );
      expect(getProjectDetails).toHaveBeenCalledWith(
        expect.any(Object),
        'project123',
        'req123',
      );
    });

    it('should get project details by GID', async () => {
      const { getProjectDetails } = await import(
        '../api-client/operations/projects'
      );

      (getProjectDetails as any).mockResolvedValue({
        gid: 'project456',
        name: 'Marketing Campaign',
        notes: 'Q1 marketing campaign',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_project_details',
        parameters: { project_gid: 'project456' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show project details for project456',
      });

      expect(result).toBe('Project details formatted');
      expect(getProjectDetails).toHaveBeenCalledWith(
        expect.any(Object),
        'project456',
        'req123',
      );
    });

    it('should handle project not found', async () => {
      const { findProjectGidByName } = await import(
        '../api-client/operations/projects'
      );

      (findProjectGidByName as any).mockResolvedValue(null);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_project_details',
        parameters: { project_name: 'Nonexistent Project' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show details for Nonexistent Project',
      });

      expect(result).toContain('Could not find project: Nonexistent Project');
    });

    it('should handle API errors gracefully', async () => {
      const { findProjectGidByName, getProjectDetails } = await import(
        '../api-client/operations/projects'
      );

      (findProjectGidByName as any).mockResolvedValue('project123');
      (getProjectDetails as any).mockRejectedValue(
        new Error('Project access denied'),
      );

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_project_details',
        parameters: { project_name: 'Restricted Project' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show details for Restricted Project',
      });

      expect(result).toContain('I encountered an error processing');
      expect(result).toContain('Project access denied');
    });
  });

  describe('create_project Operation', () => {
    it('should create a simple project', async () => {
      const { createProject } = await import(
        '../api-client/operations/projects'
      );

      (createProject as any).mockResolvedValue({
        gid: 'project789',
        name: 'New Project',
        notes: '',
        privacy_setting: 'public_to_workspace',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_project',
        parameters: { name: 'New Project' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a project called New Project',
      });

      expect(result).toBe('Project created successfully');
      expect(createProject).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'New Project',
          workspace: 'workspace123',
          privacy_setting: 'public_to_workspace',
        }),
        'req123',
      );
    });

    it('should create a project with notes', async () => {
      const { createProject } = await import(
        '../api-client/operations/projects'
      );

      (createProject as any).mockResolvedValue({
        gid: 'project790',
        name: 'Detailed Project',
        notes: 'This project has detailed notes',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_project',
        parameters: {
          name: 'Detailed Project',
          notes: 'This project has detailed notes',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a project with detailed notes',
      });

      expect(result).toBe('Project created successfully');
      expect(createProject).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'Detailed Project',
          notes: 'This project has detailed notes',
          workspace: 'workspace123',
          privacy_setting: 'public_to_workspace',
        }),
        'req123',
      );
    });

    it('should create a private project', async () => {
      const { createProject } = await import(
        '../api-client/operations/projects'
      );

      (createProject as any).mockResolvedValue({
        gid: 'project791',
        name: 'Private Project',
        privacy_setting: 'private',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_project',
        parameters: {
          name: 'Private Project',
          privacy_setting: 'private',
        },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a private project',
      });

      expect(result).toBe('Project created successfully');
      expect(createProject).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          name: 'Private Project',
          privacy_setting: 'private',
          workspace: 'workspace123',
        }),
        'req123',
      );
    });

    it('should handle project creation errors', async () => {
      const { createProject } = await import(
        '../api-client/operations/projects'
      );

      (createProject as any).mockRejectedValue(
        new Error('Project name already exists'),
      );

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_project',
        parameters: { name: 'Duplicate Project' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Create a project with duplicate name',
      });

      expect(result).toContain('I encountered an error processing');
      expect(result).toContain('Project name already exists');
    });

    it('should track created project in context', async () => {
      const { createProject } = await import(
        '../api-client/operations/projects'
      );
      const { taskContextManager } = await import('../context/taskContext');

      (createProject as any).mockResolvedValue({
        gid: 'project792',
        name: 'Context Project',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'create_project',
        parameters: { name: 'Context Project' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      await tool.func({
        action_description: 'Create a context project',
      });

      expect(taskContextManager.addProjectContext).toHaveBeenCalledWith(
        'project792',
        'Context Project',
      );
    });
  });

  describe('list_projects Operation', () => {
    it('should list all projects', async () => {
      const { listProjects } = await import(
        '../api-client/operations/projects'
      );

      (listProjects as any).mockResolvedValue([
        { gid: 'project1', name: 'Project Alpha' },
        { gid: 'project2', name: 'Project Beta' },
        { gid: 'project3', name: 'Project Gamma' },
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

      expect(result).toBe('Projects listed successfully');
      expect(listProjects).toHaveBeenCalledWith(
        expect.any(Object),
        'workspace123',
        false, // archived parameter
        'req123',
      );
    });

    it('should handle empty project list', async () => {
      const { listProjects } = await import(
        '../api-client/operations/projects'
      );

      (listProjects as any).mockResolvedValue([]);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_projects',
        parameters: {},
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'List all projects',
      });

      expect(result).toBe('Projects listed successfully');
    });

    it('should handle list projects API error', async () => {
      const { listProjects } = await import(
        '../api-client/operations/projects'
      );

      (listProjects as any).mockRejectedValue(
        new Error('Workspace access denied'),
      );

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_projects',
        parameters: {},
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show all projects',
      });

      expect(result).toContain('I encountered an error processing');
      expect(result).toContain('Workspace access denied');
    });
  });

  describe('Error Handling', () => {
    it('should handle workspace not configured', async () => {
      const { getWorkspaceGid } = await import('../config');

      (getWorkspaceGid as any).mockReturnValue(null);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_projects',
        parameters: {},
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'List projects',
      });

      expect(result).toContain('Asana workspace is not configured');
    });
  });

  describe('Context Integration', () => {
    it.skip('should add project context when getting details', async () => {
      const { findProjectGidByName, getProjectDetails } = await import(
        '../api-client/operations/projects'
      );
      const { conversationContextManager } = await import(
        '../context/conversationContext'
      );
      const { getWorkspaceGid } = await import('../config');

      // Ensure workspace is configured
      (getWorkspaceGid as any).mockReturnValue('workspace123');

      (findProjectGidByName as any).mockResolvedValue('project123');
      (getProjectDetails as any).mockResolvedValue({
        gid: 'project123',
        name: 'Context Project',
      });

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'get_project_details',
        parameters: { project_name: 'Context Project' },
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      const result = await tool.func({
        action_description: 'Show Context Project details',
        session_id: 'test_session',
      });

      expect(result).toBe('Project details formatted');
      expect(getProjectDetails).toHaveBeenCalled();

      // Check if context tracking was called
      expect(conversationContextManager.addProjectContext).toHaveBeenCalled();
    });

    it('should use session ID for context tracking', async () => {
      const { listProjects } = await import(
        '../api-client/operations/projects'
      );
      const { conversationContextManager } = await import(
        '../context/conversationContext'
      );

      (listProjects as any).mockResolvedValue([
        { gid: 'project1', name: 'Project 1' },
      ]);

      mockExtractor.extractFunctionCall.mockResolvedValue({
        functionName: 'list_projects',
        parameters: {},
        confidence: 0.9,
      });

      const tool = modernTool.createTool();
      await tool.func({
        action_description: 'List all projects',
        session_id: 'custom_session_456',
      });

      expect(conversationContextManager.addMessage).toHaveBeenCalledWith(
        'custom_session_456',
        'user',
        'List all projects',
        expect.any(Object),
      );
    });
  });
});
