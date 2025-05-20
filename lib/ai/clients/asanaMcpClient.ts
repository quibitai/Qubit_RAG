import EventSource from 'eventsource';
import { logger } from '@/lib/logger';

/**
 * Response types for Asana MCP
 */
export interface McpResponse {
  success: boolean;
  data?: any;
  error?: string;
  requestId?: string;
}

/**
 * Event types for Asana MCP SSE
 */
export enum McpEventType {
  MESSAGE = 'message',
  ERROR = 'error',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  COMMAND_ACK = 'command_ack',
  COMMAND_COMPLETE = 'command_complete',
}

/**
 * Configuration for AsanaMcpClient
 */
export interface AsanaMcpClientConfig {
  baseUrl: string;
  timeoutMs: number;
  maxReconnectAttempts: number;
  reconnectIntervalMs: number;
  maxReconnectDelay: number;
  commandTimeoutMs: number;
}

/**
 * Default configuration for AsanaMcpClient
 */
const DEFAULT_CONFIG: AsanaMcpClientConfig = {
  baseUrl: process.env.ASANA_MCP_SERVER_URL ?? 'https://mcp.asana.com/sse',
  timeoutMs: 30000, // 30 seconds
  maxReconnectAttempts: 3,
  reconnectIntervalMs: 5000, // 5 seconds
  maxReconnectDelay: 10000, // 10 seconds
  commandTimeoutMs: 30000, // 30 seconds
};

/**
 * Custom error class for MCP client errors
 */
export class AsanaMcpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'AsanaMcpError';
  }
}

/**
 * AsanaMcpClient - Handles communication with Asana MCP server via SSE
 */
export class AsanaMcpClient {
  private eventSource: EventSource | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private pendingCommands: Map<
    string,
    {
      resolve: (value: McpResponse) => void;
      reject: (reason: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  private config: AsanaMcpClientConfig;
  private accessToken: string;

  constructor(accessToken: string, config: Partial<AsanaMcpClientConfig> = {}) {
    this.accessToken = accessToken;
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('AsanaMcpClient', 'Initialized with config:', {
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      reconnectIntervalMs: this.config.reconnectIntervalMs,
      maxReconnectDelay: this.config.maxReconnectDelay,
      commandTimeoutMs: this.config.commandTimeoutMs,
    });
  }

  /**
   * Connect to the Asana MCP server
   * @returns Promise that resolves when the connection is established
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      logger.debug('AsanaMcpClient', 'Already connected');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.eventSource = new EventSource(this.config.baseUrl, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });

        this.setupEventHandlers();

        // Set up message handlers
        this.eventSource.addEventListener(
          McpEventType.MESSAGE,
          this.handleMessage.bind(this),
        );
        this.eventSource.addEventListener(
          McpEventType.ERROR,
          this.handleError.bind(this),
        );
        this.eventSource.addEventListener(
          McpEventType.COMMAND_ACK,
          this.handleCommandAck.bind(this),
        );
        this.eventSource.addEventListener(
          McpEventType.COMMAND_COMPLETE,
          this.handleCommandComplete.bind(this),
        );

        resolve();
      } catch (error) {
        logger.error('AsanaMcpClient', 'Failed to create EventSource:', error);
        reject(
          new AsanaMcpError(
            'Failed to create EventSource',
            'INITIALIZATION_ERROR',
          ),
        );
      }
    });
  }

  private setupEventHandlers() {
    if (!this.eventSource) return;

    this.eventSource.addEventListener('open', () => {
      logger.info('AsanaMcpClient', 'SSE connection established');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.eventSource.addEventListener('message', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        this.handleMessage(data);
      } catch (error) {
        logger.error('AsanaMcpClient', 'Error parsing SSE message:', error);
      }
    });

    this.eventSource.addEventListener('error', (error: Event) => {
      logger.error('AsanaMcpClient', 'SSE connection error:', error);
      this.isConnected = false;
      this.handleConnectionError(error);
    });
  }

  /**
   * Disconnect from the Asana MCP server
   */
  public disconnect(): void {
    if (this.eventSource) {
      logger.debug('AsanaMcpClient', 'Disconnecting SSE connection');
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      this.reconnectAttempts = 0;
      logger.info('AsanaMcpClient', 'SSE connection closed');
    }
  }

  /**
   * Send a command to the Asana MCP server
   * @param command The command to send (string or structured object)
   * @returns Promise that resolves with the MCP response
   */
  public async sendCommand(
    command: string | object,
    commandTimeoutMs?: number,
  ): Promise<McpResponse> {
    if (!this.isConnected) {
      throw new AsanaMcpError('Not connected to MCP server', 'NOT_CONNECTED');
    }

    const requestId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timeout = commandTimeoutMs ?? this.config.commandTimeoutMs;

    logger.debug('AsanaMcpClient', 'Sending command:', {
      requestId,
      command: typeof command === 'string' ? command : JSON.stringify(command),
    });

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new AsanaMcpError('Command timed out', 'TIMEOUT', requestId));
      }, timeout);

