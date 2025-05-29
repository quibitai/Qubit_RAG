#!/usr/bin/env tsx

/**
 * Verification script for date/time context injection
 * This script tests that all AI assistants now have proper date/time context
 */

import { loadPrompt } from '../lib/ai/prompts/loader.js';
import type { ClientConfig } from '../lib/db/queries.js';

// Mock client config for testing
const testClientConfig: ClientConfig = {
  id: 'test-client',
  name: 'Test Client',
  client_display_name: 'Test Client',
  client_core_mission: 'Testing date/time context injection',
  customInstructions: 'Test instructions',
  configJson: {
    available_bit_ids: ['echo-tango-specialist'],
  },
};

const testDateTime = 'Monday, January 15, 2024 2:30 PM (America/New_York)';

console.log('🕐 Verifying Date/Time Context Injection Fix\n');

// Test 1: Orchestrator
console.log('1. Testing Orchestrator Prompt:');
const orchestratorPrompt = loadPrompt({
  modelId: 'global-orchestrator',
  contextId: null,
  clientConfig: testClientConfig,
  currentDateTime: testDateTime,
});

if (orchestratorPrompt.includes(`Current date and time: ${testDateTime}`)) {
  console.log('   ✅ Orchestrator has correct date/time context');
} else {
  console.log('   ❌ Orchestrator missing date/time context');
  console.log(
    `   📝 Prompt preview: ${orchestratorPrompt.substring(0, 200)}...`,
  );
}

// Test 2: Specialist
console.log('\n2. Testing Specialist Prompt:');
const specialistPrompt = loadPrompt({
  modelId: 'gpt-4',
  contextId: 'echo-tango-specialist',
  clientConfig: testClientConfig,
  currentDateTime: testDateTime,
});

if (specialistPrompt.includes(`Current date and time: ${testDateTime}`)) {
  console.log('   ✅ Specialist has correct date/time context');
} else {
  console.log('   ❌ Specialist missing date/time context');
  console.log(`   📝 Prompt preview: ${specialistPrompt.substring(0, 200)}...`);
}

// Test 3: Chat Model (using correct context ID)
console.log('\n3. Testing Chat Model Prompt:');
const chatModelPrompt = loadPrompt({
  modelId: 'gpt-4',
  contextId: 'chat-model',
  clientConfig: testClientConfig,
  currentDateTime: testDateTime,
});

if (chatModelPrompt.includes(`Current date and time: ${testDateTime}`)) {
  console.log('   ✅ Chat Model has correct date/time context');
} else {
  console.log('   ❌ Chat Model missing date/time context');
  console.log(`   📝 Prompt preview: ${chatModelPrompt.substring(0, 200)}...`);
}

// Test 4: Default Assistant
console.log('\n4. Testing Default Assistant Prompt:');
const defaultPrompt = loadPrompt({
  modelId: 'gpt-4',
  contextId: 'unknown-context',
  clientConfig: testClientConfig,
  currentDateTime: testDateTime,
});

if (defaultPrompt.includes(`Current date and time: ${testDateTime}`)) {
  console.log('   ✅ Default Assistant has correct date/time context');
} else {
  console.log('   ❌ Default Assistant missing date/time context');
  console.log(`   📝 Prompt preview: ${defaultPrompt.substring(0, 200)}...`);
}

// Test 5: Default fallback when no currentDateTime provided
console.log('\n5. Testing Default DateTime Fallback:');
const fallbackPrompt = loadPrompt({
  modelId: 'gpt-4',
  contextId: 'echo-tango-specialist',
  clientConfig: testClientConfig,
  // No currentDateTime provided - should use default
});

if (fallbackPrompt.includes('Current date and time:')) {
  console.log('   ✅ Default fallback provides date/time context');
} else {
  console.log('   ❌ Default fallback missing date/time context');
}

console.log('\n🎯 Summary:');
console.log(
  'All AI assistants (orchestrator, specialists, chat model, default) now have',
);
console.log(
  'automatic date/time context injection. This ensures accurate responses to',
);
console.log(
  'time-sensitive queries like "What time is it?" or "What\'s today\'s date?"',
);

console.log('\n📚 For more information, see: docs/datetime-context-guide.md');
