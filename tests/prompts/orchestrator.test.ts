import { getOrchestratorPrompt } from '@/lib/ai/prompts/core/orchestrator';
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
    tool_configs: {
      n8n: {
        webhookUrl: 'https://n8n.echotango.co/webhook/ai-gateway',
        apiKey: 'et_test_api_key',
      },
      tavily: {
        maxResults: 10,
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

test.describe('Orchestrator Prompt Generation Tests', () => {
  test('should correctly inject all client fields for fully configured client', async () => {
    const currentDateTime = '2023-05-01 12:00:00 (UTC)';

    const prompt = getOrchestratorPrompt(
      currentDateTime,
      mockEchoTangoConfig.client_display_name,
      mockEchoTangoConfig.client_core_mission,
      mockEchoTangoConfig.configJson?.orchestrator_client_context,
      mockEchoTangoConfig.configJson?.available_bit_ids,
      mockEchoTangoConfig.customInstructions,
    );

    // Verify client display name is injected
    expect(prompt).toContain('Quibit Orchestrator (v2.0) for Echo Tango');
    expect(prompt).toContain('central AI orchestrator for Echo Tango');

    // Verify mission statement is injected
    expect(prompt).toContain(
      `As a reminder, Echo Tango's core mission is: To revolutionize AI assistants for enterprise communications`,
    );

    // Verify client operational context is included
    expect(prompt).toContain('# Client Operational Context for Echo Tango:');
    expect(prompt).toContain(
      'Echo Tango operates in the enterprise communications sector',
    );

    // Verify available bits are listed
    expect(prompt).toContain('echo-tango-specialist');
    expect(prompt).toContain('document-editor');
    expect(prompt).toContain('web-research');

    // Verify custom instructions are included
    expect(prompt).toContain('# General Client Guidelines (for Echo Tango):');
    expect(prompt).toContain(
      'Always prioritize clarity and precision in all communications.',
    );

    // Verify current date/time is injected
    expect(prompt).toContain('2023-05-01 12:00:00 (UTC)');

    // Verify critical sections are preserved
    expect(prompt).toContain('# IDENTITY PRESERVATION - CRITICAL');
    expect(prompt).toContain('# CRITICAL: REQUEST HANDLING PROTOCOL');
    expect(prompt).toContain('# Core Responsibilities & Workflow');
    expect(prompt).toContain('# Tool Usage Guidelines');
  });

  test('should gracefully handle minimal client configuration', async () => {
    const currentDateTime = '2023-05-01 12:00:00 (UTC)';

    const prompt = getOrchestratorPrompt(
      currentDateTime,
      mockMinimalConfig.client_display_name,
      mockMinimalConfig.client_core_mission,
      mockMinimalConfig.configJson?.orchestrator_client_context,
      mockMinimalConfig.configJson?.available_bit_ids,
      mockMinimalConfig.customInstructions,
    );

    // Verify client display name is injected
    expect(prompt).toContain('Quibit Orchestrator (v2.0) for Minimal Client');
    expect(prompt).toContain('central AI orchestrator for Minimal Client');

    // Verify mission statement is injected
    expect(prompt).toContain(
      `As a reminder, Minimal Client's core mission is: Simple testing client`,
    );

    // Verify operational context is not included (since it's null)
    expect(prompt).not.toContain(
      '# Client Operational Context for Minimal Client:',
    );

    // Verify available bits fallback message is included
    expect(prompt).toContain('* **Available Specialists:** None configured');
    expect(prompt).toContain(
      'no specific specialized Bits are configured for focused delegation for this client',
    );

    // Verify custom instructions section is not included (since it's null)
    expect(prompt).not.toContain(
      '# General Client Guidelines (for Minimal Client):',
    );

    // Verify current date/time is still injected
    expect(prompt).toContain('2023-05-01 12:00:00 (UTC)');

    // Verify critical sections are preserved
    expect(prompt).toContain('# IDENTITY PRESERVATION - CRITICAL');
    expect(prompt).toContain('# CRITICAL: REQUEST HANDLING PROTOCOL');
  });

  test('should handle all optional parameters being null/undefined', async () => {
    const currentDateTime = '2023-05-01 12:00:00 (UTC)';

    const prompt = getOrchestratorPrompt(
      currentDateTime,
      'Default Client',
      null,
      undefined,
      null,
      undefined,
    );

    // Verify client display name is injected
    expect(prompt).toContain('Quibit Orchestrator (v2.0) for Default Client');
    expect(prompt).toContain('central AI orchestrator for Default Client');

    // Verify mission statement is not included (since it's null)
    expect(prompt).not.toContain(
      `As a reminder, Default Client's core mission is:`,
    );

    // Verify operational context is not included (since it's undefined)
    expect(prompt).not.toContain(
      '# Client Operational Context for Default Client:',
    );

    // Verify available bits fallback message is included
    expect(prompt).toContain('* **Available Specialists:** None configured');
    expect(prompt).toContain(
      'no specific specialized Bits are configured for focused delegation for this client',
    );

    // Verify custom instructions section is not included (since it's undefined)
    expect(prompt).not.toContain(
      '# General Client Guidelines (for Default Client):',
    );

    // Verify current date/time is still injected
    expect(prompt).toContain('2023-05-01 12:00:00 (UTC)');

    // Verify the prompt is still functional with core sections intact
    expect(prompt).toContain('# IDENTITY PRESERVATION - CRITICAL');
    expect(prompt).toContain('# CRITICAL: REQUEST HANDLING PROTOCOL');
    expect(prompt).toContain('# Core Responsibilities & Workflow');
    expect(prompt).toContain('# Tool Usage Guidelines');
  });
});
