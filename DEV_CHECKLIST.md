# RAG System Development Checklist

This checklist tracks our progress implementing the Langchain-focused RAG system as outlined in the Development Roadmap.

## Phase 0: Architectural Blueprint (Langchain Integration)
- [x] Design Brain orchestrator architecture
- [x] Define API routes structure
- [x] Map tool functions required for system
- [x] Document architecture diagram
- [x] Create migration plan from n8n workflows to direct API integration

## Phase 1: Define Tool Registry & Langchain Schemas
- [x] Install required Langchain packages
  - [x] `@langchain/core`
  - [x] `@langchain/openai` (or chosen model provider)
  - [x] `langchain`
  - [x] `zod`
- [x] Document all required tool functions with precise TypeScript interfaces
  - [x] `listDocuments(folderId: string) → Promise<{ documents: Array<{ id: string, name: string }> }>`
  - [x] `getFileContents(file_id: string) → Promise<{ text: string }>`
  - [ ] `searchRAG(query: string, topK?: number) → Promise<{ results: Array<{ id: string, score: number, snippet: string }> }>`
  - [ ] `queryRows(spreadsheetId: string, sql: string) → Promise<{ rows: any[] }>`
  - [ ] `searchWeb(query: string) → Promise<{ results: Array<{ title: string, link: string, snippet: string }> }>`
  - [ ] Google Calendar tools (`searchEvents`, `createEvent`, etc.)
- [x] Implement tool logic in `/lib/ai/tools/`
  - [x] Google Drive tools (`listDocumentsLogic`)
  - [x] Google Drive tools (`getFileContentsLogic`)
  - [ ] Supabase RAG tools (vector search integration)
  - [ ] Supabase query tools (SQL execution)
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
- [x] Implement model agnostic `initializeLLM` function (GPT-4.1 and GPT-4.1-mini support)
- [x] Define system prompts for different Bits
- [x] Implement history formatting utilities
- [x] Create Agent setup with `createOpenAIToolsAgent`
- [x] Set up `AgentExecutor` with proper configuration
- [x] Add error handling and detailed logging
- [x] Test API endpoint with single tool
- [ ] Support file attachment handling and processing
- [x] Implement streaming responses

## Phase 3: Secure Application
- [ ] Set up environment variables for all API keys
  - [ ] OpenAI/Anthropic keys
  - [ ] Google Cloud credentials
  - [ ] Supabase credentials
  - [ ] SerpAPI keys (replacing Tavily)
  - [ ] Vercel Blob storage token
- [ ] Implement input validation for API routes
- [ ] Sanitize inputs to prevent injection attacks
- [ ] Secure database credentials
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
- [ ] Set up self-hosted database with vector extensions
- [ ] Configure LLM provider for self-hosting
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
  - [ ] File processing metrics
- [ ] Configure autoscaling (if self-hosted)
- [ ] Create monitoring dashboards
- [ ] Set up alerting for critical failures

## Phase 8: Testing & Validation
- [ ] Write unit tests for tool functions
- [ ] Create integration tests for API endpoint
- [ ] Implement E2E tests with Playwright
- [ ] Set up CI for automated testing
- [ ] Document test coverage
- [ ] Create test fixtures for file processing
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
- [x] Implement first tool function and wrapper
- [x] Create basic Brain API endpoint
- [x] Test direct API calls
- [x] Wire up front-end integration for one Bit
- [x] Document migration from n8n to direct API integration
- [x] Fix streaming response compatibility with useChat hook 