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
  - [ ] `getFileContents(file_id: string) → Promise<{ text: string }>`
  - [ ] `searchRAG(query: string, topK?: number) → Promise<{ results: Array<{ id: string, score: number, snippet: string }> }>`
  - [ ] `queryRows(spreadsheetId: string, sql: string) → Promise<{ rows: any[] }>`
  - [ ] `searchWeb(query: string) → Promise<{ results: Array<{ title: string, link: string, snippet: string }> }>`
  - [ ] Google Calendar tools (`searchEvents`, `createEvent`, etc.)
- [x] Implement tool logic in `/lib/ai/tools/`
  - [x] Google Drive tools (`listDocumentsLogic`)
  - [ ] Google Drive tools (`getFileContentsLogic`)
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
- [ ] Create `/app/api/brain/route.ts` API endpoint
- [ ] Implement model agnostic `initializeLLM` function (GPT-4.1 and GPT-4.1-mini support)
- [ ] Define system prompts for different Bits
- [ ] Implement history formatting utilities
- [ ] Create Agent setup with `createOpenAIToolsAgent`
- [ ] Set up `AgentExecutor` with proper configuration
- [ ] Add error handling and detailed logging
- [ ] Test API endpoint with single tool
- [ ] Support file attachment handling and processing
- [ ] Implement streaming responses

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
- [ ] Modify Bit components to call `/api/brain`
- [ ] Pass required parameters (`bitId`, `message`, `context`, `history`)
- [ ] Implement response handling with streaming support
- [ ] Update UI to display agent responses
- [ ] Handle structured data responses
- [ ] Test end-to-end with simple workflow
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
- [ ] Implement structured logging
  - [ ] Add logging to API route
  - [ ] Add logging to tool functions
  - [ ] Track tool execution and performance
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
- [ ] Establish code organization standards
- [ ] Set up Git workflow
- [ ] Configure linting and formatting
- [ ] Document development processes
- [ ] Create contribution guidelines
- [ ] Write technical documentation for tools and integrations
- [ ] Create system architecture diagrams
- [ ] Document API endpoints and schemas

## Current Focus (v3.0.0)
- [ ] Create GitHub repository tag for v3.0.0
- [ ] Set up Langchain packages
- [ ] Implement first tool function and wrapper
- [ ] Create basic Brain API endpoint
- [ ] Test direct API calls
- [ ] Wire up front-end integration for one Bit
- [ ] Document migration from n8n to direct API integration 