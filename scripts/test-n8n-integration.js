/**
 * Advanced test script for the N8N MCP Gateway Tool integration
 * Tests the tool with different input formats and verifies if LangChain integration works properly
 *
 * Run with: NODE_OPTIONS='--require dotenv/config' node scripts/test-n8n-integration.js
 */

import 'dotenv/config';
import { n8nMcpGatewayTool } from '../lib/ai/tools/n8nMcpGatewayTool.js';

/**
 * Test the n8n MCP Gateway tool with different input formats
 */
async function testN8nIntegration() {
  console.log('=================================================');
  console.log('N8N MCP GATEWAY TOOL INTEGRATION TEST');
  console.log('=================================================');
  console.log('This script tests the tool with different input formats.');
  console.log('');

  // Test queries
  const queries = [
    'What calendar events do I have tomorrow?',
    'Show me my calendar for next week',
    'List all events next Tuesday',
  ];

  // Input formats to test
  const formats = [
    { name: 'String input', formatter: (q) => q },
    {
      name: 'Task description object',
      formatter: (q) => ({ task_description: q }),
    },
    { name: 'Input property object', formatter: (q) => ({ input: q }) },
    {
      name: 'OpenAI tools format',
      formatter: (q) => ({
        arguments: JSON.stringify({ task_description: q }),
      }),
    },
  ];

  // Run tests with each format and query
  for (const format of formats) {
    console.log(`\n\n-------------------------------------------------`);
    console.log(`Testing with format: ${format.name}`);
    console.log(`-------------------------------------------------`);

    for (const query of queries) {
      console.log(`\nQuery: "${query}"`);

      // Format the input based on the current format
      const formattedInput = format.formatter(query);
      console.log(`Input format: ${JSON.stringify(formattedInput)}`);

      try {
        console.log('Calling n8nMcpGatewayTool...');
        console.time('Request duration');

        // Call the tool
        const result = await n8nMcpGatewayTool.call(formattedInput);

        console.timeEnd('Request duration');
        console.log(`\nResult (truncated):`);
        console.log(
          result.substring(0, 500) + (result.length > 500 ? '...' : ''),
        );
        console.log('\nTest completed successfully.');
      } catch (error) {
        console.timeEnd('Request duration');
        console.error(`\nError testing ${format.name} with query "${query}":`);
        console.error(error);
      }

      // Wait briefly between tests
      console.log('Waiting 2 seconds before next test...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log('\n=================================================');
  console.log('ALL TESTS COMPLETED');
  console.log('=================================================');
}

// Run the test
testN8nIntegration().catch((error) => {
  console.error('Fatal error in test script:', error);
});
