/**
 * Tests for the LIST_PROJECTS operation in the Asana tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsanaTool } from '../asanaTool';
import * as projectOperations from '../api-client/operations/projects';
import * as configModule from '../config';
import * as responseFormatter from '../formatters/responseFormatter';
import { setupAsanaTestEnv, clearAsanaTestEnv } from './mocks/mockSetup';
import {
  mockProjectsList,
  mockEmptyProjectsList,
  mockProjectsListWithArchived as mockProjectsWithArchived,
} from './mocks/projectResponses';

// Mock the API operations
vi.mock('../api-client/operations/projects', () => ({
  listProjects: vi.fn(),
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
  formatProjectList: vi.fn((projects, filters, context) => {
    if (projects.length === 0) {
      return `No projects found. (Request ID: ${context.requestId})`;
    }
    return `Found ${projects.length} project(s):\n1. ${projects[0].name}\n2. ${projects[1].name}\n3. ${projects[2]?.name || 'Archived Project'}\n4. ${projects[3]?.name || ''}\n(Request ID: ${context.requestId})`;
  }),
  formatError: vi.fn((error, context) => {
    return `Error: ${error.message} (Request ID: ${context.requestId})`;
  }),
}));

describe('Asana Tool - LIST_PROJECTS operation', () => {
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

  it('should list projects when projects exist', async () => {
    // Mock the listProjects function to return test data
    vi.mocked(projectOperations.listProjects).mockResolvedValue(
      mockProjectsList,
    );

    // Call the tool with a natural language query
    const result = await tool.call('list all projects');

    // Verify the result contains the expected project info
    expect(result).toContain('Found 3 project(s)');
    expect(result).toContain('Test Project');
    expect(result).toContain('Minimal Project');
  });

  it('should handle when no projects exist', async () => {
    // Mock the listProjects function to return empty array
    vi.mocked(projectOperations.listProjects).mockResolvedValue(
      mockEmptyProjectsList,
    );

    // Call the tool with a natural language query
    const result = await tool.call('list all projects');

    // Verify the result indicates no projects found
    expect(result).toContain('No projects found');
  });

  it('should include archived projects when requested', async () => {
    // Mock the listProjects function to return test data
    vi.mocked(projectOperations.listProjects).mockResolvedValue(
      mockProjectsWithArchived,
    );

    // Call the tool with a natural language query
    const result = await tool.call('list all projects including archived');

    // Verify the result contains both active and archived projects
    expect(result).toContain('Found 4 project(s)');
    expect(result).toContain('Archived Project');
  });

  it('should handle error when projects listing fails', async () => {
    // Mock listProjects to throw an error
    vi.mocked(projectOperations.listProjects).mockRejectedValue(
      new Error('API connection failed'),
    );

    // Setup the formatter to return an error message
    vi.mocked(responseFormatter.formatError).mockReturnValueOnce(
      'Error: API connection failed (Request ID: any-id)',
    );

    // Call the tool
    const result = await tool.call('list all projects');

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
    const result = await tool.call('list projects');

    // Verify the result contains an error about missing workspace GID
    expect(result).toContain('Default Asana workspace is not configured');
  });
});
