/**
 * Simple test script for directly testing the n8n webhook
 * Run with: NODE_OPTIONS='--require dotenv/config' node scripts/test-direct-n8n.js
 */

// Load dotenv to get environment variables
import 'dotenv/config';
import directN8nFetch from './direct-n8n-fetch.js';

async function testN8nFetch() {
  try {
    console.log('Testing direct n8n fetch...');

    const query =
      'List all Google Calendar events scheduled for Tuesday, May 6, 2025.';
    console.log(`Query: ${query}`);

    const result = await directN8nFetch(query);
    console.log('Result:', JSON.stringify(result, null, 2));

    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testN8nFetch();
