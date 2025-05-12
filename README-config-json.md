# Client Configuration in Quibit RAG

This document explains the implementation of the client-aware configuration in Quibit RAG, focusing on the `config_json` column and new top-level context fields in the Clients table.

## Overview

The Clients table in the database now has several ways to store client-specific configurations:

1. `client_display_name` (TEXT, NOT NULL) - User-facing name of the client company (e.g., "Echo Tango Creative Agency")
2. `client_core_mission` (TEXT, NULLABLE) - Short description of the client's main business
3. `customInstructions` (TEXT column) - Simple text-based instructions for the client
4. `config_json` (JSONB column) - Structured configuration data including specialist prompts and hierarchical context

## Schema Structure

The `config_json` column is a flexible JSON structure with the following format:

```json
{
  "specialistPrompts": {
    "chat-model": "Custom prompt for chat model context",
    "document-editor": "Custom prompt for document editor context",
    "echo-tango-specialist": "Custom prompt for Echo Tango specialist context"
  },
  "orchestrator_client_context": "Extra context for orchestrator prompt logic.",
  "available_bit_ids": ["chat-model", "echo-tango-specialist"],
  "tool_configs": {
    "n8n": { "webhook_url": "...", "api_key": "..." }
  }
}
```

### Field Descriptions

- **client_display_name**: User-facing name for the client (e.g., "Echo Tango Creative Agency").
- **client_core_mission**: Short description of the client's business or mission. Used for prompt context.
- **customInstructions**: General client-wide guidelines for prompt assembly.
- **config_json.specialistPrompts**: Object mapping specialist/bit IDs to persona prompt strings. Used to override default specialist personas.
- **config_json.orchestrator_client_context**: (New) String with extra context for orchestrator prompt logic.
- **config_json.available_bit_ids**: (Preferred) Array of active bit/specialist IDs for this client. Use this for new logic.
- **config_json.tool_configs**: (New) Object for tool-specific configuration (e.g., API keys, endpoints).

### Transition Plan
- **available_bit_ids**: This is now the sole source of truth for the list of enabled/available bits for a client. If you previously used a top-level enabledBits column, migrate its data into this key within config_json before dropping the column.
- **specialistPrompts**: Continue using this key for specialist persona overrides. (May be renamed to `specialist_personas` in the future for clarity.)

## Implementation Details

### Database Schema

Added to `lib/db/schema.ts`:
```typescript
export const clients = pgTable('Clients', {
  // ... other fields
  client_display_name: text('client_display_name').notNull(),
  client_core_mission: text('client_core_mission'),
  customInstructions: text('customInstructions'),
  config_json: json('config_json'), // Structured configuration including specialistPrompts and new keys
});
```

### ClientConfig Type

Updated in `lib/db/queries.ts`:
```typescript
export type ClientConfig = {
  id: string;
  name: string;
  client_display_name: string;
  client_core_mission?: string | null;
  customInstructions?: string | null;
  configJson?: {
    specialistPrompts?: Record<string, string> | null;
    orchestrator_client_context?: string | null;
    available_bit_ids?: string[] | null;
    tool_configs?: Record<string, any> | null;
  } | null;
};
```

## Testing

You can test the `config_json` and new columns using the `test_config_json.ts` script:

```bash
# Make sure the POSTGRES_URL environment variable is set
export POSTGRES_URL="postgres://your_connection_string"

# Run the test script
npx tsx test_config_json.ts
```

## Benefits

This implementation provides:

- Flexible, hierarchical client customization through structured JSON and top-level fields
- Backward compatibility with existing text-based instructions
- Clear hierarchy for prompt assembly and context injection
- Enhanced debugging with detailed logging
- Future extensibility for additional configuration options and multi-client support 