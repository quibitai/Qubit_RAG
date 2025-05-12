import { test, expect } from '@playwright/test';
import type { ClientConfig } from '@/lib/db/queries';

// Mock function to simulate getAvailableTools from app/api/brain/route.ts
// We need to recreate it here since it's not exported
async function getAvailableTools(clientConfig?: ClientConfig | null) {
  // Reset global config store for testing
  global.CURRENT_TOOL_CONFIGS = {};

  // Mock tools array for testing
  const mockTools = [
    { name: 'n8nMcpGateway' },
    { name: 'tavilySearch' },
    { name: 'getFileContentsTool' },
  ];

  try {
    // If no client configuration, return default tools
    if (!clientConfig?.configJson?.tool_configs) {
      return mockTools;
    }

    const toolConfigs = clientConfig.configJson.tool_configs;

    // Initialize the global configuration store
    global.CURRENT_TOOL_CONFIGS = {};

    // Configure specific tools based on client settings
    if (toolConfigs.n8n) {
      // Set configuration for n8nMcpGateway tool
      global.CURRENT_TOOL_CONFIGS.n8n = {
        webhookUrl: toolConfigs.n8n.webhookUrl || process.env.N8N_WEBHOOK_URL,
        apiKey: toolConfigs.n8n.apiKey || process.env.N8N_API_KEY,
        // Additional configurations
        ...toolConfigs.n8n,
      };
    }

    if (toolConfigs.tavily) {
      global.CURRENT_TOOL_CONFIGS.tavily = toolConfigs.tavily;
    }

    return mockTools;
  } catch (error) {
    console.error('Error getting available tools:', error);
    return [];
  }
}

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
      'Echo Tango operates in the enterprise communications sector.',
    available_bit_ids: ['echo-tango-specialist', 'document-editor'],
    tool_configs: {
      n8n: {
        webhookUrl: 'https://n8n.echotango.co/webhook/ai-gateway',
        apiKey: 'et_test_api_key',
        customEndpoint: '/echo-tango-specific',
      },
      tavily: {
        maxResults: 10,
        apiKey: 'et_tavily_key',
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

test.describe('Client-Specific Tool Configuration Tests', () => {
  test('should configure tools with client-specific settings when available', async () => {
    // Get tools with Echo Tango config
    await getAvailableTools(mockEchoTangoConfig);

    // Verify global tool configs were set correctly
    expect(global.CURRENT_TOOL_CONFIGS.n8n).toBeDefined();
    expect(global.CURRENT_TOOL_CONFIGS.n8n.webhookUrl).toBe(
      'https://n8n.echotango.co/webhook/ai-gateway',
    );
    expect(global.CURRENT_TOOL_CONFIGS.n8n.apiKey).toBe('et_test_api_key');
    expect(global.CURRENT_TOOL_CONFIGS.n8n.customEndpoint).toBe(
      '/echo-tango-specific',
    );

    expect(global.CURRENT_TOOL_CONFIGS.tavily).toBeDefined();
    expect(global.CURRENT_TOOL_CONFIGS.tavily.maxResults).toBe(10);
    expect(global.CURRENT_TOOL_CONFIGS.tavily.apiKey).toBe('et_tavily_key');
  });

  test('should not configure tools when client has no tool configs', async () => {
    // Reset global config
    global.CURRENT_TOOL_CONFIGS = {};

    // Get tools with minimal config
    await getAvailableTools(mockMinimalConfig);

    // Verify global tool configs were not set
    expect(Object.keys(global.CURRENT_TOOL_CONFIGS).length).toBe(0);
  });

  test('should fall back to environment variables when client config is missing specific values', async () => {
    // Save original env variables
    const originalN8nWebhook = process.env.N8N_WEBHOOK_URL;
    const originalN8nApiKey = process.env.N8N_API_KEY;

    // Set test env variables
    process.env.N8N_WEBHOOK_URL = 'https://default-n8n-webhook.com';
    process.env.N8N_API_KEY = 'default_api_key';

    // Create a client config with partial tool config (missing apiKey)
    const partialConfig: ClientConfig = {
      id: 'partial-client',
      name: 'Partial Client',
      client_display_name: 'Partial Client',
      client_core_mission: null,
      customInstructions: null,
      configJson: {
        tool_configs: {
          n8n: {
            // Only specify webhook, not apiKey
            webhookUrl: 'https://partial-client.com/webhook',
          },
        },
      },
    };

    // Get tools with partial config
    await getAvailableTools(partialConfig);

    // Verify client webhook was used
    expect(global.CURRENT_TOOL_CONFIGS.n8n.webhookUrl).toBe(
      'https://partial-client.com/webhook',
    );

    // Verify default API key was used as fallback
    expect(global.CURRENT_TOOL_CONFIGS.n8n.apiKey).toBe('default_api_key');

    // Restore original env variables
    process.env.N8N_WEBHOOK_URL = originalN8nWebhook;
    process.env.N8N_API_KEY = originalN8nApiKey;
  });

  test('should return all tools regardless of client configuration', async () => {
    // Tools should be returned for all clients, just with different configurations
    const echoTangoTools = await getAvailableTools(mockEchoTangoConfig);
    const minimalTools = await getAvailableTools(mockMinimalConfig);

    // Both should return the same number of tools
    expect(echoTangoTools.length).toBe(3);
    expect(minimalTools.length).toBe(3);

    // Both should include all tool types
    expect(echoTangoTools.some((tool) => tool.name === 'n8nMcpGateway')).toBe(
      true,
    );
    expect(echoTangoTools.some((tool) => tool.name === 'tavilySearch')).toBe(
      true,
    );
    expect(minimalTools.some((tool) => tool.name === 'n8nMcpGateway')).toBe(
      true,
    );
    expect(minimalTools.some((tool) => tool.name === 'tavilySearch')).toBe(
      true,
    );
  });
});
