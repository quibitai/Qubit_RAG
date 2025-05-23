# Documentation Style Guide

## Overview

This guide establishes standards for all documentation in the Quibit RAG project to ensure consistency, maintainability, and professional presentation.

## 📁 File Organization

### Directory Structure
```
├── README.md                 # Main project overview
├── docs/                     # Detailed documentation
│   ├── api/                 # API documentation  
│   ├── guides/              # How-to guides
│   ├── architecture/        # System design docs
│   └── reference/           # Reference materials
├── {module}/README.md       # Module-specific docs
└── CHANGELOG.md             # Version history
```

### File Naming Conventions
- Use SCREAMING_SNAKE_CASE for top-level docs: `CONTRIBUTING.md`, `CHANGELOG.md`
- Use kebab-case for docs/ subdirectory: `api-reference.md`, `deployment-guide.md`
- Use README.md for directory overviews
- Include date in temporary docs: `migration-plan-2024-12-20.md`

## 📝 Document Structure Standards

### Standard Header Template
```markdown
# Document Title

> Brief description (1-2 sentences)

**Status**: [Draft | Stable | Deprecated]  
**Last Updated**: YYYY-MM-DD  
**Maintainer**: Team/Role

## Table of Contents
- [Overview](#overview)
- [Section 1](#section-1)
- ...

## Overview
Brief overview paragraph...
```

### Section Hierarchy
- Use `#` for document title (once per document)
- Use `##` for main sections  
- Use `###` for subsections
- Use `####` sparingly for detailed breakdowns
- Maximum 4 levels of nesting

### Code Documentation Standards

#### TypeScript/JavaScript Files
```typescript
/**
 * Brief function description
 * 
 * Detailed explanation if needed. Explain the business logic,
 * not just what the code does.
 * 
 * @param paramName - Description of parameter
 * @param options - Configuration options
 * @returns Description of return value
 * @throws {ErrorType} When this specific error occurs
 * 
 * @example
 * ```typescript
 * const result = myFunction('example', { option: true });
 * ```
 */
export function myFunction(paramName: string, options: Options): Result {
  // Implementation comment explaining complex logic
  const processedData = complexOperation(paramName);
  
  // Return comment if return is complex
  return processedData;
}
```

#### File Headers
```typescript
/**
 * File Purpose and Description
 * 
 * This file handles [specific functionality]. It integrates with [systems]
 * and is responsible for [key responsibilities].
 * 
 * Key features:
 * - Feature 1
 * - Feature 2
 * 
 * Dependencies:
 * - External library usage
 * - Internal module dependencies
 * 
 * @author Team Name
 * @since Version when introduced
 */
```

#### Inline Comments
- Use `//` for single-line explanatory comments
- Explain **why**, not **what**
- Comment before the code block it describes
- Use TODO/FIXME/NOTE tags appropriately:
  ```typescript
  // TODO: Implement caching for better performance
  // FIXME: Handle edge case when data is null
  // NOTE: This approach is temporary until API v2
  ```

## 🎯 Content Guidelines

### Writing Style
- **Active voice**: "The system processes data" not "Data is processed"
- **Present tense**: "The function returns" not "The function will return"
- **Concise**: Remove unnecessary words
- **Specific**: Use exact terms, avoid vague language
- **Consistent terminology**: Maintain a project glossary

### Code Examples
- Always include working, tested examples
- Show complete, runnable code when possible
- Include expected outputs
- Explain what each example demonstrates

### Cross-References
- Use relative paths: `[Architecture](./docs/ARCHITECTURE.md)`
- Include section anchors: `[Installation](#installation)`
- Verify all links work before committing
- Update links when files are moved/renamed

## 📊 Documentation Types

### 1. README Files
**Purpose**: Quick orientation and getting started
**Structure**:
```markdown
# Project/Module Name
Brief description

## Features
- Key feature list

## Quick Start
Minimal setup steps

## Documentation
Links to detailed docs

## Contributing
Link to CONTRIBUTING.md
```

### 2. API Documentation
**Purpose**: Complete API reference
**Structure**:
```markdown
# API Endpoint Name

## Overview
What this endpoint does

## Authentication
Required permissions/tokens

## Request
### URL
### Method
### Parameters
### Body Schema

## Response
### Success Response
### Error Responses

## Examples
Working code examples
```

### 3. How-To Guides
**Purpose**: Task-oriented instructions
**Structure**:
```markdown
# How to [Task]

## Prerequisites
What you need before starting

## Steps
1. Step 1 with code/screenshots
2. Step 2...

## Troubleshooting
Common issues and solutions

## Next Steps
What to do after completing this guide
```

### 4. Architecture Documents
**Purpose**: System design and technical decisions
**Structure**:
```markdown
# System Component Name

## Purpose
Why this component exists

## Design Decisions
Key architectural choices and rationale

## Integration Points
How it connects to other components

## Data Flow
How data moves through the system

## Performance Considerations
Scalability and optimization notes
```

## ✅ Quality Checklist

Before committing documentation:

### Content Quality
- [ ] Purpose is clear in first paragraph
- [ ] All code examples work
- [ ] Screenshots are current and relevant
- [ ] Cross-references are valid
- [ ] Grammar and spelling checked

### Structure Quality  
- [ ] Follows style guide format
- [ ] Table of contents for docs >3 sections
- [ ] Consistent heading hierarchy
- [ ] Proper code formatting with syntax highlighting

### Maintenance Quality
- [ ] Status and last updated date included
- [ ] Maintainer identified
- [ ] Related documentation updated
- [ ] Old/deprecated content removed or marked

## 🔄 Maintenance Process

### Regular Reviews
- Monthly review of all documentation
- Update screenshots and examples
- Verify all links work
- Check for outdated information

### Change Management
- Update docs in same PR as code changes
- Review documentation changes like code
- Maintain CHANGELOG.md for major doc updates

### Feedback Integration
- Track documentation issues in GitHub
- Regular user feedback collection
- Analytics on most-accessed docs

## 📚 Tools and Resources

### Recommended Tools
- **Markdown linting**: markdownlint
- **Link checking**: markdown-link-check
- **Spell checking**: cspell
- **Documentation generation**: JSDoc for code docs

### Templates
All templates available in `/docs/templates/`:
- `readme-template.md`
- `api-endpoint-template.md`
- `how-to-guide-template.md`
- `architecture-doc-template.md`

## 🏷️ Glossary

**API**: Application Programming Interface
**RAG**: Retrieval-Augmented Generation
**LLM**: Large Language Model
**SSE**: Server-Sent Events
**JSDoc**: JavaScript documentation format

---

**Note**: This style guide is a living document. Suggest improvements via GitHub issues or PRs. 