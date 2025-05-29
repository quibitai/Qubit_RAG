/**
 * Tests for Modern Asana Tool Wrapper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createModernAsanaToolWrapper } from '../modern-asana-tool-wrapper';
import { setupAsanaTestEnv, clearAsanaTestEnv } from './mocks/mockSetup';

describe('Modern Asana Tool Wrapper', () => {
  let tool: any;

  beforeEach(() => {
    vi.resetAllMocks();
    setupAsanaTestEnv();

    // Create tool instance
    tool = createModernAsanaToolWrapper('mock-api-key');
  });

  afterEach(() => {
    clearAsanaTestEnv();
    vi.clearAllMocks();
  });

  describe('Tool Configuration', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('asana');
      expect(tool.description).toContain(
        'Advanced Asana tool with AI-powered capabilities',
      );
    });

    it('should have proper schema', () => {
      expect(tool.schema).toBeDefined();
      expect(tool.schema._def.shape.action_description).toBeDefined();
    });
  });

  describe('Basic Functionality', () => {
    it('should handle string input', async () => {
      const result = await tool.func({ action_description: 'list users' });
      expect(typeof result).toBe('string');
    });

    it('should handle task creation intent', async () => {
      const result = await tool.func({
        action_description: 'create task "Test Task" in Marketing project',
      });
      expect(typeof result).toBe('string');
    });

    it('should handle project listing intent', async () => {
      const result = await tool.func({
        action_description: 'list projects',
      });
      expect(typeof result).toBe('string');
    });
  });
});
