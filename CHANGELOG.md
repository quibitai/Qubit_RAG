# Changelog

All notable changes to Quibit RAG will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2024-12-23

### Added
- **Comprehensive Documentation Overhaul**
  - Created `DOCUMENTATION_STYLE_GUIDE.md` with standardized formatting, structure, and maintenance procedures
  - Added `DOCUMENTATION_AUDIT_REPORT.md` with systematic audit results and recommendations
  - New `docs/` directory structure with organized sections (api, architecture, guides, configuration, planning, troubleshooting)
  - Template system with `docs/templates/` for consistent documentation creation
  - Comprehensive API documentation with detailed endpoint schemas and examples
  
- **Enhanced Documentation Structure**
  - `docs/README.md` as central navigation hub with categorized links
  - `docs/api/brain-endpoint.md` with complete API documentation including streaming protocols
  - `docs/planning/` directory for strategic planning documents
  - `docs/configuration-json-guide.md` for multi-tenant setup guidance
  - `docs/prompt-architecture-guide.md` for system customization

- **Project Organization Improvements**
  - Archived legacy files and debug scripts to `archive/` directory
  - Cleaned root directory of temporary files, duplicates, and system artifacts
  - Proper file naming conventions and organized structure
  - Enhanced project identity with consistent "Quibit RAG" branding

- **Enhanced Context Management**
  - New context management tables in database schema
  - Advanced context-aware conversation handling
  - Improved database migration system with proper versioning

- **Asana Tool Enhancements**
  - Enhanced entity extraction with better task and project identification
  - Improved GID utility functions for Asana API integration
  - Better error handling and response formatting
  - Enhanced search capabilities for tasks and projects

### Changed
- **Documentation Standards**: All documentation now follows consistent formatting, cross-referencing, and maintenance standards
- **File Organization**: Moved planning documents to proper directories with clean filenames
- **Version Control**: Removed duplicate configuration files (kept TypeScript versions)
- **Project Structure**: Eliminated 584KB+ of unnecessary files and debug artifacts
- **Navigation**: Updated all internal documentation links to reflect new organization

### Fixed
- **Configuration Conflicts**: Removed duplicate `next.config.js` in favor of TypeScript version
- **Documentation Links**: Fixed broken cross-references and updated navigation paths
- **Project Identity**: Updated package name from "ai-chatbot" to "quibit-rag"
- **File Cleanup**: Removed system files (`.DS_Store`), build cache (`tsconfig.tsbuildinfo`), and temporary files

### Removed
- Legacy debug scripts and temporary development files
- Duplicate configuration files and backup files
- Outdated documentation scattered in root directory
- Empty log files and system artifacts
- Test directories with outdated dependencies (18MB+ cleanup)

### Documentation
- **Quality Assurance**: Established documentation review processes and maintenance schedules
- **Accessibility**: Improved navigation with clear categorization and quick links
- **Completeness**: Added missing API documentation and configuration guides
- **Consistency**: Standardized formatting across all documentation files

### Infrastructure
- **Build Optimization**: Cleaned build artifacts and improved development workflow
- **Repository Health**: Improved git history with proper organization and cleanup
- **Development Experience**: Enhanced project structure for easier navigation and maintenance

## [2.1.1] - 2024-03-27

### Added
- Comprehensive Asana testing infrastructure
  - New test suite for Asana API client operations
  - Unit tests for task creation, project listing, and task listing
  - Mock data and test utilities for Asana API testing
- Enhanced Asana tool documentation
  - Added TESTING.md with detailed testing guidelines
  - Improved API client operation documentation
  - Better error handling and type safety

### Changed
- Refactored Asana API client operations for better modularity
- Updated Asana tool configuration for improved reliability
- Enhanced error handling in Asana operations

### Fixed
- Improved type safety in Asana API client
- Enhanced error handling for API rate limits
- Fixed task creation validation

## [2.0.0] - 2024-07-23

