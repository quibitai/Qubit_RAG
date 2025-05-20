import { logger } from '@/lib/logger';

// Define MessageEvent type
interface MessageEvent {
  data: any;
  type: string;
  lastEventId: string;
  origin: string;
  ports: ReadonlyArray<MessagePort>;
  source: Window | MessagePort | ServiceWorker | null;
}

// Define EventSource type
interface EventSourceOptions {
  headers?: Record<string, string>;
}

interface EventSourceInstance extends EventTarget {
  readonly readyState: number;
  readonly url: string;
  close(): void;
  addEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  dispatchEvent(event: Event): boolean;
}

interface EventSourceImpl {
  new (url: string, options?: EventSourceOptions): EventSourceInstance;
  readonly CONNECTING: number;
  readonly OPEN: number;
  readonly CLOSED: number;
}

// This will be assigned the appropriate EventSource implementation
let EventSourceImpl: any = null;

// We'll initialize this in the connect method
const getEventSource = async (): Promise<any> => {
  if (EventSourceImpl) {
    return EventSourceImpl;
  }

  // In browser environments, use the native EventSource
  if (
    typeof window !== 'undefined' &&
    typeof window.EventSource !== 'undefined'
  ) {
    EventSourceImpl = window.EventSource;
    return EventSourceImpl;
  }

  // In Node.js, dynamically import the eventsource package
  try {
    const eventSourceModule = await import('eventsource');
    EventSourceImpl = eventSourceModule.default;
    return EventSourceImpl;
  } catch (error) {
    throw new Error(
      `Failed to load EventSource implementation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Response types for MCP
 */
export interface McpResponse {
  success: boolean;
  data?: any;
  error?: string;
  requestId?: string;
}

/**
 * Common Event types for MCP SSE
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
 * Configuration for BaseMcpClient
 */
export interface BaseMcpClientConfig {
  baseUrl: string;
  timeoutMs: number;
  maxReconnectAttempts: number;
  reconnectIntervalMs: number;
  maxReconnectDelay: number;
  commandTimeoutMs: number;
}

/**
 * Custom error class for MCP client errors
 */
export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

/**
 * BaseMcpClient - Abstract base class for MCP clients that handles communication via SSE
 */
export abstract class BaseMcpClient {
  protected eventSource: EventSourceInstance | null = null;
  protected isConnected = false;
  protected reconnectAttempts = 0;
  protected pendingCommands: Map<
    string,
    {
      resolve: (value: McpResponse) => void;
      reject: (reason: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  protected config: BaseMcpClientConfig;
  protected accessToken: string;

  constructor(accessToken: string, config: Partial<BaseMcpClientConfig>) {
    this.accessToken = accessToken;
    this.config = { ...this.getDefaultConfig(), ...config };
    logger.debug(this.getLoggerName(), 'Initialized with config:', {
      baseUrl: this.config.baseUrl,
      timeoutMs: this.config.timeoutMs,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      reconnectIntervalMs: this.config.reconnectIntervalMs,
      maxReconnectDelay: this.config.maxReconnectDelay,
      commandTimeoutMs: this.config.commandTimeoutMs,
    });
  }

  /**
   * Get the default configuration for this MCP client
   * This method must be implemented by derived classes
   */
  protected abstract getDefaultConfig(): BaseMcpClientConfig;

  /**
   * Get the logger name for this MCP client
   * This method must be implemented by derived classes
   */
  protected abstract getLoggerName(): string;

  /**
   * Connect to the MCP server
   * @returns Promise that resolves when the connection is established
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      logger.debug(this.getLoggerName(), 'Already connected');
      return;
    }

    try {
      // Get the appropriate EventSource implementation
      const EventSource = await getEventSource();

      // Create new EventSource instance
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
    } catch (error) {
      logger.error(
        this.getLoggerName(),
        'Failed to create EventSource:',
        error,
      );
      throw new McpError(
        'Failed to create EventSource',
        'INITIALIZATION_ERROR',
      );
    }
  }

  protected setupEventHandlers() {
    if (!this.eventSource) return;

    this.eventSource.addEventListener('open', () => {
      logger.info(this.getLoggerName(), 'SSE connection established');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.eventSource.addEventListener('message', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        this.handleMessage(data);
      } catch (error) {
        logger.error(this.getLoggerName(), 'Error parsing SSE message:', error);
      }
    });

    this.eventSource.addEventListener('error', (error: Event) => {
      logger.error(this.getLoggerName(), 'SSE connection error:', error);
      this.isConnected = false;
      this.handleConnectionError(error);
    });
  }

  /**
   * Disconnect from the MCP server
   */
  public disconnect(): void {
    if (this.eventSource) {
      logger.debug(this.getLoggerName(), 'Disconnecting SSE connection');
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      this.reconnectAttempts = 0;
      logger.info(this.getLoggerName(), 'SSE connection closed');
    }
  }

  /**
   * Send a command to the MCP server
   * @param command The command to send (string or structured object)
   * @returns Promise that resolves with the MCP response
   */
  public async sendCommand(
    command: string | object,
    commandTimeoutMs?: number,
  ): Promise<McpResponse> {
    if (!this.isConnected) {
      throw new McpError('Not connected to MCP server', 'NOT_CONNECTED');
    }

    const requestId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timeout = commandTimeoutMs ?? this.config.commandTimeoutMs;

    logger.debug(this.getLoggerName(), 'Sending command:', {
      requestId,
      command: typeof command === 'string' ? command : JSON.stringify(command),
    });

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        logger.error(this.getLoggerName(), 'Command timed out', { requestId });
        reject(new McpError('Command timed out', 'TIMEOUT', requestId));
      }, timeout);

      // Store the promise resolvers
      this.pendingCommands.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      // Execute the command (implementation provided by subclass)
      this.executeCommand(command, requestId);
    });
  }

  /**
   * Implementation-specific command execution
   * This method must be implemented by derived classes
   */
  protected abstract executeCommand(
    command: string | object,
    requestId: string,
  ): void;

  /**
   * Handle incoming SSE messages
   * @param event The SSE message event
   */
  protected handleMessage(event: MessageEvent): void {
    try {
      let data: any;
      if (typeof event.data === 'string') {
        data = JSON.parse(event.data);
      } else {
        data = event.data;
      }

      logger.debug(this.getLoggerName(), 'Received message:', {
        data: JSON.stringify(data),
      });
    } catch (error) {
      logger.error(this.getLoggerName(), 'Error processing message:', error);
    }
  }

  /**
   * Handle command acknowledgments
   * @param event The command acknowledgment event
   */
  protected handleCommandAck(event: MessageEvent): void {
    try {
      let data: any;
      if (typeof event.data === 'string') {
        data = JSON.parse(event.data);
      } else {
        data = event.data;
      }

      const requestId = data.requestId;
      logger.debug(this.getLoggerName(), 'Command acknowledged:', {
        requestId,
        data: JSON.stringify(data),
      });
    } catch (error) {
      logger.error(
        this.getLoggerName(),
        'Error processing command acknowledgment:',
        error,
      );
    }
  }

  /**
   * Handle command completion
   * @param event The command completion event
   */
  protected handleCommandComplete(event: MessageEvent): void {
    try {
      let data: any;
      if (typeof event.data === 'string') {
        data = JSON.parse(event.data);
      } else {
        data = event.data;
      }

      const requestId = data.requestId;
      logger.debug(this.getLoggerName(), 'Command completed:', {
        requestId,
        data: JSON.stringify(data),
      });

      const pendingCommand = this.pendingCommands.get(requestId);
      if (pendingCommand) {
        clearTimeout(pendingCommand.timeout);
        this.pendingCommands.delete(requestId);

        if (data.success) {
          pendingCommand.resolve({
            success: true,
            data: data.data,
            requestId,
          });
        } else {
          pendingCommand.resolve({
            success: false,
            error: data.error || 'Unknown error',
            requestId,
          });
        }
      } else {
        logger.warn(
          this.getLoggerName(),
          'No pending command found for requestId',
          {
            requestId,
          },
        );
      }
    } catch (error) {
      logger.error(
        this.getLoggerName(),
        'Error processing command completion:',
        error,
      );
    }
  }

  /**
   * Handle errors
   * @param event The error event
   */
  protected handleError(event: MessageEvent): void {
    try {
      let data: any;
      if (typeof event.data === 'string') {
        data = JSON.parse(event.data);
      } else {
        data = event.data;
      }

      const requestId = data.requestId;
      const errorMessage = data.error || 'Unknown error';

      logger.error(this.getLoggerName(), 'Received error event:', {
        requestId,
        error: errorMessage,
      });

      const pendingCommand = requestId
        ? this.pendingCommands.get(requestId)
        : null;
      if (pendingCommand) {
        clearTimeout(pendingCommand.timeout);
        this.pendingCommands.delete(requestId);
        pendingCommand.resolve({
          success: false,
          error: errorMessage,
          requestId,
        });
      }
    } catch (error) {
      logger.error(
        this.getLoggerName(),
        'Error processing error event:',
        error,
      );
    }
  }

  /**
   * Handle connection errors and attempt reconnection
   * @param error The connection error
   */
  protected handleConnectionError(error: Error | Event): void {
    this.isConnected = false;
    logger.error(this.getLoggerName(), 'Connection error:', error);

    // Reject all pending commands
    for (const [requestId, pendingCommand] of this.pendingCommands.entries()) {
      clearTimeout(pendingCommand.timeout);
      pendingCommand.reject(
        new McpError(
          'Connection lost during command execution',
          'CONNECTION_ERROR',
          requestId,
        ),
      );
      this.pendingCommands.delete(requestId);
    }

    // Attempt to reconnect if allowed
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const backoffTime = Math.min(
        this.config.reconnectIntervalMs *
          Math.pow(1.5, this.reconnectAttempts - 1),
        this.config.maxReconnectDelay,
      );

      logger.info(this.getLoggerName(), 'Attempting reconnection', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.config.maxReconnectAttempts,
        backoffTime,
      });

      setTimeout(() => {
        this.connect().catch((reconnectError) => {
          logger.error(
            this.getLoggerName(),
            'Reconnection failed:',
            reconnectError,
          );
        });
      }, backoffTime);
    } else {
      logger.error(this.getLoggerName(), 'Max reconnection attempts reached', {
        attempts: this.reconnectAttempts,
      });
    }
  }

  /**
   * Get the connection status
   * @returns True if connected, false otherwise
   */
  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get the current configuration
   * @returns The current MCP client configuration
   */
  public getConfig(): BaseMcpClientConfig {
    return { ...this.config };
  }
}
