# Model Context Protocol (MCP) Clients

This directory contains client implementations for various Model Context Protocol (MCP) services.

## Architecture

The MCP architecture is designed to be modular, extensible, and easy to maintain:

```
BaseMcpClient (Abstract Class)
   ↑
   ├── AsanaMcpClient
   ├── GoogleMcpClient (Future)
   ├── MicrosoftMcpClient (Future)
   └── Other Implementations
```

## Components

### BaseMcpClient

`BaseMcpClient` is an abstract base class that handles common MCP functionality:

- Connection management
- Event handling
- Command execution and response processing
- Error handling
- Reconnection logic

Key methods:
- `connect()`: Establishes a connection to the MCP server
- `disconnect()`: Closes the connection to the MCP server
- `sendCommand()`: Sends a command to the MCP server
- `getConnectionStatus()`: Returns the current connection status

### AsanaMcpClient

`AsanaMcpClient` is a concrete implementation of `BaseMcpClient` for Asana:

- Extends BaseMcpClient with Asana-specific functionality
- Implements the Asana MCP protocol for task management
- Provides mock responses in development/test environments

## Integration with TokenManager

The MCP clients are designed to work with the `TokenManager` for OAuth token management:

1. `TokenManager` handles token refresh and caching
2. Tools or services request tokens from `TokenManager`
3. Tokens are passed to MCP clients for authentication

## Usage

For detailed usage instructions, see:

- [Asana MCP Usage Guide](/docs/mcp/asana-mcp-usage.md)
- [TokenManager Documentation](/docs/auth/token-management.md)

## Adding New MCP Clients

To add a new MCP client:

1. Create a new class that extends `BaseMcpClient`
2. Implement the required abstract methods:
   - `getDefaultConfig()`
   - `getLoggerName()`
   - `executeCommand()`
3. Add provider-specific configuration and methods
4. Create a corresponding tool in the `lib/ai/tools` directory

## Testing

Each MCP client should have both unit tests and integration tests:

- Unit tests: Test individual client methods in isolation
- Integration tests: Test the full flow with mocked responses

Test files are located in the `tests/mcp` directory. 