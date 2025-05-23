# Revised Context Management Plan - Database Integration

## 1. **Big-Picture Goal**
Enable the orchestrator (Quibit) and all specialists (Bits) to maintain robust, scalable, and modular contextual awareness across entire conversations—regardless of length or complexity. This ensures that critical information (like addresses, project details, or user preferences) is never lost, leveraging our existing database schema and n8n workflows.

---

## 2. **Current Database Schema Analysis**

### **Existing Tables (Context-Ready):**
- **`Chat`** - Chat sessions with `bitContextId` to track specialist context, `userId`, `client_id`
- **`Message_v2`** - Complete conversation history with JSON `parts`, `attachments`, includes both `chatId` and `userId`
- **Knowledge Base Tables** (n8n-managed, client-scoped):
  - `document_metadata` - Google Drive sync documents (text id, client_id)
  - `document_rows` - Structured spreadsheet data (integer id, dataset_id references document_metadata.id)
  - `documents` - Document chunks with vector embeddings (bigint id, client_id)
- **`Document`** - AI-generated artifacts (uuid id, composite primary key with createdAt)
- **`Clients`** - Client config with `gdrive_folder_id`, `config_json`

### **New Tables Needed:**
```sql
-- Entity tracking across conversations
CREATE TABLE conversation_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES "Chat"(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  entity_type varchar NOT NULL, -- 'address', 'name', 'date', 'project'
  entity_value text NOT NULL,
  message_id uuid REFERENCES "Message_v2"(id) ON DELETE CASCADE,
  extracted_at timestamp with time zone DEFAULT now(),
  client_id text NOT NULL REFERENCES "Clients"(id)
);

-- Conversation summaries for long chats
CREATE TABLE conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES "Chat"(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  summary_text text NOT NULL,
  messages_covered_start timestamp with time zone NOT NULL,
  messages_covered_end timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  client_id text NOT NULL REFERENCES "Clients"(id)
);

-- File references and metadata
CREATE TABLE chat_file_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES "Chat"(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  message_id uuid REFERENCES "Message_v2"(id) ON DELETE CASCADE,
  file_type varchar NOT NULL, -- 'uploaded', 'knowledge_base', 'artifact'
  file_metadata json, -- n8n webhook response for uploaded files
  
  -- For knowledge base files (document_metadata uses text id)
  document_metadata_id text REFERENCES document_metadata(id),
  
  -- For document chunks (documents table uses bigint id)  
  document_chunk_id bigint REFERENCES documents(id),
  
  -- For artifacts (Document table uses uuid + timestamp composite key)
  artifact_document_id uuid,
  artifact_document_created_at timestamp without time zone,
  
  client_id text NOT NULL REFERENCES "Clients"(id),
  created_at timestamp with time zone DEFAULT now(),
  
  -- Foreign key for artifact references
  FOREIGN KEY (artifact_document_id, artifact_document_created_at) 
    REFERENCES "Document"(id, "createdAt")
);
```

---

## 3. **Context Window Construction Process**

### **For Each New Message:**
```typescript
async function buildContextWindow(chatId: string, userId: string, clientId: string) {
  // 1. Recent conversation history (includes both chatId and userId)
  const recentMessages = await db
    .select()
    .from(message)
    .where(and(
      eq(message.chatId, chatId), 
      eq(message.userId, userId),
      eq(message.clientId, clientId)
    ))
    .orderBy(desc(message.createdAt))
    .limit(15);
  
  // 2. Tracked entities for this conversation and user
  const entities = await db
    .select()
    .from(conversationEntities)
    .where(and(
      eq(conversationEntities.chatId, chatId),
      eq(conversationEntities.userId, userId)
    ));
  
  // 3. Conversation summary if chat is long
  const summary = await db
    .select()
    .from(conversationSummaries)
    .where(and(
      eq(conversationSummaries.chatId, chatId),
      eq(conversationSummaries.userId, userId)
    ))
    .orderBy(desc(conversationSummaries.createdAt))
    .limit(1);
  
  // 4. Referenced files (includes all file types with proper joins)
  const fileReferences = await db
    .select({
      id: chatFileReferences.id,
      fileType: chatFileReferences.fileType,
      fileMetadata: chatFileReferences.fileMetadata,
      // Knowledge base file info
      kbTitle: document_metadata.title,
      kbUrl: document_metadata.url,
      // Document chunk info  
      chunkContent: documents.content,
      // Artifact info
      artifactTitle: document.title
    })
    .from(chatFileReferences)
    .leftJoin(document_metadata, eq(chatFileReferences.documentMetadataId, document_metadata.id))
    .leftJoin(documents, eq(chatFileReferences.documentChunkId, documents.id))
    .leftJoin(document, and(
      eq(chatFileReferences.artifactDocumentId, document.id),
      eq(chatFileReferences.artifactDocumentCreatedAt, document.createdAt)
    ))
    .where(and(
      eq(chatFileReferences.chatId, chatId),
      eq(chatFileReferences.userId, userId)
    ));
  
  return {
    recentHistory: recentMessages,
    keyEntities: entities,
    summary: summary[0]?.summaryText,
    files: fileReferences,
    tokenCount: calculateTokens(...)
  };
}
```

---

## 4. **Integration with Existing Architecture**

