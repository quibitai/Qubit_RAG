# Asana Native Tool - Modular Implementation

## Overview

This directory contains a comprehensive, modular implementation of an Asana integration tool for the AI agent system. The tool provides natural language processing capabilities for Asana operations, with robust error handling, caching, and retry mechanisms.

## 🏗️ Architecture

The implementation follows a modular architecture with clear separation of concerns:

```
lib/ai/tools/asana/
├── asanaTool.ts              # Main LangChain Tool implementation
├── types.ts                  # Shared TypeScript type definitions
├── config.ts                 # Configuration loading (API keys, defaults)
├── constants.ts              # Asana-specific constants
├── intent-parser/            # Natural Language Processing
│   ├── index.ts
│   ├── types.ts              # Intent and entity type definitions  
│   ├── intent.classifier.ts  # Intent classification logic
│   └── entity.extractor.ts   # Entity extraction logic
├── api-client/               # Asana API integration
│   ├── index.ts
│   ├── client.ts             # Core API client with retry logic
│   ├── retryHandler.ts       # Exponential backoff retry handler
│   ├── cache.ts              # Intelligent caching layer
│   └── operations/           # API operations by resource type
│       ├── users.ts          # User operations
│       ├── tasks.ts          # Task operations
│       ├── projects.ts       # Project operations
│       ├── sections.ts       # Project section operations
│       └── search.ts         # Search and typeahead operations
├── formatters/               # Response formatting
│   ├── index.ts
│   └── responseFormatter.ts  # User-friendly response formatting
└── utils/                    # Utilities
    ├── errorHandler.ts       # Centralized error handling
    ├── gidUtils.ts           # GID extraction/validation utilities
    ├── ambiguityResolver.ts  # Ambiguity resolution helpers
    └── dateTimeParser.ts     # Enhanced date/time parsing
```

## 🚀 Key Features

### ✅ **Comprehensive API Coverage**
- **User Operations**: Authentication, user info retrieval
- **Task Management**: Creation, updates, completion, details, listing
- **Advanced Task Features**: Due dates, followers, subtasks, dependencies
- **Project Management**: Listing, section management, task organization
- **Search & Discovery**: Typeahead search across all resource types

### ✅ **Robust Infrastructure**
- **Retry Logic**: Exponential backoff with jitter for transient failures
- **Intelligent Caching**: TTL-based caching for expensive operations
- **Error Handling**: Comprehensive error classification and user-friendly messages
- **Rate Limiting**: Automatic handling of Asana API rate limits

### ✅ **Enhanced UX**
- **Natural Language Processing**: Intent classification and entity extraction
- **Ambiguity Resolution**: Smart handling of ambiguous queries with user guidance
- **Date/Time Parsing**: Advanced natural language date parsing with confidence scoring
- **Rich Formatting**: User-friendly response formatting with actionable information

## 📋 Supported Operations

| Operation | Natural Language Examples | API Endpoint |
|-----------|---------------------------|--------------|
| **User Info** | "who am i", "my asana info" | `GET /users/me` |
| **Create Task** | "create task 'Review docs' in Marketing project" | `POST /tasks` |
| **List Tasks** | "show my tasks", "list tasks in Development project" | `GET /tasks` |
| **Task Details** | "get details for task 'Budget Review'" | `GET /tasks/{gid}` |
| **Update Task** | "update description of 'Project Alpha' to '...'" | `PUT /tasks/{gid}` |
| **Complete Task** | "mark 'Budget Review' as complete" | `PUT /tasks/{gid}` |
| **Set Due Date** | "set due date of 'Review docs' to next Friday" | `PUT /tasks/{gid}` |
| **Add Followers** | "add me as follower to 'Project Alpha'" | `POST /tasks/{gid}/addFollowers` |
| **Create Subtask** | "add subtask 'Review section 1' to 'Budget Review'" | `POST /tasks` |
| **List Subtasks** | "show subtasks of 'Project Alpha'" | `GET /tasks/{gid}/subtasks` |
| **Task Dependencies** | "make task A dependent on task B" | `POST /tasks/{gid}/addDependencies` |
| **List Projects** | "show all projects", "list archived projects" | `GET /projects` |
| **Project Sections** | "list sections in Marketing project" | `GET /projects/{gid}/sections` |
| **Move Task to Section** | "move 'Review docs' to 'In Progress' section" | `POST /sections/{gid}/addTask` |
| **Search** | "search for 'budget' in asana" | `GET /workspaces/{gid}/typeahead` |

## 🔧 Configuration

### Environment Variables

```bash
# Required
ASANA_PAT=your_personal_access_token_here
ASANA_DEFAULT_WORKSPACE_GID=workspace_gid_here

# Optional  
ASANA_DEFAULT_TEAM_GID=team_gid_here
ASANA_REQUEST_TIMEOUT_MS=30000
```

### Caching Configuration

The caching layer is automatically configured with sensible defaults:

- **User Info**: 10 minutes TTL (rarely changes)
- **Project/Task Lookups**: 5 minutes TTL (moderate change frequency)
- **Search Results**: 5 minutes TTL (dynamic content)
- **Task Details**: Variable TTL based on content type

