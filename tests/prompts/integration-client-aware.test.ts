/**
 * Integration tests for the client-aware prompt system
 *
 * These tests simulate real client requests and validate that:
 * 1. Client-specific context is correctly loaded and injected
 * 2. The system properly handles tool configurations based on client settings
 * 3. Orchestrator and specialist contexts work correctly with client context
 */
import { test, expect } from '@playwright/test';
import { loadPrompt } from '@/lib/ai/prompts/loader';
import type { ClientConfig } from '@/lib/db/queries';
import {
  CHAT_BIT_CONTEXT_ID,
  GLOBAL_ORCHESTRATOR_CONTEXT_ID,
} from '@/lib/constants';

// Mock client configurations
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

// Add type declaration for global variables
declare global {
  var CURRENT_TOOL_CONFIGS: Record<string, any>;
}

// Initialize global variable if needed
if (typeof global.CURRENT_TOOL_CONFIGS === 'undefined') {
  global.CURRENT_TOOL_CONFIGS = {};
}

/**
 * Simulates the app/api/brain/route.ts request handling in a simplified form
 * to test integration of client context, prompt loading, and tool configuration
 */
async function simulateApiRequest({
  clientConfig,
  contextId,
  modelId = 'global-orchestrator',
  userMessage = 'What events do I have scheduled today?',
}: {
  clientConfig: ClientConfig;
  contextId: string | null;
  modelId?: string;
  userMessage?: string;
}) {
  // Clear existing tool configs
  global.CURRENT_TOOL_CONFIGS = {};

  // 1. Format current date/time (simplified)
  const currentDateTime = new Date().toLocaleString();

  // 2. Determine the appropriate modelId to use for loadPrompt
  // If it's the global orchestrator context, use 'global-orchestrator'
  // Otherwise, use the actual selected model ID to avoid triggering orchestrator logic
  const promptModelId =
    contextId === GLOBAL_ORCHESTRATOR_CONTEXT_ID
      ? 'global-orchestrator'
      : modelId;

  // 3. Load appropriate prompt
  const systemPrompt = loadPrompt({
    modelId: promptModelId,
    contextId,
    clientConfig,
    currentDateTime,
  });

  // 4. Configure tools based on client settings (simplified version of getAvailableTools)
  if (clientConfig?.configJson?.tool_configs) {
    const toolConfigs = clientConfig.configJson.tool_configs;

    if (toolConfigs.n8n) {
      global.CURRENT_TOOL_CONFIGS.n8n = {
        webhookUrl: toolConfigs.n8n.webhookUrl || process.env.N8N_WEBHOOK_URL,
        apiKey: toolConfigs.n8n.apiKey || process.env.N8N_API_KEY,
        ...toolConfigs.n8n,
      };
    }

    if (toolConfigs.tavily) {
      global.CURRENT_TOOL_CONFIGS.tavily = toolConfigs.tavily;
    }
  }

  // 5. Return simulated result
  return {
    systemPrompt,
    toolConfigs: global.CURRENT_TOOL_CONFIGS,
    clientId: clientConfig.id,
    contextId,
  };
}

