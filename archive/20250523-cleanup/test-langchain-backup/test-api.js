// Test script to connect to the actual API endpoint
// Run with: node test-api.js
// This tests the full API integration

async function testApi() {
  console.log('Testing API endpoint...');

  const apiUrl = 'http://localhost:3000/api/brain';
  const payload = {
    messages: [
      {
        role: 'user',
        content:
          'what google calendar events do I have scheduled for tuesday of this week?',
        id: 'msg-test-' + Date.now(),
      },
    ],
    id: 'test-api-' + Date.now(),
    activeBitContextId: 'global-orchestrator',
  };

  console.log('Request payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    // The API response will be a stream, so we need to read it
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';

    console.log('\nReading stream response...');
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value);
      result += chunk;
      console.log('Received chunk:', chunk);
    }

    console.log('\nFull response:');
    console.log(result);

    // Check if the response mentions calendar events
    if (result.includes('calendar') || result.includes('events')) {
      console.log('\nFound calendar-related content in the response.');
    } else {
      console.log('\nNo calendar-related content found in the response.');
    }

    console.log('\nTest completed!');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testApi();
