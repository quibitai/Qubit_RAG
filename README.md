# Quibit RAG

> A modular, enterprise-grade Retrieval-Augmented Generation (RAG) system with native file handling, Google Drive integration, and modern chatbot interface

**Status**: Stable  
**Last Updated**: 2024-12-23  
**Version**: 2.3.0

![Version](https://img.shields.io/badge/version-2.3.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-15.3.0-black)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-green)
![LangChain](https://img.shields.io/badge/LangChain-0.3.24-yellow)

## Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [File Processing](#file-processing)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Overview

Quibit RAG is a modular, multi-tenant AI assistant platform that combines modern language models with retrieval techniques and a robust tool registry. Built on Next.js, LangChain, and Supabase, it's designed for extensibility, maintainability, and real-time streaming.

### Core Capabilities
- **Client-Aware Configuration**: Each client receives unique, context-aware experiences with custom prompts, tool access, and specialist personas
- **Context Management**: Automatic entity extraction, conversation summarization, and long-term memory
- **Modular Tool Registry**: Easily add, remove, or update tools for document search, file handling, calendar, web search, and more
- **Real-time Streaming**: Server-Sent Events (SSE) for responsive chat and document updates
- **Multi-tenancy**: Client-aware context, permissions, and data isolation
- **Cross-Platform Integration**: Google Drive, Supabase, Tavily, Google Calendar, Asana, and more

### System Components
- **Brain Orchestrator**: Central LangChain agent for AI interactions
- **Specialist Registry**: Contextual AI personas (General Chat, Echo Tango, custom specialists)
- **Context Engine**: Advanced conversation memory and entity tracking
- **Tool Framework**: Modular integrations with external services
- **Document Editor**: Real-time collaborative document creation
- **File Processing**: Intelligent extraction and analysis pipeline

## Key Features

### Version 2.3.0 Features (Latest)
- **Modular Asana Integration**: Complete rebuild of Asana tool with modular architecture, intent parsing, and comprehensive API coverage
- **Google Calendar Tool**: Dedicated Google Calendar integration (renamed from n8n MCP Gateway) for focused calendar management
- **Enhanced Tool Architecture**: Improved modularity, error handling, and type safety across all tools
- **Comprehensive Documentation**: Updated documentation for all tools and architectural improvements

### Version 2.2.0 Features
- **Advanced Asana Operations**: Complete task management, project operations, and natural language processing
- **Tool Framework Improvements**: Enhanced error handling, timeout management, and response formatting
- **Performance Optimizations**: Improved caching strategies and API efficiency

### Version 2.1.0 Features
- **Comprehensive Context Management**: Advanced entity extraction, conversation summarization, and cross-chat context sharing
- **Enhanced Tool Integration**: Improved reliability and client-specific configurations
- **Background Processing**: Non-blocking entity extraction and context building
- **Improved Documentation**: Comprehensive API documentation and style guides

### Version 2.0.0 Foundation
- **Client-Aware Configuration System**: Dynamic prompts and tool access per client using unified configuration schema
- **General Chat Specialist**: Dedicated, client-contextualized specialist for standard chat contexts
- **Unified Specialist Registry**: Centralized management of all specialists with no UI duplicates
- **Comprehensive Test Suite**: Unit and integration tests for prompts, tools, and client context injection

## Architecture

Quibit RAG follows a modular, streaming architecture optimized for scalability and maintainability:

### High-Level Data Flow

```mermaid
graph TD
    A[Frontend] --> B[Brain API]
    B --> C[LangChain Agent]
    C --> D[Tool Registry]
    C --> E[Context Manager]
    B --> F[Database Layer]
    G[File Upload] --> H[Processing Pipeline]
    H --> I[Content Extraction]
```

### Key Components

#### 🧠 **Brain API** (`/api/brain`)
- Central orchestration endpoint using LangChain agents
- Dynamic tool selection based on context and permissions
- Real-time SSE streaming with structured data
- Context-aware prompt composition

#### 🔧 **Tool Registry** (`/lib/ai/tools/`)
- Modular, self-contained tool implementations
- Direct API integrations (Google Drive, Supabase, Tavily, etc.)
- Client-specific configuration support
- Unified error handling and logging

#### 🎯 **Context Manager** (`/lib/context/`)
- Automatic entity extraction (addresses, dates, names, etc.)
- Conversation summarization for long chats
- File reference tracking and metadata storage
- Cross-chat context sharing

#### 📊 **Data Layer**
- PostgreSQL (Supabase) for structured and vector data
- Vercel Blob for file storage
- Row-level security (RLS) for multi-tenancy
- Real-time subscriptions

## Getting Started

### Prerequisites
- **Node.js** (v18+)
- **pnpm** (9.12.3) - Required package manager
- **PostgreSQL** database (Supabase recommended)
- **OpenAI API key**
- **Google API credentials** (optional, for Drive integration)

### Quick Installation

1. **Clone and install dependencies:**
```bash
git clone https://github.com/quibitai/Quibit_RAG.git
cd Quibit_RAG
pnpm install
```

2. **Environment configuration:**
```bash
cp .env.example .env.local
```

3. **Configure essential environment variables:**
```env
# Core Configuration
OPENAI_API_KEY=your_openai_api_key
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secure_secret

# Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_key
POSTGRES_URL=your_postgres_connection_string

# Optional Integrations
N8N_EXTRACT_WEBHOOK_URL=your_n8n_webhook_url
N8N_EXTRACT_AUTH_TOKEN=your_n8n_auth_token
TAVILY_API_KEY=your_tavily_api_key
```

4. **Database setup:**
```bash
pnpm db:migrate
```

5. **Start development server:**
```bash
pnpm dev
```

Access the application at [http://localhost:3000](http://localhost:3000)

### Docker Setup (Alternative)

```bash
# Using Docker Compose
docker-compose up -d

# Using individual containers
docker build -t quibit-rag .
docker run -p 3000:3000 quibit-rag
```

## File Processing

### Supported Formats
- **Documents**: PDF, DOCX, TXT, MD, JSON
- **Spreadsheets**: XLSX, CSV
- **Images**: PNG, JPG, GIF (with OCR)
- **Code**: JS, TS, PY, and more

### Processing Pipeline
1. **Upload**: Files stored in Vercel Blob
2. **Extraction**: n8n workflow for content extraction
3. **Analysis**: LLM-powered content understanding
4. **Storage**: Metadata and content stored in database
5. **Context Integration**: Automatic reference tracking

### Advanced Features
- **Fallback Extraction**: LLM-based processing for unsupported formats
- **Microsoft Office Support**: Native GPT-4 document processing
- **Multi-modal Support**: Text, images, and structured data
- **Version Tracking**: File update history and diff tracking

## Development

### Development Commands
```bash
# Development
pnpm dev              # Start development server with Turbo
pnpm build           # Build for production
pnpm start           # Start production server

# Code Quality
pnpm lint            # Run ESLint and Biome
pnpm lint:fix        # Fix linting issues
pnpm format          # Format code with Biome

# Database
pnpm db:generate     # Generate migrations
pnpm db:migrate      # Run migrations
pnpm db:studio       # Open Drizzle Studio

# Testing
pnpm test            # Run Playwright tests
```

### Project Structure
```
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── brain/         # Main AI endpoint
│   │   └── files/         # File handling
│   └── (auth)/            # Authentication
├── lib/                   # Core libraries
│   ├── ai/               # AI and tool logic
│   ├── context/          # Context management
│   ├── db/               # Database schema
│   └── utils/            # Utilities
├── components/           # React components
├── docs/                # Documentation
└── tests/              # Test suites
```

### Code Standards
- **File Size**: Maximum 200 lines per file for maintainability
- **Documentation**: JSDoc comments for all public functions
- **Testing**: Unit and integration tests required
- **Type Safety**: Strict TypeScript configuration
- **Code Style**: Biome for formatting and linting

## Documentation

### Complete Documentation
- **[API Reference](./docs/api/)** - Complete endpoint documentation
- **[Architecture Guide](./ARCHITECTURE.md)** - System design and decisions
- **[Prompt System](./docs/prompt-architecture-guide.md)** - Configuration and customization
- **[Development Guide](./docs/guides/)** - Setup and development workflow
- **[Style Guide](./DOCUMENTATION_STYLE_GUIDE.md)** - Documentation standards

### Key Guides
- **[Message Handling](./docs/MESSAGE_HANDLING.md)** - LangChain message processing
- **[Context Management](./docs/planning/context-management-plan.md)** - Advanced context features
- **[Tool Development](./docs/guides/tool-development.md)** - Creating custom tools
- **[Client Configuration](./docs/configuration-json-guide.md)** - Multi-tenant setup
- **[Debugging](./docs/debugging.md)** - Troubleshooting and diagnostics

### Testing Documentation
- **[Test Overview](./tests/prompts/README.md)** - Testing strategy and setup
- **[E2E Testing](./docs/guides/e2e-testing.md)** - End-to-end test setup
- **[Performance Testing](./docs/guides/performance.md)** - Load and performance testing

## Contributing

We welcome contributions! Please read our guidelines:

1. **[Contributing Guide](./CONTRIBUTING.md)** - Detailed contribution process
2. **[Code of Conduct](./CODE_OF_CONDUCT.md)** - Community standards
3. **[Development Guide](./docs/guides/development.md)** - Local setup and workflow
4. **[Style Guide](./DOCUMENTATION_STYLE_GUIDE.md)** - Documentation standards

### Quick Start for Contributors
```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/Quibit_RAG.git
cd Quibit_RAG

# Create feature branch
git checkout -b feature/amazing-feature

# Install dependencies
pnpm install

# Make changes and test
pnpm lint
pnpm test

# Commit and push
git commit -m "Add amazing feature"
git push origin feature/amazing-feature
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Support

- **GitHub Issues**: [Report bugs and request features](https://github.com/quibitai/Quibit_RAG/issues)
- **Documentation**: [Complete documentation portal](./docs/)
- **Community**: [Discussions and support](https://github.com/quibitai/Quibit_RAG/discussions)

---

**Built with ❤️ by the Quibit Team**  
**Last Updated**: 2024-12-23  
**Version**: 2.3.0
