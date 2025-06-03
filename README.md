# Quibit RAG v3.2.0 - Hybrid AI Architecture

## 🔧 Current Status (v3.2.0)

### Backend Systems Status ✅
- **Hybrid Architecture**: Intelligent routing between LangChain and Vercel AI working correctly
- **Image Generation**: Backend successfully generating images and buffering artifact events
- **Tool Execution**: 26 tools functioning properly with intelligent selection
- **Classification**: Query routing working with 95% accuracy
- **Performance**: 30% token reduction and 2-3x faster responses maintained

### Frontend Issues ❌
- **Artifact Display**: Images generated but not appearing in UI due to streaming completion issues
- **History Dropdown**: Chat history navigation broken
- **Text Wrapping**: Overflow issues in resizable containers
- **Streaming Display**: Intermittent rendering problems in response streaming

## ⚠️ Known Issues - Critical

**The following features are currently broken and require immediate attention:**

- **History Global Dropdown**: Chat history dropdown not working properly
- **Text Wrapping in Resizable Containers**: Text overflow issues in resizable UI components  
- **Streaming Responses**: Streaming may be intermittent or failing in some scenarios
- **Artifact UI**: Image artifacts not displaying correctly despite successful backend generation

**Status**: Backend systems are functioning correctly (image generation, tool execution, hybrid routing), but frontend display has multiple UI rendering and interaction issues.

## Overview

Quibit RAG is an advanced AI-powered knowledge management and task automation system featuring a **hybrid architecture** that intelligently routes queries between LangChain Agent (complex operations) and Vercel AI SDK (simple responses) for optimal performance.

## 🚀 Key Features

### Hybrid AI Orchestration
- **Intelligent Query Classification**: Automatically routes queries to the optimal execution path
- **Dual Execution Paths**: LangChain for complex reasoning, Vercel AI SDK for fast responses
- **Unified Response Format**: Seamless user experience regardless of execution path
- **Performance Optimization**: 2-3x faster responses for simple queries, 30% token reduction

### Advanced Tool Ecosystem
- **26 Integrated Tools**: Document creation, Asana project management, knowledge base search, timezone handling
- **Intelligent Tool Selection**: Priority-based scoring with keyword matching
- **Cross-Path Tool Support**: All tools work across both LangChain and Vercel AI execution paths

### Artifact Generation System
- **Cross-Path Image Generation**: AI-generated images work on both execution paths
- **Document Creation**: Text, code, and spreadsheet generation
- **Real-Time Streaming**: Buffered artifact event system with replay mechanism
- **Unified Format**: Consistent artifact handling across all execution paths

### Smart Context Management
- **Context Bleeding Prevention**: AI focuses on current question, not previous conversation
- **Timezone Awareness**: Automatic timezone detection with 70+ city mappings
- **Conversation Persistence**: Chat history with specialist context organization
- **User-Friendly Responses**: Formatted outputs instead of raw data

## 🏗️ Architecture

### Core Services

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Query Input    │    │ BrainOrchestrator│    │ Response Stream │
│                 │───▶│                 │───▶│                 │
│ User Question   │    │ Classification  │    │ Unified Format  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────┐
                    ▼                   ▼
           ┌─────────────────┐ ┌─────────────────┐
           │ LangChain Agent │ │ Vercel AI SDK  │
           │                 │ │                 │
           │ Complex Queries │ │ Simple Queries  │
           │ 4-6 seconds     │ │ 2-3 seconds     │
           │ Multi-step      │ │ Direct response │
           └─────────────────┘ └─────────────────┘
```

### Key Components

| Component | Purpose | File Location |
|-----------|---------|---------------|
| **BrainOrchestrator** | Central routing and coordination | `lib/services/brainOrchestrator.ts` |
| **QueryClassifier** | Intelligent path selection | `lib/services/queryClassifier.ts` |
| **VercelAIService** | Fast execution for simple queries | `lib/services/vercelAIService.ts` |
| **ModernToolService** | Tool selection and management | `lib/services/modernToolService.ts` |
| **MessageService** | Context and conversation handling | `lib/services/messageService.ts` |

## 🛠️ Tech Stack

```typescript
// AI Frameworks
"@langchain/core": "^0.3.0"      // Complex reasoning
"ai": "^4.0.0"                   // Fast responses
"@ai-sdk/openai": "^1.0.0"       // OpenAI integration

// Core Infrastructure  
"next": "^15.0.0"                // Full-stack framework
"typescript": "^5.0.0"           // Type safety
"zod": "^3.22.0"                 // Schema validation

// Database & State
"postgresql": "^3.0.0"           // Chat persistence
"luxon": "^3.4.0"               // DateTime handling
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- OpenAI API key
- Asana API token (optional)

### Installation

