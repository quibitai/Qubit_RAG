# Cascade Delete Implementation

## Overview

This document outlines the cascade delete functionality implemented in the Quibit RAG system. When a conversation (`Chat` record) is deleted, all related records are automatically removed to maintain data consistency and prevent orphaned entries.

## Database Schema Relationships

### Complete Cascade Delete Chain

When a `Chat` record is deleted, the following cascade deletions occur:

```
Chat (deleted)
├── Message_v2 (cascade delete) ✓
├── Vote_v2 (cascade delete) ✓
├── conversation_entities (cascade delete) ✓
├── conversation_summaries (cascade delete) ✓  
├── chat_file_references (cascade delete) ✓
└── conversational_memory (cascade delete) ✓
```

### Table-by-Table Breakdown

#### Core Chat Tables
- **`Message_v2`**: Chat messages cascade delete via `chatId` → `Chat.id`
- **`Vote_v2`**: Message votes cascade delete via `chatId` → `Chat.id` and `messageId` → `Message_v2.id`

#### Context Management Tables
- **`conversation_entities`**: Extracted entities cascade delete via `chat_id` → `Chat.id`
- **`conversation_summaries`**: Conversation summaries cascade delete via `chat_id` → `Chat.id`
- **`chat_file_references`**: File references cascade delete via `chat_id` → `Chat.id`

#### Conversational Memory (RAG Context)
- **`conversational_memory`**: Memory snippets for contextual RAG cascade delete via `chat_id` → `Chat.id`

## Implementation Details

### Foreign Key Constraints

All cascade delete relationships are implemented using PostgreSQL foreign key constraints with `ON DELETE CASCADE`:

```sql
-- Example: Message_v2 cascade delete
ALTER TABLE "Message_v2" ADD CONSTRAINT "Message_v2_chatId_Chat_id_fk" 
FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE CASCADE;

-- Example: conversational_memory cascade delete  
ALTER TABLE "conversational_memory" ADD CONSTRAINT "conversational_memory_chat_id_Chat_id_fk"
FOREIGN KEY ("chat_id") REFERENCES "public"."Chat"("id") ON DELETE CASCADE;
```

### Drizzle Schema Configuration

The cascade delete behavior is defined in the Drizzle schema (`lib/db/schema.ts`):

```typescript
export const message = pgTable('Message_v2', {
  // ... other fields
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
});

export const conversationalMemory = pgTable('conversational_memory', {
  // ... other fields  
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
});
```

## Migration History

### Migration: `0011_cascade_delete_and_conversational_memory.sql`

This migration implements:

1. **Updated foreign key constraints** for `Message_v2` and `Vote_v2` to include cascade delete
2. **Created `conversational_memory` table** with vector embedding support for RAG context retention
3. **Added performance indexes** for vector similarity search
4. **Created RPC function** `match_conversational_history` for similarity search

Key features of the `conversational_memory` table:
- Vector embedding storage using PostgreSQL `vector` extension
- IVFFlat index for efficient similarity search
- Support for both individual conversation turns and summaries
- Automatic cascade delete when conversations are removed

## Testing & Verification

### Test Script: `scripts/test-cascade-delete.sql`

The provided test script verifies cascade delete functionality by:

1. Creating test data across all related tables
2. Verifying data insertion
3. Deleting the parent `Chat` record
4. Confirming all related records were automatically deleted
5. Cleaning up test data

**⚠️ Warning**: The test script creates and deletes data. Do not run on production!

### Manual Testing Steps

1. **Run the migration**:
   ```bash
   # Apply the cascade delete migration
   npm run db:migrate
   ```

2. **Run the test script** (development only):
   ```sql
   -- Execute in your database client
   \i scripts/test-cascade-delete.sql
   ```

3. **Verify in application**:
   - Create a conversation with messages
   - Delete the conversation via the UI
   - Confirm no orphaned records remain

## Benefits

### Data Consistency
- **No orphaned records**: All related data is automatically cleaned up
- **Referential integrity**: Database constraints prevent inconsistent states
- **Storage efficiency**: Automatic cleanup prevents database bloat

### Maintenance Benefits  
- **Simplified deletion logic**: No need for complex application-level cleanup code
- **Atomic operations**: Database-level cascade ensures consistency even if application crashes
- **Performance**: Single DELETE operation handles all cleanup

### RAG Context Management
- **Automatic memory cleanup**: Conversational memory is cleaned up with conversations
- **Vector storage efficiency**: No orphaned embeddings consuming storage
- **Consistent context boundaries**: Memory scope matches conversation scope

## Configuration Options

### Conversational Memory Settings

The conversational memory system supports configuration in `lib/conversationalMemory.ts`:

```typescript
// Embedding model configuration
const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small', // Configurable model
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Retrieval settings
const maxResults = 5; // Configurable result count
const similarityThreshold = 0.7; // Can be added for filtering
```

### Database Index Tuning

Vector similarity search performance can be tuned by adjusting the IVFFlat index:

```sql
-- Adjust 'lists' parameter based on data size
-- Small datasets: lists = sqrt(num_rows)  
-- Large datasets: lists = num_rows / 1000
CREATE INDEX idx_conversational_memory_embedding 
ON conversational_memory
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

## Troubleshooting

### Common Issues

1. **Migration failures**: 
   - Ensure PostgreSQL vector extension is installed
   - Check for existing constraint conflicts
   - Verify foreign key references exist

2. **Vector search not working**:
   - Confirm vector extension is enabled: `CREATE EXTENSION IF NOT EXISTS vector;`
   - Check embedding dimensions match (default: 1536 for OpenAI)
   - Verify RPC function permissions

3. **Cascade delete not working**:
   - Run test script to verify implementation
   - Check constraint names in database
   - Ensure migration was applied successfully

### Monitoring

Monitor cascade delete operations by checking database logs for:
- DELETE operations on Chat table
- Corresponding CASCADE delete operations
- Performance of large conversation deletions

## Future Enhancements

### Potential Improvements

1. **Soft deletes**: Implement soft delete flags for conversation recovery
2. **Batch cleanup**: Background jobs for cleaning old conversational memory
3. **Archive functionality**: Move old conversations to archive tables before deletion
4. **Performance optimization**: Partition large tables for better delete performance

### RAG Context Enhancements

1. **Smart summarization**: Automatically summarize old turns before deletion
2. **Cross-conversation memory**: Optional memory sharing between related conversations
3. **Memory importance scoring**: Preserve high-value memory snippets longer
4. **Contextual decay**: Implement time-based memory relevance scoring

---

## Implementation Checklist

- [x] Updated schema definitions with cascade delete
- [x] Created migration for foreign key constraints
- [x] Added conversational_memory table with vector support
- [x] Updated conversational memory library for vector storage
- [x] Created test script for verification
- [x] Documented implementation and usage
- [ ] Deploy migration to production
- [ ] Monitor cascade delete performance
- [ ] Update application deletion workflows if needed 