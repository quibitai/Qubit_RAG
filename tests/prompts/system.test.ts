import { loadPrompt } from '@/lib/ai/prompts/loader';
import {
  getSpecialistPromptById,
  specialistRegistry,
} from '@/lib/ai/prompts/specialists';
import { getOrchestratorPrompt } from '@/lib/ai/prompts/core/orchestrator';
import { getToolPromptInstructions } from '@/lib/ai/prompts/tools';
import { defaultAssistantPrompt } from '@/lib/ai/prompts/core/base'; // Import default prompt
import { test, expect } from '@playwright/test';

// Mock clientConfig if needed for tests
const mockClientConfig = null; // Or provide a mock config object

test.describe('Prompt System Refactoring Tests', () => {
  // Test Orchestrator Prompt Loading & Content
  test('loadPrompt should return Orchestrator prompt for orchestrator model', async () => {
    const prompt = loadPrompt({
      modelId: 'global-orchestrator',
      contextId: null,
      clientConfig: mockClientConfig,
    });
    expect(prompt).toContain('# Role: Quibit Orchestrator');
    expect(prompt).toContain('IDENTITY PRESERVATION - CRITICAL');
    // Ensure it DOES NOT contain specialist content accidentally
    expect(prompt).not.toContain("Echo Tango's AI Brand Voice");
  });

  test('getOrchestratorPrompt should return the correct prompt', async () => {
    const prompt = getOrchestratorPrompt();
    expect(prompt).toEqual(
      expect.stringContaining('# Role: Quibit Orchestrator'),
    );
  });

  // Test Specialist Prompt Loading & Content
  test('loadPrompt should return Echo Tango prompt for specialist context', async () => {
    const prompt = loadPrompt({
      modelId: 'gpt-4.1-mini',
      contextId: 'echo-tango-specialist',
      clientConfig: mockClientConfig,
    });
    expect(prompt).toContain('# ROLE: Echo Tango Specialist');
    expect(prompt).toContain("Echo Tango's AI Brand Voice");
    expect(prompt).toContain('Tool Usage Notes'); // Check if tool instructions are composed
    // Ensure it DOES NOT contain Orchestrator identity preservation content
    expect(prompt).not.toContain('IDENTITY PRESERVATION - CRITICAL');
  });

  test('getSpecialistPromptById should return correct persona string', async () => {
    const persona = getSpecialistPromptById('echo-tango-specialist');
    expect(persona).toEqual(
      expect.stringContaining('# ROLE: Echo Tango Specialist'),
    );
    expect(persona).not.toEqual('');
  });

  test('getSpecialistPromptById should return empty string for unknown ID', async () => {
    const persona = getSpecialistPromptById('unknown-specialist');
    expect(persona).toEqual('');
  });

  // Test Default/Fallback Prompt Loading
  test('loadPrompt should return Default Assistant prompt for non-orchestrator, unknown context', async () => {
    const prompt = loadPrompt({
      modelId: 'gpt-4.1-mini',
      contextId: null,
      clientConfig: mockClientConfig,
    });
    expect(prompt).toContain('# Role: General Assistant');
    expect(prompt).not.toContain("Echo Tango's AI Brand Voice");
    expect(prompt).not.toContain('IDENTITY PRESERVATION - CRITICAL');
  });

  test('defaultAssistantPrompt should be a valid prompt string', async () => {
    expect(defaultAssistantPrompt).toEqual(
      expect.stringContaining('# Role: General Assistant'),
    );
  });

  // Test Tool Instruction Retrieval
  test('getToolPromptInstructions should return relevant instructions', async () => {
    const echoTangoTools =
      specialistRegistry['echo-tango-specialist']?.defaultTools || [];
    const instructions = getToolPromptInstructions(echoTangoTools);
    expect(instructions).toContain('When using internal knowledge tools'); // From knowledge.ts
    expect(instructions).toContain('When using `tavilySearch`'); // From web-search.ts
    expect(instructions).toContain('When using document tools'); // From documents.ts
    // Add checks for other relevant tool instructions based on echoTangoConfig.defaultTools
  });

  test('getToolPromptInstructions should handle empty or unknown tools', async () => {
    const instructionsEmpty = getToolPromptInstructions([]);
    expect(instructionsEmpty).toEqual('');
    const instructionsUnknown = getToolPromptInstructions(['unknown-tool']);
    expect(instructionsUnknown).toEqual('');
  });

  // Add more tests as needed, e.g., testing clientConfig overrides if implemented
});
