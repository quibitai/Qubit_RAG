# Quibit RAG System Architecture (v1.7.9)

This document describes the architecture of the Quibit RAG system as of v1.7.9, reflecting its modular, streaming, and multi-tenant design.

## System Overview

Quibit RAG is a modular Retrieval-Augmented Generation (RAG) platform built on Next.js, LangChain, and a robust tool registry. The system is designed for scalability, maintainability, and extensibility, supporting multi-tenant deployments and real-time streaming.

### High-Level Data Flow

```
[ Frontend (Bits, Editor, Chat) ]
    │
    ▼
/api/brain (Brain API, SSE streaming)
    │
    ▼
[ Brain Orchestrator (LangChain Agent) ]
    │
    ├─▶ [Tool Registry: Modular Tools]
    │      ├─ getFileContentsTool (Google Drive, Supabase)
    │      ├─ searchInternalKnowledgeBase (Supabase Vector DB)
    │      ├─ tavilySearch (Web Search)
    │      ├─ googleCalendar (n8n MCP)
    │      ├─ queryDocumentRows (Supabase)
    │      ├─ createDocument, updateDocument
    │      └─ ...more
    │
    └─▶ [Prompt System: Orchestrator & Specialists]

[ File Upload ]
    │
    ├─▶ /api/files/upload (Vercel Blob)
    └─▶ /api/files/extract (n8n for extraction)
```

## Core Components

### 1. Brain API Endpoint (`/app/api/brain/route.ts`)
- Central orchestration layer for all AI and tool interactions
- Handles authentication, permissions, and multi-tenancy
- Initializes LangChain agent with dynamic toolset and prompt
- Manages conversation history, context, and streaming SSE responses
- Supports file attachments and Bit/persona context

### 2. Tool Registry (`/lib/ai/tools/`)
- Modular, self-contained tool implementations
- Direct API integrations (Google Drive, Supabase, Tavily, n8n, etc.)
- Unified error handling and logging
- Dynamic tool selection based on Bit/persona context and permissions

### 3. Prompt System (`/lib/ai/prompts/`)
- Modular prompt loader, orchestrator, and specialist personas
- Dynamic prompt composition based on context, client config, and toolset
- Tool usage notes and persona-specific instructions
- See [`docs/PROMPT_SYSTEM.md`](./docs/PROMPT_SYSTEM.md) for details

### 4. Streaming & Real-Time Updates
- SSE streaming from Brain API to frontend for chat and document updates
- Real-time document editor sync and chat streaming
- Custom event types for navigation, file upload, and document deltas

### 5. Multi-Tenancy & Permissions
- NextAuth-based authentication
- Row-level security (RLS) in Supabase/Postgres
- Client-aware prompt, tool, and data access

### 6. Data Layer
- PostgreSQL (Supabase) for structured and vector data
- Vercel Blob for file storage
- n8n for file extraction and MCP integrations (where direct API is not used)

## Directory Structure

```
/app
  /api
    /brain/route.ts         # Main Brain API endpoint
    /files/upload/route.ts  # File upload (Vercel Blob)
    /files/extract/route.ts # File extraction (n8n)
/lib
  /ai
    /tools/                 # Modular tool implementations
    /prompts/               # Prompt system (core, specialists, tools)
    /models.ts              # Model selection logic
  /db/
    schema.ts               # Database schema (Supabase/Postgres)
/components/                # UI components (Bits, Editor, Chat)
```

## Authentication & Security
- All API endpoints require authentication via NextAuth
- Permissions enforced at API and DB level
- Tool access and prompt composition are client-aware

## Performance & Best Practices
- SSE streaming for responsiveness
- Caching and parallel tool execution where possible
- Robust error handling and logging
- Modular codebase, <200 lines per file, clear docstrings

## Deprecated/Legacy
- n8n is now only used for file extraction and some MCP integrations
- All other orchestration is handled by the Brain API and modular tools
- Legacy n8n workflow documentation is retained for reference only 