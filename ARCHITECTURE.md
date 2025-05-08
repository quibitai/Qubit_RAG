# RAG System Architecture (v3.0.0)

This document outlines the architecture for the Langchain-based RAG system that will replace the current n8n workflow implementation.

## System Overview

The new architecture centralizes the AI orchestration within a Brain micro-service that directly integrates with various APIs rather than relying on n8n workflows. This provides greater control, better performance, and simplified deployment.

```
[ Front‑end Bits ]  ──>  /api/brain  ──>  [ Brain Orchestrator (Langchain Agent) ]
                                          │
                                          ├─▶ tool:getFileContents  ──▶ (lib/tools/googleDrive.ts) ──▶ Google Drive API
                                          ├─▶ tool:searchRAG         ──▶ (lib/tools/supabaseRAG.ts) ──▶ Supabase/Postgres Vector DB
                                          ├─▶ tool:queryRows         ──▶ (lib/tools/supabaseQuery.ts)──▶ Supabase/Postgres
                                          ├─▶ tool:listDocuments     ──▶ (lib/tools/googleDrive.ts) ──▶ Google Drive API
                                          ├─▶ tool:searchWeb         ──▶ (lib/tools/serpapi.ts)      ──▶ SerpAPI
                                          ├─▶ tool:googleCalendar    ──▶ (lib/tools/googleCalendar.ts)─▶ Google Calendar API
                                          └─▶ ...other tools...
```

## Core Components

### 1. Brain API Endpoint (`/app/api/brain/route.ts`)
- Central orchestration layer
- Handles authentication and permissions
- Initializes the LLM with appropriate model
- Creates and executes the Langchain agent
- Manages conversation history and context
- Supports file attachments and streaming responses

### 2. Tool Registry (`/lib/ai/tools/`)
- Modular implementation of tool functions
- Direct API integrations instead of n8n workflows
- Unified error handling and logging
- Dynamic tool selection based on Bit context

### 3. Prompt System (`/lib/ai/prompts/`)
The AI prompt system is modular, located in `lib/ai/prompts/`. It distinguishes between a central Orchestrator and various Specialist personas. A `PromptLoader` service dynamically composes system prompts based on the current context (Orchestrator, specific Specialist, or Default Assistant), incorporating base instructions, persona-specific details, and relevant tool usage guidelines. This design allows for clear separation of concerns and easier management of AI behaviors. For detailed information, see [`docs/PROMPT_SYSTEM.md`](./docs/PROMPT_SYSTEM.md).

The key components include:
- **Core prompts**: Base templates and the Orchestrator persona
- **Specialists**: Configurable specialist personas with dedicated prompts and tool sets
- **Tool instructions**: Concise usage guidelines for various tool categories
- **Prompt loader**: Dynamic prompt composition based on context

### 4. Front-end Integration
- Bit components call the Brain API
- Handles streaming responses and file uploads
- Displays structured data and citations

## Migration Path from n8n Workflows

### Current n8n Workflow Structure
1. **Internal Knowledge Base Search Tool**: n8n workflow for semantic search using PostgreSQL vector database
2. **Web Search Tool**: n8n workflow using SerpAPI
3. **Document Management Tools**: n8n workflows for listing and retrieving documents
4. **Google Drive Integration**: n8n workflow for monitoring and processing files
5. **Google Calendar Integration**: n8n workflow for calendar operations
6. **File Extraction Service**: n8n workflow for processing uploaded files

### Migration Strategy
1. **Parallel Implementation**: Build the Langchain tools alongside existing n8n workflows
2. **Gradual Transition**: Test each tool individually before switching the front-end to use it
3. **Validation**: Compare results between n8n and direct implementation to ensure consistency
4. **Feature Parity**: Ensure all existing capabilities are maintained or enhanced

### Implementation Priority
1. First tool: Document listing (simplest to implement)
2. Second tool: RAG search (core functionality)
3. Third tool: File content retrieval (dependency for other features)
4. Remaining tools in order of complexity and dependency

## Directory Structure

```
/app
  /api
    /brain
      /route.ts             # Main brain API endpoint
    /chat                   # Legacy chat API (to be deprecated)
/lib
  /ai
    /tools                  # Tool implementations
      /googleDrive.ts       # Google Drive tools
      /supabaseRAG.ts       # Vector search tools
      /supabaseQuery.ts     # SQL query tools
      /serpapi.ts           # Web search tools
      /googleCalendar.ts    # Calendar tools
      /index.ts             # Tool registry and exports
    /prompts                # Modular prompt system
      /core                 # Base prompts and orchestrator
      /specialists          # Specialist personas
      /tools                # Tool-specific instructions
      /loader.ts            # Dynamic prompt composition
    /models.ts              # LLM initialization logic
  /db                       # Database utilities
/components                 # UI components
```

## Authentication and Permissions

The Brain API will handle authentication and permission checks before processing requests:

1. Verify user session using NextAuth
2. Check if the user has permission to access the requested Bit
3. Determine which tools should be available based on user permissions
4. Enforce security boundaries during tool execution

## Performance Considerations

1. **Streaming Responses**: Implement streaming to improve perceived responsiveness
2. **Caching**: Cache frequently used data (e.g., document listings)
3. **Parallel Execution**: Allow multiple tools to execute concurrently when possible
4. **Error Handling**: Robust error recovery to prevent complete request failure

## Migration Checklist

- [ ] Set up Langchain packages and dependencies
- [ ] Create the Brain API route skeleton
- [ ] Implement the first tool (document listing)
- [ ] Test direct API calls
- [ ] Update front-end to call Brain API
- [ ] Add remaining tools one by one
- [ ] Implement streaming responses
- [ ] Add file attachment support
- [ ] Deprecate legacy endpoints 