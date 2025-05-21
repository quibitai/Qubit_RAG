#!/usr/bin/env tsx

/**
 * Test Asana OAuth Token Format
 *
 * This script tests if an Asana OAuth token is in the correct format
 * and checks it against both the Asana REST API and MCP server.
 *
 * Usage:
 * 1. Set the ASANA_ACCESS_TOKEN environment variable or edit the token below
 * 2. Run: npx tsx scripts/test-asana-oauth-token.ts
 */

import 'dotenv/config';
import EventSource from 'eventsource';

// Either use the token from env var or a hardcoded one for testing
let ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN || '';

// Allow token input as command line argument
if (process.argv.length > 2) {
  ASANA_ACCESS_TOKEN = process.argv[2];
}

// The URL for the Asana MCP server
const ASANA_MCP_URL =
  process.env.ASANA_MCP_SERVER_URL || 'https://mcp.asana.com/sse';
const ASANA_API_URL = 'https://app.asana.com/api/1.0/users/me';

// Define a custom error event type that includes additional properties
interface ExtendedErrorEvent {
  status?: number;
  message?: string;
  type: string; // Type is required in Event interface
}

/**
 * Check if a string is a JWT token
 */
function isJwt(token: string): boolean {
  // JWT tokens are typically three base64url-encoded strings separated by dots
  const jwtPattern = /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*$/;
  return jwtPattern.test(token);
}

/**
 * Decode a JWT token's payload
 */
function decodeJwt(token: string): any {
  try {
    const payload = token.split('.')[1];
    const padded = payload.padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      '=',
    );
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (e) {
    return { error: 'Failed to decode token' };
  }
}

async function testAsanaToken() {
  console.log('\n🔑 ASANA OAUTH TOKEN TEST');
  console.log('==================================================');

  if (!ASANA_ACCESS_TOKEN) {
    console.error(
      '❌ No access token provided. Please set ASANA_ACCESS_TOKEN environment variable or provide it as an argument.',
    );
    process.exit(1);
  }

  // 1. Check token format
  console.log('\n🔍 1. CHECKING TOKEN FORMAT');
  console.log('--------------------------------------------------');

  const tokenPreview =
    ASANA_ACCESS_TOKEN.length > 10
      ? `${ASANA_ACCESS_TOKEN.substring(0, 5)}...${ASANA_ACCESS_TOKEN.substring(ASANA_ACCESS_TOKEN.length - 5)}`
      : ASANA_ACCESS_TOKEN;

  console.log(`Token preview: ${tokenPreview}`);
  console.log(`Token length: ${ASANA_ACCESS_TOKEN.length} characters`);

  if (isJwt(ASANA_ACCESS_TOKEN)) {
    console.log(
      '⚠️ WARNING: Token appears to be a JWT. This may not be compatible with the Asana MCP server.',
    );

    // Decode and show JWT contents
    const decoded = decodeJwt(ASANA_ACCESS_TOKEN);
    console.log('JWT payload:', JSON.stringify(decoded, null, 2));

    console.log(
      '\n⚠️ IMPORTANT: Asana MCP expects an opaque OAuth token, not a JWT.',
    );
    console.log(
      'The NextAuth.js flow may be generating a JWT instead of using the raw Asana token.',
    );
  } else {
    console.log('✅ Token format appears correct (not a JWT).');
  }

  // 2. Test against Asana REST API
  console.log('\n🔍 2. TESTING AGAINST ASANA REST API');
  console.log('--------------------------------------------------');

  try {
    console.log(`Making request to: ${ASANA_API_URL}`);

    const response = await fetch(ASANA_API_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ASANA_ACCESS_TOKEN}`,
      },
    });

    console.log(
      `API Response status: ${response.status} ${response.statusText}`,
    );

    if (response.ok) {
      const data = await response.json();
      console.log('✅ API test successful! User details:');
      console.log(`- User ID: ${data.data.gid}`);
      console.log(`- Name: ${data.data.name}`);
      console.log(`- Email: ${data.data.email}`);
    } else {
      const errorText = await response.text();
      console.error(`❌ API test failed with status ${response.status}:`);
      try {
        const errorJson = JSON.parse(errorText);
        console.error(JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error(errorText);
      }
    }
  } catch (error) {
    console.error('❌ API request failed:', error);
  }

  // 3. Test against Asana MCP server
  console.log('\n🔍 3. TESTING AGAINST ASANA MCP SERVER');
  console.log('--------------------------------------------------');
  console.log(`Making request to MCP server: ${ASANA_MCP_URL}`);

  return new Promise<void>((resolve) => {
    // Initialize timeout variable
    let connectionTimeout: NodeJS.Timeout | null = null;
    let eventSourceClosed = false;

    try {
      const eventSource = new EventSource(ASANA_MCP_URL, {
        headers: {
          Authorization: `Bearer ${ASANA_ACCESS_TOKEN}`,
        },
      });

      // Set a timeout to close the connection if nothing happens
      connectionTimeout = setTimeout(() => {
        console.log('⏱️ Connection timeout after 5 seconds with no events');
        if (!eventSourceClosed) {
          eventSource.close();
          eventSourceClosed = true;
          resolve();
        }
      }, 5000);

      // Set up event handlers
      eventSource.addEventListener('open', () => {
        console.log('✅ MCP connection opened successfully!');
      });

      eventSource.addEventListener('error', (event: Event) => {
        // Cast the event to our custom type
        const errorEvent = event as unknown as ExtendedErrorEvent;
        console.error('❌ MCP connection error:');

        if (errorEvent.status) {
          console.error(`- Status: ${errorEvent.status}`);
        }

        if (errorEvent.message) {
          console.error(`- Message: ${errorEvent.message}`);
        }

        console.error('- Type:', errorEvent.type);
        console.error('EventSource state:', {
          readyState: eventSource.readyState,
        });

        if (errorEvent.status === 401) {
          console.error('\n⚠️ ERROR 401: Token was rejected by the MCP server.');
          console.error(
            'This indicates the token format is incorrect or invalid.',
          );
          console.error(
            "If you're using a JWT, you need to use the raw Asana OAuth token instead.",
          );
        }

        // Clear timeout and close connection
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        if (!eventSourceClosed) {
          eventSource.close();
          eventSourceClosed = true;
          resolve();
        }
      });

      eventSource.addEventListener('message', (event) => {
        console.log('📨 Received message from MCP server:', event.data);

        // Clear timeout and close connection
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        if (!eventSourceClosed) {
          eventSource.close();
          eventSourceClosed = true;
          resolve();
        }
      });
    } catch (error) {
      console.error('❌ Failed to initialize MCP connection:', error);
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      resolve();
    }
  });
}

// Run the test
testAsanaToken().then(() => {
  console.log('\n==================================================');
  console.log('🔍 TEST SUMMARY:');
  console.log('1. If your token is a JWT, it will not work with Asana MCP.');
  console.log('2. The Asana MCP server expects a raw OAuth token from Asana.');
  console.log('3. Update your NextAuth.js configuration to use the raw token.');
  console.log('==================================================');
});
