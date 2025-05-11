#!/bin/bash

# This script tests the n8n webhook directly using curl
# It bypasses the API layer to rule out any issues with the integration

# Get environment variables
N8N_URL="${N8N_MCP_WEBHOOK_URL:-https://quibit.app.n8n.cloud/webhook/6551a320-8df7-4f1a-bfe4-c3927981ef8f}"
AUTH_HEADER="${N8N_MCP_AUTH_HEADER:-mcp}"
AUTH_TOKEN="${N8N_MCP_AUTH_TOKEN:-V7vwKwT92MBq4}"

echo "===== TESTING N8N WEBHOOK DIRECTLY ====="
echo "Using webhook URL: ${N8N_URL:0:20}..."
echo "Using auth header: ${AUTH_HEADER}"
echo "Using auth token: ${AUTH_TOKEN:0:3}***"
echo ""

echo "===== SENDING DIRECT REQUEST ====="
echo "Request timestamp: $(date)"
echo "Request payload: {\"task_description\": \"List all Google Calendar events for Tuesday, May 13, 2025\"}"

response=$(curl -v -s -X POST "${N8N_URL}" \
  -H "Content-Type: application/json" \
  -H "${AUTH_HEADER}: ${AUTH_TOKEN}" \
  -d '{"task_description": "List all Google Calendar events for Tuesday, May 13, 2025"}' 2>&1)

# Extract HTTP status code
status_code=$(echo "$response" | grep -o "< HTTP/[0-9.]* [0-9]*" | grep -o "[0-9]*$")
echo "Response HTTP status: $status_code"

# Split the response into headers and body
headers=$(echo "$response" | grep -E "^< ")
body=$(echo "$response" | awk '/^\{/{flag=1}flag')

echo "Response headers:"
echo "$headers"
echo ""

echo "Response body:"
echo "$body" | jq . 2>/dev/null || echo "$body"
echo ""

# Check API response from local server
echo "===== TESTING VIA API ENDPOINT ====="
api_response=$(curl -s localhost:3000/api/brain -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "what google calendar events do I have scheduled for tuesday of next week?",
        "id": "test-n8n-'$(date +%s)'"
      }
    ],
    "id": "test-api-'$(date +%s)'",
    "activeBitContextId": "global-orchestrator"
  }')

echo "API response (first 500 chars):"
echo "${api_response:0:500}..."

echo -e "\n===== WATCHING SERVER LOGS ====="
echo "Server logs for the next 10 seconds (look for n8nMcpGatewayTool entries):"
timeout 10 tail -f /tmp/next-server.log 2>&1 | grep -i 'n8nMcpGatewayTool' || echo "No relevant logs found in 10 seconds." 