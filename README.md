# N8N RAG Integration for Next.js

A modular Next.js application that integrates with n8n workflows to provide powerful RAG (Retrieval Augmented Generation) capabilities. This application leverages n8n's workflow automation to access and query document repositories through a conversational AI interface.

## Features

- **Conversational AI Interface**: Built with Next.js and the AI SDK
- **Multiple RAG Tools**:
  - **Search Tool**: Semantic search across document collections
  - **List Documents Tool**: Quick access to available document inventory
  - **Document Retrieval Tool**: Full document content access by file ID
  - **Spreadsheet Query Tool**: Analyze structured data in spreadsheets
- **OpenAI Integration**: Powered by GPT-4o-mini for chat and o3-mini for reasoning

## Project Structure

```
N8N_v002/
├── app/
│   └── (chat)/api/chat/route.ts  # Main API route handling AI requests
├── lib/
│   ├── ai/
│   │   ├── providers.ts          # AI model provider configuration
│   │   ├── prompts.ts            # System prompts and instructions
│   │   └── tools/                # AI tool implementations
│   │       ├── list-documents.ts # List available documents
│   │       ├── retrieve-document.ts # Get full document content
│   │       ├── query-document-rows.ts # Query spreadsheet data
│   │       └── ...               # Other tool implementations
│   └── ...                       # Other library code
└── .env.local                    # Environment configuration
```

## Setup

1. Clone the repository:
```bash
git clone https://github.com/quibitai/etn8n002.git
cd etn8n002
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment variables in `.env.local`:
```
# N8N RAG Tools
N8N_RAG_TOOL_WEBHOOK_URL=your_search_webhook_url
N8N_RAG_TOOL_AUTH_TOKEN=your_search_auth_token
N8N_RAG_TOOL_AUTH_HEADER=your_search_auth_header

N8N_LIST_DOCS_TOOL_WEBHOOK_URL=your_list_docs_webhook_url
N8N_LIST_DOCS_TOOL_AUTH_HEADER=your_list_docs_auth_header
N8N_LIST_DOCS_TOOL_AUTH_TOKEN=your_list_docs_auth_token

N8N_GET_CONTENTS_TOOL_WEBHOOK_URL=your_get_contents_webhook_url
N8N_GET_CONTENTS_TOOL_AUTH_HEADER=your_get_contents_auth_header
N8N_GET_CONTENTS_TOOL_AUTH_TOKEN=your_get_contents_auth_token

N8N_QUERY_ROWS_TOOL_WEBHOOK_URL=your_query_rows_webhook_url
N8N_QUERY_ROWS_TOOL_AUTH_HEADER=your_query_rows_auth_header
N8N_QUERY_ROWS_TOOL_AUTH_TOKEN=your_query_rows_auth_token

# Authentication
AUTH_SECRET=your_auth_secret

# Database
POSTGRES_URL=your_postgres_connection_string

# OpenAI API
OPENAI_API_KEY=your_openai_api_key
```

4. Start the development server:
```bash
pnpm dev
```

## N8N Workflows

This application connects to four distinct n8n workflows:

1. **Search Tool**: Performs semantic search through document embeddings
   - Webhook: `N8N_RAG_TOOL_WEBHOOK_URL`
   - Input: `{ "query": "your search query" }`
   - Output: Relevant text snippets from documents

2. **List Documents Tool**: Lists all available documents
   - Webhook: `N8N_LIST_DOCS_TOOL_WEBHOOK_URL`
   - Input: No parameters required
   - Output: `[{ "id": "document_id", "title": "Document Title" }, ...]`

3. **Document Retrieval Tool**: Gets full content of a specific document
   - Webhook: `N8N_GET_CONTENTS_TOOL_WEBHOOK_URL`
   - Input: `{ "file_id": "document_id" }`
   - Output: `{ "document_text": "full document content..." }`

4. **Spreadsheet Query Tool**: Retrieves structured data from spreadsheets
   - Webhook: `N8N_QUERY_ROWS_TOOL_WEBHOOK_URL`
   - Input: `{ "file_id": "spreadsheet_id" }`
   - Output: `[{ "row_data": { "column1": "value1", "column2": "value2", ... } }, ...]`

## AI Tool Usage

The AI assistant will automatically select the appropriate tool based on the user's query:

- For general information needs, it uses the **Search Tool**
- When asked about available documents, it uses the **List Documents Tool**
- For full document content retrieval, it uses the **Document Retrieval Tool**
- For spreadsheet data analysis, it uses the **Spreadsheet Query Tool**

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
