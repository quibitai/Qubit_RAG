/**
 * Test script for GET_PROJECT_DETAILS functionality
 */

const { AsanaTool } = require('./lib/ai/tools/asana/asanaTool');

async function testProjectDetails() {
  console.log('Testing GET_PROJECT_DETAILS functionality...');

  const asanaTool = new AsanaTool();

  // Test cases for project details requests
  const testCases = [
    'show me the details of the Twitch project on Asana',
    "Show details of any project with the name 'Twitch' in Asana",
    "Show me details for the project named 'Twitch'",
    'get project details for Echo Tango',
    'display information about the Marketing project',
  ];

  for (const testCase of testCases) {
    console.log(`\n--- Testing: "${testCase}" ---`);
    try {
      const result = await asanaTool._call(testCase);
      console.log('Result:', result);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

// Run the test
testProjectDetails().catch(console.error);
