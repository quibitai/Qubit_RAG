import { config } from 'dotenv';
import { RealAsanaMcpClient } from '../lib/ai/clients/asanaMcpClientReal';
import EventSource from 'eventsource';

// Import just the types we need without database dependencies
type McpResponse = {
  success: boolean;
  data?: any;
  error?: string;
  requestId?: string;
};

// Load environment variables from .env.local if it exists
config({
  path: '.env.local',
});

// Manual token input - get this from your browser's network tab or database
const ASANA_ACCESS_TOKEN =
  process.env.ASANA_ACCESS_TOKEN || 'paste_your_asana_access_token_here';

// The URL for the Asana MCP server
const ASANA_MCP_URL =
  process.env.ASANA_MCP_SERVER_URL || 'https://mcp.asana.com/sse';

/**
 * Simple function to test connecting to Asana MCP server
 */
async function testSimpleAsanaMcpConnection() {
  console.log('🚀 Starting direct Asana MCP connection test');
  console.log(`Using MCP server URL: ${ASANA_MCP_URL}`);

  // Create EventSource with Authorization header
  console.log('Attempting to establish EventSource connection...');
  const eventSource = new EventSource(ASANA_MCP_URL, {
    headers: {
      Authorization: `Bearer ${ASANA_ACCESS_TOKEN}`,
    },
  });

  // Set up event handlers
  eventSource.addEventListener('open', () => {
    console.log('✅ EventSource connection established!');
  });

  eventSource.addEventListener('error', (event) => {
    console.error('❌ EventSource connection error:', event);
    console.log('Error details:', {
      readyState: eventSource.readyState,
      withCredentials: eventSource.withCredentials,
    });
  });

  eventSource.addEventListener('message', (event) => {
    console.log('📨 Received message:', event.data);
    try {
      const data = JSON.parse(event.data);
      console.log('Parsed message data:', data);
    } catch (error) {
      console.error('Error parsing message data:', error);
    }
  });

  // Wait for 5 seconds to see if connection is established
  console.log('Waiting for 5 seconds to test connection...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Check if connected
  console.log(
    `Connection state after 5 seconds: ${eventSource.readyState === EventSource.OPEN ? 'OPEN' : 'CLOSED/CONNECTING'}`,
  );

  // Close the connection
  console.log('Closing EventSource connection...');
  eventSource.close();
  console.log('EventSource connection closed');

  // Return success based on whether the connection was established
  return {
    success: eventSource.readyState === EventSource.CLOSED, // If it was successfully opened, it should now be closed
    message: 'Test completed',
  };
}

/**
 * Test function using our client implementation
 */
async function testAsanaMcpClientConnection() {
  console.log('\n🚀 Testing RealAsanaMcpClient implementation');

  // Create a real Asana MCP client
  const client = new RealAsanaMcpClient(ASANA_ACCESS_TOKEN, {
    baseUrl: ASANA_MCP_URL,
  });
  console.log('✅ Created RealAsanaMcpClient instance');

  try {
    // Connect to Asana MCP server
    console.log('🔄 Attempting to connect to Asana MCP server...');
    await client.connect();
    console.log('✅ Successfully connected to Asana MCP server');

    // Send a test command
    console.log('🔄 Sending test command to Asana MCP server...');
    const response = await client.sendCommand('List all my tasks');

    console.log('✅ Successfully received response:');
    console.log(JSON.stringify(response, null, 2));

    return {
      success: true,
      response,
    };
  } catch (error) {
    console.error('❌ Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    // Disconnect from the Asana MCP server
    console.log('🔄 Disconnecting from Asana MCP server...');
    client.disconnect();
    console.log('✅ Disconnected from Asana MCP server');
  }
}

// Run the tests
async function runTests() {
  console.log('==================================================');
  console.log('ASANA MCP CONNECTION TEST - STANDALONE VERSION');
  console.log('==================================================');
  console.log('This script tests connecting to Asana MCP server');
  console.log('without relying on the database or other dependencies');
  console.log('==================================================\n');

  // First test simple connection
  console.log('\n📋 TEST 1: Simple EventSource Connection');
  console.log('--------------------------------------------------');
  try {
    const simpleResult = await testSimpleAsanaMcpConnection();
    console.log(
      `\n✅ Simple connection test ${simpleResult.success ? 'PASSED' : 'FAILED'}`,
    );
  } catch (error) {
    console.error('❌ Simple connection test failed with error:', error);
  }

  // Then test client implementation
  console.log('\n📋 TEST 2: RealAsanaMcpClient Implementation');
  console.log('--------------------------------------------------');
  try {
    const clientResult = await testAsanaMcpClientConnection();
    console.log(
      `\n✅ Client implementation test ${clientResult.success ? 'PASSED' : 'FAILED'}`,
    );
  } catch (error) {
    console.error('❌ Client implementation test failed with error:', error);
  }

  console.log('\n==================================================');
  console.log('TESTS COMPLETED');
  console.log('==================================================');
}

// Run the tests
runTests()
  .catch(console.error)
  .finally(() => {
    console.log('👋 Script completed');
    process.exit(0);
  });
