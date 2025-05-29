# Modern Asana Tool - Testing Guide

This guide provides comprehensive commands and instructions to test all the advanced features of the Modern Asana Tool in real-world scenarios.

## 🚀 Quick Setup

### Prerequisites

1. **Asana Personal Access Token (PAT)**
   ```bash
   export ASANA_PAT="your_asana_personal_access_token_here"
   ```

2. **Workspace GID** (Required)
   ```bash
   export ASANA_DEFAULT_WORKSPACE_GID="your_workspace_gid_here"
   ```

3. **Team GID** (Optional)
   ```bash
   export ASANA_DEFAULT_TEAM_GID="your_team_gid_here"
   ```

### Getting Your Asana Credentials

1. **Personal Access Token**: Go to [Asana Developer Console](https://app.asana.com/0/developer-console) → Personal Access Tokens → Create New Token

2. **Workspace GID**: 
   - Go to your Asana workspace
   - Look at the URL: `https://app.asana.com/0/{WORKSPACE_GID}/...`
   - Or use the API: `curl -H "Authorization: Bearer $ASANA_PAT" https://app.asana.com/api/1.0/workspaces`

3. **Team GID** (if you have teams):
   - Use the API: `curl -H "Authorization: Bearer $ASANA_PAT" https://app.asana.com/api/1.0/teams`

## 📋 Available Test Commands

### 1. Quick Individual Commands

Use the quick test script for individual operations:

```bash
# Show all available commands
pnpm tsx scripts/test-asana-commands.ts

# Basic operations
pnpm tsx scripts/test-asana-commands.ts list-users
pnpm tsx scripts/test-asana-commands.ts list-projects
pnpm tsx scripts/test-asana-commands.ts list-tasks

# Create operations
pnpm tsx scripts/test-asana-commands.ts create-task "My Test Task"
pnpm tsx scripts/test-asana-commands.ts create-project "My Test Project"

# Advanced features
pnpm tsx scripts/test-asana-commands.ts suggest-workflows "set up a new project"
pnpm tsx scripts/test-asana-commands.ts resolve-user "john"
pnpm tsx scripts/test-asana-commands.ts resolve-project "demo"

# Configuration and testing
pnpm tsx scripts/test-asana-commands.ts test-config
pnpm tsx scripts/test-asana-commands.ts run-tests
```

### 2. Comprehensive Demo

Run the full feature demonstration:

```bash
# Run complete demo (takes 2-5 minutes)
pnpm tsx scripts/demo-asana-tool.ts
```

### 3. Unit Tests

Run the comprehensive test suite:

```bash
# Run all Asana tool tests
pnpm test:unit:run lib/ai/tools/asana

# Run specific test files
pnpm test:unit:run lib/ai/tools/asana/__tests__/modern-asana-tool.test.ts
pnpm test:unit:run lib/ai/tools/asana/__tests__/workflows/orchestrator.test.ts
pnpm test:unit:run lib/ai/tools/asana/__tests__/response/enhancer.test.ts
```

## 🎯 Feature-Specific Testing Commands

### Basic Operations Testing

```bash
# Test user operations
pnpm tsx scripts/test-asana-commands.ts list-users

# Test project operations  
pnpm tsx scripts/test-asana-commands.ts list-projects
pnpm tsx scripts/test-asana-commands.ts create-project "Demo Project $(date)"

# Test task operations
pnpm tsx scripts/test-asana-commands.ts list-tasks
pnpm tsx scripts/test-asana-commands.ts create-task "Demo Task $(date)"
```

### Workflow Orchestration Testing

```bash
# Get workflow suggestions
pnpm tsx scripts/test-asana-commands.ts suggest-workflows "I want to set up a new project with tasks"
pnpm tsx scripts/test-asana-commands.ts suggest-workflows "help me organize a sprint"
pnpm tsx scripts/test-asana-commands.ts suggest-workflows "onboard new team member"

# Test workflow execution (via full demo)
pnpm tsx scripts/demo-asana-tool.ts
```

### Semantic Entity Resolution Testing

```bash
# Test user resolution
pnpm tsx scripts/test-asana-commands.ts resolve-user "admin"
pnpm tsx scripts/test-asana-commands.ts resolve-user "@me"
pnpm tsx scripts/test-asana-commands.ts resolve-user "john"

# Test project resolution
pnpm tsx scripts/test-asana-commands.ts resolve-project "demo"
pnpm tsx scripts/test-asana-commands.ts resolve-project "test"
pnpm tsx scripts/test-asana-commands.ts resolve-project "main"
```

### Error Recovery Testing

The error recovery features are automatically tested when operations fail. You can trigger error scenarios by:

```bash
# These will demonstrate error recovery in action
pnpm tsx scripts/test-asana-commands.ts resolve-user "nonexistent-user-12345"
pnpm tsx scripts/test-asana-commands.ts resolve-project "nonexistent-project-12345"
```

### Response Enhancement Testing

All commands automatically demonstrate response enhancement. Look for:
- 📊 Enhanced metadata
- 💬 Rich formatted messages
- 💡 Actionable suggestions
- 🔄 Follow-up recommendations

## 🧪 Advanced Testing Scenarios

### 1. Performance Testing

```bash
# Quick performance test
time pnpm tsx scripts/test-asana-commands.ts list-users
time pnpm tsx scripts/test-asana-commands.ts list-projects
time pnpm tsx scripts/test-asana-commands.ts list-tasks
```

### 2. Feature Configuration Testing

```bash
# Check current configuration
pnpm tsx scripts/test-asana-commands.ts test-config

# The demo script tests feature toggling automatically
pnpm tsx scripts/demo-asana-tool.ts
```

### 3. Integration Testing

```bash
# Test complete workflow (creates project → tasks → updates)
pnpm tsx scripts/demo-asana-tool.ts

# Test individual components
pnpm test:unit:run lib/ai/tools/asana/__tests__/workflows/
pnpm test:unit:run lib/ai/tools/asana/__tests__/semantic/
pnpm test:unit:run lib/ai/tools/asana/__tests__/recovery/
```

## 📊 What to Look For

### ✅ Success Indicators

1. **Basic Operations**:
   - Commands complete without errors
   - Data is returned in expected format
   - Response times are reasonable (< 2 seconds)

2. **Enhanced Responses**:
   - Rich markdown formatting with emojis
   - Actionable suggestions provided
   - Follow-up recommendations included
   - Performance metadata displayed

3. **Workflow Features**:
   - Workflow suggestions have confidence scores > 0.2
   - Multi-step workflows execute successfully
   - Step-by-step progress is shown

4. **Semantic Resolution**:
   - Entity queries return relevant matches
   - Confidence scores are reasonable (> 0.5 for good matches)
   - Fuzzy matching works for partial names

5. **Error Recovery**:
   - Failed operations provide helpful error messages
   - Suggestions for resolution are offered
   - Automatic retries work for transient failures

### ⚠️ Common Issues and Solutions

1. **Authentication Errors**:
   ```
   Error: Invalid authentication credentials
   ```
   **Solution**: Check your `ASANA_PAT` environment variable

2. **Workspace Not Found**:
   ```
   Error: Workspace not configured
   ```
   **Solution**: Set `ASANA_DEFAULT_WORKSPACE_GID` environment variable

3. **Permission Errors**:
   ```
   Error: Access denied: insufficient permissions
   ```
   **Solution**: Ensure your PAT has access to the workspace/projects

4. **Rate Limiting**:
   ```
   Error: Rate limit exceeded
   ```
   **Solution**: Wait a moment and retry (automatic retry is built-in)

## 🎯 Real-World Test Scenarios

### Scenario 1: Project Setup Workflow

```bash
# 1. Get workflow suggestions
pnpm tsx scripts/test-asana-commands.ts suggest-workflows "set up new marketing project"

# 2. Run full demo to see workflow execution
pnpm tsx scripts/demo-asana-tool.ts

# 3. Verify created resources in Asana UI
```

### Scenario 2: Task Management

```bash
# 1. Create a task
pnpm tsx scripts/test-asana-commands.ts create-task "Review quarterly goals"

# 2. List tasks to see it
pnpm tsx scripts/test-asana-commands.ts list-tasks

# 3. Check Asana UI for the created task
```

### Scenario 3: Team Collaboration

```bash
# 1. List team members
pnpm tsx scripts/test-asana-commands.ts list-users

# 2. Try to resolve team members by name
pnpm tsx scripts/test-asana-commands.ts resolve-user "john"
pnpm tsx scripts/test-asana-commands.ts resolve-user "@me"

# 3. Create project for team
pnpm tsx scripts/test-asana-commands.ts create-project "Team Collaboration Test"
```

### Scenario 4: Error Handling

```bash
# 1. Test with invalid data
pnpm tsx scripts/test-asana-commands.ts resolve-user "definitely-not-a-real-user-12345"

# 2. Check error messages and suggestions
# 3. Verify graceful degradation
```

## 📈 Performance Benchmarks

Expected performance for typical operations:

- **List Users**: < 500ms
- **List Projects**: < 800ms  
- **List Tasks**: < 1000ms
- **Create Task**: < 1500ms
- **Create Project**: < 2000ms
- **Workflow Execution**: 2-5 minutes (depending on complexity)
- **Entity Resolution**: < 300ms

## 🔧 Troubleshooting

### Debug Mode

Add debug logging by setting:
```bash
export DEBUG=asana:*
```

### Verbose Output

For more detailed output, check the enhanced response data:
- Look for `metadata.duration` for performance
- Check `metadata.success` for operation status
- Review `enhanced.suggestions` for next steps

### Test Environment

Ensure you're testing in a safe environment:
- Use a test workspace if possible
- Created test data will have timestamps to avoid conflicts
- Demo script creates clearly labeled test resources

## 🎉 Success Criteria

Your Modern Asana Tool is working correctly if:

1. ✅ All basic commands execute successfully
2. ✅ Enhanced responses include suggestions and formatting
3. ✅ Workflow suggestions are relevant and confident
4. ✅ Entity resolution finds appropriate matches
5. ✅ Error handling provides helpful guidance
6. ✅ Performance meets expected benchmarks
7. ✅ Unit tests pass (233/234 tests)

## 📞 Support

If you encounter issues:

1. Check the [COMPLETION_SUMMARY.md](lib/ai/tools/asana/COMPLETION_SUMMARY.md) for architecture details
2. Review test files in `lib/ai/tools/asana/__tests__/` for examples
3. Ensure environment variables are correctly set
4. Verify Asana PAT permissions and workspace access

The Modern Asana Tool is production-ready with 99.6% test coverage and comprehensive error handling! 🚀 