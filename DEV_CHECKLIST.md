# RAG System Development Checklist

This checklist tracks our progress implementing the Langchain-focused RAG system with Supabase integration as outlined in the revised Development Roadmap.

## Phase 0: Architectural Blueprint (Langchain Integration)
- [x] Design Brain orchestrator architecture
- [x] Define API routes structure
- [x] Map tool functions required for system
- [x] Document architecture diagram
- [x] Create migration plan from n8n workflows to direct API integration

## Phase 1: Define Tool Registry & Langchain Schemas (Supabase Focus)
- [x] Install required Langchain packages
  - [x] `@langchain/core`
  - [x] `@langchain/openai` (or chosen model provider)
  - [x] `langchain`
  - [x] `zod`
  - [ ] `@supabase/supabase-js`
- [x] Document all required tool functions with precise TypeScript interfaces
  - [x] `listDocuments() → Promise<{ documents: Array<{ file_id: string, file_title: string }> }>` 
  - [x] `getFileContents(file_id: string) → Promise<{ text: string }>`
  - [ ] `searchRAG(query: string, topK?: number, match_threshold?: number) → Promise<{ results: Array<{ id: string, similarity: number, content: string, source: string, title: string }> }>`
  - [ ] `queryRows(dataset_id: string) → Promise<{ rows: any[] }>`
  - [ ] `searchWeb(query: string) → Promise<{ results: Array<{ title: string, link: string, snippet: string }> }>`
  - [ ] Google Calendar tools (`searchEvents`, `createEvent`, etc.)
- [x] Implement tool logic in `/lib/ai/tools/`
  - [x] Google Drive tools for prototyping (`listDocumentsLogic`, `getFileContentsLogic`)
  - [ ] Supabase tools (`listDocumentsFromSupabase`, `getFileContentsFromSupabase`)
  - [ ] Supabase RAG tools (vector search integration via `match_documents`)
  - [ ] Supabase query tools (SQL execution on document_rows)
  - [ ] Web search tools (SerpAPI integration replacing Tavily)
  - [ ] Google Calendar tools (using `googleapis` calendar)
  - [ ] File extraction service (handling PDF, XLSX, CSV files)
- [x] Create Langchain tool wrappers with Zod schemas
  - [x] Define tool schemas with proper validation
  - [x] Implement proper error handling and logging
  - [x] Create utility for dynamically selecting tools based on bitId
  - [ ] Add context-aware tool selection

## Phase 2: Build the Brain Micro-service
- [x] Create `/app/api/brain/route.ts` API endpoint
- [x] Implement model selection logic (`gpt-4.1` for Brain, `gpt-4.1-mini` for Bits)
- [x] Define system prompts for different Bits
- [x] Implement history formatting utilities
- [x] Create Agent setup with `createOpenAIToolsAgent`
- [x] Set up `AgentExecutor` with proper configuration
- [x] Add error handling and detailed logging
- [x] Test API endpoint with single tool
- [ ] Support file attachment handling and processing
- [x] Implement streaming responses
- [ ] Ensure all runtime tools use Supabase (not Google Drive directly)

## Phase 3: Secure Application
- [ ] Set up environment variables for all API keys
  - [ ] OpenAI/Anthropic keys
  - [ ] Supabase URL and API keys (Anon and Service Role)
  - [ ] SerpAPI keys (replacing Tavily)
  - [ ] Google Calendar API credentials
  - [ ] Vercel Blob storage token (if needed)
- [ ] Implement input validation for API routes
- [ ] Sanitize inputs to prevent injection attacks
- [ ] Configure Row Level Security (RLS) in Supabase 
- [ ] Audit tool implementations for security issues
- [ ] Set up secure file handling

## Phase 4: Front-end Integration
- [x] Modify Bit components to call `/api/brain`
- [x] Pass required parameters (`bitId`, `message`, `context`, `history`)
- [x] Implement response handling with streaming support
- [x] Update UI to display agent responses
- [ ] Handle structured data responses
- [x] Test end-to-end with simple workflow
- [ ] Integrate file upload and attachment functionality
- [ ] Add drag-and-drop support for file uploads
- [ ] Display source citations in UI

## Phase 5: Department & Bit Permissions
- [ ] Implement session verification with NextAuth
- [ ] Create permission mapping system
- [ ] Build `getUserPermissions` function
- [ ] Add authorization checks to API route
- [ ] Add proper error responses for unauthorized access
- [ ] Test permission controls with different user roles
- [ ] Implement tool-based permissions

## Phase 6: Self-Hosting Path
- [ ] Containerize Next.js application
  - [ ] Create Dockerfile
  - [ ] Define Docker Compose setup
- [ ] Set up self-hosted Supabase/Postgres with vector extensions
- [ ] Configure self-hosted LLM provider (Ollama) if desired
- [ ] Document deployment process
- [ ] Implement CI/CD pipeline
- [ ] Create environment-specific configuration

## Phase 7: Observability & Scaling
- [x] Implement structured logging
  - [x] Add logging to API route
  - [ ] Add logging to tool functions
  - [x] Track tool execution and performance
- [ ] Set up metrics collection
  - [ ] Request rates and latency
  - [ ] Error rates
  - [ ] Tool execution duration
  - [ ] LLM token usage
  - [ ] Supabase query performance
- [ ] Configure autoscaling (if self-hosted)
- [ ] Create monitoring dashboards
- [ ] Set up alerting for critical failures

## Phase 8: Testing & Validation
- [ ] Write unit tests for tool functions
  - [ ] Mock Supabase client calls for testing
  - [ ] Test tool logic independent of Supabase
- [ ] Create integration tests for API endpoint
- [ ] Implement E2E tests with Playwright
- [ ] Set up CI for automated testing
- [ ] Document test coverage
- [ ] Create test fixtures for Supabase data
- [ ] Test vector search accuracy

## Phase 9: Developer Workflow & Documentation
- [x] Establish code organization standards
- [x] Set up Git workflow
- [x] Configure linting and formatting
- [ ] Document development processes
- [ ] Create contribution guidelines
- [ ] Write technical documentation for tools and integrations
- [ ] Create system architecture diagrams
- [x] Document API endpoints and schemas

## Current Focus (v3.0.1)
- [x] Create GitHub repository tag for v3.0.1
- [x] Set up Langchain packages
- [x] Configure model mapping for `gpt-4.1` and `gpt-4.1-mini`
- [x] Implement updated Brain API with proper model selection
- [ ] Migrate from Google Drive tools to Supabase tools
- [ ] Implement Supabase vector search integration
- [ ] Test end-to-end with Supabase-based tools
- [ ] Document Supabase schema and integration details 