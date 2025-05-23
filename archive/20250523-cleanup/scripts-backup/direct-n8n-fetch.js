/**
 * Direct N8N fetch utility
 * This module makes direct requests to the n8n webhook for testing
 */

/**
 * Makes a direct fetch to the n8n webhook
 * @param {string} query - The calendar query to send
 * @returns {Promise<object>} - The response from n8n
 */
export default async function directN8nFetch(query) {
  console.log('Making direct fetch to n8n webhook...');
  console.log(`Query: ${query}`);

  const N8N_MCP_WEBHOOK_URL = process.env.N8N_MCP_WEBHOOK_URL;
  const N8N_MCP_AUTH_TOKEN = process.env.N8N_MCP_AUTH_TOKEN;
  const N8N_MCP_AUTH_HEADER = process.env.N8N_MCP_AUTH_HEADER;

  // Log environment variables (censored)
  console.log(
    `Using webhook URL: ${N8N_MCP_WEBHOOK_URL ? N8N_MCP_WEBHOOK_URL.substring(0, 20) + '...' : 'undefined'}`,
  );
  console.log(`Using auth header: ${N8N_MCP_AUTH_HEADER || 'undefined'}`);
  console.log(`Auth token present: ${N8N_MCP_AUTH_TOKEN ? 'yes' : 'no'}`);

  if (!N8N_MCP_WEBHOOK_URL || !N8N_MCP_AUTH_TOKEN || !N8N_MCP_AUTH_HEADER) {
    throw new Error('Missing required environment variables for n8n webhook');
  }

  try {
    // Send request to n8n webhook
    const response = await fetch(N8N_MCP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [N8N_MCP_AUTH_HEADER]: N8N_MCP_AUTH_TOKEN,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(
        `N8N webhook returned status ${response.status}: ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching from n8n:', error);
    throw error;
  }
}
