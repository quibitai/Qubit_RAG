# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [1.2.0] - 2024-01-01

### Added
- Custom business queries
- Advanced document filtering
- Improved UI/UX with dark mode support

### Changed
- Enhanced documentation
- Code cleanup and organization
- Upgraded dependencies

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