# ETN8N002 - RAG-Enhanced AI Assistant

A Next.js AI chatbot with RAG (Retrieval Augmented Generation) capabilities powered by N8N workflows for document retrieval, search, and structured data queries.

## Features

- 🔍 Semantic search over internal knowledge base
- 📄 Document listing and retrieval
- 📊 SQL-like queries for spreadsheet data
- 💬 AI assistant with streaming responses
- 🔄 N8N integration for data processing workflows
- 🔐 Authentication and session management

## Project Structure

- `app/api/chat/route.ts` - Main API endpoint for chat functionality
- `lib/ai/tools/` - Custom AI tools for document retrieval, search, and more
- `app/(chat)/` - Chat UI components and functionality
- `app/(auth)/` - Authentication components and logic
- `test-*.js` - Test scripts for N8N webhooks

## Setup

1. Clone the repository
2. Install dependencies with `pnpm install`
3. Copy `.env.example` to `.env.local` and fill in the values
4. Run the development server with `pnpm dev`

### Environment Variables

The following environment variables are required:

```env
# N8N Webhooks
N8N_RAG_TOOL_WEBHOOK_URL=
N8N_RAG_TOOL_AUTH_HEADER=
N8N_RAG_TOOL_AUTH_TOKEN=
N8N_LIST_DOCS_TOOL_WEBHOOK_URL=
N8N_LIST_DOCS_TOOL_AUTH_HEADER=
N8N_LIST_DOCS_TOOL_AUTH_TOKEN=
N8N_GET_CONTENTS_TOOL_WEBHOOK_URL=
N8N_GET_CONTENTS_TOOL_AUTH_HEADER=
N8N_GET_CONTENTS_TOOL_AUTH_TOKEN=
N8N_QUERY_ROWS_TOOL_WEBHOOK_URL=
N8N_QUERY_ROWS_TOOL_AUTH_HEADER=
N8N_QUERY_ROWS_TOOL_AUTH_TOKEN=

# Auth
AUTH_SECRET=

# Database
POSTGRES_URL=

# OpenAI
OPENAI_API_KEY=
```

## N8N Workflows

This project uses N8N for backend processing. Four custom webhooks are used:

1. **RAG Search Tool** - Semantic search against your knowledge base
2. **List Documents Tool** - List all available documents
3. **Document Retrieval Tool** - Get the full content of a specific document
4. **Spreadsheet Query Tool** - Run SQL-like queries against spreadsheet data

### Testing N8N Webhooks

This repository includes test scripts to verify each N8N webhook is working correctly:

```bash
# Test the RAG search webhook
node test-updated-n8n-webhook.js

# Test the list documents webhook
node test-list-docs-webhook.js

# Test the document retrieval webhook 
node test-get-contents-webhook.js

# Test the spreadsheet query webhook
node test-query-rows-webhook.js
```

Make sure to configure your N8N workflows properly:
1. Each workflow should have a "Respond to Webhook" node at the end
2. For PostgreSQL nodes, format query parameters as arrays: `["{{ $('webhook').first().json.body.paramName }}"]`
3. Activate all workflows in the N8N dashboard

## Deployment

This project is configured for deployment on Vercel. To deploy:

1. Push to GitHub
2. Connect to Vercel
3. Set up all required environment variables in the Vercel dashboard
4. Deploy the project

## Technologies

- Next.js 15
- Vercel AI SDK
- N8N for backend workflows
- PostgreSQL for data storage
- Tailwind CSS for styling
- Next-Auth for authentication

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
