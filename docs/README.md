# Quibit RAG Documentation

> Comprehensive documentation for the Quibit RAG system

**Status**: Stable  
**Last Updated**: 2024-12-23  
**Maintainer**: Quibit Development Team

## Table of Contents
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Tools & Integrations](#tools--integrations)
- [Architecture & Design](#architecture--design)
- [Development Guides](#development-guides)
- [Configuration](#configuration)
- [Planning & Design](#planning--design)
- [Migration Guides](#migration-guides)
- [Troubleshooting](#troubleshooting)
- [Legacy Documentation](#legacy-documentation)

## Getting Started

Start here if you're new to Quibit RAG:

- **[Main README](../README.md)** - Project overview and quick start
- **[Installation Guide](./guides/installation.md)** - Detailed setup instructions
- **[Your First Chat](./guides/first-chat.md)** - Using the system for the first time
- **[Configuration Basics](./guides/configuration-basics.md)** - Essential configuration

## API Reference

Complete API documentation:

- **[Brain API](./api/brain-endpoint.md)** - Central orchestration endpoint
- **[File Upload API](./api/files-upload.md)** - File handling endpoints
- **[Authentication API](./api/authentication.md)** - Session and user management
- **[Tool API Reference](./api/tools/)** - Individual tool documentation

### API Quick Reference
- `POST /api/brain` - Chat and AI interactions
- `POST /api/files/upload` - File upload
- `POST /api/files/extract` - Content extraction
- `GET /api/health` - System health check

## Tools & Integrations

Comprehensive tool documentation and integration guides:

- **[Tools Overview](./TOOLS.md)** - Complete guide to all available AI tools
- **[Asana Integration](./tools/asana.md)** - Project and task management
- **[Google Calendar](./tools/google-calendar.md)** - Calendar event management
- **[Document Tools](./tools/documents.md)** - File and document operations
- **[Search Tools](./tools/search.md)** - Knowledge base and web search
- **[Tool Development Guide](./guides/tool-development.md)** - Creating custom tools

### Integration Setup
- **[Environment Variables Reference](./TOOLS.md#environment-variables-reference)** - All required variables
- **[Tool Configuration](./configuration/tool-configuration.md)** - Setup and configuration
- **[Best Practices](./TOOLS.md#best-practices)** - Usage guidelines and security

## Architecture & Design

System design and technical decisions:

- **[System Architecture](../ARCHITECTURE.md)** - High-level system design
- **[Database Schema](./architecture/database-schema.md)** - Data model and relationships
- **[Context Management](./architecture/context-management.md)** - Advanced context features
- **[Tool Framework](./architecture/tool-framework.md)** - Tool system design
- **[Security Model](./architecture/security.md)** - Authentication and authorization

### Design Patterns
- **[Prompt System](./prompt-architecture-guide.md)** - Configuration and customization
- **[Message Handling](./MESSAGE_HANDLING.md)** - LangChain message processing
- **[Streaming Protocol](./architecture/streaming.md)** - Real-time data streaming

## Development Guides

For contributors and developers:

- **[Development Setup](./guides/development-setup.md)** - Local development environment
- **[Contributing Guidelines](../CONTRIBUTING.md)** - How to contribute
- **[Code Standards](./guides/code-standards.md)** - Coding conventions
- **[Testing Guide](./guides/testing.md)** - Writing and running tests
- **[Deployment Guide](./guides/deployment.md)** - Production deployment

### Advanced Development
- **[Tool Development](./guides/tool-development.md)** - Creating custom tools
- **[Specialist Creation](./guides/specialist-creation.md)** - Adding AI specialists
- **[Database Migrations](./guides/database-migrations.md)** - Schema changes
- **[Performance Optimization](./guides/performance.md)** - Optimization techniques

## Configuration

System and client configuration:

- **[Client Configuration](./configuration-json-guide.md)** - Multi-tenant setup
- **[Environment Variables](./configuration/environment-variables.md)** - All environment settings
- **[Tool Configuration](./configuration/tool-configuration.md)** - Configuring integrations
- **[Prompt Configuration](./configuration/prompt-configuration.md)** - Customizing AI behavior

### Integration Configuration
- **[Google Drive Setup](./configuration/google-drive.md)** - Drive integration
- **[n8n Configuration](./configuration/n8n-setup.md)** - Workflow automation
- **[Supabase Setup](./configuration/supabase.md)** - Database configuration

## Planning & Design

Strategic planning and future development:

- **[Context Management Plan](./planning/context-management-plan.md)** - Database integration strategy
- **[Asana Tool Migration](./planning/asana-tool-migration-plan.md)** - Tool enhancement roadmap
- **[Architecture Decisions](./planning/architecture-decisions.md)** - Key design decisions
- **[Roadmap](./planning/roadmap.md)** - Future development plans

## Migration Guides

Upgrade guides for major version changes:

- **[Version 2.3.0 Migration Guide](./MIGRATION_GUIDE_v2.3.0.md)** - Upgrading to v2.3.0 with modular Asana and Google Calendar tools
- **[v1 to v2 Migration](./migration/v1-to-v2.md)** - Upgrading from v1.x
- **[Context System Migration](./migration/context-system.md)** - Upgrading context features
- **[Tool Architecture Migration](./migration/tool-architecture.md)** - Tool system changes

### Version-Specific Changes
- **[Breaking Changes Log](./migration/breaking-changes.md)** - All breaking changes by version
- **[Environment Variable Changes](./migration/environment-variables.md)** - Variable updates and deprecations

## Troubleshooting

Common issues and solutions:

- **[Debugging Guide](./debugging.md)** - General debugging techniques
- **[Document Editor Issues](./document-editor-issues.md)** - Editor-specific problems
- **[Common Errors](./troubleshooting/common-errors.md)** - Frequent issues and fixes
- **[Performance Issues](./troubleshooting/performance.md)** - Performance debugging
- **[Integration Problems](./troubleshooting/integrations.md)** - Third-party service issues

### Diagnostic Tools
- **[Health Checks](./troubleshooting/health-checks.md)** - System status verification
- **[Log Analysis](./troubleshooting/log-analysis.md)** - Understanding system logs
- **[Database Debugging](./troubleshooting/database.md)** - Database issues

## Legacy Documentation

Older documentation kept for reference:

- **[Prompt System (Legacy)](./PROMPT_SYSTEM.md)** - Old prompt system documentation
- **[Model Selection](./MODEL_SELECTION.md)** - Historical model selection logic
- **[Bit Selection Implementation](./Bit-Selection-Implementation.md)** - Legacy specialist system
- **[N8N Workflows](./N8N_WORKFLOWS.md)** - Legacy workflow documentation

### Migration Guides
- **[v1 to v2 Migration](./migration/v1-to-v2.md)** - Upgrading from v1.x
- **[Context System Migration](./migration/context-system.md)** - Upgrading context features

## Documentation Standards

All documentation follows the [Documentation Style Guide](../DOCUMENTATION_STYLE_GUIDE.md):

- **Templates**: Available in `./templates/`
- **Standards**: Consistent formatting and structure
- **Maintenance**: Regular review and updates
- **Quality**: Comprehensive examples and testing

## Quick Links

### For Developers
- [Development Setup](./guides/development-setup.md)
- [API Reference](./api/)
- [Contributing Guide](../CONTRIBUTING.md)

### For Administrators
- [Installation Guide](./guides/installation.md)
- [Configuration Reference](./configuration/)
- [Troubleshooting](./troubleshooting/)

### For Users
- [Getting Started Guide](./guides/getting-started.md)
- [User Manual](./guides/user-manual.md)
- [FAQ](./troubleshooting/faq.md)

---

**Need help?** Check our [troubleshooting section](./troubleshooting/) or [open an issue](https://github.com/quibitai/Quibit_RAG/issues).

**Last Updated**: 2024-12-23  
**Maintained by**: Quibit Development Team 