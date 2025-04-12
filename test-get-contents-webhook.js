// Script to test the Get Contents n8n webhook
require('dotenv').config({ path: '.env.local' });

const webhookUrl = process.env.N8N_GET_CONTENTS_TOOL_WEBHOOK_URL;
const authHeader = process.env.N8N_GET_CONTENTS_TOOL_AUTH_HEADER;
const authToken = process.env.N8N_GET_CONTENTS_TOOL_AUTH_TOKEN;

console.log(`Testing Get Contents webhook: ${webhookUrl}`);
console.log(`Auth header: ${authHeader}=${authToken}`);

async function testWebhook() {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    // Add the dynamic authentication header
    headers[authHeader] = authToken;

    console.log('Request headers:', headers);
    console.log('Request body:', JSON.stringify({ 
      documentId: "1h7YR_RZ3juvdDYd2qegchNFStc_yn89I" // Producer Checklist.txt
    }));

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ 
        documentId: "1h7YR_RZ3juvdDYd2qegchNFStc_yn89I" // Producer Checklist.txt
      }),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const rawText = await response.text();
    console.log('Raw response body:', rawText);
    
    if (rawText.trim() === '') {
      console.log('Empty response received. The n8n workflow may not be active or properly configured.');
      return;
    }
    
    try {
      const data = JSON.parse(rawText);
      console.log('Success! Response from Get Contents webhook:');
      console.log(JSON.stringify(data, null, 2).substring(0, 500) + '...');
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError);
      console.log('Received non-JSON response');
    }
  } catch (error) {
    console.error('Error testing webhook:', error);
  }
}

testWebhook(); 