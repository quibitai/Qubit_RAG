/**
 * Simple test script for directly testing the n8n webhook
 * Run with: node scripts/test-direct-n8n-common.js
 */

// Use CommonJS syntax
require('dotenv').config({ path: '../.env.local' });

// Make a direct fetch to n8n
async function directFetch() {
  console.log('Making direct fetch to n8n webhook...');

  const query =
    'List all Google Calendar events scheduled for Tuesday, May 6, 2025.';
  console.log(`Query: ${query}`);

  const webhookUrl = process.env.N8N_MCP_WEBHOOK_URL;
  const authToken = process.env.N8N_MCP_AUTH_TOKEN;
  const authHeaderName = process.env.N8N_MCP_AUTH_HEADER;

  // Log environment variables (censored)
  console.log(
    `Using webhook URL: ${webhookUrl ? webhookUrl.substring(0, 20) + '...' : 'undefined'}`,
  );
  console.log(`Using auth header: ${authHeaderName || 'undefined'}`);
  console.log(`Auth token present: ${authToken ? 'yes' : 'no'}`);

  if (!webhookUrl || !authToken || !authHeaderName) {
    throw new Error('Missing required environment variables for n8n webhook');
  }

  try {
    // Use node-fetch for Node.js environments
    const fetch = require('node-fetch');

    // Send request to n8n webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [authHeaderName]: authToken,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(
        `N8N webhook returned status ${response.status}: ${response.statusText}`,
      );
    }

    const result = await response.json();
    console.log('Result:', JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('Error fetching from n8n:', error);
    throw error;
  }
}

// Run the test
async function runTest() {
  try {
    console.log('Testing direct n8n fetch...');
    await directFetch();
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTest();
