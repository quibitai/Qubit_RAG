/**
 * Test setup for Asana tool tests
 */

import { vi, beforeEach } from 'vitest';

// Mock environment variables
process.env.ASANA_API_KEY = 'test-asana-key';
process.env.ASANA_DEFAULT_WORKSPACE_GID = 'workspace123';
process.env.OPENAI_API_KEY = 'test-openai-key';

// Global test setup
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
});

// Mock fetch globally for OpenAI API calls
global.fetch = vi.fn();

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
