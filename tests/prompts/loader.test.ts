import { loadPrompt } from '@/lib/ai/prompts/loader';
import { getOrchestratorPrompt } from '@/lib/ai/prompts/core/orchestrator';
import { getSpecialistPromptById } from '@/lib/ai/prompts/specialists';
import { test, expect } from '@playwright/test';
import type { ClientConfig } from '@/lib/db/queries';

// Mock client configurations for testing
const mockEchoTangoConfig: ClientConfig = {
  id: 'echo-tango',
  name: 'Echo Tango',
  client_display_name: 'Echo Tango',
  client_core_mission:
    'To revolutionize AI assistants for enterprise communications',
  customInstructions:
    'Always prioritize clarity and precision in all communications.',
  configJson: {
    orchestrator_client_context:
      'Echo Tango operates in the enterprise communications sector with emphasis on timely and accurate responses.',
    available_bit_ids: [
      'echo-tango-specialist',
      'document-editor',
      'web-research',
    ],
    specialistPrompts: {
      'echo-tango-specialist':
        'Custom Echo Tango specialist prompt with {client_display_name} and {client_core_mission_statement} placeholders.',
      'document-editor':
        'Custom document editor prompt for {client_display_name}.',
    },
    tool_configs: {
      n8n: {
        webhookUrl: 'https://n8n.echotango.co/webhook/ai-gateway',
        apiKey: 'et_test_api_key',
      },
    },
  },
};

const mockMinimalConfig: ClientConfig = {
  id: 'minimal-client',
  name: 'Minimal Client',
  client_display_name: 'Minimal Client',
  client_core_mission: 'Simple testing client',
  customInstructions: null,
  configJson: null,
};

