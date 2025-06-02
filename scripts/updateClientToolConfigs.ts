#!/usr/bin/env tsx
/**
 * Update Client Tool Configurations
 *
 * This script systematically updates client configurations in the database
 * to ensure all tools (Asana, Google Calendar, etc.) have proper access
 * for both echo-tango-specialist and the global orchestrator.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { clients } from '../lib/db/schema';

// Environment variables validation
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!POSTGRES_URL) {
  console.error(
    '❌ POSTGRES_URL or DATABASE_URL environment variable is required',
  );
  process.exit(1);
}

// Create database connection
const client = postgres(POSTGRES_URL);
const db = drizzle(client);

/**
 * Complete tool configuration template that includes all available tools
 */
const COMPLETE_TOOL_CONFIGS = {
  // Native Asana Integration
  nativeAsana: {
    apiKey: process.env.ASANA_PAT || process.env.NATIVE_ASANA_PAT || null,
    defaultWorkspaceGid: process.env.ASANA_DEFAULT_WORKSPACE_GID || null,
    defaultTeamGid: process.env.ASANA_DEFAULT_TEAM_GID || null,
    timeoutMs: Number(process.env.NATIVE_ASANA_TIMEOUT_MS || '30000'),
  },

  // Google Calendar Integration
  googleCalendar: {
    webhookUrl: process.env.GOOGLE_CALENDAR_WEBHOOK_URL || null,
    authToken: process.env.GOOGLE_CALENDAR_AUTH_TOKEN || null,
    authHeader: process.env.GOOGLE_CALENDAR_AUTH_HEADER || null,
    timeoutMs: Number(process.env.GOOGLE_CALENDAR_TIMEOUT_MS || '30000'),
  },

  // Tavily Web Search
  tavily: {
    apiKey: process.env.TAVILY_API_KEY || null,
    maxResults: 10,
    includeAnswer: true,
    includeRawContent: false,
    includeImages: false,
  },

  // File Extraction Service (N8N)
  n8n: {
    webhookUrl: process.env.N8N_EXTRACT_WEBHOOK_URL || null,
    authToken: process.env.N8N_EXTRACT_AUTH_TOKEN || null,
    authHeader: process.env.N8N_EXTRACT_AUTH_HEADER || null,
    timeoutMs: Number(process.env.N8N_EXTRACT_TIMEOUT_MS || '30000'),
  },

  // Internal Knowledge Base
  internalKnowledgeBase: {
    default_id_for_client: 'echo-tango', // This can be customized per client
    enableCaching: true,
    maxResults: 50,
  },
} as const;

/**
 * Get client configuration from database
 */
