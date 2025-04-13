// Simple script to test n8n webhook connection
require('dotenv').config({ path: '.env.local' });

const n8nWebhookUrl = process.env.N8N_RAG_TOOL_WEBHOOK_URL;
const n8nAuthHeader = process.env.N8N_RAG_TOOL_AUTH_HEADER;
const n8nAuthToken = process.env.N8N_RAG_TOOL_AUTH_TOKEN;

console.log(`Testing n8n webhook connection to: ${n8nWebhookUrl}`);

async function testWebhook() {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    // Add the dynamic authentication header
    headers[n8nAuthHeader] = n8nAuthToken;

    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ query: "Test query for n8n webhook" }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`n8n webhook call failed with status ${response.status}: ${errorBody}`);
      return;
    }

    const data = await response.json();
    console.log('Success! Response from n8n webhook:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error testing webhook:', error);
  }
}

testWebhook(); 