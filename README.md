# Quibit RAG

A modular, enterprise-grade Retrieval-Augmented Generation (RAG) system with native file handling, Google Drive integration, and a modern Vercel-hosted chatbot interface.

![Version](https://img.shields.io/badge/version-1.7.9-blue)
![Next.js](https://img.shields.io/badge/Next.js-15.3.0-black)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-green)
![LangChain](https://img.shields.io/badge/LangChain-0.3.24-yellow)

## 🌟 Overview

Quibit RAG is a modular, multi-tenant AI assistant platform that combines modern language models with retrieval techniques and a robust tool registry. It is built on Next.js, LangChain, and Supabase, and is designed for extensibility, maintainability, and real-time streaming.

- **Modular Tool Registry**: Easily add, remove, or update tools for document search, file handling, calendar, web search, and more
- **Streaming Responses**: Real-time chat and document updates via SSE
- **Multi-Tenancy**: Client-aware context, permissions, and data isolation
- **Modern UI**: Responsive, real-time interface with file upload and document editing
- **Direct API Integrations**: Google Drive, Supabase, Tavily, Google Calendar (via n8n MCP), and more
- **Prompt System**: Modular, context-aware prompt composition for orchestrator and specialist personas

## ✨ Key Features in v1.7.9

- Modular tool registry with direct API integrations
- Streaming chat and document updates
- Multi-tenant support with row-level security
- File upload and extraction (n8n used only for extraction/MCP)
- Dynamic prompt system for orchestrator and specialists
- Real-time document editor with debugging tools

## 🏗️ Architecture

Quibit RAG follows a modular, streaming architecture:

### Client Layer
- Next.js front-end with React components
- Real-time streaming UI (SSE)
- File upload and document editor

### API Layer
- `/api/brain`: Central orchestration endpoint (LangChain agent, streaming)
- `/api/files/upload`: File upload (Vercel Blob)
- `/api/files/extract`: File extraction (n8n workflow)
- Authentication via NextAuth

### Brain Orchestration
- LangChain agent with dynamic toolset
- Modular tool registry (`lib/ai/tools/`)
- Prompt system with orchestrator and specialist personas
- Streaming SSE responses

### Data Layer
- PostgreSQL (Supabase) for structured and vector data
- Vercel Blob for file storage
- n8n for file extraction and some MCP integrations

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL database
- Supabase account for vector storage
- OpenAI API key
- Google API credentials
- n8n instance (optional, for file extraction/MCP)

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

# Optional n8n configuration (for file extraction/MCP)
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

- **Primary Extraction (n8n)**: Uses n8n workflow for optimal extraction (text-based files)
- **Direct Upload**: All files are uploaded to Vercel Blob
- **Format-Specific Handling**: Microsoft Office, PDF, text, JSON, images, etc.

## 🧩 Core Components

- **Message Handling**: Type-safe, multi-layered sanitization, robust error handling
- **Brain API**: Central orchestration, streaming, context-aware, multi-tenant
- **Tool Integration**: Modular, direct API integrations, n8n for extraction/MCP only
- **Prompt System**: Modular, context-aware, orchestrator and specialist personas

## 🧪 Development

- Run tests: `npm test`
- Run migrations: `npm run db:migrate`
- Generate migration: `npm run db:generate`

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT

## 📚 Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Prompt System](./docs/PROMPT_SYSTEM.md)
- [Model Selection](./docs/MODEL_SELECTION.md)
- [Bit & Persona Selection](./docs/Bit-Selection-Implementation.md)
- [Message Handling](./docs/MESSAGE_HANDLING.md)
- [Debugging](./docs/debugging.md)
- [Document Editor Issues](./docs/document-editor-issues.md)
- [N8N Workflows (legacy, for extraction/MCP)](./docs/N8N_WORKFLOWS.md)

## Document Editor Debugging

See `docs/debugging.md` and `docs/document-editor-issues.md` for details on debugging tools and procedures.