      // Store the promise resolvers
      this.pendingCommands.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      // Send the command
      try {
        // Note: This is a placeholder for the actual command sending mechanism
        // The exact implementation will depend on how the MCP server expects to receive commands
        const message = {
          type: 'command',
          requestId,
          data: typeof command === 'string' ? command : JSON.stringify(command),
        };

        // Send the command over the SSE connection
        // This is a simplified implementation - the actual mechanism may differ
        if (this.eventSource) {
          this.eventSource.dispatchEvent(
            new MessageEvent('command', {
              data: JSON.stringify(message),
            }),
          );
        } else {
          throw new AsanaMcpError(
            'EventSource not available',
            'CONNECTION_LOST',
            requestId,
          );
        }
      } catch (error) {
        this.pendingCommands.delete(requestId);
        clearTimeout(timeoutId);
        reject(
          new AsanaMcpError('Failed to send command', 'SEND_ERROR', requestId),
        );
      }
    });
  }

  /**
   * Handles incoming messages from the SSE connection
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      logger.debug('AsanaMcpClient', 'Received message:', data);

      // Handle different message types
      switch (data.type) {
        case McpEventType.COMMAND_ACK:
          this.handleCommandAck(event);
          break;
        case McpEventType.COMMAND_COMPLETE:
          this.handleCommandComplete(event);
          break;
        default:
          logger.debug('AsanaMcpClient', 'Unhandled message type:', data.type);
      }
    } catch (error) {
      logger.error('AsanaMcpClient', 'Error handling message:', error);
    }
  }

  /**
   * Handles command acknowledgment events
   */
  private handleCommandAck(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      const { requestId } = data;

      logger.debug('AsanaMcpClient', 'Command acknowledged:', { requestId });

      // Update the pending command state if needed
      const pendingCommand = this.pendingCommands.get(requestId);
      if (pendingCommand) {
        // Command was acknowledged, but we're still waiting for completion
        logger.debug(
          'AsanaMcpClient',
          'Command acknowledged, waiting for completion:',
          { requestId },
        );
      }
    } catch (error) {
      logger.error(
        'AsanaMcpClient',
        'Error handling command acknowledgment:',
        error,
      );
    }
  }

  /**
   * Handles command completion events
   */
  private handleCommandComplete(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      const { requestId, success, error, result } = data;

      logger.debug('AsanaMcpClient', 'Command completed:', {
        requestId,
        success,
        error,
      });

      const pendingCommand = this.pendingCommands.get(requestId);
      if (pendingCommand) {
        clearTimeout(pendingCommand.timeout);
        this.pendingCommands.delete(requestId);

        if (success) {
          pendingCommand.resolve({
            success: true,
            data: result,
            requestId,
          });
        } else {
          pendingCommand.reject(
            new AsanaMcpError(
              error || 'Command failed',
              'COMMAND_ERROR',
              requestId,
            ),
          );
        }
      }
    } catch (error) {
      logger.error(
        'AsanaMcpClient',
        'Error handling command completion:',
        error,
      );
    }
  }

  /**
   * Handles error events from the SSE connection
   */
  private handleError(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      logger.error('AsanaMcpClient', 'Received error event:', data);

      // Check if this is an authentication error
      if (data.code === 401 || data.code === 403) {
        throw new AsanaMcpError('Authentication failed', 'AUTH_ERROR');
      }

      // Handle other error types
      // ...
    } catch (error) {
      logger.error('AsanaMcpClient', 'Error handling error event:', error);
    }
  }

  /**
   * Handles connection errors and implements reconnection logic
   */
  private handleConnectionError(error: Error | Event): void {
    if (!this.eventSource) return;

    logger.error('AsanaMcpClient', 'Connection error:', error);
    this.isConnected = false;

    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(
        1000 * Math.pow(2, this.reconnectAttempts),
        this.config.maxReconnectDelay,
      );

      logger.info(
        'AsanaMcpClient',
        `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`,
      );
      setTimeout(() => this.connect(), delay);
    } else {
      logger.error('AsanaMcpClient', 'Max reconnection attempts reached');
      this.disconnect();
    }
  }

  /**
   * Check if the client is connected to the MCP server
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Gets the current configuration
   */
  public getConfig(): AsanaMcpClientConfig {
    return { ...this.config };
  }
}