test.describe('Client-Aware Prompt System Integration', () => {
  // Echo Tango tests
  test('Echo Tango client with Orchestrator should use client-specific context', async () => {
    const result = await simulateApiRequest({
      clientConfig: mockEchoTangoConfig,
      contextId: GLOBAL_ORCHESTRATOR_CONTEXT_ID,
      modelId: 'global-orchestrator',
    });

    // Verify client context is injected into Orchestrator prompt
    expect(result.systemPrompt).toContain(
      'Quibit Orchestrator (v2.0) for Echo Tango',
    );
    expect(result.systemPrompt).toContain(
      'To revolutionize AI assistants for enterprise communications',
    );
    expect(result.systemPrompt).toContain('enterprise communications sector');
    expect(result.systemPrompt).toContain('echo-tango-specialist');
    expect(result.systemPrompt).toContain('document-editor');
    expect(result.systemPrompt).toContain(
      'Always prioritize clarity and precision',
    );

    // Verify client tool configs are applied
    expect(result.toolConfigs.n8n).toBeDefined();
    expect(result.toolConfigs.n8n.webhookUrl).toBe(
      'https://n8n.echotango.co/webhook/ai-gateway',
    );
    expect(result.toolConfigs.n8n.apiKey).toBe('et_test_api_key');
  });

  test('Echo Tango client with specialist context should use client-specific override', async () => {
    const result = await simulateApiRequest({
      clientConfig: mockEchoTangoConfig,
      contextId: 'echo-tango-specialist',
      modelId: 'gpt-4-o',
    });

    // Verify client-specific specialist override is used
    expect(result.systemPrompt).toContain(
      'Custom Echo Tango specialist prompt with Echo Tango',
    );

    // Verify mission statement is injected
    expect(result.systemPrompt).toContain(
      'be guided by their core mission: To revolutionize AI assistants',
    );

    // Verify client custom instructions are appended
    expect(result.systemPrompt).toContain(
      '# Client-Specific Guidelines for Echo Tango',
    );
    expect(result.systemPrompt).toContain(
      'Always prioritize clarity and precision',
    );

    // Verify tool configs are still applied even in specialist context
    expect(result.toolConfigs.n8n).toBeDefined();
    expect(result.toolConfigs.n8n.webhookUrl).toBe(
      'https://n8n.echotango.co/webhook/ai-gateway',
    );
  });

  // Chat Model tests (general chat)
  test('Echo Tango client with chat model context should use general chat specialist prompt', async () => {
    const result = await simulateApiRequest({
      clientConfig: mockEchoTangoConfig,
      contextId: CHAT_BIT_CONTEXT_ID,
      modelId: 'gpt-4-o',
    });

    // Verify it's using the chat model specialist prompt
    expect(result.systemPrompt).toContain('General Assistant for Echo Tango');

    // Verify client name is injected
    expect(result.systemPrompt).toContain('Echo Tango');

    // Verify mission statement is injected
    expect(result.systemPrompt).toContain(
      'revolutionize AI assistants for enterprise communications',
    );

    // Verify custom instructions are appended
    expect(result.systemPrompt).toContain(
      '# Client-Specific Guidelines for Echo Tango',
    );
    expect(result.systemPrompt).toContain(
      'Always prioritize clarity and precision',
    );

    // Verify it's not using the orchestrator prompt
    expect(result.systemPrompt).not.toContain('Quibit Orchestrator (v2.0)');

    // Verify tool configs are still applied
    expect(result.toolConfigs.n8n).toBeDefined();
    expect(result.toolConfigs.n8n.webhookUrl).toBe(
      'https://n8n.echotango.co/webhook/ai-gateway',
    );
  });

  // Minimal client tests
  test('Minimal client with Orchestrator should use defaults with basic client info', async () => {
    const result = await simulateApiRequest({
      clientConfig: mockMinimalConfig,
      contextId: GLOBAL_ORCHESTRATOR_CONTEXT_ID,
      modelId: 'global-orchestrator',
    });

    // Verify client display name is injected
    expect(result.systemPrompt).toContain(
      'Quibit Orchestrator (v2.0) for Minimal Client',
    );
    expect(result.systemPrompt).toContain(
      'central AI orchestrator for Minimal Client',
    );

    // Verify mission statement is injected
    expect(result.systemPrompt).toContain(
      `As a reminder, Minimal Client's core mission is: Simple testing client`,
    );

    // Verify no tool configs are set
    expect(Object.keys(result.toolConfigs).length).toBe(0);
  });

  test('Minimal client with specialist context should use default specialist prompt', async () => {
    const result = await simulateApiRequest({
      clientConfig: mockMinimalConfig,
      contextId: 'echo-tango-specialist',
      modelId: 'gpt-4-o',
    });

    // Should use default specialist prompt since no override exists
    expect(result.systemPrompt).toContain('ROLE: Echo Tango Specialist');

    // But client name should still be injected
    expect(result.systemPrompt).toContain('Minimal Client');

    // And mission statement should be formed and injected
    expect(result.systemPrompt).toContain(
      'be guided by their core mission: Simple testing client',
    );

    // No tool configs should be set
    expect(Object.keys(result.toolConfigs).length).toBe(0);
  });

  test('Minimal client with chat model context should use general chat specialist prompt with client info', async () => {
    const result = await simulateApiRequest({
      clientConfig: mockMinimalConfig,
      contextId: CHAT_BIT_CONTEXT_ID,
      modelId: 'gpt-4-o',
    });

    // Verify it's using the chat model specialist prompt
    expect(result.systemPrompt).toContain(
      'General Assistant for Minimal Client',
    );

    // Verify client name is injected
    expect(result.systemPrompt).toContain('Minimal Client');

    // Verify mission statement is injected
    expect(result.systemPrompt).toContain('Simple testing client');

    // Verify it's not using the orchestrator prompt
    expect(result.systemPrompt).not.toContain('Quibit Orchestrator (v2.0)');

    // No tool configs should be set
    expect(Object.keys(result.toolConfigs).length).toBe(0);
  });

  // Environment variable fallback test
  test('Should use environment variables as fallback when client config is missing values', async () => {
    // Save original env variables
    const originalN8nWebhook = process.env.N8N_WEBHOOK_URL;
    const originalN8nApiKey = process.env.N8N_API_KEY;

    // Set test env variables
    process.env.N8N_WEBHOOK_URL = 'https://default-n8n-webhook.com';
    process.env.N8N_API_KEY = 'default_api_key';

    // Create a client config with partial tool config
    const partialConfig: ClientConfig = {
      id: 'partial-client',
      name: 'Partial Client',
      client_display_name: 'Partial Client',
      client_core_mission: null,
      customInstructions: null,
      configJson: {
        tool_configs: {
          n8n: {
            // Only specify webhook
            webhookUrl: 'https://partial-client.com/webhook',
          },
        },
      },
    };

    const result = await simulateApiRequest({
      clientConfig: partialConfig,
      contextId: null,
      modelId: 'global-orchestrator',
    });

    // Verify client webhook was used
    expect(result.toolConfigs.n8n.webhookUrl).toBe(
      'https://partial-client.com/webhook',
    );

    // Verify default API key was used as fallback
    expect(result.toolConfigs.n8n.apiKey).toBe('default_api_key');

    // Restore original env variables
    process.env.N8N_WEBHOOK_URL = originalN8nWebhook;
    process.env.N8N_API_KEY = originalN8nApiKey;
  });
});
