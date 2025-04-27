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
  - [x] `@supabase/supabase-js`
  - [x] `@langchain/community` (for Tavily integration)
- [x] Document all required tool functions with precise TypeScript interfaces
  - [x] `listDocuments() → Promise<{ documents: Array<{ file_id: string, file_title: string }> }>` 
  - [x] `getFileContents(file_id: string) → Promise<{ text: string }>`
  - [x] `searchRAG(query: string, filter?: object, match_count?: number) → Promise<{ results: Array<{ id: string, similarity: number, content: string, source: string, title: string }> }>`
  - [x] `queryRows(dataset_id: string) → Promise<{ rows: any[] }>`
  - [x] `searchWeb(query: string) → Promise<{ results: Array<{ title: string, url: string, content: string }> }>`
  - [x] `extractWebContent(urls: string[]) → Promise<{ results: Array<{ url: string, content: string }>, failed_results: Array<{ url: string, error: string }> }>`
  - [x] Google Calendar tools (`searchEvents`, `createEvent`, etc.)
  - [x] `getWeather(latitude: number, longitude: number) -> Promise<object>`
  - [x] Artifact tools (`createDocument`, `updateDocument`, `requestSuggestions`)
- [x] Implement tool logic in `/lib/ai/tools/`
  - [x] Google Drive tools for prototyping (`listDocumentsLogic`, `getFileContentsLogic`)
  - [x] Supabase tools 
    - [x] `getFileContentsTool` (using RPC with fallback for fuzzy title matching)
    - [x] `listDocumentsTool` (using Supabase document_metadata table)
  - [x] Supabase RAG tools (vector search integration via `match_documents`)
    - [x] `searchInternalKnowledgeBase` using OpenAI embeddings and Supabase RPC
  - [x] Supabase query tools (implemented in query-document-rows.ts via n8n)
    - [x] Refactor to use direct Supabase connection
  - [x] Web search tools (Tavily search implementation via n8n)
    - [x] Migrate to direct Tavily API using `TavilySearchResults` from `@langchain/community`
  - [x] Web content extraction tools
    - [x] Implement `tavilyExtractTool` using Tavily's `/extract` endpoint
  - [x] Google Calendar tools (implemented in google-calendar.ts via n8n)
  - [x] Weather tools (implemented in get-weather.ts)
  - [x] Artifact tools (review/integration needed for Langchain agent)
    - [x] Implement `createDocumentTool` to return a string confirmation
    - [x] Implement `requestSuggestionsTool` integration
    - [x] Update `updateDocumentTool` to work with Brain API
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
- [x] Ensure all runtime tools use Supabase (not Google Drive directly)
  - [x] Migrate `getFileContentsTool` to use Supabase RPC directly
  - [x] Implement `searchInternalKnowledgeBase` using Supabase vector search
  - [x] Migrate `listDocumentsTool` to use Supabase
  - [x] Address artifact streaming issues
    - [x] Improve detection of `createDocument` tool calls in intermediateSteps
    - [x] Use `createDataStream` to properly stream artifact content
    - [x] Add extensive debugging logs for tool invocation
    - [x] Implement direct tool call detection using the extracted toolCalls array
    - [x] Add robust error handling for artifact stream creation
    - [x] Fix response type handling for proper content streaming
  - [ ] Implement artifact versioning and history
  - [ ] Add support for bulk document operations
  - [ ] Implement document deletion and archiving

## Phase 3: Secure Application
- [ ] Set up environment variables for all API keys
  - [x] OpenAI/Anthropic keys
  - [x] Supabase URL and API keys (Anon and Service Role)
  - [x] Tavily API key (for direct integration)
  - [x] N8N webhook credentials (for Google Calendar)
  - [ ] Vercel Blob storage token (if needed)
- [ ] Implement input validation for API routes
- [ ] Sanitize inputs to prevent injection attacks
  - [ ] Sanitize RAG queries
  - [ ] Sanitize row queries
  - [ ] Sanitize URLs passed to Extract tool
- [ ] Configure Row Level Security (RLS) in Supabase 
- [ ] Audit tool implementations for security issues
- [ ] Set up secure file handling

## Phase 4: Front-end Integration
- [x] Modify Bit components to call `/api/brain`
- [x] Pass required parameters (`bitId`, `message`, `context`, `history`)
- [x] Implement response handling with streaming support
- [x] Update UI to display agent responses
- [x] Handle structured data responses
  - [x] Implement debug data display for tool calls
  - [x] Support artifact stream visualization
  - [x] Handle nested content streams
- [x] Test end-to-end with simple workflow
- [ ] Integrate file upload and attachment functionality
- [ ] Add drag-and-drop support for file uploads
- [ ] Display source citations in UI
- [x] Update Artifact UI components to handle data streams correctly
  - [x] Support text artifacts with progressive rendering
  - [x] Support code artifacts with syntax highlighting
  - [x] Support image artifacts with proper display
  - [x] Add artifact feedback mechanisms (upvote/downvote)
  - [ ] Implement collaborative editing for artifacts

