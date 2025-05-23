/**
 * Manual test script for the refactored prompt system
 *
 * This script tests the loadPrompt function and other prompt-related utilities
 * to ensure they function correctly with different inputs.
 *
 * Run with: tsx scripts/test-prompt-system.ts
 */

// Use path module to handle relative paths correctly
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory name of the current module (for ESM compatibility)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the prompt system components using direct relative paths
import {
  getSpecialistPromptById,
  specialistRegistry,
} from '../lib/ai/prompts/specialists/index.js';
import { getOrchestratorPrompt } from '../lib/ai/prompts/core/orchestrator.js';
import { defaultAssistantPrompt } from '../lib/ai/prompts/core/base.js';
import { loadPrompt } from '../lib/ai/prompts/loader.js';
import { getToolPromptInstructions } from '../lib/ai/prompts/tools/index.js';

console.log('=== Prompt System Manual Test ===\n');

// Test presence of specialist registry
console.log('1. Testing Specialist Registry:');
if (specialistRegistry) {
  const specialists = Object.keys(specialistRegistry);
  console.log(
    `- Found ${specialists.length} registered specialists: ${specialists.join(', ')}`,
  );
} else {
  console.log('- ERROR: specialistRegistry is undefined');
}

// Test Specialist Prompt retrieval
console.log('\n2. Testing getSpecialistPromptById:');
try {
  const echoTangoPrompt = getSpecialistPromptById('echo-tango-specialist');
  if (echoTangoPrompt) {
    console.log(
      `- Successfully retrieved Echo Tango prompt (${echoTangoPrompt.length} chars)`,
    );
    console.log(`- First 100 chars: ${echoTangoPrompt.substring(0, 100)}...`);
  } else {
    console.log('- ERROR: Echo Tango prompt is empty or undefined');
  }
} catch (error) {
  console.error('- ERROR accessing getSpecialistPromptById:', error);
}

// Test Orchestrator Prompt retrieval
console.log('\n3. Testing getOrchestratorPrompt:');
try {
  const orchestratorPrompt = getOrchestratorPrompt();
  if (orchestratorPrompt) {
    console.log(
      `- Successfully retrieved Orchestrator prompt (${orchestratorPrompt.length} chars)`,
    );
    console.log(
      `- First 100 chars: ${orchestratorPrompt.substring(0, 100)}...`,
    );
  } else {
    console.log('- ERROR: Orchestrator prompt is empty or undefined');
  }
} catch (error) {
  console.error('- ERROR accessing getOrchestratorPrompt:', error);
}

// Test Default Assistant Prompt
console.log('\n4. Testing defaultAssistantPrompt:');
try {
  if (defaultAssistantPrompt) {
    console.log(
      `- Default Assistant prompt exists (${defaultAssistantPrompt.length} chars)`,
    );
    console.log(
      `- First 100 chars: ${defaultAssistantPrompt.substring(0, 100)}...`,
    );
  } else {
    console.log('- ERROR: Default Assistant prompt is empty or undefined');
  }
} catch (error) {
  console.error('- ERROR accessing defaultAssistantPrompt:', error);
}

// Test loadPrompt function
console.log('\n5. Testing loadPrompt function:');
try {
  // Test with orchestrator model
  const orchestratorResult = loadPrompt({
    modelId: 'global-orchestrator',
    contextId: null,
    clientConfig: null,
  });
  console.log(
    `- Orchestrator model: ${orchestratorResult ? 'SUCCESS' : 'FAILURE'}`,
  );

  // Test with specialist context
  const specialistResult = loadPrompt({
    modelId: 'gpt-4-o',
    contextId: 'echo-tango-specialist',
    clientConfig: null,
  });
  console.log(
    `- Specialist context: ${specialistResult ? 'SUCCESS' : 'FAILURE'}`,
  );

  // Test with default/fallback case
  const defaultResult = loadPrompt({
    modelId: 'gpt-4-o',
    contextId: null,
    clientConfig: null,
  });
  console.log(`- Default case: ${defaultResult ? 'SUCCESS' : 'FAILURE'}`);
} catch (error) {
  console.error('- ERROR testing loadPrompt:', error);
}

// Test getToolPromptInstructions
console.log('\n6. Testing getToolPromptInstructions:');
try {
  if (specialistRegistry && specialistRegistry['echo-tango-specialist']) {
    const tools =
      specialistRegistry['echo-tango-specialist']?.defaultTools || [];
    console.log(`- Echo Tango has ${tools.length} tools: ${tools.join(', ')}`);

    const toolInstructions = getToolPromptInstructions(tools);
    console.log(
      `- Tool instructions: ${toolInstructions ? 'SUCCESS' : 'FAILURE'}`,
    );
    if (toolInstructions) {
      console.log(`- Instructions length: ${toolInstructions.length} chars`);
    }
  } else {
    console.log('- ERROR: Could not access Echo Tango tools');
  }
} catch (error) {
  console.error('- ERROR testing getToolPromptInstructions:', error);
}

console.log('\n=== Test Complete ===');
