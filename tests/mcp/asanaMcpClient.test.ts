import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AsanaMcpClient } from '@/lib/ai/clients/asanaMcpClient';
import { McpResponse } from '@/lib/ai/clients/baseMcpClient';

// Mock the EventSource to control SSE messaging
vi.mock('eventsource', () => {
  const EventSourceMock = vi.fn().mockImplementation(() => {
    return {
      addEventListener: vi.fn(),
      close: vi.fn(),
    };
  });
  return { default: EventSourceMock };
});

// Mock the logger to prevent console output during tests
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AsanaMcpClient', () => {
  let client: AsanaMcpClient;
  const mockAccessToken = 'mock-access-token';

  beforeEach(() => {
    client = new AsanaMcpClient(mockAccessToken);
    vi.clearAllMocks();
  });

  afterEach(() => {
    client.disconnect();
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const config = client.getConfig();
      expect(config.baseUrl).toBe('https://mcp.asana.com/sse');
      expect(config.timeoutMs).toBe(30000);
      expect(config.maxReconnectAttempts).toBe(3);
      expect(config.reconnectIntervalMs).toBe(5000);
      expect(config.maxReconnectDelay).toBe(10000);
      expect(config.commandTimeoutMs).toBe(30000);
    });

    it('should override default configuration with provided values', () => {
      const customClient = new AsanaMcpClient(mockAccessToken, {
        baseUrl: 'https://custom-url.com',
        timeoutMs: 10000,
      });
      const config = customClient.getConfig();
      expect(config.baseUrl).toBe('https://custom-url.com');
      expect(config.timeoutMs).toBe(10000);
      // These should still be defaults
      expect(config.maxReconnectAttempts).toBe(3);
      expect(config.reconnectIntervalMs).toBe(5000);
    });
  });

  describe('Connection', () => {
    it('should track connection status', async () => {
      expect(client.getConnectionStatus()).toBe(false);

      // Simulate connection
      await client.connect();
      // Mock the 'open' event handler manually since we've mocked EventSource
      // In a real test, we would trigger the event handler naturally
      (client as any).isConnected = true;

      expect(client.getConnectionStatus()).toBe(true);

      client.disconnect();
      expect(client.getConnectionStatus()).toBe(false);
    });
  });

  describe('Command Execution', () => {
    it('should return a mock response in test mode', async () => {
      const commandText = 'Create a task in my marketing project';

      // Simulate connection
      await client.connect();
      (client as any).isConnected = true;

      // Mock the command completion handler
      const mockHandleCommandComplete = vi
        .fn()
        .mockImplementation((event: MessageEvent) => {
          // Simulate the base class behavior by extracting data and resolving the promise
          const data = JSON.parse(event.data as string);
          const pendingCommand = (client as any).pendingCommands.get(
            data.requestId,
          );
          if (pendingCommand) {
            pendingCommand.resolve({
              success: true,
              data: data.data,
              requestId: data.requestId,
            });
          }
        });

      // Replace the handleCommandComplete method
      (client as any).handleCommandComplete = mockHandleCommandComplete;

      // Send the command
      const response = await client.sendCommand(commandText);

      // Verify response
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.message).toContain('mock response');
      expect(response.data.action).toBe(commandText);
    });

    it('should handle command timeout', async () => {
      // Create a client with shorter timeout
      const timeoutClient = new AsanaMcpClient(mockAccessToken, {
        commandTimeoutMs: 50, // Very short timeout for testing
      });

      // Simulate connection
      await timeoutClient.connect();
      (timeoutClient as any).isConnected = true;

      // This will timeout since we don't mock the response
      await expect(timeoutClient.sendCommand('test command')).rejects.toThrow(
        'Command timed out',
      );
    });
  });
});
