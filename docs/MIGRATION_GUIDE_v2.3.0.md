# Migration Guide: Version 2.3.0

> Guide for upgrading to Quibit RAG v2.3.0 with modular Asana integration and Google Calendar tool

**Migration Date**: 2024-12-23  
**From Version**: 2.2.0  
**To Version**: 2.3.0

## Overview

Version 2.3.0 introduces significant changes to the tool architecture, including a complete rebuild of the Asana integration and renaming of the calendar tool. This guide will help you upgrade smoothly.

## Breaking Changes

### 🔧 Environment Variable Changes

#### Google Calendar Tool (Previously n8n MCP Gateway)

**Old Environment Variables** (to be removed):
```env
N8N_MCP_WEBHOOK_URL=your_webhook_url
N8N_MCP_AUTH_TOKEN=your_auth_token
N8N_MCP_AUTH_HEADER=your_auth_header_name
N8N_MCP_TIMEOUT_MS=30000
```

**New Environment Variables** (to be added):
```env
GOOGLE_CALENDAR_WEBHOOK_URL=your_webhook_url
GOOGLE_CALENDAR_AUTH_TOKEN=your_auth_token
GOOGLE_CALENDAR_AUTH_HEADER=your_auth_header_name
GOOGLE_CALENDAR_TIMEOUT_MS=30000
```

### 📋 Asana Integration Changes

The Asana tool has been completely rebuilt with a modular architecture. **No environment variable changes are required** for Asana, but the tool now offers enhanced capabilities.

**Existing Environment Variables** (unchanged):
```env
ASANA_PAT=your_asana_personal_access_token
ASANA_DEFAULT_WORKSPACE_GID=your_workspace_gid
ASANA_DEFAULT_TEAM_GID=your_team_gid
NATIVE_ASANA_TIMEOUT_MS=30000
```

## Migration Steps

### Step 1: Update Environment Variables

1. **Backup your current `.env.local` file**:
   ```bash
   cp .env.local .env.local.backup
   ```

2. **Update calendar environment variables**:
   - Copy the values from your `N8N_MCP_*` variables
   - Create new `GOOGLE_CALENDAR_*` variables with the same values
   - Remove the old `N8N_MCP_*` variables

3. **Example migration**:
   ```diff
   # Old variables (remove these)
   - N8N_MCP_WEBHOOK_URL=https://your-webhook-url.com
   - N8N_MCP_AUTH_TOKEN=your_auth_token
   - N8N_MCP_AUTH_HEADER=Authorization
   - N8N_MCP_TIMEOUT_MS=30000

   # New variables (add these)
   + GOOGLE_CALENDAR_WEBHOOK_URL=https://your-webhook-url.com
   + GOOGLE_CALENDAR_AUTH_TOKEN=your_auth_token
   + GOOGLE_CALENDAR_AUTH_HEADER=Authorization
   + GOOGLE_CALENDAR_TIMEOUT_MS=30000
   ```

### Step 2: Update Your Code

1. **Pull the latest changes**:
   ```bash
   git pull origin main
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Run type checking**:
   ```bash
   pnpm lint
   ```

### Step 3: Test the Migration

1. **Start the development server**:
   ```bash
   pnpm dev
   ```

2. **Test Google Calendar functionality**:
   - Try a calendar query: "Show me my calendar events for tomorrow"
   - Verify that calendar operations work as expected

3. **Test Asana functionality**:
   - Try basic operations: "List my tasks"
   - Test advanced features: "Create a task called 'Test task' in the Marketing project"
   - Verify enhanced natural language processing

## New Features in v2.3.0

### 🚀 Enhanced Asana Integration

The new modular Asana tool includes:

- **Advanced Natural Language Processing**: Better understanding of complex requests
- **Comprehensive API Coverage**: Full support for tasks, projects, users, and more
- **Enhanced Operations**:
  - Task management: create, update, complete, search
  - Project operations: list, search, context resolution
  - Advanced features: followers, due dates, subtasks, dependencies
- **Improved Error Handling**: Better error messages and recovery
- **Type Safety**: Full TypeScript support throughout

### 📅 Dedicated Google Calendar Tool

The renamed Google Calendar tool provides:

- **Focused Purpose**: Exclusively for calendar operations
- **Clearer Interface**: Better descriptions and user guidance
- **Enhanced Error Messages**: More specific calendar-related feedback
- **Improved Documentation**: Clear usage examples and setup guides

## Troubleshooting

### Calendar Tool Not Working

1. **Check environment variables**:
   ```bash
   # Verify variables are set
   echo $GOOGLE_CALENDAR_WEBHOOK_URL
   echo $GOOGLE_CALENDAR_AUTH_TOKEN
   echo $GOOGLE_CALENDAR_AUTH_HEADER
   ```

2. **Common issues**:
   - Old `N8N_MCP_*` variables still present (remove them)
   - Webhook URL changed (update the URL)
   - Authentication token expired (renew the token)

### Asana Tool Issues

1. **Check Asana credentials**:
   ```bash
   # Verify Asana variables
   echo $ASANA_PAT
   echo $ASANA_DEFAULT_WORKSPACE_GID
   ```

2. **Common issues**:
   - Personal Access Token expired (create a new one)
   - Workspace GID incorrect (verify in Asana)
   - Network connectivity issues (check firewall/proxy)

### TypeScript Errors

1. **Clear build cache**:
   ```bash
   rm -rf .next
   pnpm build
   ```

2. **Check for dependency conflicts**:
   ```bash
   pnpm install --force
   ```

## Rollback Procedure

If you encounter issues and need to rollback:

1. **Restore environment variables**:
   ```bash
   cp .env.local.backup .env.local
   ```

2. **Checkout previous version**:
   ```bash
   git checkout v2.2.0
   pnpm install
   pnpm dev
   ```

3. **Report issues**:
   - Create an issue on GitHub with details
   - Include error messages and environment information

## Support

### Getting Help

- **Documentation**: Check the updated [TOOLS.md](./TOOLS.md) for comprehensive tool documentation
- **GitHub Issues**: Report bugs or request help at [GitHub Issues](https://github.com/quibitai/Quibit_RAG/issues)
- **Environment Setup**: Refer to the main [README.md](../README.md) for setup guidance

### Known Issues

- None currently identified in v2.3.0

### Reporting Problems

When reporting issues, please include:

1. **Environment Information**:
   - Operating system
   - Node.js version
   - pnpm version

2. **Error Details**:
   - Full error messages
   - Steps to reproduce
   - Expected vs actual behavior

3. **Configuration**:
   - Relevant environment variables (without sensitive values)
   - Tool configurations

## Conclusion

Version 2.3.0 represents a significant improvement in tool architecture and capabilities. The modular Asana integration provides enhanced functionality, while the renamed Google Calendar tool offers better clarity and focus.

The migration primarily involves updating environment variable names for the calendar tool. The enhanced Asana integration maintains backward compatibility while adding powerful new features.

After migration, you'll benefit from:
- More reliable and feature-rich Asana integration
- Clearer calendar tool interface
- Better error handling and user feedback
- Enhanced natural language processing
- Comprehensive documentation and support

For questions or issues during migration, please refer to the troubleshooting section above or contact support through GitHub Issues. 