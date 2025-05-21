import { BaseMcpClient, McpError } from './baseMcpClient';
import type { BaseMcpClientConfig } from './baseMcpClient';
import { logger } from '@/lib/logger';
// Import the eventsource package directly for Node.js environment
import EventSourcePolyfill from 'eventsource';

/**
 * Default configuration for AsanaMcpClient
 */
const DEFAULT_CONFIG: BaseMcpClientConfig = {
  baseUrl: process.env.ASANA_MCP_SERVER_URL ?? 'https://mcp.asana.com/sse',
  timeoutMs: 30000, // 30 seconds
  maxReconnectAttempts: 3,
  reconnectIntervalMs: 5000, // 5 seconds
  maxReconnectDelay: 10000, // 10 seconds
  commandTimeoutMs: 30000, // 30 seconds
};

/**
 * Command message format for Asana MCP
 */
interface AsanaMcpCommandMessage {
  requestId: string;
  command: string | object;
}

/**
 * AsanaMcpClient - Client for connecting to the Asana MCP server
 */
export class AsanaMcpClient extends BaseMcpClient {
  // Track connection initialization state
  private connectionInitialized = false;

  constructor(accessToken: string, config: Partial<BaseMcpClientConfig> = {}) {
    super(accessToken, config);
    logger.info(this.getLoggerName(), 'Initializing Asana MCP client');
  }

  /**
   * Get the default configuration for this MCP client
   */
  protected getDefaultConfig(): BaseMcpClientConfig {
    return DEFAULT_CONFIG;
  }

  /**
   * Get the logger name for this MCP client
   */
  protected getLoggerName(): string {
    return 'AsanaMcpClient';
  }

  /**
   * Override connect method to establish connection to Asana MCP server
   */
  public async connect(): Promise<void> {
    try {
      logger.info(this.getLoggerName(), 'Connecting to Asana MCP server', {
        baseUrl: this.config.baseUrl,
      });

      // Create a direct connection using the EventSource polyfill
      logger.debug(
        this.getLoggerName(),
        'Connecting to MCP SSE with Access Token (tail):',
        this.accessToken.slice(-8),
      );
      try {
        this.eventSource = new EventSourcePolyfill(this.config.baseUrl, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });

        this.setupEventHandlers();

        // Set up message handlers
        this.eventSource.addEventListener(
          'message',
          this.handleMessage.bind(this),
        );
        this.eventSource.addEventListener('error', this.handleError.bind(this));
        this.eventSource.addEventListener(
          'command_ack',
          this.handleCommandAck.bind(this),
        );
        this.eventSource.addEventListener(
          'command_complete',
          this.handleCommandComplete.bind(this),
        );
      } catch (error) {
        throw new McpError(
          `Failed to create EventSource: ${error instanceof Error ? error.message : String(error)}`,
          'INITIALIZATION_ERROR',
        );
      }

      // Add a short delay to ensure connection is fully established
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify connection is actually working
      if (
        !this.eventSource ||
        this.eventSource.readyState !== EventSourcePolyfill.OPEN
      ) {
        throw new McpError(
          'Failed to establish connection to Asana MCP server',
          'CONNECTION_FAILED',
        );
      }

      this.connectionInitialized = true;
      this.isConnected = true;
      logger.info(
        this.getLoggerName(),
        'Successfully connected to Asana MCP server',
      );
    } catch (error) {
      logger.error(
        this.getLoggerName(),
        'Failed to connect to Asana MCP server',
        {
          error: error instanceof Error ? error.message : String(error),
          code: error instanceof McpError ? error.code : 'UNKNOWN_ERROR',
        },
      );

      this.isConnected = false;
      this.connectionInitialized = false;
      throw error;
    }
  }

  /**
   * Execute a command by sending it to the Asana MCP server
   * @param command The command to send
   * @param requestId The request ID for tracking
   */
  protected executeCommand(command: string | object, requestId: string): void {
    try {
      // Format the command message
      const message: AsanaMcpCommandMessage = {
        requestId,
        command,
      };

      logger.info(this.getLoggerName(), 'Sending command to Asana MCP:', {
        requestId,
        command:
          typeof command === 'string' ? command : JSON.stringify(command),
      });

      // Use a POST request to send commands to the Asana MCP command endpoint
      const commandEndpoint = `${this.config.baseUrl.replace('/sse', '')}/commands`;

      fetch(commandEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(message),
      }).catch((error) => {
        logger.error(this.getLoggerName(), 'Error sending command via POST:', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
          endpoint: commandEndpoint,
        });

        const pendingCommand = this.pendingCommands.get(requestId);
        if (pendingCommand) {
          clearTimeout(pendingCommand.timeout);
          pendingCommand.reject(
            new McpError(
              `Failed to send command: ${error.message}`,
              'SEND_ERROR',
              requestId,
            ),
          );
          this.pendingCommands.delete(requestId);
        }
      });
    } catch (error) {
      logger.error(this.getLoggerName(), 'Error preparing command:', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      const pendingCommand = this.pendingCommands.get(requestId);
      if (pendingCommand) {
        clearTimeout(pendingCommand.timeout);
        pendingCommand.reject(
          new McpError(
            `Error preparing command: ${error instanceof Error ? error.message : String(error)}`,
            'COMMAND_ERROR',
            requestId,
          ),
        );
        this.pendingCommands.delete(requestId);
      }
    }
  }
}
