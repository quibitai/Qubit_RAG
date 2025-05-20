# Connecting to the Real Asana MCP Server

This document explains how to test and use a real connection to the Asana Model Context Protocol (MCP) server. The default implementation simulates a connection in development mode, but these tools allow you to test a real connection.

## Prerequisites

1. A valid Asana account with OAuth integration
2. An active access token for the Asana API
3. Proper configuration in your environment files

## Overview of Available Scripts

This repository includes several scripts to help you test and use real connections to the Asana MCP server:

1. **extract-asana-token.ts**: Extracts an Asana access token from the database for use in standalone tests
2. **test-asana-mcp-standalone.ts**: Tests a real connection to the Asana MCP server without relying on the database
3. **enable-real-asana-mcp.ts**: Modifies the main application to use real connections instead of simulated ones
4. **disable-real-asana-mcp.ts**: Reverts the changes made by enable-real-asana-mcp.ts

## Quick Start Guide

### 1. Extract an Asana Access Token

If you have a valid Asana account connected in the database:

```bash
npx tsx scripts/extract-asana-token.ts
```

This will provide you with:
- The access token value
- Commands to set it as an environment variable
- Instructions to use it in the standalone test

### 2. Run the Standalone Test

You can test a direct connection to the Asana MCP server without modifying the main application:

```bash
# Using environment variable
export ASANA_ACCESS_TOKEN='your_token_here'
npx tsx scripts/test-asana-mcp-standalone.ts

# Or edit the script directly with your token
```

The standalone test tries two approaches:
- A direct EventSource connection
- Using our RealAsanaMcpClient implementation

### 3. Enable Real Connections in the Main App

When you're ready to use real connections in the main application:

```bash
npx tsx scripts/enable-real-asana-mcp.ts
```

This script:
- Creates a backup of the original asanaMcpTool.ts file
- Updates import statements to use RealAsanaMcpClient
- Replaces client initialization
- Adds a warning comment at the top of the file

### 4. Run the Application with Real Connections

```bash
pnpm dev
```

Now when you use Asana functionality, it will attempt to connect to the real Asana MCP server instead of using simulation.

### 5. Revert to Simulated Mode

When you're done testing, revert to the original configuration:

```bash
npx tsx scripts/disable-real-asana-mcp.ts
```

## Technical Implementation

The implementation includes these components:

1. **RealAsanaMcpClient**: A version of AsanaMcpClient that bypasses development mode checks
2. **RealAsanaMcpTool**: A LangChain tool that uses RealAsanaMcpClient

## Troubleshooting

### Common Issues

1. **Connection Failures**:
   - Check that your access token is valid and not expired
   - Verify the Asana MCP server URL is correct
   - Ensure your network allows the connection

2. **Authentication Errors**:
   - Reconnect your Asana account in the application
   - Check that your token has the necessary scopes/permissions

3. **Command Errors**:
   - Verify the command format is correct
   - Check if there are rate limits or API restrictions

### Logs and Debugging

Look for logs with these prefixes to diagnose issues:
- `RealAsanaMcpClient`: For connection issues
- `RealAsanaMcpTool`: For tool invocation issues

## Security Considerations

When working with real connections and access tokens:

1. Never commit access tokens to version control
2. Use environment variables for sensitive information
3. Reset to simulation mode when not actively testing

## Additional Resources

- [Asana MCP Documentation](https://developers.asana.com/docs/mcp)
- [Asana API Authentication](https://developers.asana.com/docs/authentication)
- [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) 