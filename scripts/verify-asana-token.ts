import { db } from '@/lib/db/client';
import { account } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import EventSourcePolyfill from 'eventsource';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function main() {
  try {
    // Fetch the Asana account information from the database
    console.log('Fetching Asana account from the database...');
    const asanaAccount = await db.query.account.findFirst({
      where: and(eq(account.provider, 'asana')),
    });

    if (!asanaAccount) {
      console.error('No Asana account found in the database');
      return;
    }

    // Display the token information
    console.log('=== Asana Account Information ===');
    console.log(`Provider Account ID: ${asanaAccount.providerAccountId}`);
    console.log(`Token Type: ${asanaAccount.token_type}`);
    console.log(`Scopes: ${asanaAccount.scope}`);

    // Check access token format
    // const accessToken = asanaAccount.access_token as string;
    const accessToken =
      '2/1208461823426072/1210281431678745:187158294076500909327ccbf1d406e1';
    const isJwt =
      accessToken.includes('.') &&
      (accessToken.startsWith('eyJ') ||
        accessToken.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/));
    const isOpaque =
      accessToken.match(/^[1-2]\/\d+\/\d+:[a-zA-Z0-9]+$/) ||
      accessToken.match(/^[1-2]\/[a-zA-Z0-9]+$/);

    console.log(
      `Access Token Format: ${isJwt ? 'JWT' : isOpaque ? 'Opaque' : 'Unknown'}`,
    );
    console.log(
      `Access Token Preview: ${accessToken.substring(0, 10)}...${accessToken.substring(accessToken.length - 10)}`,
    );

    // Check refresh token
    if (!asanaAccount.refresh_token) {
      console.error(
        'Asana refresh_token not found in the database for this account.',
      );
      return;
    }

    const refreshToken = asanaAccount.refresh_token as string;
    const refreshIsJwt =
      refreshToken.includes('.') &&
      (refreshToken.startsWith('eyJ') ||
        refreshToken.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/));
    const refreshIsOpaque =
      refreshToken.match(/^[1-2]\/\d+\/\d+:[a-zA-Z0-9]+$/) ||
      refreshToken.match(/^[1-2]\/[a-zA-Z0-9]+$/);

    console.log(
      `Refresh Token Format: ${refreshIsJwt ? 'JWT' : refreshIsOpaque ? 'Opaque' : 'Unknown'}`,
    );
    console.log(
      `Refresh Token Preview: ${refreshToken.substring(0, 10)}...${refreshToken.substring(refreshToken.length - 10)}`,
    );

    // Attempt to connect to the Asana MCP server using the ACCESS token
    console.log('\n=== Testing MCP Connection with ACCESS Token ===');
    console.log(
      `Connecting to: ${process.env.ASANA_MCP_SERVER_URL || 'https://mcp.asana.com/sse'}`,
    );
    console.log(
      `Using ACCESS token: ${accessToken.substring(0, 10)}...${accessToken.substring(accessToken.length - 10)}`,
    );

    const eventSource = new EventSourcePolyfill(
      process.env.ASANA_MCP_SERVER_URL || 'https://mcp.asana.com/sse',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Asana-Enable': 'new_project_templates,new_goal_memberships',
          'Asana-Client-Lib': 'rag_tests/v0.0.1',
        },
      },
    );

    // Set up event handlers
    eventSource.addEventListener('open', () => {
      console.log('✅ Connection with ACCESS token opened successfully!');
    });

    eventSource.addEventListener('error', (event) => {
      console.error('❌ Connection error with ACCESS token:', event);

      // Try to extract more information about the error if possible
      if ((event as any).status === 401) {
        console.error('Authentication failed: 401 Unauthorized');
        console.error(
          'This indicates the ACCESS token is not valid for the MCP server.',
        );
      }

      // Close connection
      eventSource.close();
    });

    // Wait for a few seconds to see if connection succeeds
    setTimeout(() => {
      console.log('ACCESS token test complete.');
      eventSource.close();

      // Now test with REFRESH token
      testWithRefreshToken(refreshToken);
    }, 5000);
  } catch (error) {
    console.error('Error:', error);
  }
}

// New function to test MCP connection with refresh token
async function testWithRefreshToken(refreshToken: string) {
  console.log('\n=== Testing MCP Connection with REFRESH Token ===');

  const mcpUrl =
    process.env.ASANA_MCP_SERVER_URL || 'https://mcp.asana.com/sse';

  try {
    console.log(
      `Connecting to Asana MCP at ${mcpUrl} using the refresh_token as Bearer token...`,
    );
    console.log(
      `Using REFRESH token: ${refreshToken.substring(0, 10)}...${refreshToken.substring(refreshToken.length - 10)}`,
    );

    const mcpResponse = await fetch(mcpUrl, {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        'Asana-Enable': 'new_project_templates,new_goal_memberships',
        'Asana-Client-Lib': 'rag_tests/v0.0.1',
        Accept: 'text/event-stream',
      },
      signal: AbortSignal.timeout(10000), // Timeout after 10 seconds
    });

    console.log(
      `MCP connection attempt with refresh_token - Status: ${mcpResponse.status}`,
    );

    if (mcpResponse.ok) {
      console.log(
        '✅ Successfully connected to Asana MCP using the refresh_token as Bearer token!',
      );
      // Close the connection if just testing connectivity
      mcpResponse.body?.cancel();
    } else {
      console.error(
        `❌ Failed to connect to Asana MCP using refresh_token. Status: ${mcpResponse.status}`,
      );
      const errorBody = await mcpResponse.text();
      console.error('MCP Error Body:', errorBody);
    }
  } catch (error) {
    console.error(
      '❌ Error during MCP connection attempt with refresh_token:',
      error,
    );
  }

  process.exit(0);
}

main();
