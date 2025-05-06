import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { clients } from './lib/db/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get the database URL from environment variables
const POSTGRES_URL = process.env.POSTGRES_URL || '';
if (!POSTGRES_URL) {
  console.error('POSTGRES_URL environment variable is not set');
  process.exit(1);
}

// Create a Postgres client
const client = postgres(POSTGRES_URL);
const db = drizzle(client);

async function testConfigJson() {
  console.log('Testing config_json column in Clients table...');

  try {
    // Test reading from the table
    console.log('Reading from Clients table...');
    const result = await db.select().from(clients).limit(1);

    if (result.length > 0) {
      console.log('Sample client record:');
      console.log(JSON.stringify(result[0], null, 2));

      // Check if config_json column exists
      if ('config_json' in result[0]) {
        console.log('✅ config_json column EXISTS in the database');
        console.log('Current value:', result[0].config_json);
      } else {
        console.log('❌ config_json column DOES NOT EXIST in the database');
      }
    } else {
      console.log('No clients found in the database');
    }

    // Test updating the config_json column
    const clientId = result[0]?.id;
    if (clientId) {
      console.log(`\nUpdating config_json for client ${clientId}...`);

      const testConfig = {
        specialistPrompts: {
          'chat-model':
            'This is a test specialist prompt for chat-model from config_json',
          'document-editor':
            'This is a test specialist prompt for document-editor from config_json',
        },
        enabledBits: ['chat-model', 'document-editor', 'web-research'],
      };

      await db
        .update(clients)
        .set({ config_json: testConfig })
        .where(eq(clients.id, clientId));

      console.log('✅ Updated config_json successfully');

      // Verify the update
      const updatedClient = await db
        .select()
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);

      console.log('Updated client record:');
      console.log(JSON.stringify(updatedClient[0], null, 2));
    }
  } catch (error) {
    console.error('Error testing config_json:', error);
  } finally {
    // Close the database connection
    await client.end();
  }
}

// Run the test
testConfigJson();
