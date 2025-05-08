const {
  getSpecialistPromptById,
  specialistRegistry,
} = require('./lib/ai/prompts/specialists');

/**
 * Test script to verify the Echo Tango Specialist prompt functionality
 *
 * This script tests the getSpecialistPromptById function with various inputs
 * to ensure it correctly returns the appropriate specialist prompts.
 */

console.log('== Testing Specialist Prompt Functionality ==');

// Test with non-existent specialist ID
console.log('\nTest 1: Non-existent specialist ID');
const nullResult = getSpecialistPromptById('non-existent-id');
console.log(
  `Result: ${nullResult === '' ? 'empty string (expected)' : 'NOT EMPTY (unexpected)'}`,
);

// Test with Echo Tango specialist ID
console.log('\nTest 2: echo-tango-specialist ID');
const echoTangoResult = getSpecialistPromptById('echo-tango-specialist');
console.log(
  `Result: ${echoTangoResult ? `Found prompt of length ${echoTangoResult.length}` : 'empty string (unexpected)'}`,
);

// Test specialist registry access
console.log('\nTest 3: Checking specialistRegistry');
const specialist = specialistRegistry['echo-tango-specialist'];
console.log(
  `Result: ${specialist ? `Found config for ${specialist.name}` : 'null (unexpected)'}`,
);

console.log('\n== API Request Simulation ==');
console.log(
  'When the user selects "Echo Tango Bit" in the Chat Bit interface:',
);
console.log('1. contextId is set to "echo-tango-specialist"');
console.log(
  '2. API uses contextId to retrieve the specialist prompt and tools',
);
const simulationResult = getSpecialistPromptById('echo-tango-specialist');
console.log(`\n${simulationResult?.substring(0, 150)}...\n`);

console.log('== Test Complete ==');