### **A. Orchestrator Enhancement (brain/route.ts)**
```typescript
// Extract userId from the request/session context
const userId = getCurrentUserId(req); // Implement based on your auth system

// In POST handler, before agent execution
const contextWindow = await buildContextWindow(normalizedChatId, userId, effectiveClientId);

const prompt = ChatPromptTemplate.fromMessages([
  ['system', finalSystemPrompt],
  ['system', `Context Summary: ${contextWindow.summary || 'No summary yet'}`],
  ['system', `Key Entities: ${JSON.stringify(contextWindow.keyEntities)}`],
  ['system', `Referenced Files: ${contextWindow.files.map(f => 
    f.kbTitle || f.artifactTitle || 'Uploaded file'
  ).join(', ')}`],
  ['system', `Client Google Drive Folder: ${clientConfig?.gdrive_folder_id || 'Not configured'}`],
  new MessagesPlaceholder('chat_history'),
  ['human', '{input}'],
  new MessagesPlaceholder('agent_scratchpad'),
]);
```

### **B. n8n Workflow Integration**
- **Google Drive Sync:** ✅ No changes needed (already client-scoped with gdrive_folder_id)
- **File Upload Enhancement:** Store n8n webhook response in `chat_file_references`
```typescript
// After n8n processes uploaded file
await db.insert(chatFileReferences).values({
  chatId: normalizedChatId,
  userId: userId,
  messageId: userMessageId,
  fileType: 'uploaded',
  fileMetadata: n8nWebhookResponse,
  clientId: effectiveClientId
});
```

### **C. Entity Extraction (Background Processing)**
```typescript
// After saving each message (includes userId from Message_v2)
async function extractAndStoreEntities(
  messageId: string, 
  content: string, 
  chatId: string, 
  userId: string,
  clientId: string
) {
  const entities = await extractEntities(content); // Lightweight extraction
  
  for (const entity of entities) {
    await db.insert(conversationEntities).values({
      chatId,
      userId,
      messageId,
      entityType: entity.type,
      entityValue: entity.value,
      clientId
    });
  }
}
```

---

## 5. **Performance Strategy**

### **Efficient Queries:**
- ✅ Use existing indexes on `Message_v2.chatId`, `Message_v2.userId`, and `Message_v2.createdAt`
- ✅ Leverage existing client_id scoping in knowledge base tables
- 🆕 Add indexes on new tables:
```sql
CREATE INDEX idx_conversation_entities_chat_user ON conversation_entities(chat_id, user_id);
CREATE INDEX idx_conversation_entities_type ON conversation_entities(entity_type);
CREATE INDEX idx_conversation_summaries_chat_user ON conversation_summaries(chat_id, user_id);
CREATE INDEX idx_chat_file_references_chat_user ON chat_file_references(chat_id, user_id);
CREATE INDEX idx_chat_file_references_type ON chat_file_references(file_type);
```

### **Token Management:**
- **Lightweight Context:** Recent 10 messages + key entities (~800 tokens)
- **Standard Context:** Recent 15 messages + entities + summary (~1500 tokens)
- **Full Context:** Recent 25 messages + entities + summary + files (~3000 tokens)

### **Background Processing:**
- Entity extraction runs asynchronously after message saving
- Summarization triggered every 20+ messages
- File metadata stored immediately during upload

---

## 6. **Implementation Phases**

### **Phase 1: Database Setup**
1. Add the three new tables with proper foreign key relationships
2. Add performance indexes including user_id scoping
3. Test with existing data

### **Phase 2: Context Manager Service**
```typescript
// lib/context/ContextManager.ts
export class ContextManager {
  async buildContextWindow(chatId: string, userId: string, clientId: string): Promise<ContextWindow>
  async extractEntities(messageId: string, content: string, chatId: string, userId: string): Promise<void>
  async updateSummary(chatId: string, userId: string): Promise<void>
  async storeFileReference(fileRef: FileReference): Promise<void>
}
```

### **Phase 3: Integration**
1. Enhance orchestrator prompt construction
2. Update file upload workflow to store metadata
3. Add background entity extraction with user context
4. Implement summarization for long conversations

### **Phase 4: Specialist Delegation**
- Pass context window to specialists
- Ensure specialists receive relevant entities and file context
- Track specialist-specific context needs

---

## 7. **Key Integration Points**

| Component | Current State | Enhancement Needed |
|-----------|---------------|-------------------|
| **Message Storage** | ✅ Working (includes userId) | Add entity extraction hook |
| **File Upload** | 🔄 Returns JSON, not stored | Store metadata in chat_file_references |
| **Knowledge Base** | ✅ Working via n8n (client-scoped) | Integrate file references in context |
| **Orchestrator** | ✅ Working | Enhance prompt with context window |
| **Specialists** | ✅ Working | Receive context from orchestrator |
| **Client Isolation** | ✅ Working (client_id everywhere) | Maintain in new tables |

---

## 8. **Benefits**

- **Immediate:** No more lost addresses/details in long conversations
- **Scalable:** Database-backed with efficient queries and user-scoped data
- **Modular:** ContextManager service usable across orchestrator and specialists
- **Compatible:** Leverages existing schema including user context and client isolation
- **Performance:** Smart token management and background processing

---

**Next Steps:**
1. Create database migrations for new tables with proper foreign keys
2. Implement ContextManager service with user context
3. Integrate with existing message saving flow (including userId)
4. Test with sample long conversations 