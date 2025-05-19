/**
 * Tests for configuration utility functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Store original environment
const originalEnv = { ...process.env };

describe('Asana Configuration Utilities', () => {
  // Before each test, reset modules and create a clean testing environment
  beforeEach(() => {
    vi.resetModules();

    // Clear global config
    if (global.CURRENT_TOOL_CONFIGS) {
      global.CURRENT_TOOL_CONFIGS = {
        ...global.CURRENT_TOOL_CONFIGS,
        nativeAsana: undefined,
      };
    }
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe('getWorkspaceGid', () => {
    it('should return undefined when workspace GID is not set', async () => {
      // Set environment variable to undefined
      process.env.ASANA_DEFAULT_WORKSPACE_GID = undefined;

      // If the global config exists, ensure it doesn't have a workspace GID
      if (global.CURRENT_TOOL_CONFIGS?.nativeAsana) {
        global.CURRENT_TOOL_CONFIGS = {
          ...global.CURRENT_TOOL_CONFIGS,
          nativeAsana: {
            ...global.CURRENT_TOOL_CONFIGS.nativeAsana,
            defaultWorkspaceGid: undefined,
          },
        };
      }

      // Import module with clean environment
      const { getWorkspaceGid } = await import('../config');

      // Check that result is falsy (undefined or empty string)
      expect(getWorkspaceGid()).toBeFalsy();
    });

    it('should return the workspace GID from environment variable', async () => {
      // Set the environment variable
      process.env.ASANA_DEFAULT_WORKSPACE_GID = 'test-workspace-123';

      // Import module with updated environment
      const { getWorkspaceGid } = await import('../config');

      // Test the function
      expect(getWorkspaceGid()).toBe('test-workspace-123');
    });
  });

  describe('getTeamGid', () => {
    it('should return undefined when team GID is not set', async () => {
      // Set environment variable to undefined
      process.env.ASANA_DEFAULT_TEAM_GID = undefined;

      // If the global config exists, ensure it doesn't have a team GID
      if (global.CURRENT_TOOL_CONFIGS?.nativeAsana) {
        global.CURRENT_TOOL_CONFIGS = {
          ...global.CURRENT_TOOL_CONFIGS,
          nativeAsana: {
            ...global.CURRENT_TOOL_CONFIGS.nativeAsana,
            defaultTeamGid: undefined,
          },
        };
      }

      // Import module with clean environment
      const { getTeamGid } = await import('../config');

      // Check that result is falsy (undefined or empty string)
      expect(getTeamGid()).toBeFalsy();
    });

    it('should return the team GID from environment variable', async () => {
      // Set the environment variable
      process.env.ASANA_DEFAULT_TEAM_GID = 'test-team-456';

      // Import module with updated environment
      const { getTeamGid } = await import('../config');

      // Test the function
      expect(getTeamGid()).toBe('test-team-456');
    });
  });
});
