# Hybrid LangChain + Vercel AI Architecture

## Overview

This document describes the hybrid AI orchestration system that intelligently routes queries between LangChain Agent (complex operations) and Vercel AI SDK (simple responses) for optimal performance and functionality.

## Architecture Components

### Core Services

#### BrainOrchestrator (`lib/services/brainOrchestrator.ts`)
- **Purpose**: Central routing and execution coordination
- **Key Features**:
  - Intelligent query classification and routing
  - Unified response formatting across both execution paths
  - Artifact generation support for both LangChain and Vercel AI paths
  - Database integration for chat persistence
  - Comprehensive error handling and fallbacks

#### QueryClassifier (`lib/services/queryClassifier.ts`)
- **Purpose**: Intelligent path selection based on query complexity
- **Logic**: Analyzes query patterns, tool requirements, and complexity to route to optimal execution path
- **Outputs**: Classification result with confidence score and reasoning

#### VercelAIService (`lib/services/vercelAIService.ts`)
- **Purpose**: Handles Vercel AI SDK integration for simple queries
- **Features**:
  - Fast execution for conversational responses
  - Modern tool integration with 26 available tools
  - Token usage optimization
  - Proper message format conversion

#### ModernToolService (`lib/services/modernToolService.ts`)
- **Purpose**: Intelligent tool selection and management
- **Available Tools**: 26 tools including document creation, Asana integration, knowledge base search
- **Selection Algorithm**: Priority-based scoring with keyword matching

## Execution Paths

### Path 1: LangChain Agent
- **When Used**: Complex queries, multi-step reasoning, knowledge retrieval
- **Advantages**: Advanced tool orchestration, agent scratchpad, memory management
- **Performance**: 4-6 seconds average response time

### Path 2: Vercel AI SDK  
- **When Used**: Simple conversational responses, single tool calls
- **Advantages**: 2-3x faster execution, token efficiency, modern SDK features
- **Performance**: 2-3 seconds average response time

## Artifact Generation System

### Problem Solved
The Vercel AI SDK executes tools during streaming, but artifact handlers need access to the response stream for real-time updates.

### Solution: Buffered Artifact Event System
1. **Global Context Setup**: `CREATE_DOCUMENT_CONTEXT` established for both paths
2. **Event Buffering**: Mock data stream captures artifact events during tool execution
3. **Event Replay**: Buffered events replayed during response streaming
4. **Format Compatibility**: Maintains identical artifact format across both paths

### Supported Artifacts
- **Images**: AI-generated images via `experimental_generateImage`
- **Text**: Documents, reports, content
- **Code**: Code generation, snippets  
- **Sheets**: Data tables, spreadsheets

## Response Streaming

### Unified Format
Both execution paths return identical streaming format:
- Text content: `0:${JSON.stringify(character)}\n`
- Artifact events: `2:${JSON.stringify([artifactEvent])}\n`
- Completion metadata: `d:${JSON.stringify(finishData)}\n`

## Performance Metrics

| Metric | LangChain Path | Vercel AI Path |
|--------|----------------|----------------|
| Avg Response Time | 4-6 seconds | 2-3 seconds |
| Token Efficiency | Standard | 30% improvement |
| Tool Execution | Complex orchestration | Direct calls |
| Memory Usage | Higher | Lower |

## Database Integration

### Chat Persistence
- Automatic chat creation and message storage
- Context-aware chat organization by specialist
- User session management
- History retrieval and caching

## Error Handling

### Multi-Layer Recovery
1. **Classification Fallback**: Failed classification → LangChain path
2. **Execution Fallback**: LangChain failure → Vercel AI retry  
3. **Tool Fallback**: Tool failure → graceful degradation
4. **Stream Fallback**: Stream errors → static responses

## Observability

### Comprehensive Logging
- Performance metrics (execution time, token usage)
- Tool selection and execution tracking
- Path distribution analysis
- Error rates and classification accuracy

### Key Metrics Tracked
- Query classification accuracy
- Tool utilization patterns
- Response time distributions
- Token usage optimization
- Artifact generation success rates

## Recent Improvements

### Context Bleeding Fix
- Enhanced message filtering to prevent AI from answering previous questions
- Improved prompt instructions for current question focus
- Better conversation history processing

### Timezone Awareness
- Client-side timezone detection using browser APIs
- Comprehensive city and timezone mapping
- Enhanced datetime context generation
- Proper DST handling

### User-Friendly Responses
- Fixed Asana tool responses to use proper formatters
- Enhanced tool result presentation
- Improved error messaging

## Current Status

### ✅ Fully Implemented
- Hybrid routing with intelligent classification
- Artifact generation across both paths  
- Comprehensive tool ecosystem (26 tools)
- Performance monitoring and optimization
- Error recovery and fallback systems
- Database integration and chat persistence

### 🔧 Areas for Enhancement
- Tool utilization optimization (prompting improvements)
- Classification algorithm fine-tuning
- Advanced artifact types support

## Future Roadmap

### Short-term
- Enhanced tool prompting for better utilization
- Classification refinement
- Artifact expansion

### Long-term  
- Multi-modal support (voice, video)
- Persistent agent memory
- Custom tool creation
- Advanced analytics

## Development Guidelines

### Adding New Tools
1. Create tool definition in appropriate service
2. Add to `modernToolService.ts` tool registry
3. Implement proper scoring logic
4. Add tool-specific instructions if needed
5. Test across both execution paths

### Modifying Classification Logic
1. Update criteria in `queryClassifier.ts`
2. Test with diverse query types
3. Monitor classification accuracy
4. Adjust thresholds based on performance data

### Extending Artifact Support
1. Create handler in `artifacts/` directory
2. Add to `documentHandlersByArtifactKind` registry
3. Implement buffering support for Vercel AI path
4. Test artifact generation across both paths

This hybrid architecture provides optimal performance by using the right execution path for each query type while maintaining unified interfaces and comprehensive functionality. 