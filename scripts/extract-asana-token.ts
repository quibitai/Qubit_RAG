import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../lib/db/schema';

// Load environment variables from .env.local if it exists
config({
  path: '.env.local',
});

/**
 * Quick script to extract an Asana access token from the database
 * to use in standalone tests
 */
async function extractAsanaToken() {
  try {
    // Check if we have a database URL
    const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('❌ Error: No database URL found in environment variables');
      console.error(
        'Please set POSTGRES_URL or DATABASE_URL in your .env.local file',
      );
      process.exit(1);
    }

    console.log('🔄 Connecting to database...');

    // Connect to the database
    const client = postgres(databaseUrl);
    const db = drizzle(client, { schema });

    console.log('✅ Connected to database');
    console.log('🔄 Querying for Asana accounts...');

    // Query for Asana accounts
    const asanaAccounts = await db.query.account.findMany({
      where: (account, { eq }) => eq(account.provider, 'asana'),
      orderBy: (account, { desc }) => [desc(account.expires_at)],
    });

    if (asanaAccounts.length === 0) {
      console.error('❌ No Asana accounts found in the database');
      process.exit(1);
    }

    console.log(`✅ Found ${asanaAccounts.length} Asana accounts`);

    // Select the most recent account
    const selectedAccount = asanaAccounts[0];
    console.log('📊 Selected account:');
    console.log(`  - ID: ${selectedAccount.id}`);
    console.log(`  - User ID: ${selectedAccount.userId}`);
    console.log(
      `  - Provider Account ID: ${selectedAccount.providerAccountId}`,
    );
    console.log(
      `  - Expires At: ${selectedAccount.expires_at ? new Date(Number(selectedAccount.expires_at)).toISOString() : 'N/A'}`,
    );
    console.log(`  - Token Type: ${selectedAccount.token_type}`);
    console.log(`  - Scope: ${selectedAccount.scope}`);

    // Extract the token
    const accessToken = selectedAccount.access_token;
    if (!accessToken) {
      console.error('❌ No access token found for this account');
      process.exit(1);
    }

    // Generate the environment variable export for different shells
    console.log('\n✅ Here is your Asana access token:');
    console.log('---------------------------------------');
    console.log(accessToken);
    console.log('---------------------------------------');

    console.log('\nYou can use this token in your standalone test as follows:');
    console.log('\n# For bash/zsh:');
    console.log(`export ASANA_ACCESS_TOKEN='${accessToken}'`);
    console.log('npx tsx scripts/test-asana-mcp-standalone.ts');

    console.log('\n# For Windows Command Prompt:');
    console.log(`set ASANA_ACCESS_TOKEN=${accessToken}`);
    console.log('npx tsx scripts\\test-asana-mcp-standalone.ts');

    console.log('\n# For PowerShell:');
    console.log(`$env:ASANA_ACCESS_TOKEN='${accessToken}'`);
    console.log('npx tsx scripts\\test-asana-mcp-standalone.ts');

    console.log('\n# Or directly in the test script:');
    console.log('In scripts/test-asana-mcp-standalone.ts, replace:');
    console.log(
      `const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN || 'paste_your_asana_access_token_here';`,
    );
    console.log('with:');
    console.log(
      `const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN || '${accessToken}';`,
    );
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Exit the process
    process.exit(0);
  }
}

// Run the extraction
extractAsanaToken().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
