# Conversational Memory Implementation Guide

This guide outlines the implementation of conversational memory functionality to improve contextual awareness across long conversations in your RAG-powered AI assistant.

## Overview

The conversational memory system enhances your existing RAG architecture by adding a dynamic memory layer that stores and retrieves past conversational turns. This ensures that the AI maintains awareness of earlier parts of a conversation, solving the issue where important details (like addresses mentioned early in a conversation) are forgotten after many exchanges.

## Architecture

### Components Added

1. **`lib/conversationalMemory.ts`** - Core functions for storing and retrieving conversational memory
2. **`lib/contextUtils.ts`** - Enhanced to integrate conversational memory snippets into chat history
3. **`app/api/brain/route.ts`** - Modified to retrieve memory before processing and store after response
4. **`supabase_conversational_memory_setup.sql`** - Database schema and functions

### Data Flow

1. **User sends message** → System retrieves relevant past conversation snippets using vector similarity
2. **Context processing** → Combines recent messages + retrieved memory + external RAG documents
3. **AI generates response** → System stores the new user-AI exchange in conversational memory
4. **Future messages** → Can now access this stored conversation context

## Implementation Steps

### Step 1: Database Setup

1. Open your Supabase SQL editor
2. Run the contents of `supabase_conversational_memory_setup.sql`
3. Verify the table and function were created successfully:
   ```sql
   -- Check table exists
   SELECT * FROM conversational_memory LIMIT 1;
   
   -- Check function exists
   SELECT * FROM match_conversational_history('[0,1,0]'::vector, 'test', 1);
   ```

### Step 2: Environment Variables

Ensure your environment has the required variables (these should already be set):
- `OPENAI_API_KEY` - For generating embeddings
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

### Step 3: Code Changes (Already Applied)

The following files have been modified:

#### `lib/contextUtils.ts`
- Added `ConversationalMemorySnippet` interface
- Updated `processHistory` function to accept and integrate memory snippets
- Added configuration options for memory management

#### `lib/conversationalMemory.ts`
- `retrieveConversationalMemory()` - Fetches relevant past conversations
- `storeConversationalMemory()` - Saves new conversational turns
- Helper functions for future summarization capabilities

#### `app/api/brain/route.ts`
- Added conversational memory retrieval before processing chat history
- Added conversational memory storage after AI response completion
- Integrated with existing error handling and logging

### Step 4: Configuration Options

You can customize the behavior by adjusting these parameters in `lib/contextUtils.ts`:

```typescript
const DEFAULT_OPTIONS: ChatHistoryOptions = {
  maxConversationalSnippetsToKeep: 3, // How many memory snippets to retrieve
  maxRecentMessagesToKeep: 5,         // How many recent raw messages to keep
  // ... other existing options
};
```

In `app/api/brain/route.ts`, you can adjust:
```typescript
conversationalMemorySnippets = await retrieveConversationalMemory(
  normalizedChatId,
  userQueryText,
  3, // Number of snippets to retrieve (default: 5)
);
```

## How It Works

### Memory Retrieval Process

1. When a user sends a message, the system:
   - Generates an embedding of the current query
   - Searches the `conversational_memory` table for similar past conversations in the same chat
   - Returns the top N most relevant snippets based on cosine similarity

### Memory Storage Process

1. After the AI generates a response, the system:
   - Combines the user message and AI response into a single "turn"
   - Generates an embedding of this turn
   - Stores it in the `conversational_memory` table with the chat ID

### Context Integration

The `processHistory` function now:
1. Takes recent raw messages from the current conversation
2. Retrieves relevant snippets from conversational memory
3. Formats memory snippets as `SystemMessage` objects with clear prefixes
4. Combines them intelligently, prioritizing memory snippets and the latest user query
5. Applies length limits while preserving important context

## Expected Behavior

### Before Implementation
- AI forgets details mentioned earlier in long conversations
- Context window only includes recent messages
- Important information gets "lost" as conversation grows

### After Implementation
- AI can reference details from earlier in the conversation
- Relevant past exchanges are automatically retrieved and included in context
- Better continuity and awareness across long conversations
- Maintains efficiency by only retrieving relevant (not all) past context

## Monitoring and Debugging

### Logs to Watch

Look for these log entries in your console:

```
[ConversationalMemory] Retrieving memory for chatId=...
[ConversationalMemory] Retrieved X memory snippets for chatId=...
[Brain API] Retrieved X conversational memory snippets
[Brain API] Processed chat history with smart filtering and conversational memory - message count: X
[ConversationalMemory] Storing turn for chatId=...
[Brain API] Successfully stored conversational memory for chat X
```

### Testing the Implementation

1. Start a new conversation and mention specific details (e.g., an address, project name, etc.)
2. Continue the conversation with 10+ back-and-forth messages on different topics
3. Reference the earlier details - the AI should now remember and use them appropriately

### Troubleshooting

**Memory not being retrieved:**
- Check that the `match_conversational_history` function exists in Supabase
- Verify `OPENAI_API_KEY` is set correctly
- Check console logs for embedding generation errors

**Memory not being stored:**
- Verify the `conversational_memory` table exists
- Check Supabase permissions for the service role
- Look for storage errors in the console logs

**Performance issues:**
- Monitor the IVFFlat index performance
- Consider adjusting the `lists` parameter in the index
- Monitor embedding generation latency

## Future Enhancements

The current implementation provides a foundation for additional features:

1. **Summarization** - Automatically summarize long conversation segments to save space
2. **Decay/TTL** - Automatically remove old conversational memory based on age
3. **User-specific memory** - Extend to remember information across different chats for the same user
4. **Topic-based clustering** - Group related conversation segments by topic

## Performance Considerations

- **Embedding generation**: Each message requires an API call to OpenAI for embedding
- **Vector search**: Supabase's pgvector provides efficient similarity search
- **Storage growth**: Memory grows with conversation length; consider implementing cleanup strategies
- **Index maintenance**: The IVFFlat index may need periodic optimization for large datasets

## Security Notes

- The current implementation stores all conversational memory without encryption
- Consider implementing Row Level Security (RLS) policies in Supabase for user isolation
- Memory is associated with chat IDs - ensure proper access controls on chat ownership
- Consider data retention policies for compliance requirements

## Testing Checklist

- [ ] Database schema created successfully
- [ ] RPC function returns results for test queries
- [ ] New conversations start without errors
- [ ] Memory is stored after AI responses (check database)
- [ ] Memory is retrieved in subsequent messages (check logs)
- [ ] Long conversations maintain context from early messages
- [ ] System gracefully handles memory retrieval/storage failures
- [ ] Performance is acceptable with multiple concurrent conversations

---

This implementation provides a robust foundation for conversational memory while maintaining compatibility with your existing RAG system. The modular design allows for easy extension and customization based on your specific needs. 