// Script to test the List Documents n8n webhook
require('dotenv').config({ path: '.env.local' });

const webhookUrl = process.env.N8N_LIST_DOCS_TOOL_WEBHOOK_URL;
const authHeader = process.env.N8N_LIST_DOCS_TOOL_AUTH_HEADER;
const authToken = process.env.N8N_LIST_DOCS_TOOL_AUTH_TOKEN;

console.log(`Testing List Documents webhook: ${webhookUrl}`);

async function testWebhook() {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    // Add the dynamic authentication header
    headers[authHeader] = authToken;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ 
        // You can customize the request body as needed
        filter: "marketing" // Example filter to look for marketing documents
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Webhook call failed with status ${response.status}: ${errorBody}`);
      return;
    }

    const data = await response.json();
    console.log('Success! Response from List Documents webhook:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error testing webhook:', error);
  }
}

testWebhook(); 