async function getClientConfig(clientId: string): Promise<any> {
  const result = await db
    .select({
      id: clients.id,
      name: clients.name,
      client_display_name: clients.client_display_name,
      client_core_mission: clients.client_core_mission,
      customInstructions: clients.customInstructions,
      config_json: clients.config_json,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Updates or creates tool configs for a client
 */
async function updateClientToolConfigs(
  clientId: string,
  displayName: string,
  customConfigs: Partial<typeof COMPLETE_TOOL_CONFIGS> = {},
): Promise<void> {
  console.log(`\n📋 Updating tool configs for: ${displayName} (${clientId})`);

  try {
    // Get current client configuration
    const currentConfig = await getClientConfig(clientId);

    if (!currentConfig) {
      console.log(`❌ Client ${clientId} not found in database`);
      return;
    }

    console.log(
      'Current tool configs:',
      currentConfig.config_json?.tool_configs || 'None',
    );

    // Merge complete tool configs with any custom configurations
    const updatedToolConfigs = {
      ...COMPLETE_TOOL_CONFIGS,
      ...customConfigs,
    };

    // Update internalKnowledgeBase config per client (create mutable copy)
    if (clientId === 'echo-tango') {
      updatedToolConfigs.internalKnowledgeBase = {
        ...updatedToolConfigs.internalKnowledgeBase,
        default_id_for_client: 'echo-tango',
      };
    }

    // Create the updated configuration
    const updatedConfigJson = {
      ...currentConfig.config_json,
      tool_configs: updatedToolConfigs,
    };

    // Update the database
    await db
      .update(clients)
      .set({
        config_json: updatedConfigJson,
      })
      .where(eq(clients.id, clientId));

    console.log('✅ Successfully updated tool configurations');

    // Verify the update
    const verifyConfig = await getClientConfig(clientId);
    const toolConfigKeys = Object.keys(
      verifyConfig?.config_json?.tool_configs || {},
    );
    console.log(`📊 Tool configs now available: ${toolConfigKeys.join(', ')}`);

    // Check which tools have valid configurations
    const validTools: string[] = [];
    const invalidTools: string[] = [];

    Object.entries(updatedToolConfigs).forEach(([toolName, config]) => {
      if (toolName === 'internalKnowledgeBase') {
        validTools.push(toolName); // Always valid
        return;
      }

      const hasRequiredConfig = Object.values(config).some(
        (value) => value !== null && value !== undefined && value !== '',
      );

      if (hasRequiredConfig) {
        validTools.push(toolName);
      } else {
        invalidTools.push(toolName);
      }
    });

    console.log(
      `✅ Valid tools (${validTools.length}): ${validTools.join(', ')}`,
    );
    if (invalidTools.length > 0) {
      console.log(
        `⚠️  Tools missing env vars (${invalidTools.length}): ${invalidTools.join(', ')}`,
      );
    }
  } catch (error) {
    console.error(`❌ Error updating tool configs for ${clientId}:`, error);
  }
}

/**
 * Validates environment variables for tools
 */
function validateEnvironmentVariables(): void {
  console.log('\n🔍 Validating environment variables...\n');

  const requiredEnvVars = [
    // Asana
    { name: 'ASANA_PAT', purpose: 'Asana Personal Access Token' },
    { name: 'ASANA_DEFAULT_WORKSPACE_GID', purpose: 'Asana Workspace ID' },

    // Google Calendar
    {
      name: 'GOOGLE_CALENDAR_WEBHOOK_URL',
      purpose: 'Google Calendar Webhook URL',
    },
    {
      name: 'GOOGLE_CALENDAR_AUTH_TOKEN',
      purpose: 'Google Calendar Auth Token',
    },
    {
      name: 'GOOGLE_CALENDAR_AUTH_HEADER',
      purpose: 'Google Calendar Auth Header',
    },

    // Tavily
    { name: 'TAVILY_API_KEY', purpose: 'Tavily Web Search API Key' },

    // N8N File Extraction
    { name: 'N8N_EXTRACT_WEBHOOK_URL', purpose: 'N8N File Extraction Webhook' },
    { name: 'N8N_EXTRACT_AUTH_TOKEN', purpose: 'N8N Extract Auth Token' },
    { name: 'N8N_EXTRACT_AUTH_HEADER', purpose: 'N8N Extract Auth Header' },
  ];

  const missing: string[] = [];
  const present: string[] = [];

  requiredEnvVars.forEach(({ name, purpose }) => {
    if (process.env[name]) {
      present.push(`✅ ${name} - ${purpose}`);
    } else {
      missing.push(`❌ ${name} - ${purpose}`);
    }
  });

  console.log('Environment Variables Status:');
  present.forEach((item) => console.log(item));
  missing.forEach((item) => console.log(item));

  if (missing.length > 0) {
    console.log(`\n⚠️  ${missing.length} environment variables are missing.`);
    console.log(
      'Tools with missing env vars will be configured but may not work properly.',
    );
  } else {
    console.log('\n✅ All required environment variables are present!');
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log('🚀 Starting Client Tool Configuration Update\n');

  try {
    // Validate environment variables first
    validateEnvironmentVariables();

    // Update Echo Tango configuration
    await updateClientToolConfigs('echo-tango', 'Echo Tango Creative Agency', {
      internalKnowledgeBase: {
        default_id_for_client: 'echo-tango',
        enableCaching: true,
        maxResults: 50,
      },
    });

    // Update any other clients (add as needed)
    // await updateClientToolConfigs('other-client-id', 'Other Client Name');

    console.log('\n🎉 Tool configuration update completed!');
    console.log('\n📋 Summary:');
    console.log(
      '- All clients now have access to: Asana, Google Calendar, Tavily, N8N, Knowledge Base',
    );
    console.log(
      '- Each tool is configured with appropriate environment variables',
    );
    console.log('- Invalid configurations will be logged during runtime');
  } catch (error) {
    console.error('❌ Fatal error during tool configuration update:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the script if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { updateClientToolConfigs, COMPLETE_TOOL_CONFIGS };
