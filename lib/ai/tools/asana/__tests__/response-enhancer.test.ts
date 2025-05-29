/**
 * Tests for Response Enhancer
 */

import { describe, it, expect } from 'vitest';
import { ResponseEnhancer } from '../response/enhancer';
import type { WorkflowExecution } from '../workflows/orchestrator';

describe('Response Enhancer', () => {
  const enhancer = new ResponseEnhancer();

  describe('Operation Response Enhancement', () => {
    it('should enhance task creation response', () => {
      const result = {
        gid: 'task123',
        name: 'Test Task',
        notes: 'Task description',
        permalink_url: 'https://app.asana.com/0/project/task123',
      };

      const enhanced = enhancer.enhanceOperationResponse('create_task', result);

      expect(enhanced.message).toBe('✅ Successfully created task "Test Task"');
      expect(enhanced.formatted.summary).toBe(
        'Created task "Test Task" (ID: task123)',
      );
      expect(enhanced.formatted.highlights).toContain('Task ID: task123');
      expect(enhanced.formatted.highlights).toContain('Name: Test Task');
      expect(enhanced.formatted.highlights).toContain(
        'URL: https://app.asana.com/0/project/task123',
      );

      expect(enhanced.formatted.markdown).toContain('### ✅ Task Created');
      expect(enhanced.formatted.markdown).toContain('**Test Task**');
      expect(enhanced.formatted.markdown).toContain('*Task description*');
      expect(enhanced.formatted.markdown).toContain(
        '[View in Asana](https://app.asana.com/0/project/task123)',
      );
      expect(enhanced.formatted.markdown).toContain('**Task ID:** `task123`');

      expect(enhanced.suggestions).toHaveLength(2);
      expect(enhanced.suggestions[0].type).toBe('operation');
      expect(enhanced.suggestions[0].title).toBe('Add task details');
      expect(enhanced.suggestions[1].type).toBe('collaboration');
      expect(enhanced.suggestions[1].title).toBe('Assign task');

      expect(enhanced.followUps).toHaveLength(1);
      expect(enhanced.followUps[0].category).toBe('next_steps');
      expect(enhanced.followUps[0].priority).toBe('medium');

      expect(enhanced.context.operation).toBe('create_task');
      expect(enhanced.context.success).toBe(true);
      expect(enhanced.context.entities).toHaveLength(1);
      expect(enhanced.context.entities[0].type).toBe('task');
      expect(enhanced.context.entities[0].gid).toBe('task123');
    });

    it('should enhance project creation response', () => {
      const result = {
        gid: 'project456',
        name: 'Test Project',
        notes: 'Project description',
        permalink_url: 'https://app.asana.com/0/project456',
      };

      const enhanced = enhancer.enhanceOperationResponse(
        'create_project',
        result,
      );

      expect(enhanced.message).toBe(
        '🎯 Successfully created project "Test Project"',
      );
      expect(enhanced.formatted.summary).toBe(
        'Created project "Test Project" (ID: project456)',
      );

      expect(enhanced.suggestions).toHaveLength(1);
      expect(enhanced.suggestions[0].type).toBe('workflow');
      expect(enhanced.suggestions[0].title).toBe('Set up project structure');
      expect(enhanced.suggestions[0].action?.operation).toBe(
        'workflow_execute',
      );
      expect(enhanced.suggestions[0].action?.parameters.workflow_id).toBe(
        'project_setup',
      );

      expect(enhanced.followUps).toHaveLength(1);
      expect(enhanced.followUps[0].category).toBe('project_management');
      expect(enhanced.followUps[0].priority).toBe('high');

      expect(enhanced.context.entities[0].type).toBe('project');
    });

    it('should enhance task list response', () => {
      const result = [
        { gid: 'task1', name: 'Task 1' },
        { gid: 'task2', name: 'Task 2' },
        { gid: 'task3', name: 'Task 3' },
      ];

      const enhanced = enhancer.enhanceOperationResponse('list_tasks', result);

      expect(enhanced.message).toBe('📋 Found 3 task(s)');
      expect(enhanced.formatted.summary).toBe('Found 3 tasks');
      expect(enhanced.formatted.markdown).toContain('### 📋 Tasks Found (3)');
      expect(enhanced.formatted.markdown).toContain('- **Task 1** (task1)');
      expect(enhanced.formatted.markdown).toContain('- **Task 2** (task2)');
      expect(enhanced.formatted.markdown).toContain('- **Task 3** (task3)');

      expect(enhanced.suggestions).toHaveLength(0); // No suggestions for small lists
    });

    it('should suggest filtering for large task lists', () => {
      const result = Array.from({ length: 15 }, (_, i) => ({
        gid: `task${i}`,
        name: `Task ${i}`,
      }));

      const enhanced = enhancer.enhanceOperationResponse('list_tasks', result);

      expect(enhanced.suggestions).toHaveLength(1);
      expect(enhanced.suggestions[0].type).toBe('optimization');
      expect(enhanced.suggestions[0].title).toBe('Filter tasks');
    });
  });

  describe('Workflow Response Enhancement', () => {
    it('should enhance completed workflow response', () => {
      const execution: WorkflowExecution = {
        workflowId: 'project_setup',
        sessionId: 'session123',
        status: 'completed',
        startTime: Date.now() - 5000,
        endTime: Date.now(),
        steps: [
          {
            stepId: 'create_project',
            status: 'completed',
            startTime: Date.now() - 4000,
            endTime: Date.now() - 3000,
            result: { gid: 'project123', name: 'Test Project' },
            attempts: 1,
          },
          {
            stepId: 'create_task1',
            status: 'completed',
            startTime: Date.now() - 2000,
            endTime: Date.now() - 1000,
            result: { gid: 'task123', name: 'Task 1' },
            attempts: 1,
          },
        ],
        context: { project_id: 'project123' },
        errors: [],
      };

      const enhanced = enhancer.enhanceWorkflowResponse(execution);

      expect(enhanced.message).toBe(
        '🚀 Workflow "project_setup" completed successfully (2/2 steps)',
      );
      expect(enhanced.formatted.summary).toBe(
        'Workflow project_setup completed (2/2 steps)',
      );
      expect(enhanced.formatted.markdown).toContain(
        '### 🚀 Workflow: project_setup',
      );
      expect(enhanced.formatted.markdown).toContain('**Status:** completed');
      expect(enhanced.formatted.markdown).toContain('**Progress:** 2/2 steps');
      expect(enhanced.formatted.markdown).toContain('#### ✅ Completed Steps');
      expect(enhanced.formatted.markdown).toContain(
        '- create_project: Test Project',
      );
      expect(enhanced.formatted.markdown).toContain('- create_task1: Task 1');

      expect(enhanced.formatted.highlights).toContain('Status: completed');
      expect(enhanced.formatted.highlights).toContain('Steps: 2/2');
      expect(enhanced.formatted.highlights).toContain('Duration: 5s');

      expect(enhanced.suggestions).toHaveLength(1);
      expect(enhanced.suggestions[0].type).toBe('workflow');
      expect(enhanced.suggestions[0].title).toBe('Set up team onboarding');

      expect(enhanced.followUps).toHaveLength(1);
      expect(enhanced.followUps[0].category).toBe('team_coordination');

      expect(enhanced.context.operation).toBe('workflow:project_setup');
      expect(enhanced.context.success).toBe(true);
      expect(enhanced.context.entities).toHaveLength(2);
      expect(enhanced.context.metrics?.duration).toBe(5000);
      expect(enhanced.context.metrics?.stepsCompleted).toBe(2);
      expect(enhanced.context.metrics?.totalSteps).toBe(2);
    });

    it('should enhance partial workflow response', () => {
      const execution: WorkflowExecution = {
        workflowId: 'sprint_setup',
        sessionId: 'session456',
        status: 'partial',
        startTime: Date.now() - 3000,
        endTime: Date.now(),
        steps: [
          {
            stepId: 'create_project',
            status: 'completed',
            result: { gid: 'project123', name: 'Sprint Project' },
            attempts: 1,
          },
          {
            stepId: 'create_task1',
            status: 'failed',
            error: new Error('Task creation failed'),
            attempts: 3,
          },
        ],
        context: {},
        errors: [
          {
            stepId: 'create_task1',
            error: new Error('Task creation failed'),
            recoveryAttempted: true,
            fallbackUsed: false,
            timestamp: Date.now(),
          },
        ],
      };

      const enhanced = enhancer.enhanceWorkflowResponse(execution);

      expect(enhanced.message).toBe(
        '⚠️ Workflow "sprint_setup" partially completed (1/2 steps)',
      );
      expect(enhanced.formatted.markdown).toContain('#### ❌ Failed Steps');
      expect(enhanced.formatted.markdown).toContain(
        '- create_task1: Task creation failed',
      );

      expect(enhanced.suggestions).toHaveLength(1);
      expect(enhanced.suggestions[0].type).toBe('operation');
      expect(enhanced.suggestions[0].title).toBe('Retry failed steps');

      expect(enhanced.context.success).toBe(false);
    });

    it('should enhance failed workflow response', () => {
      const execution: WorkflowExecution = {
        workflowId: 'team_onboarding',
        sessionId: 'session789',
        status: 'failed',
        startTime: Date.now() - 2000,
        endTime: Date.now(),
        steps: [
          {
            stepId: 'create_project',
            status: 'failed',
            error: new Error('Project creation failed'),
            attempts: 3,
          },
        ],
        context: {},
        errors: [
          {
            stepId: 'create_project',
            error: new Error('Project creation failed'),
            recoveryAttempted: true,
            fallbackUsed: true,
            timestamp: Date.now(),
          },
        ],
      };

      const enhanced = enhancer.enhanceWorkflowResponse(execution);

      expect(enhanced.message).toBe(
        '❌ Workflow "team_onboarding" failed (0/1 steps completed)',
      );
      expect(enhanced.context.success).toBe(false);
    });
  });

  describe('Error Response Enhancement', () => {
    it('should enhance not found error response', () => {
      const error = new Error('Task not found');
      const enhanced = enhancer.enhanceErrorResponse('update_task', error);

      expect(enhanced.message).toBe(
        '❌ Failed to execute "update_task": Task not found',
      );
      expect(enhanced.formatted.markdown).toContain('### ❌ Operation Failed');
      expect(enhanced.formatted.markdown).toContain(
        '**Operation:** update_task',
      );
      expect(enhanced.formatted.markdown).toContain(
        '**Error:** Task not found',
      );

      expect(enhanced.suggestions).toHaveLength(1);
      expect(enhanced.suggestions[0].type).toBe('operation');
      expect(enhanced.suggestions[0].title).toBe('Search for entity');

      expect(enhanced.followUps).toHaveLength(1);
      expect(enhanced.followUps[0].category).toBe('next_steps');
      expect(enhanced.followUps[0].priority).toBe('high');

      expect(enhanced.context.success).toBe(false);
    });

    it('should enhance permission error response', () => {
      const error = new Error('Access denied: insufficient permissions');
      const enhanced = enhancer.enhanceErrorResponse('create_project', error);

      expect(enhanced.suggestions).toHaveLength(1);
      expect(enhanced.suggestions[0].type).toBe('collaboration');
      expect(enhanced.suggestions[0].title).toBe('Check permissions');
      expect(enhanced.suggestions[0].confidence).toBe(0.9);
    });

    it('should enhance rate limit error response', () => {
      const error = new Error('Rate limit exceeded');
      const enhanced = enhancer.enhanceErrorResponse('list_tasks', error);

      expect(enhanced.suggestions).toHaveLength(1);
      expect(enhanced.suggestions[0].type).toBe('optimization');
      expect(enhanced.suggestions[0].title).toBe('Retry later');
      expect(enhanced.suggestions[0].confidence).toBe(0.7);
    });
  });

  describe('Context Building', () => {
    it('should build context for task operations', () => {
      const result = {
        gid: 'task123',
        name: 'Test Task',
        permalink_url: 'https://app.asana.com/task123',
      };

      const enhanced = enhancer.enhanceOperationResponse('create_task', result);

      expect(enhanced.context.operation).toBe('create_task');
      expect(enhanced.context.entities).toHaveLength(1);
      expect(enhanced.context.entities[0]).toEqual({
        type: 'task',
        gid: 'task123',
        name: 'Test Task',
        url: 'https://app.asana.com/task123',
      });
      expect(enhanced.context.success).toBe(true);
    });

    it('should build context for project operations', () => {
      const result = {
        gid: 'project456',
        name: 'Test Project',
      };

      const enhanced = enhancer.enhanceOperationResponse(
        'create_project',
        result,
      );

      expect(enhanced.context.entities[0].type).toBe('project');
      expect(enhanced.context.entities[0].gid).toBe('project456');
    });

    it('should build context for user operations', () => {
      const result = {
        gid: 'user789',
        name: 'John Doe',
      };

      const enhanced = enhancer.enhanceOperationResponse('list_users', result);

      expect(enhanced.context.entities[0].type).toBe('user');
      expect(enhanced.context.entities[0].gid).toBe('user789');
    });

    it('should handle results without gid or name', () => {
      const result = { status: 'success' };
      const enhanced = enhancer.enhanceOperationResponse(
        'unknown_operation',
        result,
      );

      expect(enhanced.context.entities).toHaveLength(0);
      expect(enhanced.context.success).toBe(true);
    });
  });

  describe('Suggestion Generation', () => {
    it('should generate workflow suggestions for project setup completion', () => {
      const execution: WorkflowExecution = {
        workflowId: 'project_setup',
        sessionId: 'session123',
        status: 'completed',
        startTime: Date.now(),
        steps: [],
        context: {},
        errors: [],
      };

      const enhanced = enhancer.enhanceWorkflowResponse(execution);

      expect(enhanced.suggestions).toHaveLength(1);
      expect(enhanced.suggestions[0].type).toBe('workflow');
      expect(enhanced.suggestions[0].title).toBe('Set up team onboarding');
      expect(enhanced.suggestions[0].action?.operation).toBe(
        'workflow_suggest',
      );
    });

    it('should generate project management suggestions for sprint completion', () => {
      const execution: WorkflowExecution = {
        workflowId: 'sprint_setup',
        sessionId: 'session456',
        status: 'completed',
        startTime: Date.now(),
        steps: [],
        context: {},
        errors: [],
      };

      const enhanced = enhancer.enhanceWorkflowResponse(execution);

      expect(enhanced.suggestions).toHaveLength(1);
      expect(enhanced.suggestions[0].type).toBe('project_management');
      expect(enhanced.suggestions[0].title).toBe('Plan sprint tasks');
    });
  });
});
