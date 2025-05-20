#!/bin/bash

# Send a calendar-related request to trigger the googleCalendarTool
echo "Sending test request to API..."
curl -X POST http://localhost:3001/api/brain \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What meetings do I have scheduled tomorrow?", "id": "msg-test-123"}],
    "id": "test-calendar-debug-123",
    "activeBitContextId": "global-orchestrator"
  }' -s > /dev/null &

# Wait a moment for the request to be processed
sleep 2

# Monitor the logs for GoogleCalendarTool-related messages
echo "Monitoring logs for GoogleCalendarTool execution..."
echo "Press Ctrl+C to stop monitoring"

# This may need adjustments based on how your Next.js server outputs logs
ps aux | grep -i node | grep -i next 