# Quibit RAG

A modular, scalable Retrieval-Augmented Generation (RAG) system with Google Drive integration and a Vercel-hosted chatbot interface.

## 🌟 Overview

Quibit RAG combines advanced language models with RAG techniques to provide AI assistants with access to your organization's knowledge base. It features:

- Document retrieval from Google Drive
- Semantic search capabilities
- Vector storage for efficient document embedding
- Context-aware responses
- Modern, responsive UI

## 🏗️ Architecture

Quibit RAG follows a modular design with these key components:

### Data Ingestion
- Google Drive integration for document source
- Document chunking and preprocessing
- Vector embedding generation
- Metadata storage

### Retrieval System
- Semantic search over vector database
- Context-aware document retrieval
- Support for different embedding models

### Generation Layer
- LLM integration with OpenAI models
- Context window optimization
- Response generation with citations

### Web Interface
- Modern React/Next.js UI
- Real-time streaming responses
- Support for conversation history
- Vercel deployment

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Supabase account for vector storage
- OpenAI API key
- Google API credentials

### Installation

1. Clone the repository:
```bash
git clone https://github.com/quibitai/Quibit_RAG.git
cd Quibit_RAG
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Fill in the required environment variables in `.env.local`:
```
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

5. Run the development server:
```bash
npm run dev
```

Access the application at http://localhost:3001

## 🧩 Core Components

### Message Handling System

The system ensures proper handling of various message types, including tool messages with complex content structures, through:

- Robust content sanitization
- Multiple fallback mechanisms
- Support for nested object structures

### Tool Integration

Quibit RAG includes several tools that enhance the capabilities of the AI:
- Google Drive document search and retrieval
- Weather information retrieval
- Web search integration

### Error Handling

Comprehensive error handling ensures system reliability:
- Message content type validation
- Runtime error logging
- Fallback strategies for unexpected inputs

## 🧪 Development

### Running Tests
```bash
npm test
```

### Debugging
The system includes extensive logging that can be enabled by setting:
```
DEBUG=quibit:*
```

## 📄 License

MIT

## 🙏 Acknowledgements

- [LangChain.js](https://js.langchain.com/) for agent and tool integration
- [Supabase](https://supabase.com/) for vector storage
- [Next.js](https://nextjs.org/) for the web framework
- [Vercel AI SDK](https://github.com/vercel/ai) for AI integration
