# Tools Documentation

> Comprehensive guide to all available AI tools in Quibit RAG

**Last Updated**: 2024-12-26  
**Version**: 2.5.0

## Overview

Quibit RAG includes a comprehensive suite of AI tools that enable the assistant to interact with external services, process files, search knowledge bases, and perform various productivity tasks. Each tool is designed to be modular, self-contained, and easily extensible.

## Available Tools

### 📋 **Asana Integration** (`asana`)
*Complete Phase 2 & Epic 3.1 implementation with 100% API coverage*

**Description**: Production-ready native Asana integration with full modular architecture, advanced natural language processing, intelligent caching, and comprehensive API coverage. All Phase 2 epics and Epic 3.1 features are fully implemented and tested.

**Phase 2 Completed Features**:
- **Epic 2.1**: Get User Info ✅ - Current user information and workspace details
- **Epic 2.2**: Task Creation ✅ - Comprehensive task creation with validation
- **Epic 2.3**: Project Listing & GID Resolution ✅ - Project discovery and identification
- **Epic 2.4**: Task Listing ✅ - Advanced task filtering and retrieval
- **Epic 2.5**: Task Details Retrieval ✅ - Complete task information access
- **Epic 2.6**: Task Updates ✅ - Full task modification capabilities
- **Epic 2.7**: Search Functionality ✅ - Advanced search across all resources
- **Epic 2.8**: Transition from Old Tool ✅ - Complete modular architecture migration

**Epic 3.1 Advanced Features**:
- **Story 3.1.1**: Complete/incomplete tasks ✅ - Task status management
- **Story 3.1.2**: Add/remove followers ✅ - Task collaboration management
- **Story 3.1.3**: Set due dates ✅ - Advanced date parsing and scheduling
- **Story 3.1.4**: Add subtasks ✅ - Hierarchical task management
- **Story 3.1.5**: List subtasks ✅ - Subtask discovery and organization
- **Story 3.1.6**: Task Dependencies ✅ - Complete dependency management system

**Core Capabilities**:
- **Task Management**: Create, update, list, complete/incomplete, get details, search, dependencies
- **Advanced Task Features**: Due dates, followers, subtasks, dependencies, status management
- **Project Management**: List, search, sections, task organization, visibility verification
- **User Operations**: Authentication, current user info, assignee resolution, workspace integration
- **Natural Language Processing**: Intent classification and entity extraction for complex operations
- **Context Management**: Task context memory for cross-session awareness
- **Performance**: Intelligent caching (TTL-based) and retry mechanisms with rate limiting
- **Reliability**: Exponential backoff retry with comprehensive error handling

**Environment Variables**:
```env
ASANA_PAT=your_asana_personal_access_token
ASANA_DEFAULT_WORKSPACE_GID=your_workspace_gid
ASANA_DEFAULT_TEAM_GID=your_team_gid (optional)
ASANA_REQUEST_TIMEOUT_MS=30000 (optional)
```

**Example Usage**:
- "Create a task called 'Review Q4 budget' in the Finance project and assign it to me"
- "List all my incomplete tasks in the Development project"
- "Show me details for the 'Bug fix' task including subtasks"
- "Mark the 'Deploy to production' task as complete"
- "Set due date of 'Review docs' to next Friday"
- "Add john@company.com as follower to 'Project Alpha'"
- "Create subtask 'Review section 1' under 'Budget Review'"
- "Make task A dependent on task B"
- "Remove dependency between task X and task Y"
- "List all subtasks for the 'Project Alpha' task"
- "Search for tasks related to 'mobile app'"
- "Get user details for andy@company.com"
- "List all users in the workspace"

**Architecture**: 
- **Modular Structure**: 20+ specialized modules across intent-parser/, api-client/, formatters/, utils/
- **API Client**: Robust client with retry logic and caching
- **Intent Parser**: Advanced NLP for natural language commands
- **Response Formatter**: User-friendly response formatting
- **Error Handling**: Comprehensive error management with user guidance