## Phase 5: Department & Bit Permissions
- [ ] Implement session verification with NextAuth
- [ ] Create permission mapping system
- [ ] Build `getUserPermissions` function
- [ ] Add authorization checks to API route
- [ ] Add proper error responses for unauthorized access
- [ ] Test permission controls with different user roles
- [ ] Implement tool-based permissions

## Phase 6: Code Cleanup & Refinement
- [x] Refactor `queryDocumentRows` to use direct Supabase connection
- [x] Refactor `tavilySearch` to use direct Tavily API
- [x] Implement `tavilyExtract` using direct Tavily API
- [ ] Remove unused n8n webhook logic after successful migration
- [ ] Consolidate API routes to address duplicate warnings
- [ ] Fix middleware issues
- [ ] Standardize error handling across tools
- [ ] Update documentation to reflect current architecture

## Phase 7: Observability & Scaling
- [x] Implement structured logging
  - [x] Add logging to API route
  - [x] Add logging to tool functions
    - [x] Detailed logging in `getFileContentsTool`
    - [x] Detailed logging in `searchInternalKnowledgeBase` 
    - [x] Detailed logging in `listDocumentsTool`
    - [x] Detailed logging in `queryRows` and other tools
  - [x] Track tool execution and performance
- [ ] Set up metrics collection
  - [ ] Request rates and latency
  - [ ] Error rates
  - [ ] Tool execution duration
  - [ ] LLM token usage
  - [ ] Supabase query performance
  - [ ] Tavily API performance
- [ ] Configure autoscaling (if self-hosted)
- [ ] Create monitoring dashboards
- [ ] Set up alerting for critical failures

## Phase 8: Testing & Validation
- [ ] Write unit tests for tool functions
  - [ ] Mock Supabase client calls for testing
  - [ ] Mock Tavily API calls for testing
  - [ ] Test tool logic independent of external APIs
- [ ] Create integration tests for API endpoint
- [ ] Implement E2E tests with Playwright
- [ ] Set up CI for automated testing
- [ ] Document test coverage
- [ ] Create test fixtures for Supabase data
- [ ] Test vector search accuracy
- [ ] Test artifact/weather tool invocation

## Phase 9: Developer Workflow & Documentation
- [x] Establish code organization standards
- [x] Set up Git workflow
- [x] Configure linting and formatting
- [ ] Document development processes
- [ ] Create contribution guidelines
- [ ] Write technical documentation for tools and integrations
- [ ] Create system architecture diagrams
- [x] Document API endpoints and schemas

## Phase 10: Self-Hosting Path (Future)
- [ ] Containerize Next.js application
  - [ ] Create Dockerfile
  - [ ] Define Docker Compose setup
- [ ] Set up self-hosted Supabase/Postgres with vector extensions
- [ ] Configure self-hosted LLM provider (Ollama) if desired
- [ ] Document deployment process
- [ ] Implement CI/CD pipeline
- [ ] Create environment-specific configuration
- [ ] Test deployment in containerized environment
- [ ] Document self-hosting guide

## Current Focus (v3.0.3)
- [x] Create GitHub repository tag for v3.0.2
- [x] Install Tavily dependency: `pnpm add @langchain/community`
- [x] Update `searchInternalKnowledgeBase` to handle filter parameter (replacing match_threshold)
- [x] Refactor `queryRows` tool to use direct Supabase connection
- [x] Refactor `searchWeb` tool to use direct Tavily API (`/search` endpoint)
- [x] Implement new `extractWebContent` tool using Tavily API (`/extract` endpoint)
- [x] Update Brain API to include refactored tools
  - [x] Add refactored `queryRowsTool`
  - [x] Add direct `tavilySearchTool`
  - [x] Add new `tavilyExtractTool`
  - [x] Verify model selection logic
  - [x] Investigate and implement fix for Artifact tool streaming
    - [x] Fix `createDocumentTool` to return a simple string output
    - [x] Update Brain API route to detect and handle tool calls properly
    - [x] Add comprehensive debug logging
    - [x] Implement more reliable toolCalls extraction and processing 
    - [x] Fix artifact streaming response handling
  - [x] Verify `getWeatherTool` integration
- [ ] Test end-to-end with Supabase tools and Tavily integration
- [x] Secure Tavily API key in environment variables
- [ ] Remove old n8n webhook logic after successful migration
- [ ] Address middleware/route warnings 

## Planned for v3.0.4
- [ ] Enhance artifact tools functionality
  - [ ] Improve error handling for artifact creation failures
  - [ ] Add progress indicators during document generation
  - [ ] Implement document versioning with comparison views
  - [ ] Add support for collaborative editing
  - [ ] Implement artifact search and filtering
- [ ] Optimize Brain API performance
  - [ ] Implement caching for frequently accessed data
  - [ ] Add request rate limiting
  - [ ] Optimize streaming response handling
- [ ] Enhance debugging capabilities
  - [ ] Add custom debug panel component
  - [ ] Create visual representation of tool execution flow
  - [ ] Implement detailed performance metrics for tool calls 