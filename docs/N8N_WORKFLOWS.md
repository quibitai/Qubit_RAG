# N8N Workflow Documentation

This document provides details on how to set up the n8n workflows that power the RAG tools in this application.

## Overview

The application uses several distinct n8n workflows:

1. **Internal Knowledge Base Search Tool**: Performs semantic search in documents using vector embeddings
2. **Web Search Tool (SerpAPI)**: Performs web searches and summarizes results using AI
3. **List Documents Tool**: Lists all available documents
4. **Document Retrieval Tool**: Gets full content of a document by ID
5. **Spreadsheet Query Tool**: Retrieves and processes spreadsheet data
6. **Google Drive Integration**: Monitors and processes files from Google Drive folders
7. **Google Calendar Integration**: Manages calendar events and appointments
8. **File Extraction Service**: Processes and extracts content from uploaded files

## Workflow 1: Internal Knowledge Base Search Tool

This workflow performs semantic search through document embeddings stored in your vector database.

### Webhook Setup

1. Create a new n8n workflow
2. Add a **Webhook** node as the trigger
   - Method: POST
   - Authentication: Header Auth
   - Auth Header Name: `etrag` (or your preferred name)
   - Auth Header Value: Generate a secure token

### Required Nodes

1. **Webhook** node (trigger)
2. **Embeddings OpenAI** node to generate embeddings for the search query
3. **Supabase Vector Store** node configured with "load" mode to search the vector database
4. **Code** node to format the search results properly
5. **Respond to Webhook** node to return the results

### Example Response Format

```json
{
  "success": true,
  "results": [
    {
      "title": "Document Title",
      "url": "Document URL or ID",
      "content": "Extracted content from document..."
    }
  ],
  "summary": "Found X relevant results for your query.",
  "sources": "Source1\nSource2\nSource3"
}
```

## Workflow 2: Web Search Tool (SerpAPI)

This workflow performs web searches using the SerpAPI integration and processes results with AI.

### Webhook Setup

1. Create a new n8n workflow
2. Add a **Webhook** node as the trigger
   - Method: POST
   - Authentication: Header Auth
   - Auth Header Name: `tavilyauth` (or your preferred name)
   - Auth Header Value: Generate a secure token

### Required Nodes

1. **Webhook** node (trigger)
2. **OpenAI Chat Model** node configured with GPT-4.1-mini
3. **AI Agent** node to process the query and search results
4. **SerpAPI** node to perform the search
5. **Simple Memory** node to maintain conversation context
6. **Respond to Webhook** node to return the summarized results

## Workflow 3: Google Drive Integration

This workflow monitors Google Drive folders and processes new or updated files automatically.

### Trigger Setup

1. Configure a **Google Drive Trigger** node to monitor specific folders
   - Set up for both file creation and file updates
   - Configure polling interval (e.g., every minute)
2. Alternatively, use a **Schedule Trigger** for periodic full scans

### Required Nodes

1. **Google Drive Trigger** or **Schedule Trigger** node
2. **Google Drive** node to list all files in the target folder
3. **PostgreSQL** nodes to:
   - Track processed file IDs
   - Store the last run timestamp
   - Detect and remove orphaned files
4. **Loop Over Items** node to process each file
5. **Switch** node to handle different file types (PDF, XLSX, etc.)
6. **Download File** node to get file content from Google Drive
7. **Extract from File** nodes for specific file types
8. **Character Text Splitter** node to chunk document text
9. **Embeddings OpenAI** node to create vector embeddings
10. **Default Data Loader** node to prepare documents for the vector store
11. **Supabase Vector Store** node to store the embeddings

### File Processing Logic

1. Fetch all files from the Google Drive folder
2. Compare with previously processed files to identify new or updated files
3. For each new/updated file:
   - Delete any previous versions from the database
   - Download the file from Google Drive
   - Extract text based on file type
   - Split text into chunks for optimal embedding
   - Generate embeddings using OpenAI's text-embedding-3-small model
   - Store in Supabase vector database with proper metadata
4. Record processed files to prevent duplicate processing
5. Update the last run timestamp

## Workflow 4: List Documents Tool

This workflow lists all available documents in your knowledge base.

### Webhook Setup

