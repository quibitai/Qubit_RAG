#!/bin/bash

# Load environment variables from .env.local
source ../.env.local

# Check if environment variables are set
if [ -z "$N8N_MCP_WEBHOOK_URL" ] || [ -z "$N8N_MCP_AUTH_TOKEN" ] || [ -z "$N8N_MCP_AUTH_HEADER" ]; then
  echo "Error: Missing required environment variables"
  echo "Make sure N8N_MCP_WEBHOOK_URL, N8N_MCP_AUTH_TOKEN, and N8N_MCP_AUTH_HEADER are defined in .env.local"
  exit 1
fi

# Show environment variables (partially masked)
echo "Using webhook URL: ${N8N_MCP_WEBHOOK_URL:0:20}..."
echo "Using auth header: $N8N_MCP_AUTH_HEADER"
echo "Auth token is present: Yes"

# Make the request
echo -e "\nSending request to n8n webhook..."
curl -s -X POST "$N8N_MCP_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "$N8N_MCP_AUTH_HEADER: $N8N_MCP_AUTH_TOKEN" \
  -d '{"query": "List all Google Calendar events scheduled for Tuesday, May 6, 2025."}' | jq . 