# Logging Configuration Guide

## Overview

The Quibit RAG system includes comprehensive logging capabilities with configurable verbosity levels to optimize error monitoring and debugging efficiency.

## Environment Variables

### LOG_LEVEL
Controls the overall verbosity of all logging systems:

- `LOG_LEVEL=0` - **Errors only** (recommended for production)
- `LOG_LEVEL=1` - Errors and warnings
- `LOG_LEVEL=2` - Errors, warnings, and essential info (default for development)
- `LOG_LEVEL=3` - All logs including debug details

### OBSERVABILITY_QUIET
Reduces routine operational logs for cleaner error monitoring:

- `OBSERVABILITY_QUIET=true` - Filters out routine LangGraph/streaming progress messages
- `OBSERVABILITY_QUIET=false` - Shows all operational details (default)

### DISABLE_LOGS
Disable specific log categories entirely:

- `DISABLE_LOGS="ObservabilityService,LangGraph"` - Disables specific categories
- `DISABLE_LOGS=""` - No categories disabled (default)

## Recommended Configurations

### Production (Minimal Logging)
```bash
LOG_LEVEL=0
OBSERVABILITY_QUIET=true
DISABLE_LOGS=""
```

### Development (Balanced Logging)
```bash
LOG_LEVEL=2
OBSERVABILITY_QUIET=false
DISABLE_LOGS=""
```

### Debugging (Maximum Logging)
```bash
LOG_LEVEL=3
OBSERVABILITY_QUIET=false
DISABLE_LOGS=""
```

### Error Monitoring Focus
```bash
LOG_LEVEL=1
OBSERVABILITY_QUIET=true
DISABLE_LOGS="LangGraph"
```

## Implementation Details

The logging system integrates:

1. **Centralized Logger** (`lib/logger.ts`) - Handles log level filtering and category disabling
2. **ObservabilityService** (`lib/services/observabilityService.ts`) - Provides request correlation and structured logging
3. **Routine Message Filtering** - Automatically filters common operational messages in quiet mode

## Filtered Message Patterns (Quiet Mode)

When `OBSERVABILITY_QUIET=true`, these routine messages are filtered:

- Node completion notifications
- Event processing counts
- Stream processing status
- LangGraph invocation details
- Agent creation/initialization messages

**Important:** Error and warning messages are never filtered regardless of configuration.

## Log Format

All logs include:
- Timestamp (ISO format)
- Log level (ERROR/WARN/INFO/DEBUG)
- Context/component name
- Correlation ID (for request tracing)
- Message and optional structured data

Example:
```
[2025-01-20T15:30:45.123Z][INFO][ObservabilityService] [req_abc123_1234567890] Request completed
```

## Usage Examples

### Setting Environment Variables

**Linux/macOS:**
```bash
export LOG_LEVEL=1
export OBSERVABILITY_QUIET=true
npm run dev
```

**Windows:**
```cmd
set LOG_LEVEL=1
set OBSERVABILITY_QUIET=true
npm run dev
```

**Docker:**
```yaml
environment:
  - LOG_LEVEL=0
  - OBSERVABILITY_QUIET=true
```

**Vercel:**
Add to your project's environment variables in the dashboard or via CLI:
```bash
vercel env add LOG_LEVEL
```

## Monitoring Best Practices

1. **Production**: Use `LOG_LEVEL=0` with `OBSERVABILITY_QUIET=true` to focus on errors
2. **Staging**: Use `LOG_LEVEL=1` to catch warnings before production
3. **Development**: Use `LOG_LEVEL=2` for balanced debugging information
4. **Troubleshooting**: Temporarily use `LOG_LEVEL=3` for detailed diagnostics

## Performance Impact

- **LOG_LEVEL=0-1**: Minimal performance impact
- **LOG_LEVEL=2**: Low performance impact, suitable for production if needed
- **LOG_LEVEL=3**: Higher performance impact, use only for debugging

Setting `OBSERVABILITY_QUIET=true` significantly reduces log volume without losing critical error information. 