# Client Configuration in Quibit RAG

This document explains the implementation of the client-aware configuration in Quibit RAG, focusing on the `config_json` column added to the Clients table.

## Overview

The Clients table in the database now has two main ways to store client-specific configurations:

1. `customInstructions` (TEXT column) - Simple text-based instructions for the client
2. `config_json` (JSON column) - Structured configuration data including specialist prompts

## Schema Structure

The `config_json` column is a flexible JSON structure with the following format:

```json
{
  "specialistPrompts": {
    "chat-model": "Custom prompt for chat model context",
    "document-editor": "Custom prompt for document editor context",
    "echo-tango-specialist": "Custom prompt for Echo Tango specialist context"
  },
  "enabledBits": ["chat-model", "document-editor", "web-research"]
}
```

## Implementation Details

### Database Schema

Added to `lib/db/schema.ts`:
```typescript
export const clients = pgTable('Clients', {
  // ... other fields
  customInstructions: text('customInstructions'),
  enabledBits: json('enabledBits'),
  config_json: json('config_json'), // Structured configuration including specialistPrompts
});
```

### ClientConfig Type

Updated in `lib/db/queries.ts`:
```typescript
export type ClientConfig = {
  id: string;
  name: string;
  customInstructions?: string | null;
  enabledBits?: string[] | null;
  configJson?: {
    enabledBits?: string[];
    specialistPrompts?: Record<string, string>;
    // Add any other expected top-level keys from your config_json
  } | null;
};
```

### Brain API Integration

The Brain API now combines prompts from different sources in this priority order:

1. Base orchestrator prompt (always used)
2. Client-specific specialist prompts from `configJson.specialistPrompts` (highest priority)
3. Default specialist prompts (fallback if client-specific ones aren't available)
4. General client instructions from `customInstructions` text

## Testing

You can test the `config_json` functionality using the `test_config_json.ts` script:

```bash
# Make sure the POSTGRES_URL environment variable is set
export POSTGRES_URL="postgres://your_connection_string"

# Run the test script
npx tsx test_config_json.ts
```

The script performs the following operations:
1. Reads from the Clients table to check if the `config_json` column exists
2. Updates a client record with test specialist prompts
3. Verifies the update was successful

## Benefits

This implementation provides:

- Flexible client customization through structured JSON
- Backward compatibility with existing text-based instructions
- Clear hierarchy for prompt assembly
- Enhanced debugging with detailed logging
- Future extensibility for additional configuration options 