/**
 * Unit tests for response formatters
 */

import { describe, it, expect } from 'vitest';
import { formatUserInfo } from '../formatters/responseFormatter';

describe('Response Formatters', () => {
  describe('formatUserInfo', () => {
    it('should format user info correctly', () => {
      // Mock user data
      const userData = {
        gid: '12345',
        name: 'Test User',
        email: 'test@example.com',
        workspaces: [
          { gid: 'ws1', name: 'Workspace 1' },
          { gid: 'ws2', name: 'Workspace 2' },
        ],
      };

      // Mock request context
      const requestContext = {
        requestId: 'test-request-id',
        startTime: Date.now(),
      };

      // Format the response
      const formattedResponse = formatUserInfo(userData, requestContext);

      // Verify the formatting
      expect(formattedResponse).toContain('Test User');
      expect(formattedResponse).toContain('test@example.com');
      expect(formattedResponse).toContain('Workspace 1, Workspace 2');
      expect(formattedResponse).toContain('test-request-id');
    });

    it('should handle missing user data', () => {
      // Mock request context
      const requestContext = {
        requestId: 'test-request-id',
        startTime: Date.now(),
      };

      // Format with null user data
      const formattedResponse = formatUserInfo(null as any, requestContext);

      // Verify error message
      expect(formattedResponse).toContain('Error');
      expect(formattedResponse).toContain('test-request-id');
    });
  });
});
