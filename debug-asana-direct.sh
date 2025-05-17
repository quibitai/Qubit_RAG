#!/bin/bash

# This script tests the Asana webhook directly using curl
# It bypasses the API layer to rule out any issues with the integration

# Get environment variables with fallback to hardcoded values
ASANA_URL="${N8N_ASANA_WEBHOOK_URL:-${ASANA_WEBHOOK_URL:-https://quibit.app.n8n.cloud/webhook/asana}}"
AUTH_HEADER="${N8N_ASANA_AUTH_HEADER:-${ASANA_AUTH_HEADER:-asana}}"
AUTH_TOKEN="${N8N_ASANA_AUTH_TOKEN:-${ASANA_AUTH_TOKEN:-your_token_here}}"

if [ -z "$N8N_ASANA_WEBHOOK_URL" ] && [ -n "$ASANA_WEBHOOK_URL" ]; then
  echo "[debug-asana-direct.sh] Using deprecated ASANA_WEBHOOK_URL. Please migrate to N8N_ASANA_WEBHOOK_URL."
fi
if [ -z "$N8N_ASANA_AUTH_TOKEN" ] && [ -n "$ASANA_AUTH_TOKEN" ]; then
  echo "[debug-asana-direct.sh] Using deprecated ASANA_AUTH_TOKEN. Please migrate to N8N_ASANA_AUTH_TOKEN."
fi
if [ -z "$N8N_ASANA_AUTH_HEADER" ] && [ -n "$ASANA_AUTH_HEADER" ]; then
  echo "[debug-asana-direct.sh] Using deprecated ASANA_AUTH_HEADER. Please migrate to N8N_ASANA_AUTH_HEADER."
fi

echo "===== TESTING ASANA WEBHOOK DIRECTLY ====="
echo "Using webhook URL: ${ASANA_URL}"
echo "Using auth header: ${AUTH_HEADER}"
echo "Using auth token: ${AUTH_TOKEN:0:3}***"
echo ""

echo "===== SENDING DIRECT REQUEST ====="
echo "Request timestamp: $(date)"
echo "Request payload: {\"query\": \"List all my incomplete tasks in Asana\"}"

response=$(curl -v -s -X POST "${ASANA_URL}" \
  -H "Content-Type: application/json" \
  -H "${AUTH_HEADER}: ${AUTH_TOKEN}" \
  -d '{"query": "List all my incomplete tasks in Asana"}' 2>&1)

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

# Test via API endpoint to check if it's using the right tool
echo "===== TESTING VIA API ENDPOINT ====="
api_response=$(curl -s localhost:3000/api/brain -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user", 
        "content": "list my current asana tasks",
        "id": "test-asana-'$(date +%s)'"
      }
    ],
    "id": "test-api-'$(date +%s)'",
    "activeBitContextId": "global-orchestrator"
  }')

echo "API response (first 500 chars):"
echo "${api_response:0:500}..."

echo -e "\n===== TEST COMPLETED =====" 