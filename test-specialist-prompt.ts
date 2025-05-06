import { getSpecialistPrompt } from './lib/ai/prompts';

/**
 * Test script to verify the Echo Tango Specialist prompt functionality
 *
 * This script tests the getSpecialistPrompt function with various inputs
 * to ensure it correctly returns the appropriate specialist prompts.
 */

console.log('== Testing Specialist Prompt Functionality ==');

// Test with null activeBitContextId
console.log('\nTest 1: Null activeBitContextId');
const nullResult = getSpecialistPrompt(null);
console.log(
  `Result: ${nullResult === null ? 'null (expected)' : 'NOT NULL (unexpected)'}`,
);

// Test with 'chat-model' activeBitContextId
console.log('\nTest 2: chat-model activeBitContextId');
const chatModelResult = getSpecialistPrompt('chat-model');
console.log(
  `Result: ${chatModelResult ? 'Found prompt of length ' + chatModelResult.length : 'null (unexpected)'}`,
);

// Test with 'echo-tango-specialist' activeBitContextId
console.log('\nTest 3: echo-tango-specialist activeBitContextId');
const echoTangoResult = getSpecialistPrompt('echo-tango-specialist');
console.log(
  `Result: ${echoTangoResult ? 'Found prompt of length ' + echoTangoResult.length : 'null (unexpected)'}`,
);

// Test with unknown activeBitContextId
console.log('\nTest 4: unknown-bit-id activeBitContextId');
const unknownResult = getSpecialistPrompt('unknown-bit-id');
console.log(
  `Result: ${unknownResult === null ? 'null (expected)' : 'NOT NULL (unexpected)'}`,
);

console.log('\n== API Request Simulation ==');
console.log(
  'When the user selects "Echo Tango Bit" in the Chat Bit interface:',
);
console.log('1. activeBitContextId is set to "chat-model"');
console.log('2. activeBitPersona is set to "echo-tango-specialist"');
console.log('3. API request includes both fields in the body');
console.log(
  '4. Brain API uses activeBitPersona || activeBitContextId to look up specialist prompt',
);
console.log(
  '5. When using Echo Tango Bit with persona selected, the specialist prompt should be:',
);
const simulationResult = getSpecialistPrompt('echo-tango-specialist');
console.log(`\n${simulationResult?.substring(0, 150)}...\n`);

console.log('== Test Complete ==');
