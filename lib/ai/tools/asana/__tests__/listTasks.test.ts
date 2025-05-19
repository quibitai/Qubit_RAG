/**
 * Tests for the LIST_TASKS operation in the Asana tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsanaTool } from '../asanaTool';
import * as projectOperations from '../api-client/operations/projects';
import * as taskOperations from '../api-client/operations/tasks';
import * as configModule from '../config';
import * as responseFormatter from '../formatters/responseFormatter';
import { setupAsanaTestEnv, clearAsanaTestEnv } from './mocks/mockSetup';
import { mockTasksList, mockEmptyTasksList } from './mocks/taskResponses';

// Mock the API operations and config
vi.mock('../api-client/operations/projects', () => ({
  findProjectGidByName: vi.fn(),
}));

vi.mock('../api-client/operations/tasks', () => ({
  listTasks: vi.fn(),
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
  formatTaskList: vi.fn((tasks, filters, context) => {
    if (tasks.length === 0) {
      return `No tasks found. (Request ID: ${context.requestId})`;
    }
    return `Found ${tasks.length} task(s):\n1. ${tasks[0].name}\n2. ${tasks[1].name}\n3. ${tasks[2].name}\n4. ${tasks[3].name}\n(Request ID: ${context.requestId})`;
  }),
  formatError: vi.fn((error, context) => {
    return `Error: ${error.message} (Request ID: ${context.requestId})`;
  }),
}));

describe('Asana Tool - LIST_TASKS operation', () => {
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

  it('should list all tasks in workspace', async () => {
    // Mock the listTasks function to return test data
    vi.mocked(taskOperations.listTasks).mockResolvedValue(mockTasksList);

    // Call the tool with a natural language query
    const result = await tool.call('list all tasks');

    // Verify the result contains the expected task info
    expect(result).toContain('Found 4 task(s)');
    expect(result).toContain('Test Task');
  });

  it('should list my tasks', async () => {
    // Mock the listTasks function
    vi.mocked(taskOperations.listTasks).mockResolvedValue(mockTasksList);

    // Call the tool
    const result = await tool.call('show my tasks');

    // Verify the result
    expect(result).toContain('Found 4 task(s)');
  });

  it('should list tasks in a specific project', async () => {
    // Mock findProjectGidByName to return a project GID
    vi.mocked(projectOperations.findProjectGidByName).mockResolvedValue(
      'project123',
    );

    // Mock listTasks
    vi.mocked(taskOperations.listTasks).mockResolvedValue(mockTasksList);

    // Call the tool
    const result = await tool.call('list tasks in project "Launch Campaign"');

    // Verify the result
    expect(result).toContain('Found 4 task(s)');
  });

  it('should handle ambiguous project name', async () => {
    // Mock findProjectGidByName to return 'ambiguous'
    vi.mocked(projectOperations.findProjectGidByName).mockResolvedValue(
      'ambiguous',
    );

    // Setup the formatter to return an ambiguous error
    vi.mocked(responseFormatter.formatError).mockReturnValueOnce(
      "Error: Multiple projects found matching 'Marketing'. Please be more specific. (Request ID: any-id)",
    );

    // Call the tool
    const result = await tool.call('list tasks in project "Marketing"');

    // Verify the result contains an ambiguity message
    expect(result).toContain('Multiple projects found');
    expect(result).toContain('Please be more specific');
  });

  it('should handle when project not found', async () => {
    // Mock findProjectGidByName to return undefined (project not found)
    vi.mocked(projectOperations.findProjectGidByName).mockResolvedValue(
      undefined,
    );

    // Setup the formatter to return a project not found message
    vi.mocked(responseFormatter.formatError).mockReturnValueOnce(
      'No project found matching "NonExistent Project". Please check the project name and try again. (Request ID: any-id)',
    );

    // Call the tool
    const result = await tool.call(
      'list tasks in project "NonExistent Project"',
    );

    // Verify the result contains a note about project not found
    expect(result).toContain('No project found');
  });

  it('should handle empty task list', async () => {
    // Mock listTasks to return empty array
    vi.mocked(taskOperations.listTasks).mockResolvedValue(mockEmptyTasksList);

    // Call the tool
    const result = await tool.call('list my tasks');

    // Verify the result contains no tasks message
    expect(result).toContain('No tasks found');
  });

  it('should handle error when task listing fails', async () => {
    // Mock listTasks to throw an error
    vi.mocked(taskOperations.listTasks).mockRejectedValue(
      new Error('API connection failed'),
    );

    // Setup the formatter to return an error message
    vi.mocked(responseFormatter.formatError).mockReturnValueOnce(
      'Error: API connection failed (Request ID: any-id)',
    );

    // Call the tool
    const result = await tool.call('list all tasks');

    // Verify the result contains an error message
    expect(result).toContain('Error');
    expect(result).toContain('API connection failed');
  });

  it('should return error when workspace GID is missing', async () => {
    // Override the config for this test only
    vi.mocked(configModule.getWorkspaceGid).mockReturnValueOnce(undefined);

    // Setup the formatter to return a workspace error
    vi.mocked(responseFormatter.formatError).mockReturnValueOnce(
      'Error: Default Asana workspace is not configured. Please configure ASANA_DEFAULT_WORKSPACE_GID in your environment. (Request ID: any-id)',
    );

    // Call the tool
    const result = await tool.call('list tasks');

    // Verify the result contains an error about missing workspace GID
    expect(result).toContain('Default Asana workspace is not configured');
  });

  it('should handle completed tasks query', async () => {
    // Mock listTasks
    vi.mocked(taskOperations.listTasks).mockResolvedValue(mockTasksList);

    // Call the tool
    const result = await tool.call('show my completed tasks');

    // Verify the result
    expect(result).toContain('Found 4 task(s)');
  });

  it('should list both my tasks in a project', async () => {
    // Mock findProjectGidByName to return a project GID
    vi.mocked(projectOperations.findProjectGidByName).mockResolvedValue(
      'project123',
    );

    // Mock listTasks
    vi.mocked(taskOperations.listTasks).mockResolvedValue(mockTasksList);

    // Call the tool
    const result = await tool.call('list my tasks in project "Development"');

    // Verify the result
    expect(result).toContain('Found 4 task(s)');
  });
});
