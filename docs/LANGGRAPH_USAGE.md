# LangGraph Usage Guide

## Quick Start

### 1. Enable LangGraph for Complex Queries

```typescript
// In app/api/brain/route.ts or wherever BrainOrchestrator is configured
import { createBrainOrchestrator } from '@/lib/services/brainOrchestrator';

const orchestratorConfig = {
  enableLangGraph: true,                 // Enable LangGraph support
  langGraphForComplexQueries: true,      // Use for complex patterns
  enableClassification: true,            // Use QueryClassifier for routing
  // ... other existing config
};

const orchestrator = createBrainOrchestrator(logger, orchestratorConfig);
```

### 2. Monitor LangGraph Usage

Check response headers to see when LangGraph is used:

```typescript
// Response headers will include:
// X-Execution-Path: langgraph (when LangGraph is used)
// X-Execution-Path: langchain (when traditional AgentExecutor is used)
// X-LangGraph-Patterns: TOOL_OPERATION,MULTI_STEP (detected patterns)
```

### 3. Custom Pattern Configuration

```typescript
// For specific "Bits" or contexts that should always use LangGraph:
const langchainConfig = {
  enableLangGraph: true,
  langGraphPatterns: ['TOOL_OPERATION', 'REASONING'], // Force LangGraph for these patterns
  // ... other config
};
```

## When LangGraph is Triggered

LangGraph is automatically used when these patterns are detected in user queries:

### Tool Operations
- ✅ "Create a new task in Asana for this project"
- ✅ "Search for all documents related to Q4 planning"
- ✅ "Update the status of my current tasks"

### Multi-Step Reasoning
- ✅ "First, analyze the budget data, then create a summary report"
- ✅ "Step 1: gather the requirements, Step 2: create the proposal"
- ✅ "If the budget is approved, then schedule the kickoff meeting"

### Complex Analysis
- ✅ "Compare the pros and cons of these two approaches"
- ✅ "Analyze why our conversion rates dropped last month"
- ✅ "Evaluate the effectiveness of our current strategy"

### Knowledge Retrieval
- ✅ "Show me the complete contents of our company policies"
- ✅ "Access our internal knowledge base for project templates"
- ✅ "Get all core values and mission statement documents"

## Production Deployment Strategy

### Conservative Rollout (Recommended)

1. **Start with Disabled (Default)**
   ```typescript
   const config = {
     enableLangGraph: false,  // Safe default
     // ... rest of config
   };
   ```

2. **Enable for Specific Contexts**
   ```typescript
   // Enable only for certain "Bits" or user groups
   const shouldEnableLangGraph = contextId === 'advanced-research-bit' || 
                                 userTier === 'premium';
   
   const config = {
     enableLangGraph: shouldEnableLangGraph,
     langGraphForComplexQueries: true,
   };
   ```

3. **Monitor and Gradually Expand**
   - Watch logs for routing decisions
   - Monitor performance metrics
   - Gradually enable for more contexts

### Performance Monitoring

```typescript
// Check logs for LangGraph routing decisions:
// "LangGraph routing decision" with pattern analysis
// "LangChain agent created" with execution type
// "LangChain agent execution completed" with metrics
```

## Troubleshooting

### LangGraph Not Being Used

Check if patterns are being detected:
```typescript
// Look for log: "LangGraph routing decision"
// useLangGraph: false might indicate:
// - enableLangGraph: false in config
// - No complex patterns detected
// - langGraphForComplexQueries: false
```

### Performance Issues

Monitor execution times:
```typescript
// Compare execution times between:
// X-Execution-Path: langgraph
// X-Execution-Path: langchain
// 
// LangGraph might be slower for simple queries
// but more reliable for complex ones
```

### Fallback Behavior

LangGraph failures automatically fall back to:
1. Traditional AgentExecutor (if available)
2. Error response with helpful message
3. Comprehensive error logging for debugging

## Configuration Reference

```typescript
interface BrainOrchestratorConfig {
  // LangGraph Configuration
  enableLangGraph?: boolean;              // Enable/disable LangGraph
  langGraphForComplexQueries?: boolean;   // Use for complex patterns only
  
  // Existing Configuration (unchanged)
  enableHybridRouting?: boolean;
  enableClassification?: boolean;
  // ... other options
}
```

## Best Practices

1. **Start Conservative**: Begin with `enableLangGraph: false`
2. **Monitor Logs**: Watch routing decisions and execution paths
3. **Gradual Rollout**: Enable for specific contexts before global deployment
4. **Performance Testing**: Compare execution times and success rates
5. **Error Monitoring**: Track fallback usage and error patterns

The LangGraph integration is designed to enhance complex query handling while maintaining the reliability and performance of your existing RAG system. 