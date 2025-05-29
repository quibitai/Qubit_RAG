/**
 * Tests for Modern Asana Tool - Complete Integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createModernAsanaTool,
  type ModernAsanaTool,
} from '../modern-asana-tool';
import { setupAsanaTestEnv, clearAsanaTestEnv } from './mocks/mockSetup';

describe('Modern Asana Tool - Complete Integration', () => {
  let tool: ModernAsanaTool;
  let mockClient: any;

  beforeEach(() => {
    vi.resetAllMocks();
    setupAsanaTestEnv();

    mockClient = {
      createResource: vi.fn(),
      updateResource: vi.fn(),
      request: vi.fn(),
    };

    tool = createModernAsanaTool(mockClient);
  });

  afterEach(() => {
    clearAsanaTestEnv();
    vi.clearAllMocks();
  });

  describe('Tool Configuration', () => {
    it('should initialize with default configuration', () => {
      const config = tool.getConfiguration();

      expect(config.enableWorkflows).toBe(true);
      expect(config.enableSemanticResolution).toBe(true);
      expect(config.enableErrorRecovery).toBe(true);
      expect(config.enableResponseEnhancement).toBe(true);
    });

    it('should allow custom configuration', () => {
      const customTool = createModernAsanaTool(mockClient, {
        enableWorkflows: false,
        enableSemanticResolution: false,
      });

      const config = customTool.getConfiguration();
      expect(config.enableWorkflows).toBe(false);
      expect(config.enableSemanticResolution).toBe(false);
      expect(config.enableErrorRecovery).toBe(true); // default
      expect(config.enableResponseEnhancement).toBe(true); // default
    });

    it('should update configuration', () => {
      tool.updateConfiguration({ enableWorkflows: false });

      const config = tool.getConfiguration();
      expect(config.enableWorkflows).toBe(false);
      expect(config.enableSemanticResolution).toBe(true); // unchanged
    });
  });

  describe('Task Operations with Enhanced Features', () => {
    it('should create task with response enhancement', async () => {
      mockClient.createResource.mockResolvedValue({
        gid: 'task123',
        name: 'Enhanced Task',
        permalink_url: 'https://app.asana.com/task123',
      });

      const result = await tool.createTask(
        {
          name: 'Enhanced Task',
          notes: 'Task with all features enabled',
        },
        {
          sessionId: 'session123',
          requestId: 'request123',
          userIntent: 'Create a new task',
        },
      );

      expect(result.metadata.success).toBe(true);
      expect(result.metadata.operation).toBe('create_task');
      expect(result.data.gid).toBe('task123');

      // Verify response enhancement
      expect(result.enhanced).toBeDefined();
      expect(result.enhanced?.message).toBe(
        '✅ Successfully created task "Enhanced Task"',
      );
      expect(result.enhanced?.formatted.markdown).toContain(
        '### ✅ Task Created',
      );
      expect(result.enhanced?.suggestions).toHaveLength(2);
      expect(result.enhanced?.followUps).toHaveLength(1);
    });

    it('should handle semantic entity resolution in task creation', async () => {
      // Mock entity resolution
      const mockEntityResolver = {
        resolveAnyEntity: vi.fn().mockResolvedValue({
          result: {
            bestMatch: { gid: 'user123', name: 'John Doe' },
          },
        }),
      };
      (tool as any).entityResolver = mockEntityResolver;

      mockClient.createResource.mockResolvedValue({
        gid: 'task123',
        name: 'Assigned Task',
      });

      await tool.createTask(
        {
          name: 'Assigned Task',
          assignee: '@john.doe',
        },
        {
          sessionId: 'session123',
          userIntent: 'Create task for John',
        },
      );

      expect(mockEntityResolver.resolveAnyEntity).toHaveBeenCalledWith(
        '@john.doe',
        'auto',
        { sessionId: 'session123' },
      );
      expect(mockClient.createResource).toHaveBeenCalledWith(
        'tasks',
        expect.objectContaining({
          assignee: 'user123', // Resolved GID
          name: 'Assigned Task',
          workspace: expect.any(String),
        }),
        undefined, // requestId is undefined in this test
      );
    });

    it('should handle error recovery for task operations', async () => {
      // Mock first call to fail, second to succeed
      mockClient.createResource
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          gid: 'task123',
          name: 'Recovered Task',
        });

      const result = await tool.createTask(
        {
          name: 'Recovered Task',
        },
        {
          sessionId: 'session123',
          requestId: 'request123',
        },
      );

      expect(result.metadata.success).toBe(true);
      expect(result.metadata.errorRecoveryUsed).toBe(true);
      expect(result.data.gid).toBe('task123');
    });

    it('should list tasks with intelligent filtering', async () => {
      mockClient.request.mockResolvedValue([
        { gid: 'task1', name: 'Task 1' },
        { gid: 'task2', name: 'Task 2' },
      ]);

      const result = await tool.listTasks(
        {
          assignee: '@current.user',
        },
        {
          sessionId: 'session123',
        },
      );

      expect(result.metadata.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.enhanced?.message).toBe('📋 Found 2 task(s)');
    });
  });

  describe('Project Operations with Enhanced Features', () => {
    it('should create project with workflow suggestions', async () => {
      mockClient.createResource.mockResolvedValue({
        gid: 'project123',
        name: 'Enhanced Project',
        permalink_url: 'https://app.asana.com/project123',
      });

      const result = await tool.createProject(
        {
          name: 'Enhanced Project',
          notes: 'Project with enhanced features',
        },
        {
          sessionId: 'session123',
          userIntent: 'Create a new project',
        },
      );

      expect(result.metadata.success).toBe(true);
      expect(result.data.gid).toBe('project123');

      // Verify workflow suggestion
      expect(result.enhanced?.suggestions).toHaveLength(1);
      expect(result.enhanced?.suggestions[0].type).toBe('workflow');
      expect(result.enhanced?.suggestions[0].title).toBe(
        'Set up project structure',
      );
    });

    it('should list projects with enhanced response', async () => {
      mockClient.request.mockResolvedValue([
        { gid: 'project1', name: 'Project 1' },
        { gid: 'project2', name: 'Project 2' },
      ]);

      const result = await tool.listProjects(
        {},
        {
          sessionId: 'session123',
        },
      );

      expect(result.metadata.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockClient.request).toHaveBeenCalledWith(
        'projects',
        'GET',
        undefined,
        expect.objectContaining({
          workspace: expect.any(String),
          archived: 'false',
        }),
        undefined,
      );
    });
  });

  describe('Workflow Operations', () => {
    it('should execute workflow with enhanced response', async () => {
      mockClient.createResource
        .mockResolvedValueOnce({
          gid: 'project123',
          name: 'Workflow Project',
        })
        .mockResolvedValue({
          gid: 'task123',
          name: 'Workflow Task',
        });

      const result = await tool.executeWorkflow(
        'project_setup',
        {
          project_name: 'Workflow Project',
          workspace_id: 'workspace123',
        },
        {
          sessionId: 'session123',
          requestId: 'request123',
          userIntent: 'Set up a new project',
        },
      );

      expect(result.metadata.success).toBe(true);
      expect(result.metadata.workflowExecuted).toBe(true);
      expect(result.data.status).toBe('completed');

      // Verify enhanced response
      expect(result.enhanced?.message).toContain(
        '🚀 Workflow "project_setup" completed successfully',
      );
      expect(result.enhanced?.formatted.markdown).toContain(
        '### 🚀 Workflow: project_setup',
      );
    });

    it('should suggest workflows based on user intent', async () => {
      const result = await tool.suggestWorkflows(
        'I want to set up a new project with tasks',
        {
          sessionId: 'session123',
          conversationContext: { workspace_id: 'workspace123' },
        },
      );

      expect(result.metadata.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].workflowId).toBe('project_setup');
      expect(result.data[0].confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should handle workflow execution with disabled workflows', async () => {
      tool.updateConfiguration({ enableWorkflows: false });

      const result = await tool.executeWorkflow(
        'project_setup',
        {},
        { sessionId: 'session123' },
      );

      expect(result.metadata.success).toBe(false);
      expect(result.enhanced?.message).toContain(
        'Workflow orchestration is disabled',
      );
    });
  });

  describe('Semantic Entity Resolution', () => {
    it('should resolve entity references', async () => {
      const mockEntityResolver = {
        resolveAnyEntity: vi.fn().mockResolvedValue({
          result: {
            bestMatch: { gid: 'user123', name: 'John Doe' },
            confidence: 0.95,
            alternatives: [],
          },
        }),
      };
      (tool as any).entityResolver = mockEntityResolver;

      const result = await tool.resolveEntity('@john.doe', 'user', {
        sessionId: 'session123',
      });

      expect(result.metadata.success).toBe(true);
      expect(result.metadata.semanticResolutionUsed).toBe(true);
      expect(result.data.result.bestMatch.gid).toBe('user123');
    });

    it('should handle entity resolution with disabled feature', async () => {
      tool.updateConfiguration({ enableSemanticResolution: false });

      const result = await tool.resolveEntity('@john.doe', 'user', {
        sessionId: 'session123',
      });

      expect(result.metadata.success).toBe(false);
      expect(result.enhanced?.message).toContain(
        'Semantic entity resolution is disabled',
      );
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should enhance error responses', async () => {
      mockClient.createResource.mockRejectedValue(new Error('Task not found'));

      const result = await tool.createTask(
        { name: 'Failed Task' },
        { sessionId: 'session123' },
      );

      expect(result.metadata.success).toBe(false);
      expect(result.enhanced?.message).toContain(
        '❌ Failed to execute "create_task": Task not found',
      );
      expect(result.enhanced?.suggestions).toHaveLength(1);
      expect(result.enhanced?.suggestions[0].type).toBe('operation');
      expect(result.enhanced?.suggestions[0].title).toBe('Search for entity');
    });

    it('should handle permission errors with suggestions', async () => {
      mockClient.createResource.mockRejectedValue(
        new Error('Access denied: insufficient permissions'),
      );

      const result = await tool.createProject(
        { name: 'Restricted Project' },
        { sessionId: 'session123' },
      );

      expect(result.metadata.success).toBe(false);
      expect(result.enhanced?.suggestions).toHaveLength(1);
      expect(result.enhanced?.suggestions[0].type).toBe('collaboration');
      expect(result.enhanced?.suggestions[0].title).toBe('Check permissions');
    });

    it('should handle rate limit errors with retry suggestions', async () => {
      mockClient.request.mockRejectedValue(new Error('Rate limit exceeded'));

      const result = await tool.listTasks({}, { sessionId: 'session123' });

      expect(result.metadata.success).toBe(false);
      expect(result.enhanced?.suggestions).toHaveLength(1);
      expect(result.enhanced?.suggestions[0].type).toBe('optimization');
      expect(result.enhanced?.suggestions[0].title).toBe('Retry later');
    });
  });

  describe('User Operations', () => {
    it('should handle user operations', async () => {
      // Basic test to verify user operations are available
      expect(typeof tool.listUsers).toBe('function');
    });
  });

  describe('Workflow Management', () => {
    it('should get workflow execution status', () => {
      // First execute a workflow to create an execution
      const execution = tool.getWorkflowExecution('project_setup', {
        sessionId: 'session123',
      });

      // Should be null since no workflow has been executed yet
      expect(execution).toBeUndefined();
    });

    it('should cancel workflow execution', () => {
      const cancelled = tool.cancelWorkflow('project_setup', {
        sessionId: 'session123',
      });

      // Should return false since no workflow is running
      expect(cancelled).toBe(false);
    });

    it('should handle workflow operations with disabled workflows', () => {
      tool.updateConfiguration({ enableWorkflows: false });

      const execution = tool.getWorkflowExecution('project_setup', {
        sessionId: 'session123',
      });
      expect(execution).toBeNull();

      const cancelled = tool.cancelWorkflow('project_setup', {
        sessionId: 'session123',
      });
      expect(cancelled).toBe(false);
    });
  });

  describe('Integration Features', () => {
    it('should combine all features in a complex operation', async () => {
      // Mock entity resolution
      const mockEntityResolver = {
        resolveAnyEntity: vi.fn().mockResolvedValue({
          result: {
            bestMatch: { gid: 'user123', name: 'John Doe' },
          },
        }),
      };
      (tool as any).entityResolver = mockEntityResolver;

      // Mock API calls with one failure and recovery
      mockClient.createResource
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValueOnce({
          gid: 'task123',
          name: 'Complex Task',
          permalink_url: 'https://app.asana.com/task123',
        });

      const result = await tool.createTask(
        {
          name: 'Complex Task',
          assignee: '@john.doe',
          notes: 'Task with semantic resolution and error recovery',
        },
        {
          sessionId: 'session123',
          requestId: 'request123',
          userIntent: 'Create a task for John with error handling',
          conversationContext: { project_context: 'active_project' },
        },
      );

      // Verify all features worked together
      expect(result.metadata.success).toBe(true);
      expect(result.metadata.errorRecoveryUsed).toBe(true);
      expect(result.data.gid).toBe('task123');

      // Verify semantic resolution was used
      expect(mockEntityResolver.resolveAnyEntity).toHaveBeenCalled();

      // Verify response enhancement
      expect(result.enhanced?.message).toBe(
        '✅ Successfully created task "Complex Task"',
      );
      expect(result.enhanced?.suggestions).toHaveLength(2);
      expect(result.enhanced?.context.success).toBe(true);
      expect(result.enhanced?.context.entities).toHaveLength(1);
      expect(result.enhanced?.context.entities[0].type).toBe('task');
    });

    it('should handle feature interactions with partial failures', async () => {
      // Disable some features
      tool.updateConfiguration({
        enableSemanticResolution: false,
        enableErrorRecovery: false,
      });

      mockClient.createResource.mockResolvedValue({
        gid: 'task123',
        name: 'Partial Features Task',
      });

      const result = await tool.createTask(
        {
          name: 'Partial Features Task',
          assignee: '@john.doe', // Won't be resolved
        },
        {
          sessionId: 'session123',
        },
      );

      expect(result.metadata.success).toBe(true);
      expect(result.metadata.errorRecoveryUsed).toBe(false);

      // Assignee should remain as original string since resolution is disabled
      expect(mockClient.createResource).toHaveBeenCalledWith(
        'tasks',
        expect.objectContaining({
          assignee: '@john.doe', // Not resolved
        }),
        undefined,
      );

      // Response enhancement should still work
      expect(result.enhanced?.message).toBe(
        '✅ Successfully created task "Partial Features Task"',
      );
    });
  });
});
