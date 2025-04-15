# N8N Workflow Documentation

This document provides details on how to set up the n8n workflows that power the RAG tools in this application.

## Overview

The application uses five distinct n8n workflows:

1. **Internal Knowledge Base Search Tool**: Performs semantic search in documents
2. **Web Search Tool (Tavily)**: Performs web searches and summarizes results
3. **List Documents Tool**: Lists all available documents
4. **Document Retrieval Tool**: Gets full content of a document by ID
5. **Spreadsheet Query Tool**: Retrieves and processes spreadsheet data

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
2. **Function** node to extract the search query from the request body
3. **PostgreSQL** or **Vector Database** node to perform the semantic search
4. **Set** node to format the response
5. **Respond to Webhook** node to return the results

### Example Configuration

```javascript
// Function node: Extract query
return {
  query: $input.body.query
};

// Set node: Format response
return items.map(item => ({
  content: item.json.document_text,
  metadata: item.json.metadata
}));
```

## Workflow 2: Web Search Tool (Tavily)

This workflow performs web searches using the Tavily API and returns summarized results.

### Webhook Setup

1. Create a new n8n workflow
2. Add a **Webhook** node as the trigger
   - Method: POST
   - Authentication: Header Auth
   - Auth Header Name: `tavily` (or your preferred name)
   - Auth Header Value: Generate a secure token

### Required Nodes

1. **Webhook** node (trigger)
2. **Function** node to extract the search query and parameters
   ```javascript
   return {
     query: $input.body.query,
     api_key: $input.body.api_key,
     search_depth: $input.body.search_depth || 'basic',
     max_results: $input.body.max_results || 5
   };
   ```
3. **HTTP Request** node to call the Tavily API
   - URL: `https://api.tavily.com/search`
   - Method: POST
   - Headers: `{"Content-Type": "application/json"}`
   - Body: Raw JSON with query, api_key, search_depth, max_results
4. **Function** node to process and summarize the results
   ```javascript
   const data = $node["HTTP Request"].json;
   
   if (!data.results || data.results.length === 0) {
     return { summary: `No results found for "${$input.body.query}"` };
   }
   
   // Process the results and create a summary
   const title = data.results[0].title || "Untitled";
   const content = data.results[0].content || data.results[0].raw_content;
   
   return {
     summary: `Based on information from ${title}: ${content.substring(0, 1000)}...`
   };
   ```
5. **Respond to Webhook** node to return the summarized results

## Workflow 3: List Documents Tool

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
   ```sql
   SELECT DISTINCT metadata->>'file_id' as id, 
          metadata->>'title' as title 
   FROM documents
   ORDER BY title
   ```
3. **Set** node to format response
4. **Respond to Webhook** node to return the results

## Workflow 4: Document Retrieval Tool

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
2. **Function** node to extract the file_id
   ```javascript
   return {
     file_id: $input.body.file_id
   };
   ```
3. **PostgreSQL** node to retrieve document content
   ```sql
   SELECT string_agg(content, ' ') as document_text
   FROM documents
   WHERE metadata->>'file_id' = $1
   GROUP BY metadata->>'file_id'
   ```
4. **Error Handling** node (optional)
5. **Respond to Webhook** node to return the document text

## Workflow 5: Spreadsheet Query Tool

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
2. **Function** node to extract the file_id
3. **PostgreSQL** node to retrieve spreadsheet data
   ```sql
   SELECT json_build_object('row_data', row_to_json(d)) as row_data
   FROM (
     SELECT * FROM spreadsheet_data
     WHERE file_id = $1
   ) d
   ```
4. **Error Handling** node for file not found
5. **Respond to Webhook** node to return the structured data

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
```

## Testing Your Workflows

You can test your workflows using curl or a tool like Postman:

```bash
# Test internal knowledge base search workflow
curl -X POST https://yourinstance.n8n.cloud/webhook/your-search-webhook-path \
  -H "etrag: your_search_auth_token" \
  -H "Content-Type: application/json" \
  -d '{"query":"your search query"}'

# Test Tavily web search workflow
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
``` 