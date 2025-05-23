// Simple test script to call the n8n webhook directly
// Run with: node test-n8n.js
// This simulates what the LangChain tool should be doing

const webhookUrl =
  'https://quibit.app.n8n.cloud/webhook/6551a320-8df7-4f1a-bfe4-c3927981ef8f';
const authHeader = 'mcp';
const authToken = 'V7vwKwT92MBq4';

async function testN8nWebhook() {
  console.log('Testing direct call to n8n webhook...');

  const query =
    'List all Google Calendar events scheduled for Tuesday, May 6, 2025.';
  console.log(`Query: ${query}`);

  try {
    // Make the request to n8n webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [authHeader]: authToken,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));

    // Check for events
    if (data.events && Array.isArray(data.events) && data.events.length > 0) {
      console.log(`\nFound ${data.events.length} calendar events:`);
      data.events.forEach((event, index) => {
        console.log(
          `${index + 1}. ${event.summary} - ${event.startDateTime} to ${event.endDateTime}`,
        );
      });
    }

    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testN8nWebhook();
