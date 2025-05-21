import { config } from 'dotenv';
import fetch from 'node-fetch';
import EventSource from 'eventsource';

// Load environment variables from .env.local if it exists
config({
  path: '.env.local',
});

// Either use the token from env var or a hardcoded one for testing
// (NOT for production use, just for diagnostic purposes)
const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN || '';

// The URL for the Asana MCP server
const ASANA_MCP_URL =
  process.env.ASANA_MCP_SERVER_URL || 'https://mcp.asana.com/sse';

/**
 * Simple function to directly test connecting to Asana MCP server
 * This uses a simpler approach than the more complex client implementations
 */
async function testDirectAsanaMcp() {
  console.log('🧪 DIRECT ASANA MCP TEST');
  console.log('==================================================');
  console.log(`Using MCP server URL: ${ASANA_MCP_URL}`);

  if (!ASANA_ACCESS_TOKEN) {
    console.error(
      '❌ No access token provided. Please set ASANA_ACCESS_TOKEN environment variable.',
    );
    process.exit(1);
  }

  // First, try a simple fetch to check token format
  console.log('🔄 Testing token format with a direct fetch...');
  try {
    const response = await fetch(ASANA_MCP_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ASANA_ACCESS_TOKEN}`,
      },
    });

    const contentType = response.headers.get('content-type') || '';

    console.log(`🔍 Response status: ${response.status}`);
    console.log(`🔍 Content-Type: ${contentType}`);

    // Try to read the response
    let responseText: string | undefined;
    try {
      responseText = await response.text();
      console.log(
        `🔍 Response body: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`,
      );
    } catch (error) {
      console.error('❌ Failed to read response body', error);
    }

    if (response.status === 401) {
      console.error('❌ Authentication failed (401 Unauthorized)');
      if (responseText?.includes('invalid_token')) {
        console.error(
          "🔑 Token format appears to be invalid. Make sure you're using a valid OAuth token, not a PAT.",
        );
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to perform fetch test:', error);
    process.exit(1);
  }

  console.log('\n🔄 Now testing EventSource connection...');

  // Now try with EventSource
  const eventSource = new EventSource(ASANA_MCP_URL, {
    headers: {
      Authorization: `Bearer ${ASANA_ACCESS_TOKEN}`,
    },
  });

  // Set up events
  eventSource.addEventListener('open', () => {
    console.log('✅ EventSource connection opened successfully!');
  });

  // Define a type for the error event that includes status
  interface ExtendedErrorEvent extends Event {
    status?: number;
    message?: string;
  }

  eventSource.addEventListener('error', (event: ExtendedErrorEvent) => {
    console.error('❌ EventSource connection error:', event);
    if (event?.status === 401) {
      console.error(
        '🔑 Authentication failed. Verify token is valid and has the necessary permissions.',
      );
    }
  });

  eventSource.addEventListener('message', (event: MessageEvent) => {
    console.log('📥 Received event:', event.data);
  });

  // Keep connection open for 10 seconds then close
  setTimeout(() => {
    console.log('🔄 Closing EventSource connection after 10 seconds...');
    eventSource.close();
    console.log('✅ Test completed');
    process.exit(0);
  }, 10000);
}

// Run the test
testDirectAsanaMcp().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
