/**
 * Phase 5 Tests - Workflow Orchestrator
 * Tests for intelligent multi-step workflow execution with semantic resolution and error recovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import Phase 5 components
import {
  WorkflowOrchestrator,
  type WorkflowExecution,
  type WorkflowSuggestion,
} from '../workflows/orchestrator';

// Import test utilities
import { setupAsanaTestEnv, clearAsanaTestEnv } from './mocks/mockSetup';

describe('Phase 5 - Workflow Orchestrator', () => {
  let orchestrator: WorkflowOrchestrator;
  let mockClient: any;

  beforeEach(() => {
    vi.resetAllMocks();
    setupAsanaTestEnv();

    mockClient = {
      createResource: vi.fn(),
      updateResource: vi.fn(),
      request: vi.fn(),
    };

    orchestrator = new WorkflowOrchestrator(mockClient);
  });

  afterEach(() => {
    clearAsanaTestEnv();
    vi.clearAllMocks();
  });

  describe('Workflow Execution', () => {
    it('should execute a simple workflow successfully', async () => {
      // Mock successful API responses
      mockClient.createResource
        .mockResolvedValueOnce({
          gid: 'project123',
          name: 'Test Project',
        })
        .mockResolvedValueOnce({
          gid: 'task123',
          name: 'Project Planning',
        })
        .mockResolvedValueOnce({
          gid: 'task124',
          name: 'Project Kickoff Meeting',
        });

      const execution = await orchestrator.executeWorkflow(
        'project_setup',
        {
          project_name: 'Test Project',
          project_description: 'A test project for validation',
          workspace_id: 'workspace123',
        },
        'session123',
        'request123',
      );

      expect(execution.status).toBe('completed');
      expect(execution.steps).toHaveLength(3);
      expect(execution.steps.every((s) => s.status === 'completed')).toBe(true);
      expect(execution.context.project_id).toBe('project123');
      expect(execution.context.project_name).toBe('Test Project');
      expect(mockClient.createResource).toHaveBeenCalledTimes(3);
    });

    it('should handle workflow step dependencies correctly', async () => {
      const createResourceCalls: any[] = [];

      mockClient.createResource.mockImplementation(
        (resource: string, params: any) => {
          createResourceCalls.push({ resource, params });

          if (resource === 'projects') {
            return Promise.resolve({
              gid: 'project123',
              name: params.name,
            });
          } else if (resource === 'tasks') {
            return Promise.resolve({
              gid: `task${createResourceCalls.length}`,
              name: params.name,
            });
          }
        },
      );

      const execution = await orchestrator.executeWorkflow(
        'project_setup',
        {
          project_name: 'Dependency Test',
          project_description: 'Testing step dependencies',
          workspace_id: 'workspace123',
        },
        'session124',
        'request124',
      );

      expect(execution.status).toBe('completed');

      // Verify project was created first
      expect(createResourceCalls[0].resource).toBe('projects');
      expect(createResourceCalls[0].params.name).toBe('Dependency Test');

      // Verify tasks were created after project with correct project reference
      expect(createResourceCalls[1].resource).toBe('tasks');
      expect(createResourceCalls[1].params.projects).toBeDefined();
      expect(Array.isArray(createResourceCalls[1].params.projects)).toBe(true);
      expect(createResourceCalls[1].params.projects).toContain('project123');

      expect(createResourceCalls[2].resource).toBe('tasks');
      expect(createResourceCalls[2].params.projects).toBeDefined();
      expect(Array.isArray(createResourceCalls[2].params.projects)).toBe(true);
      expect(createResourceCalls[2].params.projects).toContain('project123');
    });

    it('should handle workflow step failures with optional steps', async () => {
      mockClient.createResource
        .mockResolvedValueOnce({
          gid: 'project123',
          name: 'Sprint Test',
        })
        .mockResolvedValueOnce({
          gid: 'task123',
          name: 'Sprint Planning',
        })
        .mockRejectedValue(new Error('Optional step failed'));

      const execution = await orchestrator.executeWorkflow(
        'sprint_setup',
        {
          sprint_name: 'Sprint 1',
          workspace_id: 'workspace123',
          scrum_master: 'user123',
        },
        'session125',
        'request125',
      );

      expect(execution.status).toBe('completed');
      expect(execution.steps[0].status).toBe('completed'); // create_sprint_project
      expect(execution.steps[1].status).toBe('completed'); // create_sprint_planning
      expect(execution.steps[2].status).toBe('skipped'); // create_daily_standup (optional)
    });

    it('should fail workflow when critical step fails', async () => {
      // Mock to reject with a non-recoverable error for all attempts
      mockClient.createResource
        .mockRejectedValue(new Error('Project creation failed'))
        .mockRejectedValue(new Error('Project creation failed'))
        .mockRejectedValue(new Error('Project creation failed'));

      await expect(
        orchestrator.executeWorkflow(
          'project_setup',
          {
            project_name: 'Failed Project',
            workspace_id: 'workspace123',
          },
          'session126',
          'request126',
        ),
      ).rejects.toThrow('Project creation failed');
    });

    it('should resolve step parameters from context', async () => {
      const createResourceCalls: any[] = [];

      mockClient.createResource.mockImplementation(
        (resource: string, params: any) => {
          createResourceCalls.push({ resource, params });

          if (resource === 'projects') {
            return Promise.resolve({
              gid: 'project123',
              name: params.name,
            });
          } else if (resource === 'tasks') {
            return Promise.resolve({
              gid: `task${createResourceCalls.length}`,
              name: params.name,
            });
          }
        },
      );

      await orchestrator.executeWorkflow(
        'project_setup',
        {
          project_name: 'Context Test',
          project_description: 'Testing parameter resolution',
          workspace_id: 'workspace123',
        },
        'session127',
        'request127',
      );

      // Verify that task creation used the project_id from context
      const taskCalls = createResourceCalls.filter(
        (call) => call.resource === 'tasks',
      );
      expect(taskCalls).toHaveLength(2);
      expect(taskCalls[0].params.projects).toBeDefined();
      expect(Array.isArray(taskCalls[0].params.projects)).toBe(true);
      expect(taskCalls[0].params.projects).toContain('project123');
      expect(taskCalls[1].params.projects).toBeDefined();
      expect(Array.isArray(taskCalls[1].params.projects)).toBe(true);
      expect(taskCalls[1].params.projects).toContain('project123');
    });
  });

  describe('Workflow Suggestions', () => {
    it('should suggest relevant workflows based on user intent', async () => {
      const suggestions = await orchestrator.suggestWorkflows(
        'I want to set up a new project with tasks',
        { workspace_id: 'workspace123' },
        'session128',
      );

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].workflowId).toBe('project_setup');
      expect(suggestions[0].name).toBe('Project Setup');
      expect(suggestions[0].confidence).toBeGreaterThanOrEqual(0.5);
      expect(suggestions[0].reasoning).toContain('project operations');
    });

    it('should suggest sprint workflow for sprint-related intents', async () => {
      const suggestions = await orchestrator.suggestWorkflows(
        'create a new sprint with planning tasks',
        { workspace_id: 'workspace123' },
        'session129',
      );

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].workflowId).toBe('sprint_setup');
      expect(suggestions[0].name).toBe('Sprint Setup');
      expect(suggestions[0].confidence).toBeGreaterThan(0.3);
    });

    it('should suggest team onboarding for team-related intents', async () => {
      const suggestions = await orchestrator.suggestWorkflows(
        'onboard a new team member',
        { member_name: 'John Doe' },
        'session130',
      );

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].workflowId).toBe('team_onboarding');
      expect(suggestions[0].name).toBe('Team Member Onboarding');
      expect(suggestions[0].confidence).toBeGreaterThan(0.3);
    });

    it('should return empty suggestions for unrelated intents', async () => {
      const suggestions = await orchestrator.suggestWorkflows(
        'what is the weather today',
        {},
        'session131',
      );

      expect(suggestions).toHaveLength(0);
    });

    it('should include required and optional parameters in suggestions', async () => {
      const suggestions = await orchestrator.suggestWorkflows(
        'set up a project',
        {},
        'session132',
      );

      expect(suggestions).toHaveLength(1);
      const suggestion = suggestions[0];
      expect(suggestion.requiredParameters).toContain('project_name');
      expect(suggestion.requiredParameters).toContain('workspace_id');
      expect(suggestion.estimatedDuration).toBe('2-5 minutes');
    });
  });

  describe('Workflow Management', () => {
    it('should track workflow execution status', async () => {
      mockClient.createResource.mockResolvedValue({
        gid: 'resource123',
        name: 'Test Resource',
      });

      const executionPromise = orchestrator.executeWorkflow(
        'project_setup',
        {
          project_name: 'Status Test',
          workspace_id: 'workspace123',
        },
        'session133',
        'request133',
      );

      // Check execution can be retrieved while running
      const runningExecution = orchestrator.getWorkflowExecution(
        'session133',
        'project_setup',
      );
      expect(runningExecution).toBeDefined();
      expect(runningExecution?.status).toBe('running');

      const completedExecution = await executionPromise;
      expect(completedExecution.status).toBe('completed');
    });

    it('should cancel running workflows', async () => {
      // Create a slow-resolving promise to simulate long-running workflow
      mockClient.createResource.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ gid: 'test', name: 'test' }), 1000),
          ),
      );

      const executionPromise = orchestrator.executeWorkflow(
        'project_setup',
        {
          project_name: 'Cancel Test',
          workspace_id: 'workspace123',
        },
        'session134',
        'request134',
      );

      // Cancel the workflow
      const cancelled = orchestrator.cancelWorkflow(
        'session134',
        'project_setup',
      );
      expect(cancelled).toBe(true);

      const execution = orchestrator.getWorkflowExecution(
        'session134',
        'project_setup',
      );
      expect(execution?.status).toBe('failed');

      // Clean up the promise
      await executionPromise.catch(() => {});
    });

    it('should return false when cancelling non-existent workflow', () => {
      const cancelled = orchestrator.cancelWorkflow(
        'nonexistent',
        'project_setup',
      );
      expect(cancelled).toBe(false);
    });
  });

  describe('Error Recovery Integration', () => {
    it('should integrate with error recovery for failed steps', async () => {
      // Mock first call to fail, second to succeed (simulating retry)
      mockClient.createResource
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          gid: 'project123',
          name: 'Recovered Project',
        })
        .mockResolvedValue({
          gid: 'task123',
          name: 'Test Task',
        });

      const execution = await orchestrator.executeWorkflow(
        'project_setup',
        {
          project_name: 'Recovery Test',
          workspace_id: 'workspace123',
        },
        'session135',
        'request135',
      );

      expect(execution.status).toBe('completed');
      expect(execution.context.project_id).toBe('project123');
      // Should have retried the failed operation
      expect(mockClient.createResource).toHaveBeenCalledTimes(4); // 1 retry + 3 successful
    });

    it('should use fallback handlers when recovery fails', async () => {
      // Mock all create operations to fail
      mockClient.createResource.mockRejectedValue(
        new Error('Persistent failure'),
      );

      await expect(
        orchestrator.executeWorkflow(
          'project_setup',
          {
            project_name: 'Fallback Test',
            workspace_id: 'workspace123',
          },
          'session136',
          'request136',
        ),
      ).rejects.toThrow();

      // Should have attempted multiple retries
      expect(mockClient.createResource).toHaveBeenCalledTimes(3); // Max retries for first step
    });
  });

  describe('Semantic Entity Resolution Integration', () => {
    it('should resolve entity references in step parameters', async () => {
      // Mock entity resolution
      const mockEntityResolver = {
        resolveAnyEntity: vi.fn().mockResolvedValue({
          result: {
            bestMatch: { gid: 'user123', name: 'John Doe' },
          },
        }),
      };

      // Replace the entity resolver
      (orchestrator as any).entityResolver = mockEntityResolver;

      mockClient.createResource.mockResolvedValue({
        gid: 'project123',
        name: 'Test Project',
      });

      await orchestrator.executeWorkflow(
        'team_onboarding',
        {
          member_name: 'Jane Smith',
          workspace_id: 'workspace123',
          buddy_assignee: '@john.doe',
          it_assignee: '@it.support',
        },
        'session137',
        'request137',
      );

      // Verify entity resolution was called for @ references
      expect(mockEntityResolver.resolveAnyEntity).toHaveBeenCalledWith(
        '@john.doe',
        'auto',
        { sessionId: 'session137' },
      );
      expect(mockEntityResolver.resolveAnyEntity).toHaveBeenCalledWith(
        '@it.support',
        'auto',
        { sessionId: 'session137' },
      );
    });

    it('should handle entity resolution failures gracefully', async () => {
      // Mock entity resolution to fail
      const mockEntityResolver = {
        resolveAnyEntity: vi
          .fn()
          .mockRejectedValue(new Error('Resolution failed')),
      };

      (orchestrator as any).entityResolver = mockEntityResolver;

      mockClient.createResource.mockResolvedValue({
        gid: 'project123',
        name: 'Test Project',
      });

      const execution = await orchestrator.executeWorkflow(
        'team_onboarding',
        {
          member_name: 'Jane Smith',
          workspace_id: 'workspace123',
          buddy_assignee: '@invalid.user',
          it_assignee: '@another.invalid',
        },
        'session138',
        'request138',
      );

      // Should still complete with original parameter values
      expect(execution.status).toBe('completed');
    });
  });

  describe('Context Management', () => {
    it('should update execution context with step results', async () => {
      mockClient.createResource
        .mockResolvedValueOnce({
          gid: 'project123',
          name: 'Context Project',
        })
        .mockResolvedValue({
          gid: 'task123',
          name: 'Context Task',
        });

      const execution = await orchestrator.executeWorkflow(
        'project_setup',
        {
          project_name: 'Context Test',
          workspace_id: 'workspace123',
        },
        'session139',
        'request139',
      );

      expect(execution.context.project_id).toBe('project123');
      expect(execution.context.project_name).toBe('Context Project');
      expect(execution.context.last_task_id).toBe('task123');
      expect(execution.context.last_task_name).toBe('Context Task');
    });

    it('should log workflow completion', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockClient.createResource.mockResolvedValue({
        gid: 'resource123',
        name: 'Test Resource',
      });

      await orchestrator.executeWorkflow(
        'project_setup',
        {
          project_name: 'Log Test',
          workspace_id: 'workspace123',
        },
        'session140',
        'request140',
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[WorkflowOrchestrator] Workflow project_setup completed with 3/3 steps',
        ),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Workflow Templates', () => {
    it('should have project setup workflow template', () => {
      const execution = orchestrator.getWorkflowExecution(
        'nonexistent',
        'project_setup',
      );
      expect(execution).toBeUndefined();

      // Test that the workflow exists by trying to execute it
      expect(async () => {
        await orchestrator.executeWorkflow(
          'project_setup',
          { project_name: 'Test', workspace_id: 'test' },
          'test',
        );
      }).not.toThrow('Workflow not found');
    });

    it('should have sprint setup workflow template', async () => {
      mockClient.createResource.mockResolvedValue({
        gid: 'test123',
        name: 'Test',
      });

      const execution = await orchestrator.executeWorkflow(
        'sprint_setup',
        {
          sprint_name: 'Sprint 1',
          workspace_id: 'workspace123',
          scrum_master: 'user123',
        },
        'session141',
        'request141',
      );

      expect(execution.status).toBe('completed');
      expect(execution.steps).toHaveLength(3);
    });

    it('should have team onboarding workflow template', async () => {
      mockClient.createResource.mockResolvedValue({
        gid: 'test123',
        name: 'Test',
      });

      const execution = await orchestrator.executeWorkflow(
        'team_onboarding',
        {
          member_name: 'New Member',
          workspace_id: 'workspace123',
          buddy_assignee: 'buddy123',
          it_assignee: 'it123',
        },
        'session142',
        'request142',
      );

      expect(execution.status).toBe('completed');
      expect(execution.steps).toHaveLength(3);
    });

    it('should throw error for unknown workflow', async () => {
      await expect(
        orchestrator.executeWorkflow(
          'unknown_workflow',
          {},
          'session143',
          'request143',
        ),
      ).rejects.toThrow('Workflow not found: unknown_workflow');
    });
  });
});
