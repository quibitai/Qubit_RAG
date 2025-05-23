# API Endpoint: Brain Orchestrator

> Central orchestration endpoint for AI interactions using LangChain agents with dynamic tool selection and streaming responses

**Status**: Stable  
**Last Updated**: 2024-12-20  
**Maintainer**: Quibit Development Team

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Request](#request)
- [Response](#response)
- [Examples](#examples)
- [Error Handling](#error-handling)
- [Streaming Protocol](#streaming-protocol)
- [Context Management](#context-management)
- [Tool Integration](#tool-integration)
- [Related Endpoints](#related-endpoints)

## Overview

The Brain API endpoint serves as the central orchestration layer for all AI interactions in the Quibit RAG system. It processes user messages, maintains conversation context, executes tools dynamically, and streams responses in real-time.

### Key Features
- **LangChain Agent Execution**: OpenAI-powered agent with dynamic tool selection
- **Real-time Streaming**: Server-Sent Events (SSE) with structured data
- **Context Management**: Automatic entity extraction and conversation summarization
- **Multi-tenancy**: Client-aware prompts and tool configurations
- **File Processing**: Support for uploads with content extraction
- **Cross-UI Context Sharing**: Seamless context between main UI and global pane

### Use Cases
- Chat conversations with AI specialists
- Document creation and editing
- File processing and analysis
- Tool execution (calendar, search, integrations)
- Context-aware responses across long conversations

## Authentication

**Required**: Yes  
**Type**: Session-based (NextAuth)

```typescript
// Authentication handled automatically by NextAuth middleware
// Session must include valid user and clientId
```

**Permissions Required:**
- Valid user session
- Client association
- Tool-specific permissions (varies by client configuration)

## Request

### HTTP Method & URL
```
POST /api/brain
```

### Request Headers
| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | application/json |
| `Cookie` | string | Yes | NextAuth session cookie |

### Request Body Schema
```typescript
interface BrainRequest {
  messages: Message[];
  id: string; // Chat ID
  selectedChatModel?: string;
  fileContext?: FileContext;
  
  // Context and specialist selection
  currentActiveSpecialistId?: string | null;
  activeBitContextId?: string | null;
  activeBitPersona?: string | null;
  activeDocId?: string | null;
  
  // Cross-UI context sharing
  isFromGlobalPane?: boolean;
  referencedChatId?: string | null;
  mainUiChatId?: string | null;
  referencedGlobalPaneChatId?: string | null;
  
  // User configuration
  userTimezone?: string;
}

interface Message {
  id?: string;
  content: string;
  role: 'user' | 'assistant';
  parts?: MessagePart[];
  attachments?: Attachment[];
  createdAt?: string;
}

interface FileContext {
  filename: string;
  contentType: string;
  url: string;
  extractedText: string | object;
}
```

**Example Request Body:**
```json
{
  "messages": [
    {
      "id": "msg-1",
      "content": "What's on my calendar today?",
      "role": "user",
      "parts": [
        {
          "type": "text",
          "text": "What's on my calendar today?"
        }
      ],
      "createdAt": "2024-12-20T10:00:00Z"
    }
  ],
  "id": "chat-uuid-here",
  "currentActiveSpecialistId": "global-orchestrator",
  "userTimezone": "America/New_York"
}
```

## Response

### Success Response (Streaming SSE)
The endpoint returns a Server-Sent Events stream with structured data chunks:

```typescript
interface StreamChunk {
  type: 'text' | 'data' | 'message_annotations';
  content?: string;
  data?: any;
  annotations?: MessageAnnotations;
}

interface MessageAnnotations {
  id?: string;
  createdAt?: string;
  documentCreated?: {
    id: string;
    title: string;
    kind: string;
  };
}
```

**Stream Protocol:**
```
data: 0:"Hello"

data: {"type":"status-update","status":"Processing request..."}

data: {"type":"tool-result","content":{"toolName":"googleCalendar","toolOutput":"Found 3 events"}}

data: {"type":"completion","status":"complete","timestamp":"2024-12-20T10:00:00Z"}
```

## Examples

### Example 1: Basic Chat Request
```typescript
const response = await fetch('/api/brain', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    messages: [
      {
        content: "Help me understand the project architecture",
        role: "user"
      }
    ],
    id: "chat-123",
    currentActiveSpecialistId: "global-orchestrator"
  })
});

// Handle streaming response
const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  console.log('Received:', chunk);
}
```

### Example 2: File Upload with Context
```typescript
const requestBody = {
  messages: [
    {
      content: "Analyze this document",
      role: "user",
      attachments: [
        {
          name: "report.pdf",
          url: "blob-url",
          contentType: "application/pdf"
        }
      ]
    }
  ],
  id: "chat-456",
  fileContext: {
    filename: "report.pdf",
    contentType: "application/pdf",
    url: "blob-url",
    extractedText: "Document content here..."
  }
};

const response = await fetch('/api/brain', requestBody);
```

### Example 3: Specialist Context
```typescript
const requestBody = {
  messages: [
    {
      content: "Create a new task for this project",
      role: "user"
    }
  ],
  id: "chat-789",
  currentActiveSpecialistId: "echo-tango",
  activeBitPersona: "project-manager"
};
```

## Error Handling

### Common Error Responses

| Status Code | Error Type | Description | Resolution |
|-------------|------------|-------------|------------|
| 400 | `MISSING_PARAMETERS` | Missing required chatId or messages | Include required fields |
| 401 | `AUTHENTICATION_REQUIRED` | Invalid or missing session | Log in again |
| 500 | `INTERNAL_ERROR` | Server processing error | Check logs, retry |

### Error Response Format
```json
{
  "error": "Missing required parameter: chatId"
}
```

## Streaming Protocol

The Brain API uses Server-Sent Events (SSE) with a custom protocol:

### Text Chunks
```
data: 0:"text content"
```

### Structured Data
```
data: {"type":"status-update","status":"Creating document..."}
data: {"type":"tool-result","content":{"toolName":"createDocument","toolOutput":"Document created"}}
data: {"type":"error","error":"Tool execution failed"}
data: {"type":"completion","status":"complete"}
```

### Message Annotations
```
data: {"type":"message_annotations","annotations":{"id":"msg-123","createdAt":"2024-12-20T10:00:00Z"}}
```

## Context Management

The Brain API automatically manages conversation context through:

### Entity Extraction
Automatically extracts and tracks entities like:
- Addresses
- Phone numbers
- Email addresses
- Dates and times
- Names and organizations

### Context Window Building
Constructs context from:
- Recent conversation history (configurable limit)
- Extracted entities grouped by type
- Conversation summaries for long chats
- Referenced files and documents
- Client Google Drive integration status

### Background Processing
- Entity extraction runs asynchronously
- Context summarization for conversations >20 messages
- File metadata storage and indexing

## Tool Integration

### Dynamic Tool Selection
Tools are selected based on:
- Active specialist context
- Client configuration
- Tool availability and permissions

### Available Tool Categories
- **Document Tools**: Create, update, search documents
- **Calendar Tools**: Google Calendar integration via n8n
- **Search Tools**: Tavily web search, internal knowledge base
- **File Tools**: Google Drive integration, file processing
- **Asana Tools**: Task and project management

### Tool Configuration
Client-specific tool configurations override defaults:
```typescript
// Example client tool config
{
  "tool_configs": {
    "n8n": {
      "webhookUrl": "client-specific-url",
      "apiKey": "client-specific-key"
    },
    "asana": {
      "apiKey": "client-asana-key",
      "defaultWorkspaceGid": "workspace-id"
    }
  }
}
```

## Related Endpoints

- [`POST /api/files/upload`](./files-upload.md) - File upload endpoint
- [`POST /api/files/extract`](./files-extract.md) - File extraction endpoint
- [`GET /api/chat/{id}/messages`](./chat-messages.md) - Chat history retrieval

## Notes

### Performance Considerations
- Context window size affects processing time
- Tool execution can add latency
- Streaming provides immediate feedback during processing

### Version History
- v2.1.0: Added comprehensive context management
- v2.0.0: Added client-aware configuration system
- v1.x: Basic chat functionality with tools

### Deprecation Warnings
- Legacy n8n orchestration patterns are deprecated
- Direct tool integration preferred over n8n where possible

---

**Last Updated**: 2024-12-20  
**Maintained by**: Quibit Development Team 