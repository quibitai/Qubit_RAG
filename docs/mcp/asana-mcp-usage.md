# Asana MCP Integration

This document provides an overview of the Asana Model Context Protocol (MCP) integration in our application.

## What is the Model Context Protocol?

The Model Context Protocol (MCP) is a standardized way for AI models to interact with third-party services. In the context of Asana, MCP allows our application to communicate with Asana's task management system through natural language commands processed by AI.

## Components of the Integration

Our Asana MCP integration consists of the following components:

1. **BaseMcpClient**: An abstract class that handles common MCP functionality like connection management, event handling, and command execution.
2. **AsanaMcpClient**: A concrete implementation that extends BaseMcpClient with Asana-specific functionality.
3. **TokenManager**: Handles OAuth token management, refreshing, and caching.
4. **AsanaMcpTool**: A LangChain tool that allows AI agents to interact with Asana via natural language.

## Usage Examples

### Basic Usage

To use the Asana MCP integration in your code:

```typescript
import { AsanaMcpClient } from '@/lib/ai/clients/asanaMcpClient';
import { tokenManager } from '@/lib/auth/tokenManager';

// Get a user's Asana token
const userId = 'user-123';
const tokenData = await tokenManager.getToken(userId, 'asana');

// Create an Asana MCP client
const client = new AsanaMcpClient(tokenData.access_token);

// Connect to the Asana MCP server
await client.connect();

try {
  // Send a command to Asana
  const result = await client.sendCommand(
    'Create a task called "Review documentation" in the "Development" project'
  );
  
  if (result.success) {
    console.log('Task created:', result.data);
  } else {
    console.error('Error creating task:', result.error);
  }
} finally {
  // Always disconnect when done
  client.disconnect();
}
```

### Using with LangChain

The AsanaMcpTool can be used with LangChain agents:

```typescript
import { asanaMcpTool } from '@/lib/ai/tools/asanaMcpTool';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';

// Create an agent with the Asana MCP tool
const agent = await createOpenAIToolsAgent({
  llm: new ChatOpenAI(),
  tools: [asanaMcpTool],
  prompt: PromptTemplate.fromTemplate(`
    You are an AI assistant that can help manage tasks in Asana.
    Use the asanaMcp tool to create, update, and manage tasks.
    
    {input}
  `)
});

const executor = AgentExecutor.fromAgentAndTools({
  agent,
  tools: [asanaMcpTool],
});

// Execute the agent with a user query
const result = await executor.invoke({
  input: "Create a task called 'Review Q3 reports' due next Friday"
});

console.log(result.output);
```

## Configuration

The Asana MCP integration can be configured through environment variables:

- `ASANA_MCP_SERVER_URL`: The URL of the Asana MCP server (default: `https://mcp.asana.com/sse`)
- `ASANA_OAUTH_CLIENT_ID`: Your Asana OAuth client ID
- `ASANA_OAUTH_CLIENT_SECRET`: Your Asana OAuth client secret

## Development and Testing

In development and test environments, the AsanaMcpClient will return mock responses instead of making actual API calls. This behavior is controlled by the `NODE_ENV` environment variable.

To test with mock responses:

```typescript
// This will use mock responses
process.env.NODE_ENV = 'development';
const client = new AsanaMcpClient('mock-token');
```

To test with real API calls:

```typescript
// This will use real API calls
process.env.NODE_ENV = 'production';
const client = new AsanaMcpClient(realToken);
```

## Error Handling

The AsanaMcpClient throws `McpError` exceptions with the following error codes:

- `INITIALIZATION_ERROR`: Failed to initialize the client
- `NOT_CONNECTED`: Attempted to send a command when not connected
- `TIMEOUT`: Command timed out waiting for a response
- `CONNECTION_ERROR`: Connection to the MCP server was lost
- `SEND_ERROR`: Failed to send a command
- `COMMAND_ERROR`: Command was sent but failed to execute

Example error handling:

```typescript
import { AsanaMcpClient } from '@/lib/ai/clients/asanaMcpClient';
import { McpError } from '@/lib/ai/clients/baseMcpClient';

try {
  const client = new AsanaMcpClient(token);
  await client.connect();
  const result = await client.sendCommand('Create a task');
} catch (error) {
  if (error instanceof McpError) {
    console.error(`MCP Error (${error.code}): ${error.message}`);
    // Handle specific error types
    if (error.code === 'TIMEOUT') {
      // Handle timeout specifically
    }
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Extension Points

The MCP integration is designed to be extensible. To add support for other MCP providers:

1. Create a new client that extends `BaseMcpClient`
2. Implement the provider-specific methods
3. Create a LangChain tool that uses your new client

See `AsanaMcpClient` and `AsanaMcpTool` as reference implementations. 