**Performance Characteristics**:
- **Response Times**: 1-5ms (cached), 200-500ms (API calls)
- **Resource Usage**: 2-10MB memory for cache
- **Reliability**: Up to 60s retry scenarios with intelligent backoff
- **Cache Hit Rate**: 60-80% reduction in API calls

---

### 📅 **Google Calendar** (`googleCalendar`)
*Google Calendar event management and scheduling*

**Description**: Dedicated Google Calendar integration for managing events, checking availability, and coordinating schedules through natural language commands.

**Capabilities**:
- Create, update, delete calendar events
- Search and list events by date range
- Check availability and scheduling conflicts
- Manage meeting invitations and attendees
- View detailed event information

**Environment Variables**:
```env
GOOGLE_CALENDAR_WEBHOOK_URL=your_n8n_calendar_webhook_url
GOOGLE_CALENDAR_AUTH_TOKEN=your_auth_token
GOOGLE_CALENDAR_AUTH_HEADER=your_auth_header_name
GOOGLE_CALENDAR_TIMEOUT_MS=30000 (optional)
```

**Example Usage**:
- "Schedule a team review for next Friday at 3 PM about the Q3 roadmap"
- "Show me my calendar events for tomorrow"
- "Find all meetings with John this week"
- "Cancel my 2 PM meeting today"
- "Check if I'm free on Thursday afternoon"

---

### 📄 **Document Management**

#### **List Documents** (`listDocuments`)
*Browse and discover documents in the knowledge base*

**Description**: Retrieves documents from the Supabase database with filtering and pagination capabilities.

**Capabilities**:
- List all accessible documents
- Filter by file type, upload date, or content
- Support for pagination and sorting
- Client-aware document access

#### **Get File Contents** (`getFileContents`)
*Retrieve specific document content*

**Description**: Fetches the full content of a specific document by ID or name.

**Capabilities**:
- Retrieve document content by ID
- Support for multiple file formats
- Content preprocessing and formatting

#### **Create Document** (`createDocument`)
*Create new documents in the system*

**Description**: Creates new documents with content and metadata.

**Capabilities**:
- Create text, markdown, or JSON documents
- Automatic metadata generation
- Integration with file processing pipeline

#### **Update Document** (`updateDocument`)
*Modify existing documents*

**Description**: Updates document content, metadata, or both.

**Capabilities**:
- Update document content
- Modify metadata and tags
- Version tracking and history

---

### 🔍 **Search & Knowledge**

#### **Internal Knowledge Base Search** (`searchInternalKnowledgeBase`)
*Search across all uploaded documents and content*

**Description**: Vector-based semantic search across the entire knowledge base using embeddings.

**Capabilities**:
- Semantic search using vector embeddings
- Multi-document result aggregation
- Relevance scoring and ranking
- Context-aware search results

#### **Tavily Web Search** (`tavilySearch`)
*Real-time web search for current information*

**Description**: External web search using Tavily API for real-time information retrieval.

**Environment Variables**:
```env
TAVILY_API_KEY=your_tavily_api_key
```

**Capabilities**:
- Real-time web search
- News and current events
- Fact verification
- Source attribution

---

### 🌤️ **Weather Information** (`getWeatherTool`)
*Current weather conditions and forecasts*

**Description**: Provides current weather information and forecasts for specified locations.

**Capabilities**:
- Current weather conditions
- Multi-day forecasts
- Location-based queries
- Weather alerts and warnings

---

### 💬 **Communication**

#### **Get Messages from Other Chat** (`getMessagesFromOtherChatTool`)
*Cross-chat context sharing*

**Description**: Retrieves messages and context from other chat sessions for better continuity.

**Capabilities**:
- Access conversation history
- Cross-chat context sharing
- Message threading and references
- Privacy-aware message retrieval