test.describe('Prompt Loader Tests', () => {
  test('loadPrompt should correctly load orchestrator prompt with client params', async () => {
    const currentDateTime = '2023-05-01 12:00:00 (UTC)';

    const prompt = loadPrompt({
      modelId: 'global-orchestrator',
      contextId: null,
      clientConfig: mockEchoTangoConfig,
      currentDateTime,
    });

    // Since we can't easily mock and verify function calls in Playwright,
    // we'll verify the output contains expected client-specific content
    expect(prompt).toContain('Echo Tango');
    expect(prompt).toContain(
      'To revolutionize AI assistants for enterprise communications',
    );
    expect(prompt).toContain('enterprise communications sector');
    expect(prompt).toContain('echo-tango-specialist');
    expect(prompt).toContain('document-editor');
    expect(prompt).toContain('web-research');
    expect(prompt).toContain('Always prioritize clarity and precision');
  });

  test('loadPrompt should use client-specific specialist prompt override when available', async () => {
    const currentDateTime = '2023-05-01 12:00:00 (UTC)';

    const prompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'echo-tango-specialist',
      clientConfig: mockEchoTangoConfig,
      currentDateTime,
    });

    // The client-specific override should be used and placeholders replaced
    expect(prompt).toContain(
      'Custom Echo Tango specialist prompt with Echo Tango',
    );

    // Client mission statement should be injected
    const expectedMissionStatement = `\nAs a specialist for Echo Tango, be guided by their core mission: To revolutionize AI assistants for enterprise communications\n`;
    expect(prompt).toContain(expectedMissionStatement);

    // Custom instructions should be appended
    expect(prompt).toContain(
      '# Client-Specific Guidelines for Echo Tango (General)',
    );
    expect(prompt).toContain(
      'Always prioritize clarity and precision in all communications.',
    );
  });

  test('loadPrompt should fall back to default specialist prompt when no override exists', async () => {
    const currentDateTime = '2023-05-01 12:00:00 (UTC)';

    // We'll use the minimal client that has no specialist prompt overrides
    const prompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'echo-tango-specialist',
      clientConfig: mockMinimalConfig,
      currentDateTime,
    });

    // Should contain parts of the default Echo Tango prompt
    const defaultPrompt = getSpecialistPromptById('echo-tango-specialist');

    // Even with default prompt, client name should be injected
    expect(prompt).toContain('Minimal Client');

    // Mission statement should be formed and injected
    const expectedMissionStatement = `\nAs a specialist for Minimal Client, be guided by their core mission: Simple testing client\n`;
    expect(prompt).toContain(expectedMissionStatement);

    // But overall structure should match default since there's no override
    expect(prompt).toContain('ROLE: Echo Tango Specialist');
  });

  test('loadPrompt should inject client details into specialist prompt placeholders', async () => {
    const prompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'document-editor',
      clientConfig: mockEchoTangoConfig,
      currentDateTime: '2023-05-01',
    });

    // Client display name should be injected into the custom document editor prompt
    expect(prompt).toContain('Custom document editor prompt for Echo Tango');

    // Custom instructions should be appended
    expect(prompt).toContain(
      '# Client-Specific Guidelines for Echo Tango (General)',
    );
    expect(prompt).toContain(
      'Always prioritize clarity and precision in all communications.',
    );
  });

  test('loadPrompt should use default assistant prompt for unknown context', async () => {
    const prompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'unknown-context-id',
      clientConfig: mockEchoTangoConfig,
      currentDateTime: '2023-05-01',
    });

    // Should fall back to default assistant prompt
    expect(prompt).toContain('General Assistant');
  });

  // NEW TESTS: Date/Time Context Verification
  test('orchestrator prompt should include current date/time', async () => {
    const currentDateTime = 'Monday, May 1, 2023 12:00 PM (America/New_York)';

    const prompt = loadPrompt({
      modelId: 'global-orchestrator',
      contextId: null,
      clientConfig: mockEchoTangoConfig,
      currentDateTime,
    });

    // Verify the exact date/time string is included
    expect(prompt).toContain(
      'Current date and time: Monday, May 1, 2023 12:00 PM (America/New_York)',
    );
  });

  test('specialist prompts should include current date/time', async () => {
    const currentDateTime = 'Tuesday, May 2, 2023 3:45 PM (UTC)';

    const prompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'echo-tango-specialist',
      clientConfig: mockEchoTangoConfig,
      currentDateTime,
    });

    // Verify the date/time is appended to specialist prompts
    expect(prompt).toContain(
      'Current date and time: Tuesday, May 2, 2023 3:45 PM (UTC)',
    );
  });

  test('chat model prompt should include current date/time', async () => {
    const currentDateTime = 'Wednesday, May 3, 2023 9:30 AM (Europe/London)';

    const prompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'chat-bit',
      clientConfig: mockEchoTangoConfig,
      currentDateTime,
    });

    // Verify the date/time is included in chat model prompts
    expect(prompt).toContain(
      'Current date and time: Wednesday, May 3, 2023 9:30 AM (Europe/London)',
    );
  });

  test('default assistant prompt should include current date/time', async () => {
    const currentDateTime = 'Thursday, May 4, 2023 6:15 PM (Asia/Tokyo)';

    const prompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'unknown-context-id',
      clientConfig: mockEchoTangoConfig,
      currentDateTime,
    });

    // Verify the date/time is included even in fallback prompts
    expect(prompt).toContain(
      'Current date and time: Thursday, May 4, 2023 6:15 PM (Asia/Tokyo)',
    );
  });

  test('all prompt types should handle missing currentDateTime parameter', async () => {
    // Test orchestrator without currentDateTime
    const orchestratorPrompt = loadPrompt({
      modelId: 'global-orchestrator',
      contextId: null,
      clientConfig: mockEchoTangoConfig,
      // currentDateTime not provided - should use default
    });
    expect(orchestratorPrompt).toContain('Current date and time:');

    // Test specialist without currentDateTime
    const specialistPrompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'echo-tango-specialist',
      clientConfig: mockEchoTangoConfig,
      // currentDateTime not provided - should use default
    });
    expect(specialistPrompt).toContain('Current date and time:');
  });

  test('date/time should be properly formatted and positioned in prompts', async () => {
    const currentDateTime = 'Friday, May 5, 2023 11:59 PM (Pacific/Auckland)';

    const specialistPrompt = loadPrompt({
      modelId: 'gpt-4-o',
      contextId: 'echo-tango-specialist',
      clientConfig: mockEchoTangoConfig,
      currentDateTime,
    });

    // Verify the date/time appears at the end of the prompt (after tool instructions)
    const lines = specialistPrompt.split('\n');
    const dateTimeLine = lines.find((line) =>
      line.includes('Current date and time:'),
    );
    expect(dateTimeLine).toBeTruthy();
    expect(dateTimeLine).toBe(
      'Current date and time: Friday, May 5, 2023 11:59 PM (Pacific/Auckland)',
    );

    // Verify it's near the end of the prompt (after core content)
    const dateTimeIndex = lines.findIndex((line) =>
      line.includes('Current date and time:'),
    );
    expect(dateTimeIndex).toBeGreaterThan(lines.length - 10); // Should be in last 10 lines
  });
});
