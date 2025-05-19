# Asana Tool Testing Documentation

This document outlines the testing approach for the Asana integration tool.

## Testing Layers

1. **Unit Tests**: Testing individual components in isolation
2. **Integration Tests**: Testing how components work together
3. **End-to-End Style Tests**: Simulating full user workflows with mocked API responses

## Mock Structure

Mocks are organized in the `mocks/` directory:

- `mockSetup.ts`: Utilities for setting up and tearing down test environments
- `userResponses.ts`: Mock responses for user-related API calls
- `taskResponses.ts`: Mock responses for task-related API calls
- `projectResponses.ts`: Mock responses for project-related API calls

## Test Files

- `config.test.ts`: Tests for configuration utility functions
- `asanaTool.test.ts`: Tests for core asanaTool functionality
- `createTask.test.ts`: Tests for CREATE_TASK operation
- `listProjects.test.ts`: Tests for LIST_PROJECTS operation
- `listTasks.test.ts`: Tests for LIST_TASKS operation
- `responseFormatter.test.ts`: Tests for response formatting utilities
- `intent.classifier.test.ts`: Tests for intent classification logic
- `users.operations.test.ts`: Tests for user-related operations

## Key Operations Tested

### GET_USER_ME
- Successful user info retrieval
- Error handling
- Authentication validation
- Response formatting

### CREATE_TASK
- Creating tasks with minimal information (name only)
- Creating tasks with notes
- Creating tasks with project assignment
- Creating tasks with assignee
- Handling ambiguous project names
- Handling non-existent projects
- Error handling
- Task GID extraction and validation

### LIST_PROJECTS
- Listing projects when projects exist
- Handling empty project lists
- Including archived projects
- Error handling
- Workspace configuration validation
- Project GID extraction and validation

### LIST_TASKS
- Listing all tasks in workspace
- Listing "my tasks" (tasks assigned to the current user)
- Listing tasks in a specific project
- Handling ambiguous project names
- Handling non-existent projects
- Handling empty task lists
- Filtering by completion status
- Combining filters (e.g., my tasks in a project)
- Error handling
- Task GID extraction and validation

### GET_TASK_DETAILS
- Retrieving task details by GID
- Retrieving task details by name and project
- Retrieving task details by name and workspace
- Handling non-existent tasks
- Error handling
- Response formatting

### UPDATE_TASK_DESCRIPTION
- Updating task notes/description
- Handling non-existent tasks
- Error handling
- Response formatting

## Testing Strategies

### Environment Variable Testing
Tests for environment variable-dependent functionality ensure that:
- The code properly validates the presence of required environment variables
- Functions gracefully handle missing environment variables
- Configuration utilities correctly retrieve values
- Both NATIVE_ASANA_PAT and ASANA_PAT are supported
- Workspace and team GID fallbacks are tested

### Mock API Responses
- Success responses contain all necessary fields for the formatters
- Error responses match Asana API's error structure
- Edge cases like empty lists are covered
- Rate limiting responses are simulated
- Network timeout scenarios are tested

### Intent Parsing Testing
- Various natural language phrasings are tested for each operation
- Mandatory parameters are validated
- Optional parameters are correctly extracted
- Complex queries with multiple parameters are handled
- Edge cases in natural language input are covered

### Error Handling Testing
- API errors (400, 401, 404, 429, 500, etc.)
- Network errors
- Validation errors
- Configuration errors
- Timeout handling
- Rate limiting handling
- Invalid response format handling

### Response Formatting Testing
- Consistent formatting across all operations
- Proper handling of missing optional fields
- Date and time formatting
- URL generation for task and project links
- Error message formatting

## Coverage Goals

The test suite aims for high coverage in the following areas:
- Intent parsing logic
- API client operations
- Response formatting
- Error handling
- Configuration validation
- GID extraction and validation
- Natural language processing
- Rate limiting and timeout handling

## Running Tests

Tests can be run using Vitest:

```bash
# Run all tests
pnpm exec vitest lib/ai/tools/asana/__tests__

# Run specific test file
pnpm exec vitest lib/ai/tools/asana/__tests__/listTasks.test.ts

# Run with coverage
pnpm exec vitest lib/ai/tools/asana/__tests__ --coverage

# Run in watch mode
pnpm exec vitest lib/ai/tools/asana/__tests__ --watch
```

## Test Environment Setup

1. Create a `.env.test` file with test credentials:
```env
NATIVE_ASANA_PAT=test_pat
ASANA_DEFAULT_WORKSPACE_GID=test_workspace_gid
ASANA_DEFAULT_TEAM_GID=test_team_gid
NATIVE_ASANA_TIMEOUT_MS=5000
```

2. Ensure mock data is up to date with current API response formats
3. Run tests in isolation to prevent interference between test cases
4. Clean up any test data after running integration tests

## Best Practices

1. **Test Isolation**: Each test should be independent and not rely on the state from other tests
2. **Mock Data**: Use realistic mock data that matches the Asana API response format
3. **Error Cases**: Test both success and error scenarios for each operation
4. **Edge Cases**: Include tests for boundary conditions and unusual inputs
5. **Documentation**: Keep test documentation up to date with new features and changes
6. **Maintenance**: Regularly review and update tests as the API evolves 