#### **Request Suggestions** (`requestSuggestionsTool`)
*AI-powered content suggestions*

**Description**: Generates contextual suggestions for content creation and task completion.

**Capabilities**:
- Content completion suggestions
- Task recommendations
- Contextual prompts
- Workflow optimization tips

---

## Tool Architecture

### Design Principles

1. **Modularity**: Each tool is self-contained with clear interfaces
2. **Extensibility**: Easy to add new tools without affecting existing ones
3. **Error Handling**: Comprehensive error handling and user feedback
4. **Type Safety**: Full TypeScript support with strict typing
5. **Documentation**: Inline documentation and comprehensive guides

### Tool Structure

Each tool follows a consistent structure:

```typescript
import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

const ToolInputSchema = z.object({
  // Tool-specific input schema
});

class ToolName extends Tool {
  name = 'toolName';
  description = 'Clear description of tool capabilities';
  zodSchema = ToolInputSchema;

  protected async _call(args: any): Promise<string> {
    // Tool implementation
  }
}

export const toolName = new ToolName();
```

### Error Handling

All tools implement consistent error handling:

- **Configuration Errors**: Missing environment variables or setup issues
- **API Errors**: External service failures with retry logic
- **Validation Errors**: Input validation and user-friendly error messages
- **Timeout Errors**: Configurable timeouts with graceful degradation

### Performance Considerations

- **Caching**: Intelligent caching for frequently accessed data
- **Rate Limiting**: Respect external API rate limits
- **Async Operations**: Non-blocking operations where possible
- **Resource Management**: Efficient memory and connection usage

## Environment Variables Reference

### Core Configuration
```env
# Required for all tools
OPENAI_API_KEY=your_openai_api_key
POSTGRES_URL=your_postgres_connection_string
```

### Tool-Specific Variables
```env
# Asana Integration
ASANA_PAT=your_asana_personal_access_token
ASANA_DEFAULT_WORKSPACE_GID=your_workspace_gid
ASANA_DEFAULT_TEAM_GID=your_team_gid

# Google Calendar
GOOGLE_CALENDAR_WEBHOOK_URL=your_n8n_calendar_webhook_url
GOOGLE_CALENDAR_AUTH_TOKEN=your_auth_token
GOOGLE_CALENDAR_AUTH_HEADER=your_auth_header_name

# Web Search
TAVILY_API_KEY=your_tavily_api_key

# File Processing
N8N_EXTRACT_WEBHOOK_URL=your_n8n_webhook_url
N8N_EXTRACT_AUTH_TOKEN=your_n8n_auth_token
```

## Best Practices

### Tool Usage
1. **Clear Instructions**: Provide specific, actionable requests
2. **Context Provision**: Include relevant context for better results
3. **Error Recovery**: Handle tool failures gracefully
4. **Resource Efficiency**: Use appropriate tools for each task

### Development
1. **Input Validation**: Always validate tool inputs
2. **Error Messages**: Provide clear, actionable error messages
3. **Documentation**: Maintain up-to-date tool documentation
4. **Testing**: Comprehensive unit and integration testing

### Security
1. **Environment Variables**: Never hardcode sensitive information
2. **Input Sanitization**: Validate and sanitize all inputs
3. **Access Control**: Implement proper permission checking
4. **Audit Logging**: Log tool usage for security monitoring

## Future Roadmap

### Planned Enhancements
- **Batch Operations**: Support for multiple operations in single requests
- **Advanced Caching**: Intelligent caching for better performance
- **Real-time Updates**: WebSocket support for live updates
- **Extended Integrations**: Additional service integrations

### Tool Development Guidelines
- Follow the established architectural patterns
- Implement comprehensive error handling
- Include thorough documentation and examples
- Add appropriate unit and integration tests
- Consider performance and scalability implications

---

For specific tool implementation details, see the individual tool files in `/lib/ai/tools/` or refer to the API documentation. 