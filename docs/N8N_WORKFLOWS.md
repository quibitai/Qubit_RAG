# N8N Workflow Documentation (Legacy)

> **Note:** As of v2.1.0, n8n is only used for file extraction and some MCP integrations. All other orchestration is handled by the Brain API and modular tools. The following workflows are retained for reference only.

## Current (Active) n8n Workflows

### 1. File Extraction Service (Active)
- Used for extracting content from uploaded files (PDF, DOCX, TXT, etc.)
- Triggered by `/api/files/extract` in the app
- Uses environment variables: `N8N_EXTRACT_WEBHOOK_URL`, `N8N_EXTRACT_AUTH_HEADER`, `N8N_EXTRACT_AUTH_TOKEN`
- Returns extracted text for use in chat and document tools

### 2. MCP Agent Integrations (Active)
- Used for integrations where direct API is not available (e.g., Google Calendar MCP)
- Triggered by a single n8n webhook, routed by an AI Agent node
- Uses environment variables: `MCP_TOOL_WEBHOOK_URL`, `MCP_TOOL_AUTH_HEADER`, `MCP_TOOL_AUTH_TOKEN`
- The AI Agent node in n8n decides which MCP to call and returns the result

## Legacy n8n Workflows (No Longer Used)

- Internal Knowledge Base Search Tool
- Web Search Tool (SerpAPI)
- List Documents Tool
- Document Retrieval Tool
- Spreadsheet Query Tool
- Google Drive Integration
- Google Calendar Integration (direct API now preferred)

> All of the above are now handled by direct API integrations in the Brain API and modular tool registry. See `ARCHITECTURE.md` and `README.md` for details.

## Environment Variables

- `N8N_EXTRACT_WEBHOOK_URL`, `N8N_EXTRACT_AUTH_HEADER`, `N8N_EXTRACT_AUTH_TOKEN`: For file extraction
- `MCP_TOOL_WEBHOOK_URL`, `MCP_TOOL_AUTH_HEADER`, `MCP_TOOL_AUTH_TOKEN`: For MCP agent integrations

## References
- See `ARCHITECTURE.md` for the current system overview.
- See `/api/files/extract` and MCP tool files for integration details. 