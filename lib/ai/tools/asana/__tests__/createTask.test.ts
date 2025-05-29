/**
 * Tests for the CREATE_TASK operation in the Asana tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsanaTool } from '../asanaTool';
import * as projectOperations from '../api-client/operations/projects';
import * as taskOperations from '../api-client/operations/tasks';
import * as configModule from '../config';
import * as responseFormatter from '../formatters/responseFormatter';
import { setupAsanaTestEnv, clearAsanaTestEnv } from './mocks/mockSetup';
import { mockTaskCreationResponse } from './mocks/taskResponses';

// Mock the API operations and config
vi.mock('../api-client/operations/projects', () => ({
  findProjectGidByName: vi.fn(),
}));

vi.mock('../api-client/operations/tasks', () => ({
  createTask: vi.fn(),
}));

// Mock the config module to ensure getWorkspaceGid returns a value
vi.mock('../config', () => ({
  getWorkspaceGid: vi.fn().mockReturnValue('workspace123'),
  getTeamGid: vi.fn().mockReturnValue('team123'),
  ASANA_PAT: 'mock-api-key',
  ASANA_DEFAULT_WORKSPACE_GID: 'workspace123',
  ASANA_DEFAULT_TEAM_GID: 'team123',
  ASANA_REQUEST_TIMEOUT_MS: 30000,
}));

// Mock the response formatter
vi.mock('../formatters/responseFormatter', () => ({
  formatTaskCreation: vi.fn((task, context) => {
    return `Successfully created Asana task: "${task.name}" (GID: ${task.gid})
${task.permalink_url ? `View at: ${task.permalink_url}` : ''}
(Request ID: ${context.requestId})`;
  }),
  formatError: vi.fn((error, context) => {
    return `Error: ${error.message} (Request ID: ${context.requestId})`;
  }),
}));

describe('Asana Tool - CREATE_TASK operation', () => {
  let tool: AsanaTool;

  beforeEach(() => {
    // Reset mocks and modules
    vi.resetAllMocks();
    vi.resetModules();

    // Set up test environment
    setupAsanaTestEnv();

    // Ensure config functions return expected values
    vi.mocked(configModule.getWorkspaceGid).mockReturnValue('workspace123');

    // Create a new instance for each test
    tool = new AsanaTool('mock-api-key');
  });

  afterEach(() => {
    clearAsanaTestEnv();
    vi.clearAllMocks();
  });

  it('should create a simple task with name only', async () => {
    // Mock the createTask function to return test data
    vi.mocked(taskOperations.createTask).mockResolvedValue(
      mockTaskCreationResponse,
    );

    // Call the tool with a natural language query
    const result = await tool.call('create a task called "Newly Created Task"');

    // Verify the result contains the confirmation dialog (new behavior)
    expect(result).toContain("I'm ready to create this Asana task");
    expect(result).toContain('Newly Created Task');
    expect(result).toContain('Confirm to create this task');
  });

  it('should create a task with notes', async () => {
    // Mock the createTask function
    vi.mocked(taskOperations.createTask).mockResolvedValue(
      mockTaskCreationResponse,
    );

    // Call the tool
    const result = await tool.call(
      'create a task called "Task with Notes" with notes "These are task notes"',
    );

    // Verify the result contains the confirmation dialog
    expect(result).toContain("I'm ready to create this Asana task");
    expect(result).toContain('Task with Notes');
  });

  it('should create a task with project assignment', async () => {
    // Mock findProjectGidByName to return a project GID
    vi.mocked(projectOperations.findProjectGidByName).mockResolvedValue(
      'project123',
    );

    // Mock createTask
    vi.mocked(taskOperations.createTask).mockResolvedValue(
      mockTaskCreationResponse,
    );

    // Call the tool
    const result = await tool.call(
      'create a task called "Task in Project" in project "Development"',
    );

    // Verify the result contains the confirmation dialog
    expect(result).toContain("I'm ready to create this Asana task");
    expect(result).toContain('Task in Project');
  });

  it('should handle ambiguous project name', async () => {
    // Mock findProjectGidByName to return 'ambiguous'
    vi.mocked(projectOperations.findProjectGidByName).mockResolvedValue(
      'ambiguous',
    );

    // Call the tool
    const result = await tool.call(
      'create a task called "Task in Ambiguous Project" in project "Marketing"',
    );

    // Verify the result contains ambiguity warning in confirmation dialog
    expect(result).toContain("I'm ready to create this Asana task");
    expect(result).toContain('Ambiguous');
    expect(result).toContain('Task in Ambiguous Project');
  });

  it('should create task without project when project not found', async () => {
    // Mock findProjectGidByName to return undefined (project not found)
    vi.mocked(projectOperations.findProjectGidByName).mockResolvedValue(
      undefined,
    );

    // Mock createTask
    vi.mocked(taskOperations.createTask).mockResolvedValue(
      mockTaskCreationResponse,
    );

    // Call the tool
    const result = await tool.call(
      'create a task called "Task with Missing Project" in project "Nonexistent"',
    );

    // Verify the result contains confirmation dialog with project not found warning
    expect(result).toContain("I'm ready to create this Asana task");
    expect(result).toContain('Task with Missing Project');
    expect(result).toContain('Not found');
  });

  it('should handle error when task creation fails', async () => {
    // Mock createTask to throw an error
    vi.mocked(taskOperations.createTask).mockRejectedValue(
      new Error('API connection failed'),
    );

    // Setup the formatter to return an error message
    vi.mocked(responseFormatter.formatError).mockReturnValueOnce(
      'Error: API connection failed (Request ID: any-id)',
    );

    // Call the tool
    const result = await tool.call(
      'create a task called "Task That Will Fail"',
    );

    // For errors during creation, it should still show confirmation first
    expect(result).toContain("I'm ready to create this Asana task");
    expect(result).toContain('Task That Will Fail');
  });

  it('should reject when task name is missing', async () => {
    // Call the tool without a task name
    const result = await tool.call('create a task');

    // Verify the result contains an error about missing task name
    expect(result).toContain('Could not determine task name');
  });

  it('should handle assignee "me"', async () => {
    // Mock createTask
    vi.mocked(taskOperations.createTask).mockResolvedValue(
      mockTaskCreationResponse,
    );

    // Call the tool
    const result = await tool.call(
      'create a task called "Task Assigned to Me" and assign it to me',
    );

    // Verify the result contains confirmation dialog
    expect(result).toContain("I'm ready to create this Asana task");
    expect(result).toContain('Task Assigned to Me');
  });
});
