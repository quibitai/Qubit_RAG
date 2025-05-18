/**
 * Integration tests for Asana Tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AsanaTool } from '../asanaTool';
import * as userOperations from '../api-client/operations/users';

// Mock the getUsersMe operation
vi.mock('../api-client/operations/users', () => ({
  getUsersMe: vi.fn(),
}));

describe('Asana Tool', () => {
  let tool: AsanaTool;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();

    // Create a new instance for each test
    tool = new AsanaTool('mock-api-key');
  });

  describe('GET_USER_ME operation', () => {
    it('should handle "who am i" query and return formatted user info', async () => {
      // Mock the getUsersMe function to return test data
      const mockUserData = {
        gid: 'user123',
        name: 'Test User',
        email: 'test@example.com',
        workspaces: [{ gid: 'ws1', name: 'Work Workspace' }],
      };

      (userOperations.getUsersMe as any).mockResolvedValue(mockUserData);

      // Call the tool with a natural language query
      const result = await tool.call('who am i in asana?');

      // Verify the result contains the expected user info
      expect(result).toContain('Test User');
      expect(result).toContain('test@example.com');
      expect(result).toContain('Work Workspace');

      // Verify getUsersMe was called
      expect(userOperations.getUsersMe).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      // Mock getUsersMe to throw an error
      (userOperations.getUsersMe as any).mockRejectedValue(
        new Error('API connection failed'),
      );

      // Call the tool with a natural language query
      const result = await tool.call('show my user info');

      // Verify the result contains an error message
      expect(result).toContain('Error');
      expect(result).toContain('API connection failed');
    });
  });
});
