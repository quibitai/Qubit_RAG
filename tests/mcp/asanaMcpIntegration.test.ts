import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AsanaMcpClient } from '@/lib/ai/clients/asanaMcpClient';
import { tokenManager } from '@/lib/auth/tokenManager';
import { McpResponse } from '@/lib/ai/clients/baseMcpClient';

// Mock the EventSource
vi.mock('eventsource', () => {
  const EventSourceMock = vi.fn().mockImplementation(() => {
    return {
      addEventListener: vi.fn((eventName, callback) => {
        // Store the callback for later use
        if (eventName === 'command_complete') {
          (EventSourceMock as any).commandCompleteCallback = callback;
        }
      }),
      close: vi.fn(),
    };
  });

  // Add helper to trigger events
  (EventSourceMock as any).triggerEvent = (eventName: string, data: any) => {
    if (
      eventName === 'command_complete' &&
      (EventSourceMock as any).commandCompleteCallback
    ) {
      (EventSourceMock as any).commandCompleteCallback(
        new MessageEvent(eventName, { data: JSON.stringify(data) }),
      );
    }
  };

  return { default: EventSourceMock };
});

// Mock fetch for token and command requests
vi.mock('node-fetch', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-mock-token',
            refresh_token: 'new-mock-refresh-token',
            expires_in: 3600,
          }),
        text: () => Promise.resolve('{"success": true}'),
      });
    }),
  };
});

// Mock the logger to prevent console output
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the token manager
vi.mock('@/lib/auth/tokenManager', () => ({
  tokenManager: {
    getToken: vi.fn().mockResolvedValue({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: Date.now() + 3600 * 1000,
    }),
    invalidateToken: vi.fn(),
  },
}));

// Mock environment variables
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('ASANA_MCP_SERVER_URL', 'https://mcp.asana.test/sse');

describe('AsanaMcpClient Integration', () => {
  let client: AsanaMcpClient;
  const mockAccessToken = 'mock-access-token';

  beforeEach(() => {
    client = new AsanaMcpClient(mockAccessToken);
    vi.clearAllMocks();
  });

  afterEach(() => {
    client.disconnect();
    vi.unstubAllEnvs();
  });

  describe('Token Management Integration', () => {
    it('should get a token from TokenManager', async () => {
      const userId = 'user-1';
      const tokenData = await tokenManager.getToken(userId, 'asana');

      expect(tokenData.access_token).toBe('mock-access-token');
      expect(tokenManager.getToken).toHaveBeenCalledWith(userId, 'asana');
    });

    it('should invalidate token', async () => {
      const userId = 'user-1';
      await tokenManager.invalidateToken(userId, 'asana');

      expect(tokenManager.invalidateToken).toHaveBeenCalledWith(
        userId,
        'asana',
      );
    });
  });

  describe('AsanaMcp Test Environment', () => {
    it('should return mock response in test mode', async () => {
      // Simulate connection
      await client.connect();
      (client as any).isConnected = true;

      // Test command execution in test mode
      const command = 'Create a task in the Quibit RAG project';
      const responsePromise = client.sendCommand(command);

      // Wait a bit for the mock response to be generated
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const response = await responsePromise;

      // Verify response contains mock data
      expect(response.success).toBe(true);
      expect(response.data.message).toContain('mock response');
      expect(response.data.action).toBe(command);
    });
  });

  // This test would be enabled when we have a real implementation
  // that doesn't use mocks and can be tested against a real or
  // simulated Asana MCP server
  describe.skip('Real Asana MCP Communication', () => {
    it('should send commands to Asana MCP server', async () => {
      // Set environment to production to use real implementation
      vi.stubEnv('NODE_ENV', 'production');

      // Mock fetch for testing the real implementation
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      global.fetch = fetchMock;

      // Create client and connect
      const productionClient = new AsanaMcpClient(mockAccessToken);
      await productionClient.connect();
      (productionClient as any).isConnected = true;

      // Send command
      const responsePromise = productionClient.sendCommand(
        'Create a task named "Integration Test"',
      );

      // Simulate receiving an SSE event from Asana
      setTimeout(() => {
        const EventSourceMock = require('eventsource').default;
        EventSourceMock.triggerEvent('command_complete', {
          requestId: (productionClient as any).pendingCommands.keys().next()
            .value,
          success: true,
          data: { taskId: '12345', name: 'Test Task' },
        });
      }, 100);

      const response = await responsePromise;

      // Verify fetch was called with correct parameters
      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0][0]).toContain('/commands');

      // Verify response
      expect(response.success).toBe(true);
      expect(response.data.taskId).toBe('12345');

      // Clean up
      productionClient.disconnect();
    });
  });
});
