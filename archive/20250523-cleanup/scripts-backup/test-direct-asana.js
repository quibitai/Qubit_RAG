/**
 * Simple test script for directly testing the Asana webhook
 * Run with: NODE_OPTIONS='--require dotenv/config' node scripts/test-direct-asana.js
 */

// Load dotenv to get environment variables
import 'dotenv/config';
import directAsanaFetch from './direct-asana-fetch.js';

async function testAsanaFetch() {
  try {
    console.log('Testing direct Asana webhook fetch...');

    const query = 'List all my incomplete tasks in Asana';
    console.log(`Query: ${query}`);

    // Force the webhook URL to ensure we're using the right one
    process.env.ASANA_WEBHOOK_URL =
      'https://quibit.app.n8n.cloud/webhook/asana';
    console.log(`Using webhook URL: ${process.env.ASANA_WEBHOOK_URL}`);

    const result = await directAsanaFetch(query);
    console.log('Result:', JSON.stringify(result, null, 2));

    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testAsanaFetch();
