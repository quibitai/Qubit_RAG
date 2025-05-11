/**
 * Debug script to test the n8nMcpGatewayTool directly
 */

// Import the tool
const { n8nMcpGatewayTool } = require('./lib/ai/tools/n8nMcpGatewayTool');

// Mock different argument formats
const testCases = [
  {
    name: 'OpenAI tool format',
    args: {
      arguments: JSON.stringify({
        task_description:
          'List all Google Calendar events scheduled for Tuesday, May 6, 2025.',
      }),
    },
  },
  {
    name: 'Direct task_description',
    args: {
      task_description:
        'List all Google Calendar events scheduled for Tuesday, May 6, 2025.',
    },
  },
  {
    name: 'Input parameter',
    args: {
      input:
        'List all Google Calendar events scheduled for Tuesday, May 6, 2025.',
    },
  },
  {
    name: 'String input directly',
    args: 'List all Google Calendar events scheduled for Tuesday, May 6, 2025.',
  },
];

// Run the tests sequentially
async function runTests() {
  console.log('Starting n8nMcpGatewayTool debug tests...\n');

  for (const test of testCases) {
    console.log(`\n------ TEST CASE: ${test.name} ------`);
    console.log('Input:', JSON.stringify(test.args, null, 2));

    try {
      console.log('Calling tool...');
      const result = await n8nMcpGatewayTool.invoke(test.args);
      console.log('Result:', result);
    } catch (error) {
      console.error('Error in tool call:', error);
    }

    console.log('-'.repeat(40));
  }
}

// Run the tests
runTests()
  .then(() => {
    console.log('\nAll tests completed.');
  })
  .catch((err) => {
    console.error('Test runner error:', err);
  });