### Retry Configuration

Retry behavior is optimized for Asana API characteristics:

- **Max Retries**: 2 (conservative for API calls)
- **Base Delay**: 2 seconds
- **Max Delay**: 60 seconds (respects rate limit windows)
- **Backoff Multiplier**: 2.5
- **Jitter**: Enabled to prevent thundering herd

## 💡 Usage Examples

### Basic Task Creation
```typescript
// Natural language input: "Create a task called 'Review quarterly reports' in the Finance project and assign it to me"

// The tool will:
// 1. Parse intent: CREATE_TASK
// 2. Extract entities: taskName, projectName, assigneeName
// 3. Resolve project GID from name
// 4. Resolve "me" to current user GID  
// 5. Create task with proper associations
// 6. Return formatted success message with task link
```

### Advanced Date Parsing
```typescript
// Natural language input: "Set due date of 'Budget Review' to end of next week"

// The enhanced date parser will:
// 1. Parse "end of next week" with high confidence
// 2. Calculate the exact date (next Saturday)
// 3. Format for Asana API (YYYY-MM-DD)
// 4. Provide user-friendly confirmation
```

### Ambiguity Resolution
```typescript
// Natural language input: "Show details for Budget task"

// If multiple "Budget" tasks exist:
// 1. Tool detects ambiguity
// 2. Presents numbered options to user
// 3. Includes context (project names, completion status)
// 4. Asks for clarification with specific GIDs or names
```

## 🧪 Testing Strategies

### Unit Testing
- **Intent Classification**: Test pattern matching for all operation types
- **Entity Extraction**: Validate extraction of names, dates, identifiers
- **Date Parsing**: Test confidence scoring and edge cases
- **Retry Logic**: Mock transient failures and verify backoff behavior
- **Caching**: Test TTL expiration and cache invalidation

### Integration Testing  
- **API Operations**: Test against Asana sandbox with real data
- **End-to-End Flows**: Natural language → API call → formatted response
- **Error Scenarios**: Network failures, rate limits, invalid inputs
- **Ambiguity Handling**: Multiple matches and resolution flows

### Performance Testing
- **Cache Efficiency**: Measure cache hit rates for common operations
- **Retry Overhead**: Verify minimal impact of retry mechanisms
- **Memory Usage**: Monitor cache memory consumption over time

## 🔍 Troubleshooting

### Common Issues

**Authentication Errors (401)**
- Verify `ASANA_PAT` is set and valid
- Check token has appropriate permissions
- Ensure workspace GID is accessible to the token

**Rate Limiting (429)**  
- Retry handler automatically manages rate limits
- Check `Retry-After` headers are being respected
- Consider reducing concurrent request volume

**Ambiguous Results**
- Users should provide more specific names or context
- Use GIDs when available for precise identification
- Check project context is provided for task operations

**Cache Issues**
- Monitor cache statistics for size and hit rates
- Adjust TTL values based on data change frequency
- Clear cache manually if stale data is encountered

### Debugging

Enable detailed logging by setting request IDs:
```typescript
// All operations support optional request IDs for tracking
await asanaTool.call("create task 'Debug Issue' in Dev project");
// Logs will include: [AsanaTool] [req_abc123] Operation details...
```

Monitor cache performance:
```typescript
import { asanaCache } from './api-client/cache';
console.log(asanaCache.getStats()); // { size: 150, maxSize: 2000, hitRate: 0.85 }
```

## 📈 Performance Characteristics

### Response Times (Typical)
- **Cached Operations**: 1-5ms
- **Simple API Calls**: 200-500ms  
- **Complex Operations**: 500ms-2s
- **Retry Scenarios**: Up to 60s (with backoff)

### Resource Usage
- **Memory**: ~2-10MB for cache (depending on usage)
- **Network**: Optimized with caching and batching
- **CPU**: Minimal overhead from NLP processing

## 🔮 Future Enhancements

### Planned Features
- **Batch Operations**: Multiple task creation/updates in single call
- **Webhook Integration**: Real-time updates from Asana  
- **Advanced Search**: Complex filters and sorting options
- **Project Templates**: Automated project structure creation
- **Time Tracking**: Integration with Asana's time tracking features

### Architecture Improvements
- **Persistent Cache**: Redis or database-backed caching
- **Request Queuing**: Advanced rate limit management
- **Analytics**: Usage patterns and performance metrics
- **A/B Testing**: Intent classification algorithm optimization

## 📚 API Reference

For detailed API documentation, see:
- [Asana API Documentation](https://developers.asana.com/docs)
- [LangChain Tools Documentation](https://js.langchain.com/docs/modules/tools/)

## 🤝 Contributing

When extending this tool:

1. **Follow the modular structure** - add new operations in appropriate files
2. **Maintain type safety** - use TypeScript interfaces for all data structures  
3. **Add comprehensive tests** - cover both success and failure scenarios
4. **Update documentation** - keep this README and code comments current
5. **Follow caching patterns** - use cache for expensive or repeated operations
6. **Handle errors gracefully** - provide user-friendly error messages

## 📄 License

This implementation is part of the Quibit RAG system and follows the project's licensing terms. 