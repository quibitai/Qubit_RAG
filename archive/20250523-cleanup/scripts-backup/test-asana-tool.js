/**
 * Test script for the Asana tool integration
 * Run with: NODE_OPTIONS='--require dotenv/config' node scripts/test-asana-tool.js
 */

import 'dotenv/config';
import { asanaTool } from '../lib/ai/tools/asanaTool.js';

/**
 * Test the Asana tool with different input formats
 */
async function testAsanaIntegration() {
  console.log('=================================================');
  console.log('ASANA TOOL INTEGRATION TEST');
  console.log('=================================================');
  console.log('This script tests the tool with different input formats.');
  console.log('');

  // Test queries for Asana
  const queries = [
    'List all my incomplete tasks in Asana',
    'Show my most recent tasks in Asana',
    'List all tasks due this week in Asana',
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

  // Override environment variables to ensure correct webhook is used
  process.env.ASANA_WEBHOOK_URL = 'https://quibit.app.n8n.cloud/webhook/asana';
  console.log(`Using webhook URL: ${process.env.ASANA_WEBHOOK_URL}`);

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
        console.log('Calling asanaTool...');
        console.time('Request duration');

        // Call the tool
        const result = await asanaTool.call(formattedInput);

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
testAsanaIntegration().catch((error) => {
  console.error('Fatal error in test script:', error);
});
