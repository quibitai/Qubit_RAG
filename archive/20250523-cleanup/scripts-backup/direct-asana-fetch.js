/**
 * Direct fetch utility for Asana webhook
 * This file is used by test scripts to fetch directly from the Asana webhook
 */

// Use ES Module syntax for better compatibility
export default async function directAsanaFetch(query) {
  const webhookUrl =
    process.env.N8N_ASANA_WEBHOOK_URL ||
    process.env.ASANA_WEBHOOK_URL ||
    'https://quibit.app.n8n.cloud/webhook/asana';
  const authToken =
    process.env.N8N_ASANA_AUTH_TOKEN || process.env.ASANA_AUTH_TOKEN;
  const authHeaderName =
    process.env.N8N_ASANA_AUTH_HEADER ||
    process.env.ASANA_AUTH_HEADER ||
    'asana';

  // Log environment variables (with sensitive info partially masked)
  console.log(`Using Asana webhook URL: ${webhookUrl}`);
  console.log(`Using auth header: ${authHeaderName}`);
  console.log(
    `Auth token present: ${authToken ? `yes (first 3 chars: ${authToken.substring(0, 3)}...)` : 'no'}`,
  );

  if (!process.env.N8N_ASANA_WEBHOOK_URL && process.env.ASANA_WEBHOOK_URL) {
    console.warn(
      '[directAsanaFetch] Using deprecated ASANA_WEBHOOK_URL. Please migrate to N8N_ASANA_WEBHOOK_URL.',
    );
  }
  if (!process.env.N8N_ASANA_AUTH_TOKEN && process.env.ASANA_AUTH_TOKEN) {
    console.warn(
      '[directAsanaFetch] Using deprecated ASANA_AUTH_TOKEN. Please migrate to N8N_ASANA_AUTH_TOKEN.',
    );
  }
  if (!process.env.N8N_ASANA_AUTH_HEADER && process.env.ASANA_AUTH_HEADER) {
    console.warn(
      '[directAsanaFetch] Using deprecated ASANA_AUTH_HEADER. Please migrate to N8N_ASANA_AUTH_HEADER.',
    );
  }

  if (!webhookUrl) {
    throw new Error(
      'Missing ASANA_WEBHOOK_URL environment variable or fallback',
    );
  }

  if (!authToken) {
    console.warn(
      'Warning: No ASANA_AUTH_TOKEN provided. This might fail if the webhook requires authentication.',
    );
  }

  try {
    // For Node.js environments we need to import fetch
    const nodeFetch = await import('node-fetch').then((mod) => mod.default);
    const fetch = globalThis.fetch || nodeFetch;

    // Prepare the request
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add auth header if token is available
    if (authToken && authHeaderName) {
      headers[authHeaderName] = authToken;
    }

    // Send request to Asana webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(
        `Asana webhook returned status ${response.status}: ${response.statusText}`,
      );
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error fetching from Asana webhook:', error);
    throw error;
  }
}
