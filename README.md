# ETN8N002 - RAG-Enhanced AI Assistant

A Next.js AI chatbot with RAG (Retrieval Augmented Generation) capabilities powered by N8N workflows for document retrieval, web search, and structured data queries. This assistant helps users interact with internal documents, spreadsheets, and knowledge bases through natural language.

## Features

- 🔍 Semantic search over internal knowledge base
- 🌐 Web search integration via Tavily API
- 📄 Document listing and retrieval from Google Drive
- 📊 SQL-like queries for spreadsheet data
- 💬 AI assistant with streaming responses
- 🔄 N8N integration for data processing workflows
- 🔐 Authentication and session management
- 🎨 Modern UI with dark mode support
- 📱 Responsive design for mobile and desktop
- 🔒 Secure environment variable handling
- 🧠 Intelligent tool selection with search-before-creation logic
- 🚫 No Orchestrator - Direct implementation in route file for simplicity and performance
- 📤 Drag-and-drop file uploads for easy document sharing

## Project Structure

```
.
├── app/
│   ├── api/chat/route.ts    # Main chat API endpoint
│   ├── (chat)/             # Chat UI components
│   └── (auth)/             # Authentication logic
├── components/             # Reusable UI components
├── lib/
│   ├── ai/
│   │   ├── tools/          # Custom AI tools
│   │   └── prompts.ts      # System prompts
│   └── db/                 # Database utilities
├── docs/                   # Documentation
├── sql/                    # Database migrations
└── tests/                  # Test files
```

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Copy `.env.example` to `.env.local` and configure:
   ```bash
   cp .env.example .env.local
   ```
4. Run the development server:
   ```bash
   pnpm dev
   ```

### Environment Variables

Required environment variables (see `.env.example` for details):

- N8N Webhook configurations (URLs, auth headers, tokens)
- Authentication secret
- Database URL
- OpenAI API key
- Tavily API key

## N8N Workflows

This project uses five N8N workflows for backend processing:

1. **Internal Knowledge Base Search Tool**
   - Semantic search against internal documents
   - Supports natural language queries
   - Returns relevant document snippets

2. **Web Search Tool (Tavily)**
   - Performs web searches using the Tavily API
   - Summarizes search results for the AI
   - Attribution of sources in responses

3. **List Documents Tool**
   - Lists available documents from Google Drive
   - Supports filtering and sorting
   - Returns document metadata

4. **Document Retrieval Tool**
   - Fetches full document content
   - Supports various file formats
   - Handles large documents efficiently

5. **Spreadsheet Query Tool**
   - Runs SQL-like queries on spreadsheet data
   - Supports complex data operations
   - Returns structured results

See the [N8N Workflows Documentation](./docs/N8N_WORKFLOWS.md) for detailed setup instructions.

### Testing Webhooks

Test scripts are provided in the `/tests` directory:

```bash
node tests/test-updated-n8n-webhook.js      # Test RAG search
node tests/test-list-docs-webhook.js        # Test document listing
node tests/test-get-contents-webhook.js     # Test content retrieval
node tests/test-query-rows-webhook.js       # Test data queries
```

## Deployment

1. Push to GitHub
2. Connect to Vercel
3. Configure environment variables
4. Deploy

## Technologies

- **Frontend**
  - Next.js 15
  - Tailwind CSS
  - Shadcn UI
  - Vercel AI SDK

- **Backend**
  - N8N workflows
  - PostgreSQL
  - Next-Auth
  - OpenAI API
  - Tavily API

## Version History

- v1.5.0 - Current
  - Added drag-and-drop file upload functionality
  - Improved file attachment UX with better positioning of controls
  - Enhanced tool descriptions for better AI prompt understanding
  - Improved search results handling with support for direct response format
  - Fixed routing implementation for better performance

- v1.4.0
  - Added Tavily web search integration
  - Improved tool architecture and organization
  - Enhanced system prompt with search-before-creation logic
  - Fixed linter issues and improved error handling

- v1.3.0
  - Added SQL-like queries for spreadsheet data
  - Improved document parsing and extraction
  - Enhanced error handling for N8N workflows

- v1.2.0
  - Added custom business queries
  - Improved UI/UX
  - Enhanced documentation
  - Code cleanup and organization

- v1.1.0
  - Added RAG capabilities
  - Integrated N8N workflows
  - Added authentication

- v1.0.0
  - Initial release
  - Basic chat functionality

See the [CHANGELOG](./CHANGELOG.md) for more details on each version.

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For support, please open an issue in the GitHub repository.
