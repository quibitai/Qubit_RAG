# ETN8N002 - RAG-Enhanced AI Assistant

A Next.js AI chatbot with RAG (Retrieval Augmented Generation) capabilities powered by N8N workflows for document retrieval, web search, and structured data queries. This assistant helps users interact with internal documents, spreadsheets, and knowledge bases through natural language.

## Features

- 🔍 Semantic search over internal knowledge base
- 🌐 Web search integration via Google Search API (via SerpAPI)
- 📄 Document listing and retrieval from Google Drive
- 📊 SQL-like queries for spreadsheet data
- 💬 AI assistant with streaming responses using OpenAI models (GPT-4.1 and GPT-4.1-mini)
- 🔄 N8N integration for data processing workflows
- 🔐 Authentication and session management
- 🎨 Modern UI with dark mode support
- 📱 Responsive design for mobile and desktop
- 🔒 Secure environment variable handling
- 🧠 Intelligent tool selection with search-before-creation logic
- 📤 Advanced file upload functionality:
  - Drag-and-drop support for various file types
  - PDF document extraction
  - Excel/CSV data conversion to readable formats
  - Image handling for AI vision capabilities
  - Intelligent JSON data formatting
- 🛠️ Dual model support:
  - Echo Tango Bit (GPT-4.1-mini) for general chat
  - Orchestrator (GPT-4.1) for advanced reasoning

## Project Structure

```
.
├── app/
│   ├── api/chat/route.ts    # Main chat API endpoint with file processing
│   ├── api/files/          # File upload and processing endpoints
│   ├── (chat)/             # Chat UI components
│   └── (auth)/             # Authentication logic
├── components/             # Reusable UI components
├── lib/
│   ├── ai/
│   │   ├── tools/          # Custom AI tools
│   │   ├── providers.ts    # AI model configuration
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
- Vercel Blob storage token (for file uploads)

## N8N Workflows

This project uses five N8N workflows for backend processing:

1. **Internal Knowledge Base Search Tool**
   - Semantic search against internal documents
   - Supports natural language queries
   - Returns relevant document snippets

2. **Web Search Tool (SerpAPI)**
   - Performs web searches using Google Search API via SerpAPI
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

6. **File Extraction Workflow**
   - Extracts text from uploaded documents (PDF, XLSX, etc.)
   - Converts spreadsheet data to readable formats
   - Handles different file types appropriately

See the [N8N Workflows Documentation](./docs/N8N_WORKFLOWS.md) for detailed setup instructions.

### Testing Webhooks

Test scripts are provided in the `/tests` directory:

```bash
node tests/test-updated-n8n-webhook.js      # Test RAG search
node tests/test-list-docs-webhook.js        # Test document listing
node tests/test-get-contents-webhook.js     # Test content retrieval
node tests/test-query-rows-webhook.js       # Test data queries
```

## Private Repository Deployment

When using a private GitHub repository with Vercel, you need to configure the following:

### For Hobby Plan (Free Tier)
- Only the account owner can trigger deployments from a private repository
- Ensure your Git email address matches your Vercel account email
- You may need to reinstall the Vercel for GitHub integration to ensure it has access to your private repository

### For Pro/Enterprise Plans
- All team members who need to commit and trigger deployments must be added to the Vercel team
- Each team member must have their Git email address match their Vercel account email
- Check project settings under Git configuration to ensure proper branch setup

### Troubleshooting Deployment Issues
If deployments are not triggered automatically:
1. Check for deployment limit errors in commit comments
2. Verify Git integration permissions in your Vercel account settings
3. Try a manual deployment from the Vercel dashboard
4. Check webhook settings in your GitHub repository

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
  - Vercel AI SDK 4.3.4

- **Backend**
  - N8N workflows for document processing
  - PostgreSQL with Drizzle ORM
  - Next-Auth 5.0 for authentication
  - OpenAI API (GPT-4.1 and GPT-4.1-mini)
  - Google Search API via SerpAPI
  - Vercel Blob for file storage

## Version History

- v2.0.0 - Current
  - Enhanced file processing for Excel, PDF, and text documents
  - Improved JSON data formatting for spreadsheet data
  - Fixed AI model handling to support file attachments
  - Added sanitization of messages to prevent errors with file types
  - Enhanced console debugging for file processing
  - Better error handling throughout the application
  - Replaced Tavily search with Google Search API via SerpAPI

- v1.5.0
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
