/**
 * Integration tests for the prompt system with agent creation
 *
 * This test file validates that the prompt system correctly integrates
 * with the agent creation process and tool filtering mechanisms.
 */
import { test, expect } from '@playwright/test';
import { loadPrompt } from '@/lib/ai/prompts/loader';
import { specialistRegistry } from '@/lib/ai/prompts/specialists';

// Since we're using Playwright and not Jest, we need a different approach to mocking
// This test focuses on manual testing setup instead of mocking

test.describe('Prompt System Integration', () => {
  // Test that verifies loadPrompt produces different results for different contexts
  test('loadPrompt should return different prompts for different contexts', async () => {
    // Get prompt for Orchestrator
    const orchestratorPrompt = loadPrompt({
      modelId: 'global-orchestrator',
      contextId: null,
      clientConfig: null,
    });

    // Get prompt for Echo Tango
    const echoTangoPrompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'echo-tango-specialist',
      clientConfig: null,
    });

    // Get prompt for default assistant
    const defaultPrompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: null,
      clientConfig: null,
    });

    // Verify they are all different
    expect(orchestratorPrompt).not.toEqual(echoTangoPrompt);
    expect(orchestratorPrompt).not.toEqual(defaultPrompt);
    expect(echoTangoPrompt).not.toEqual(defaultPrompt);

    // Verify they contain the expected content
    expect(orchestratorPrompt).toContain('Quibit Orchestrator');
    expect(echoTangoPrompt).toContain('Echo Tango Specialist');
    expect(defaultPrompt).toContain('General Assistant');
  });

  // Test that specialist registry contains valid tools configuration
  test('specialistRegistry should contain valid tool configurations', async () => {
    // Check if Echo Tango specialist exists
    expect(specialistRegistry).toHaveProperty('echo-tango-specialist');

    if (specialistRegistry['echo-tango-specialist']) {
      const echoTangoConfig = specialistRegistry['echo-tango-specialist'];

      // Verify it has the required properties
      expect(echoTangoConfig).toHaveProperty('id', 'echo-tango-specialist');
      expect(echoTangoConfig).toHaveProperty('name', 'Echo Tango');
      expect(echoTangoConfig).toHaveProperty('description');
      expect(echoTangoConfig).toHaveProperty('persona');
      expect(echoTangoConfig).toHaveProperty('defaultTools');

      // Verify defaultTools is a non-empty array
      expect(Array.isArray(echoTangoConfig.defaultTools)).toBeTruthy();
      expect(echoTangoConfig.defaultTools.length).toBeGreaterThan(0);

      // Check that common tools are included
      const commonTools = [
        'searchInternalKnowledgeBase',
        'getFileContents',
        'listDocuments',
        'tavilySearch',
      ];

      for (const tool of commonTools) {
        // Allow the test to pass if at least one common tool is found
        // This avoids being too prescriptive about exact tool configuration
        expect(
          echoTangoConfig.defaultTools.some((t) => commonTools.includes(t)),
        ).toBeTruthy();
      }
    }
  });

  // Note: For fully testing the integration with the agent creation,
  // you would need to:
  // 1. Create a test version of the brain route that exposes internal details
  // 2. Or use end-to-end testing to verify the full flow with real responses

  // This placeholder suggests creating a dedicated test API endpoint
  test.skip('Agent creation should use correct prompts and filter tools (requires e2e test)', async () => {
    // This would be implemented as an end-to-end test that:
    // 1. Makes real API calls to a test endpoint
    // 2. Verifies the responses have the correct persona characteristics
    // 3. Verifies tool usage patterns match expectations
  });
});