1. Create a new n8n workflow
2. Add a **Webhook** node as the trigger
   - Method: POST
   - Authentication: Header Auth
   - Auth Header Name: `listdocuments` (or your preferred name)
   - Auth Header Value: Generate a secure token

### Required Nodes

1. **Webhook** node (trigger)
2. **PostgreSQL** node to query document metadata
3. **Respond to Webhook** node to return the results

## Workflow 5: Document Retrieval Tool

This workflow retrieves the full content of a document by its ID.

### Webhook Setup

1. Create a new n8n workflow
2. Add a **Webhook** node as the trigger
   - Method: POST
   - Authentication: Header Auth
   - Auth Header Name: `getfilecontents` (or your preferred name)
   - Auth Header Value: Generate a secure token

### Required Nodes

1. **Webhook** node (trigger)
2. **Code** node to standardize input parameters
3. **PostgreSQL** node to retrieve document content
4. **Respond to Webhook** node to return the document text

## Workflow 6: Spreadsheet Query Tool

This workflow retrieves structured data from spreadsheet documents.

### Webhook Setup

1. Create a new n8n workflow
2. Add a **Webhook** node as the trigger
   - Method: POST
   - Authentication: Header Auth
   - Auth Header Name: `querydocumentrows` (or your preferred name)
   - Auth Header Value: Generate a secure token

### Required Nodes

1. **Webhook** node (trigger)
2. **Code** node to standardize input parameters
3. **PostgreSQL** node to retrieve spreadsheet data
4. **Respond to Webhook** node to return the structured data

## Workflow 7: File Extraction Service

This workflow processes uploaded files and extracts their content.

### Webhook Setup

1. Create a new n8n workflow
2. Add a **Webhook** node as the trigger
   - Method: POST
   - Authentication: Header Auth
   - Auth Header Name: `extractfilecontent` (or your preferred name)
   - Auth Header Value: Generate a secure token
   - Binary Property Name: `file` (for file uploads)

### Required Nodes

1. **Webhook** node (trigger)
2. **HTTP Request** node to fetch file from URL (if URL provided)
3. **Switch** node to route processing based on file type:
   - PDF files: Extract PDF Text node
   - Excel files: Extract from Excel node
   - CSV files: Extract from CSV node
   - JSON files: Extract from File (JSON) node
   - Text files: Extract Document Text node
4. **Code** node to format extracted content
5. **Respond to Webhook** node to return the extracted content

## Workflow 8: Google Calendar Integration

This workflow enables interaction with Google Calendar to manage events and appointments.

### Webhook Setup

1. Create a new n8n workflow
2. Add a **Webhook** node as the trigger
   - Method: POST
   - Authentication: Header Auth
   - Auth Header Name: `googlecalendar` (or your preferred name)
   - Auth Header Value: Generate a secure token

### Required Nodes

1. **Webhook** node (trigger)
2. **AI Agent** node to process natural language queries
3. **Output Parser** node to structure the results
4. **Google Calendar Tool** nodes for each action:
   - SearchEvent: List events matching criteria
   - CreateEvent: Create a new calendar event
   - UpdateEvent: Modify existing events
   - DeleteEvent: Remove events from calendar
5. **Respond to Webhook** node to return appropriate responses

## Environment Variables

After setting up your n8n workflows, copy the relevant webhook URLs and authentication details into your `.env.local` file:

