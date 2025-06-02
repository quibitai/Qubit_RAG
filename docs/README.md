# Quibit RAG Documentation

> Comprehensive documentation for the Quibit RAG system

**Status**: Active  
**Last Updated**: 2025-06-02  
**Version**: 2.8.0

## Overview

This directory contains comprehensive documentation for the Quibit RAG system, including API references, architectural guides, and development documentation.

## Documentation Structure

### Core Documentation
- **[API Reference](./api/)** - Complete endpoint documentation
- **[Tools Documentation](./TOOLS.md)** - Available tools and integrations
- **[Prompt System](./PROMPT_SYSTEM.md)** - Prompt architecture and configuration
- **[Model Selection](./MODEL_SELECTION.md)** - AI model configuration guide

### Development Guides
- **[Configuration Guide](./configuration-json-guide.md)** - Client configuration setup
- **[Debugging Guide](./debugging.md)** - Troubleshooting and diagnostics
- **[Message Handling](./MESSAGE_HANDLING.md)** - LangChain message processing

### Migration Guides
- **[v2.5.0 Migration](./MIGRATION_GUIDE_v2.5.0.md)** - Vercel AI SDK migration
- **[v2.4.0 Migration](./MIGRATION_GUIDE_v2.4.0.md)** - Asana integration updates
- **[v2.3.0 Migration](./MIGRATION_GUIDE_v2.3.0.md)** - Tool architecture changes

### Templates
- **[API Endpoint Template](./templates/api-endpoint-template.md)** - Standard API documentation format

## Current System Architecture

The Quibit RAG system is built on:
- **Next.js 15.3.0** with App Router
- **LangChain 0.3.24** for AI agent orchestration
- **Vercel AI SDK** for streaming responses
- **Supabase** for database and vector storage
- **26 integrated tools** for various functionalities

## Key Features (v2.8.0)

### Streaming Architecture
- Vercel AI SDK data stream protocol implementation
- Manual stream encoding for AgentExecutor compatibility
- Robust error handling and fallback mechanisms

### Tool Integration
- 26 available tools with intelligent selection
- Modular architecture for easy tool addition/removal
- Client-specific tool configurations

### Performance & Monitoring
- Detailed observability service with correlation IDs
- Performance metrics and monitoring
- Comprehensive error tracking

## Getting Started

1. **Read the Architecture Guide**: Start with `../ARCHITECTURE.md` for system overview
2. **API Documentation**: Review `./api/` for endpoint specifications
3. **Tool Documentation**: Check `./TOOLS.md` for available integrations
4. **Configuration**: Use `./configuration-json-guide.md` for setup

## Contributing to Documentation

Please follow our [Documentation Style Guide](../DOCUMENTATION_STYLE_GUIDE.md) when contributing:

- Use clear, concise language
- Include code examples where appropriate
- Update version information and dates
- Follow the established template structure

## Support

- **Issues**: [GitHub Issues](https://github.com/quibitai/Quibit_RAG/issues)
- **Discussions**: [GitHub Discussions](https://github.com/quibitai/Quibit_RAG/discussions)
- **Documentation**: This directory contains comprehensive guides

---

**Last Updated**: 2025-06-02  
**Maintained by**: Quibit Development Team 