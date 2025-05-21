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

    // Check token format
    const accessToken = asanaAccount.access_token as string;
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

    if (asanaAccount.refresh_token) {
      const refreshToken = asanaAccount.refresh_token as string;
      const refreshIsJwt =
        refreshToken.includes('.') &&
        (refreshToken.startsWith('eyJ') ||
          refreshToken.match(
            /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
          ));
      const refreshIsOpaque =
        refreshToken.match(/^[1-2]\/\d+\/\d+:[a-zA-Z0-9]+$/) ||
        refreshToken.match(/^[1-2]\/[a-zA-Z0-9]+$/);

      console.log(
        `Refresh Token Format: ${refreshIsJwt ? 'JWT' : refreshIsOpaque ? 'Opaque' : 'Unknown'}`,
      );
      console.log(
        `Refresh Token Preview: ${refreshToken.substring(0, 10)}...${refreshToken.substring(refreshToken.length - 10)}`,
      );
    }

    // Attempt to connect to the Asana MCP server
    console.log('\n=== Testing MCP Connection ===');
    console.log(
      `Connecting to: ${process.env.ASANA_MCP_SERVER_URL || 'https://mcp.asana.com/sse'}`,
    );
    console.log(
      `Using token: ${accessToken.substring(0, 10)}...${accessToken.substring(accessToken.length - 10)}`,
    );

    const eventSource = new EventSourcePolyfill(
      process.env.ASANA_MCP_SERVER_URL || 'https://mcp.asana.com/sse',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    // Set up event handlers
    eventSource.addEventListener('open', () => {
      console.log('✅ Connection opened successfully!');
    });

    eventSource.addEventListener('error', (event) => {
      console.error('❌ Connection error:', event);

      // Try to extract more information about the error if possible
      if ((event as any).status === 401) {
        console.error('Authentication failed: 401 Unauthorized');
        console.error(
          'This indicates the token is not valid for the MCP server.',
        );
      }

      // Close connection
      eventSource.close();
    });

    // Wait for a few seconds to see if connection succeeds
    setTimeout(() => {
      console.log('Test complete.');
      eventSource.close();
      process.exit(0);
    }, 5000);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
