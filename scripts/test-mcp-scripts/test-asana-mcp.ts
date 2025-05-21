import { config } from 'dotenv';
import { AsanaMcpClient } from '../../lib/ai/clients/asanaMcpClient';
import { tokenManager } from '../../lib/auth/tokenManager';
import { db } from '../../lib/db/client';
import { account } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger';

// Load environment variables
config({
  path: '.env.local',
});

/**
 * Main function to test real Asana MCP connection
 */
async function testRealAsanaMcpConnection() {
  logger.info('SCRIPT', '🚀 Starting Real Asana MCP Connection Test');

  try {
    // Get an Asana account from the database to use for testing
    const asanaAccount = await db.query.account.findFirst({
      where: eq(account.provider, 'asana'),
      orderBy: (account, { desc }) => [desc(account.expires_at)],
    });

    if (!asanaAccount) {
      logger.error('SCRIPT', '❌ No Asana account found in the database');
      console.error('❌ Error: No Asana account found in the database');
      return;
    }

    logger.info('SCRIPT', '✅ Found Asana account in database', {
      accountId: asanaAccount.id,
      userId: asanaAccount.userId,
      providerAccountId: asanaAccount.providerAccountId,
      hasAccessToken: !!asanaAccount.access_token,
      hasRefreshToken: !!asanaAccount.refresh_token,
      expiresAt: asanaAccount.expires_at,
      tokenType: asanaAccount.token_type,
    });

    // Get a fresh token using TokenManager
    logger.info('SCRIPT', '🔄 Getting fresh token using TokenManager');
    const tokenData = await tokenManager.getToken(asanaAccount.userId, 'asana');
    logger.info('SCRIPT', '✅ Successfully retrieved token', {
      hasAccessToken: !!tokenData.access_token,
      accessTokenLength: tokenData.access_token?.length || 0,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresAt: tokenData.expires_at,
      tokenType: tokenData.token_type,
    });

    // Create an Asana MCP client
    const client = new AsanaMcpClient(tokenData.access_token);
    logger.info('SCRIPT', '✅ Created AsanaMcpClient instance');

    // Attempt to connect to the Asana MCP server
    try {
      logger.info('SCRIPT', '🔄 Attempting to connect to Asana MCP server...');
      await client.connect();
      logger.info('SCRIPT', '✅ Successfully connected to Asana MCP server');
    } catch (error) {
      logger.error('SCRIPT', '❌ Failed to connect to Asana MCP server', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(
        `❌ Connection Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    // Attempt to send a command to the Asana MCP server
    try {
      const commandText = 'List all my tasks and projects';
      logger.info('SCRIPT', '🔄 Sending command to Asana MCP server', {
        command: commandText,
      });
      const response = await client.sendCommand(commandText);

      logger.info(
        'SCRIPT',
        '✅ Successfully received response from Asana MCP server',
        { response },
      );
      console.log('\n✅ Success! Asana MCP server responded:');
      console.log(JSON.stringify(response, null, 2));
    } catch (error) {
      logger.error('SCRIPT', '❌ Error sending command to Asana MCP server', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(
        `❌ Command Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      // Always disconnect when done
      logger.info('SCRIPT', '🔄 Disconnecting from Asana MCP server');
      client.disconnect();
    }

    logger.info('SCRIPT', '✅ Test completed successfully');
    console.log('\n✅ Test completed successfully');
  } catch (error) {
    logger.error('SCRIPT', '❌ Test failed with error', {
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(
      `\n❌ Test failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    // No need to explicitly end the DB connection when using drizzle with pg
    console.log('\n👋 Test script completed');
    process.exit(0);
  }
}

// Run the test
testRealAsanaMcpConnection().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