```
N8N_RAG_TOOL_WEBHOOK_URL=https://yourinstance.n8n.cloud/webhook/your-search-webhook-path
N8N_RAG_TOOL_AUTH_TOKEN=your_search_auth_token
N8N_RAG_TOOL_AUTH_HEADER=etrag

N8N_TAVILY_SEARCH_WEBHOOK_URL=https://yourinstance.n8n.cloud/webhook/your-tavily-webhook-path
N8N_TAVILY_SEARCH_AUTH_HEADER=tavily
N8N_TAVILY_SEARCH_AUTH_TOKEN=your_tavily_auth_token
TAVILY_API_KEY=your_tavily_api_key

N8N_LIST_DOCS_TOOL_WEBHOOK_URL=https://yourinstance.n8n.cloud/webhook/your-list-docs-webhook-path
N8N_LIST_DOCS_TOOL_AUTH_HEADER=listdocuments
N8N_LIST_DOCS_TOOL_AUTH_TOKEN=your_list_docs_auth_token

N8N_GET_CONTENTS_TOOL_WEBHOOK_URL=https://yourinstance.n8n.cloud/webhook/your-get-contents-webhook-path
N8N_GET_CONTENTS_TOOL_AUTH_HEADER=getfilecontents
N8N_GET_CONTENTS_TOOL_AUTH_TOKEN=your_get_contents_auth_token

N8N_QUERY_ROWS_TOOL_WEBHOOK_URL=https://yourinstance.n8n.cloud/webhook/your-query-rows-webhook-path
N8N_QUERY_ROWS_TOOL_AUTH_HEADER=querydocumentrows
N8N_QUERY_ROWS_TOOL_AUTH_TOKEN=your_query_rows_auth_token

N8N_EXTRACT_WEBHOOK_URL=https://yourinstance.n8n.cloud/webhook/your-extract-webhook-path
N8N_EXTRACT_AUTH_HEADER=extractfilecontent
N8N_EXTRACT_AUTH_TOKEN=your_extract_auth_token

N8N_GOOGLE_CALENDAR_WEBHOOK_URL=https://yourinstance.n8n.cloud/webhook/your-google-calendar-webhook-path
N8N_GOOGLE_CALENDAR_AUTH_HEADER=googlecalendar
N8N_GOOGLE_CALENDAR_AUTH_TOKEN=your_google_calendar_auth_token
```

## Testing Your Workflows

You can test your workflows using curl or a tool like Postman:

```bash
# Test internal knowledge base search workflow
curl -X POST https://yourinstance.n8n.cloud/webhook/your-search-webhook-path \
  -H "etrag: your_search_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"query":"your search query"}'

# Test SerpAPI web search workflow
curl -X POST https://yourinstance.n8n.cloud/webhook/your-tavily-webhook-path \
  -H "tavily: your_tavily_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"query":"your search query", "api_key":"your_tavily_api_key"}'

# Test list documents workflow
curl -X POST https://yourinstance.n8n.cloud/webhook/your-list-docs-webhook-path \
  -H "listdocuments: your_list_docs_auth_token" \
  -H "Content-Type: application/json"

# Test document retrieval workflow
curl -X POST https://yourinstance.n8n.cloud/webhook/your-get-contents-webhook-path \
  -H "getfilecontents: your_get_contents_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"file_id":"your_file_id"}'

# Test spreadsheet query workflow
curl -X POST https://yourinstance.n8n.cloud/webhook/your-query-rows-webhook-path \
  -H "querydocumentrows: your_query_rows_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"file_id":"your_spreadsheet_id"}'

# Test Google Calendar workflow - Search events
curl -X POST https://yourinstance.n8n.cloud/webhook/your-google-calendar-webhook-path \
  -H "googlecalendar: your_google_calendar_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"action":"search","query":"meetings tomorrow"}'

# Test Google Calendar workflow - Create event
curl -X POST https://yourinstance.n8n.cloud/webhook/your-google-calendar-webhook-path \
  -H "googlecalendar: your_google_calendar_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"action":"create","eventDetails":{"summary":"Team Meeting","startDateTime":"2024-05-30T09:00:00","endDateTime":"2024-05-30T10:00:00","description":"Weekly team sync"}}'

# Test Google Calendar workflow - Update event
curl -X POST https://yourinstance.n8n.cloud/webhook/your-google-calendar-webhook-path \
  -H "googlecalendar: your_google_calendar_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"action":"update","eventId":"EVENT_ID_HERE","eventDetails":{"summary":"Updated Meeting Title"}}'

# Test Google Calendar workflow - Delete event
curl -X POST https://yourinstance.n8n.cloud/webhook/your-google-calendar-webhook-path \
  -H "googlecalendar: your_google_calendar_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"action":"delete","eventId":"EVENT_ID_HERE"}'

# Test file extraction workflow
curl -X POST https://yourinstance.n8n.cloud/webhook/your-extract-webhook-path \
  -H "extractfilecontent: your_extract_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"fileUrl":"https://example.com/path/to/file.pdf"}'
``` 