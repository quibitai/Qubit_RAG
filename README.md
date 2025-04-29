# Quibit RAG

A modular, enterprise-grade Retrieval-Augmented Generation (RAG) system with native file handling, Google Drive integration, and a modern Vercel-hosted chatbot interface.

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-15.3.0-black)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-green)
![LangChain](https://img.shields.io/badge/LangChain-0.3.24-yellow)

## 🌟 Overview

Quibit RAG is an advanced AI assistant platform that combines modern language models with retrieval techniques to provide accurate, context-aware responses. Built on Next.js and deployed on Vercel, it offers enterprise-grade features including:

- **Robust Document Processing**: Support for Microsoft Office formats, PDFs, and more with intelligent fallback extraction
- **Google Drive Integration**: Seamless access to your organization's knowledge base
- **Vector Search**: Semantic document retrieval using Supabase's vector storage
- **Tool Integration**: Weather, web search, Google Calendar, and other tools
- **Modern UI**: Responsive interface with real-time streaming responses
- **Multi-model Support**: Dynamic LLM selection based on use cases
- **Multi-user Capabilities**: Authentication and permission management

## ✨ Key Features in v1.2.0

### Enhanced File Processing

- **Intelligent File Extraction**: Primary extraction with n8n workflows and fallback to direct LLM processing
- **Microsoft Office Format Support**: Native handling of DOCX, XLSX, PPTX files using GPT-4's capabilities
- **Smart File Detection**: Format-specific processing strategies for optimal results
- **Graceful Fallbacks**: Automatic recovery when primary extraction fails

### Improved Brain API

- **Context-aware Processing**: Better handling of file context in LLM prompts
- **Dynamic Instruction Generation**: Specialized instructions based on file type
- **Enhanced Error Handling**: Clear user feedback for processing limitations

### Refined UX

- **Clearer Error Messages**: Improved user feedback for file processing issues
- **Streamlined Interactions**: Fewer unnecessary tool calls for supported formats
- **Responsive Design**: Optimized mobile and desktop experience

## 🏗️ Architecture

Quibit RAG follows a modular architecture with these key components:

### Client Layer
- Next.js front-end with React components
- AI SDK integration for streaming responses
- SWR for data fetching and state management
- Modern UI with Tailwind CSS

### API Layer
- RESTful endpoints for chat, brain, and file operations
- Authentication via NextAuth
- Streaming response support
- File upload and processing

### Brain Orchestration
- LangChain agent-based orchestration
- Tool integration for external services
- Context management for conversations
- Dynamic model selection

### Data Layer
- PostgreSQL for structured data
- Supabase for vector storage
- Vercel Blob for file storage
- Google Drive API integration

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL database
- Supabase account for vector storage
- OpenAI API key
- Google API credentials
- n8n instance (optional for advanced extraction)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/quibitai/Quibit_RAG.git
cd Quibit_RAG
```

2. Install dependencies:
```bash
npm install
# or
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure essential environment variables in `.env.local`:
```
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_key
POSTGRES_URL=your_postgres_connection_string
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secure_secret

# Optional n8n configuration
N8N_EXTRACT_WEBHOOK_URL=your_n8n_webhook_url
N8N_EXTRACT_AUTH_TOKEN=your_n8n_auth_token
```

5. Run database migrations:
```bash
npm run db:migrate
```

6. Start the development server:
```bash
npm run dev
```

Access the application at http://localhost:3000

## 📂 File Processing Capabilities

Quibit RAG offers advanced file processing with a multi-tiered approach:

1. **Primary Extraction (n8n)**: Uses n8n workflows for optimal extraction
2. **Fallback Extraction**: Intelligent fallback when primary extraction fails
3. **Format-Specific Handling**: Special processing for different file types:
   - Microsoft Office documents (DOCX, XLSX, PPTX)
   - PDF files
   - Plain text and markdown
   - JSON and structured data
   - Images and other binary formats

### Office Document Processing

The system leverages GPT-4's native ability to understand Microsoft Office formats:

```mermaid
graph TD
    A[Upload Office Document] --> B{Primary Extraction}
    B -->|Success| C[Process Extracted Content]
    B -->|Failure| D[Detect Format]
    D -->|Office Format| E[Use GPT-4 Native Processing]
    D -->|Other Supported| F[Use Generic Fallback]
    D -->|Unsupported| G[Return Error]
    E --> H[Generate Contextualized Response]
    F --> H
    C --> H
```

## 🧩 Core Components

### Message Handling System

The system uses a robust message handling architecture:

- Type-safe content validation
- Race condition prevention
- Error handling and logging
- Support for various message types
- Attachment processing
- Streaming responses

### Brain API

The central intelligence orchestration:

- LangChain agent integration
- Tool management and execution
- Context window optimization
- Dynamic model selection
- Conversation history management
- File context incorporation

### Tool Integration

Quibit RAG includes several AI tools:

- Google Drive document search and retrieval
- Semantic search over vector database
- Weather information retrieval
- Web search via Tavily
- Google Calendar operations
- File extraction and processing

## 🧪 Development

### Running Tests
```bash
npm test
```

### Database Operations
```bash
# Run migrations
npm run db:migrate

# Generate new migration
npm run db:generate
```

### Environment Setup

For detailed environment setup, see the `.env.example` file and [environment setup documentation](./docs/ENVIRONMENT.md).

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT

## 📚 Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Environment Setup](./docs/ENVIRONMENT.md)
- [Database Schema](./docs/DATABASE.md)
- [Tool Integration](./docs/TOOLS.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