### Added
- **Client-Aware Configuration System:** Prompts, tool access, and specialist personas are dynamically tailored per client using a unified configuration schema. See [Prompt Architecture and Configuration Guide](./Prompt%20Architecture%20and%20Configuration%20Guide.md).
- **General Chat Specialist:** The "General Chat" context now uses a dedicated, client-contextualized specialist prompt, not the Orchestrator prompt.
- **Unified Specialist Registry:** All specialists (including General Chat) are registered and managed centrally, ensuring no duplicates in the UI.
- **Comprehensive Test Suite:** New unit and integration tests validate prompt generation, tool configuration, and client context injection. See [tests/prompts/README.md](./tests/prompts/README.md).

### Changed
- Refactored prompt system to use a hierarchical, client-driven configuration (see new guide)
- Updated all documentation to reflect v2.0.0 architecture and best practices
- Marked previous prompt system documentation as legacy
- Updated version numbers and badges

### Fixed
- Cleaned up outdated documentation and removed references to deprecated features
- Fixed duplicate "General Chat" entries in the specialist dropdown

### Stability
- **Stable, Clean Baseline:** This version is a stable, working baseline for further development (e.g., artifact streaming). Tag and revert to this version as needed.

## [1.8.0] - 2024-07-23

### Added
- 

### Changed
- 

### Fixed
- 

## [1.7.9] - 2024-07-23

### Added
- 

### Changed
- 

### Fixed
- 

## [1.7.5] - 2024-07-22

### Removed
- Removed "Clean Up" debugging button from the chat header
- Eliminated unused cleanupEmptyMessages function from actions.ts

### Fixed
- Improved context-awareness between Global Orchestrator and Echo Tango Bit conversations
- Fixed message reference handling between different chat contexts
- Eliminated duplicate message persistence in database

## [1.7.4] - 2024-07-21

### Added
- Enhanced global chat context tracking for specialist Bits (e.g., Echo Tango)
- Improved message deduplication, cleaning, and formatting for specialist responses
- Chronological sorting and clear identification of the most recent message
- Updated orchestrator prompts and tool usage for better specialist context handling

### Fixed
- Resolved issues with garbled or repeated content in specialist messages
- Fixed retrieval of the correct "most recent" message in global chat queries

## [1.7.3] - 2024-07-21

### Fixed
- Resolved issue with user messages not being saved in the database
- Fixed UUID handling to ensure valid format for PostgreSQL
- Enhanced validation for message IDs in GlobalChatPane and main chat
- Added robust UUID generation and validation in the brain API
- Improved error handling for invalid UUIDs with fallback generation
- Ensured proper clientId inclusion for all messages

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

## [1.7.4] - 2024-07-21

### Added
- Enhanced global chat context tracking for specialist Bits (e.g., Echo Tango)
- Improved message deduplication, cleaning, and formatting for specialist responses
- Chronological sorting and clear identification of the most recent message
- Updated orchestrator prompts and tool usage for better specialist context handling

### Fixed
- Resolved issues with garbled or repeated content in specialist messages
- Fixed retrieval of the correct "most recent" message in global chat queries 

## [2.1.0] - 2024-03-26

### Added
- New native Asana tool implementation (`lib/ai/tools/asanaTool.ts`)
- Direct Asana API integration scripts
  - `scripts/direct-asana-fetch.js`
  - `scripts/test-asana-tool.js`
  - `scripts/test-direct-asana.js`
  - `debug-asana-direct.sh`

### Changed
- Updated Asana integration to begin migration to native tool
- Enhanced tool configuration system in `lib/ai/tools/index.ts`
- Improved specialist prompts for better tool usage
- Updated n8nMcpGateway tool configuration

### Notes
- Beginning migration of Asana integration from n8n to native tool implementation
- This version includes both the legacy n8n integration and the new native implementation for testing
- Future versions will complete the migration to the native Asana tool 