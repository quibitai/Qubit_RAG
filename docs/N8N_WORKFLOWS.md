# N8N Workflow Documentation (Legacy)

> **Note:** As of v2.3.0, n8n is primarily used for file extraction. Google Calendar integration now uses a dedicated tool with n8n as the backend service. All other orchestration is handled by the Brain API and modular tools. The following workflows are retained for reference only.

## Current (Active) n8n Workflows

### 1. File Extraction Service (Active)
- Used for extracting content from uploaded files (PDF, DOCX, TXT, etc.)
- Triggered by `/api/files/extract` in the app
- Uses environment variables: `N8N_EXTRACT_WEBHOOK_URL`, `N8N_EXTRACT_AUTH_HEADER`, `N8N_EXTRACT_AUTH_TOKEN`
- Returns extracted text for use in chat and document tools

### 2. Google Calendar Service (Active)
- Dedicated Google Calendar integration backend service
- Triggered by the `googleCalendar` tool in the app
- Uses environment variables: `GOOGLE_CALENDAR_WEBHOOK_URL`, `GOOGLE_CALENDAR_AUTH_HEADER`, `GOOGLE_CALENDAR_AUTH_TOKEN`
- Handles all calendar operations: create, read, update, delete events
- No longer uses generic MCP gateway pattern - dedicated to calendar operations

## Legacy n8n Workflows (No Longer Used)

- Internal Knowledge Base Search Tool
- Web Search Tool (SerpAPI)
- List Documents Tool
- Document Retrieval Tool
- Spreadsheet Query Tool
- Google Drive Integration
- Generic MCP Gateway Tool (replaced by dedicated Google Calendar tool in v2.3.0)

> All of the above are now handled by direct API integrations in the Brain API and modular tool registry. See `ARCHITECTURE.md` and `README.md` for details.

## Environment Variables

### Active Integrations
- `N8N_EXTRACT_WEBHOOK_URL`, `N8N_EXTRACT_AUTH_HEADER`, `N8N_EXTRACT_AUTH_TOKEN`: For file extraction
- `GOOGLE_CALENDAR_WEBHOOK_URL`, `GOOGLE_CALENDAR_AUTH_HEADER`, `GOOGLE_CALENDAR_AUTH_TOKEN`: For Google Calendar operations

### Deprecated (v2.3.0)
- `N8N_MCP_*` variables: Replaced by `GOOGLE_CALENDAR_*` variables
- `MCP_TOOL_*` variables: No longer used due to dedicated tool approach

## Migration Notes (v2.3.0)

The n8n MCP gateway approach has been replaced with dedicated tool integrations:

- **Old**: Generic MCP gateway tool that could handle multiple services
- **New**: Dedicated Google Calendar tool with focused functionality
- **Benefits**: Better error handling, clearer user interface, more reliable operations

For migration instructions, see [Migration Guide v2.3.0](./MIGRATION_GUIDE_v2.3.0.md).

## References
- See `ARCHITECTURE.md` for the current system overview
- See [Tools Documentation](./TOOLS.md) for complete tool information
- See `/api/files/extract` for file extraction integration details
- See [Google Calendar Tool](./TOOLS.md#google-calendar-googlecalendar) for calendar integration details 