```bash
# Clone repository
git clone [repository-url]
cd Quibit_RAG_v002

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your API keys and database URL

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=your_postgresql_url

# Optional integrations
ASANA_PERSONAL_ACCESS_TOKEN=your_asana_token
TAVILY_API_KEY=your_tavily_api_key
GOOGLE_CALENDAR_WEBHOOK_URL=your_calendar_webhook
```

## 📊 Performance Metrics

| Metric | LangChain Path | Vercel AI Path |
|--------|----------------|----------------|
| **Response Time** | 4-6 seconds | 2-3 seconds |
| **Token Usage** | Standard | 30% reduction |
| **Use Cases** | Complex reasoning | Simple queries |
| **Tool Execution** | Multi-step orchestration | Direct calls |

## 🎯 Usage Examples

### Simple Queries (Vercel AI Path)
```
"What's the weather like?"
"Who is on my team in Asana?"
"What time is it in Tokyo?"
```

### Complex Queries (LangChain Path)
```
"Search the knowledge base for project requirements and create a task list"
"Analyze the uploaded document and generate a summary report"
"Find all overdue tasks and create a project status update"
```

### Artifact Generation
```
"Create an image of a logo concept"
"Generate a project timeline document"
"Create a data analysis spreadsheet"
```

## 📁 Project Structure

```
Quibit_RAG_v002/
├── app/                          # Next.js app directory
│   ├── api/brain/               # Main AI orchestration endpoint
│   └── (main)/                  # Main application routes
├── lib/
│   ├── services/                # Core service layer
│   │   ├── brainOrchestrator.ts # Central routing logic
│   │   ├── queryClassifier.ts   # Path selection intelligence
│   │   ├── vercelAIService.ts   # Vercel AI SDK integration
│   │   └── modernToolService.ts # Tool management
│   ├── ai/                      # AI-related utilities
│   │   ├── prompts/             # System prompts and templates
│   │   └── tools/               # Tool definitions
│   └── artifacts/               # Document/image generation
├── components/
│   ├── timezone/                # Timezone detection components
│   └── chat/                    # Chat interface components
└── docs/
    ├── HYBRID_ARCHITECTURE.md   # Architecture documentation
    └── CHANGELOG.md             # Version history
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:services
npm run test:tools
npm run test:integration

# Run with coverage
npm run test:coverage
```

## 📚 Documentation

- **[Hybrid Architecture](HYBRID_ARCHITECTURE.md)**: Comprehensive technical documentation
- **[Changelog](CHANGELOG.md)**: Version history and recent changes
- **[API Documentation](docs/api.md)**: REST API reference
- **[Tool Development Guide](docs/tools.md)**: Creating new tools

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes following the architecture patterns
4. Add tests for new functionality
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines

- **Adding Tools**: Follow the pattern in `modernToolService.ts`
- **Modifying Classification**: Update criteria in `queryClassifier.ts`
- **Extending Artifacts**: Add handlers in `artifacts/` directory
- **Testing**: Maintain 95%+ test coverage

## 📋 Roadmap

### Short-term (v2.9.0)
- Enhanced tool prompting for better utilization
- Classification algorithm fine-tuning
- Advanced artifact types (interactive components)

### Medium-term (v3.0.0)
- Multi-modal support (voice, video)
- Custom tool creation interface
- Advanced analytics dashboard

### Long-term
- Persistent agent memory
- User-defined workflows
- Enterprise integrations

## 🐛 Known Issues

### Critical Issues Requiring Immediate Attention
- **History Global Dropdown**: Chat history dropdown navigation not functioning properly
- **Text Wrapping in Resizable Containers**: Text overflow and display issues in resizable UI components
- **Streaming Responses**: Intermittent streaming response rendering problems  
- **Artifact UI Display**: Generated images not appearing in UI despite successful backend generation

### System Status
- **Backend Health**: ✅ All core systems operational (AI, tools, routing, generation)
- **Frontend Stability**: ❌ Multiple UI interaction and display issues
- **Data Persistence**: ✅ Chat storage and retrieval working correctly
- **API Integration**: ✅ All external integrations (Asana, OpenAI, etc.) functioning

### Immediate Priorities
1. **Fix artifact streaming completion** - Images generate but don't display
2. **Restore history dropdown functionality** - Navigation between chats broken  
3. **Resolve text wrapping issues** - Content overflow in resizable containers
4. **Stabilize streaming responses** - Intermittent rendering problems

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](repository-url/issues)
- **Discussions**: [GitHub Discussions](repository-url/discussions)
- **Documentation**: [Wiki](repository-url/wiki)

## 🏆 Acknowledgments

- **LangChain**: For powerful agent orchestration capabilities
- **Vercel AI SDK**: For fast and efficient AI responses
- **OpenAI**: For GPT-4 language model integration
- **Community**: For feedback and contributions

---

**Quibit RAG v3.2.0** - Intelligent, Fast, and Comprehensive AI Assistant

*Current Status: Backend systems operational, frontend UI issues require attention*