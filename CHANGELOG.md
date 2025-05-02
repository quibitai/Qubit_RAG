# Changelog

All notable changes to Quibit RAG will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2024-07-15

### Added
- New "+" button in Global Chat Pane for starting fresh conversations
- Comprehensive debugging tools for document editor component
- Debug documentation in docs/document-editor-issues.md and docs/debugging.md
- Test APIs for document streaming and connectivity verification
- Debug panel accessible via ?debug=true query parameter

### Changed
- Improved chat experience with fixed sidebar history and duplicate message prevention
- Reduced toast notifications to focus only on errors for cleaner UX
- Enhanced document editor with better synchronization and stability
- Fixed navigation between different chat contexts
- Optimized cache invalidation in the chat and document systems
- Better hydration error handling for React components

### Fixed
- Fixed issue where clicking on orchestrator in main chat did nothing
- Resolved React hydration errors related to browser extensions
- Fixed duplicate toast messages when deleting document histories
- Resolved issue with new chats not being saved to sidebar history
- Fixed duplicate messages in the global chat pane
- Enhanced cache invalidation for better state management

## [1.2.0] - 2024-06-01

### Added
- Enhanced fallback extraction for file processing when primary extraction fails
- Special handling for Microsoft Office documents (DOCX, XLSX, PPTX) leveraging GPT-4's native capabilities
- Smart detection of file types with format-specific processing strategies
- Integration of LLM-based fallback content processing for unsupported file formats
- System instruction improvements for better file context handling

### Changed
- Updated the file extraction API to detect and handle Microsoft Office formats directly
- Modified the brain API to process file context more intelligently
- Improved user-facing messaging for file processing errors
- Enhanced logging for file extraction process
- Eliminated unnecessary external tool calls for supported document types

### Fixed
- Resolved issues with file context not being properly utilized in LLM prompts
- Fixed Microsoft Office document handling in the chat interface
- Improved error handling for extraction service failures
- Enhanced fallback mechanism with clearer instructions to the LLM

## [3.1.0] - 2024-12-20

### Added
- Implemented dynamic model selection based on Bit ID with fallback mechanism
- Added comprehensive test script for model selection logic (test-model-selection.js)
- Enhanced environment variable support for default model configuration

### Changed
- Updated model mapping to use gpt-4.1-mini for Echo Tango Bit and Orchestrator
- Improved TypeScript type safety throughout the codebase

### Fixed
- Resolved linter errors in components/chat.tsx
- Fixed optional chaining in onResponse event handler
- Enhanced error handling in API routes

## [1.5.0] - 2024-05-21

### Added
- New Google Calendar integration via n8n for creating, searching, updating, and deleting events
- Enhanced environment configuration for Google Calendar webhook
- Import and export of the googleCalendar tool in the API route

### Changed
- Updated system prompts to include Google Calendar tool usage instructions
- Updated .env.example with Google Calendar configuration variables

## [1.4.0] - 2024-02-04

### Added
- New Tavily web search workflow integration
- Enhanced system prompt with better guidance for search result handling
- Improved tool chaining with search-before-creation pattern

### Changed
- Refactored searchInternalKnowledgeBase tool into a separate module
- Simplified tavilySearch tool to work with n8n direct summarization
- Updated N8N workflow documentation with Tavily search details

### Fixed
- Resolved linter issues with type imports and template literals
- Fixed tool selection logic to prioritize search before document creation
- Improved error handling in search tools

## [1.3.0] - 2024-01-15

### Added
- SQL-like queries for spreadsheet data
- Improved document parsing and content extraction
- Enhanced error handling for N8N workflows

### Changed
- Upgraded to Next.js 15
- Improved UI/UX with better loading states and error messages
- Enhanced logging for debugging

## [1.0.0] - 2023-11-19

### Added
- Initial release of Quibit RAG
- Google Drive integration for document retrieval
- LangChain.js integration for agent and tool capabilities
- Vercel AI SDK integration for streaming responses
- Supabase vector database for document embedding storage
- Modern React/Next.js UI with real-time streaming responses
- Support for conversation history and context-aware responses
- Multiple AI tools including document search, weather info, and web search
- Comprehensive error handling and logging system

### Fixed
- Critical message content handling issue in LangChain integration
- Tool message serialization for nested content structures
- Stringification of complex objects returned by tools
- Multiple layers of content sanitization in the message processing pipeline
- Error handling for "message.content.map is not a function" issue

### Documentation
- Comprehensive README with setup instructions
- Detailed message handling documentation
- Architecture overview
- Tool integration documentation

## [1.1.0] - 2023-12-15

### Added
- RAG capabilities
- N8N workflow integration
- Authentication with Next-Auth

### Changed
- Improved chat interface
- Enhanced error handling
- Better mobile responsiveness

## [1.0.0] - 2023-12-01

### Added
- Initial release
- Basic chat functionality
- Simple UI 