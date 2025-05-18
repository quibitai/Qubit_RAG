/**
 * Unit tests for users API operations
 */

import { describe, it, expect, vi } from 'vitest';
import { getUsersMe } from '../api-client/operations/users';

describe('Users API Operations', () => {
  describe('getUsersMe', () => {
    it('should call the API client with correct parameters', async () => {
      // Create a mock API client
      const mockApiClient = {
        request: vi.fn().mockResolvedValue({
          gid: '12345',
          name: 'Test User',
          email: 'test@example.com',
          workspaces: [{ gid: 'ws1', name: 'Workspace 1' }],
        }),
      };

      // Call the operation with the mock client
      const result = await getUsersMe(mockApiClient as any, 'test-request-id');

      // Check that the client was called with the correct parameters
      expect(mockApiClient.request).toHaveBeenCalledWith(
        'users/me',
        'GET',
        undefined,
        {
          opt_fields: 'gid,name,email,photo,workspaces.name,workspaces.gid',
        },
        'test-request-id',
      );

      // Verify the result
      expect(result).toEqual({
        gid: '12345',
        name: 'Test User',
        email: 'test@example.com',
        workspaces: [{ gid: 'ws1', name: 'Workspace 1' }],
      });
    });
  });
});
