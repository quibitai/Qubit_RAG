import type { InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  text,
  primaryKey,
  foreignKey,
  boolean,
  bigint,
  index,
} from 'drizzle-orm/pg-core';

// New Clients table
export const clients = pgTable('Clients', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  client_display_name: text('client_display_name').notNull(), // User-facing client name
  client_core_mission: text('client_core_mission'), // Short client business description (nullable)
  createdAt: timestamp('createdAt', { mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  customInstructions: text('customInstructions'),
  config_json: json('config_json'), // Structured configuration including specialistPrompts
});

export type Client = InferSelectModel<typeof clients>;

export const user = pgTable('User', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  email: varchar('email', { length: 64 }).notNull(),
  password: varchar('password', { length: 64 }),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
  title: text('title').notNull(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id),
  bitContextId: text('bitContextId'), // Add bitContextId field (nullable)
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable('Message_v2', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt', { mode: 'date', withTimezone: true })
    .defaultNow()
    .notNull(),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  'Vote_v2',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    isUpvoted: boolean('isUpvoted').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  'Document',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdAt: timestamp('createdAt').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    kind: varchar('text', { enum: ['text', 'code', 'image', 'sheet'] })
      .notNull()
      .default('text'),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  'Suggestion',
  {
    id: uuid('id').notNull().defaultRandom(),
    documentId: uuid('documentId').notNull(),
    documentCreatedAt: timestamp('documentCreatedAt').notNull(),
    originalText: text('originalText').notNull(),
    suggestedText: text('suggestedText').notNull(),
    description: text('description'),
    isResolved: boolean('isResolved').notNull().default(false),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('createdAt').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;

// Context Management Tables

export const conversationEntities = pgTable(
  'conversation_entities',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    entityType: varchar('entity_type').notNull(),
    entityValue: text('entity_value').notNull(),
    messageId: uuid('message_id').references(() => message.id, {
      onDelete: 'cascade',
    }),
    extractedAt: timestamp('extracted_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
  },
  (table) => ({
    chatUserIdx: index('idx_conversation_entities_chat_user').on(
      table.chatId,
      table.userId,
    ),
    typeIdx: index('idx_conversation_entities_type').on(table.entityType),
    clientIdx: index('idx_conversation_entities_client').on(table.clientId),
  }),
);

export type ConversationEntity = InferSelectModel<typeof conversationEntities>;

export const conversationSummaries = pgTable(
  'conversation_summaries',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    summaryText: text('summary_text').notNull(),
    messagesCoveredStart: timestamp('messages_covered_start', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    messagesCoveredEnd: timestamp('messages_covered_end', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
  },
  (table) => ({
    chatUserIdx: index('idx_conversation_summaries_chat_user').on(
      table.chatId,
      table.userId,
    ),
    clientIdx: index('idx_conversation_summaries_client').on(table.clientId),
  }),
);

export type ConversationSummary = InferSelectModel<
  typeof conversationSummaries
>;

export const chatFileReferences = pgTable(
  'chat_file_references',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => message.id, {
      onDelete: 'cascade',
    }),
    fileType: varchar('file_type').notNull(),
    fileMetadata: json('file_metadata'),
    // For knowledge base files (document_metadata uses text id)
    documentMetadataId: text('document_metadata_id'),
    // For document chunks (documents table uses bigint id)
    documentChunkId: bigint('document_chunk_id', { mode: 'number' }),
    // For artifacts (Document table uses uuid + timestamp composite key)
    artifactDocumentId: uuid('artifact_document_id'),
    artifactDocumentCreatedAt: timestamp('artifact_document_created_at'),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    chatUserIdx: index('idx_chat_file_references_chat_user').on(
      table.chatId,
      table.userId,
    ),
    typeIdx: index('idx_chat_file_references_type').on(table.fileType),
    clientIdx: index('idx_chat_file_references_client').on(table.clientId),
    // Foreign key for artifact references
    artifactRef: foreignKey({
      columns: [table.artifactDocumentId, table.artifactDocumentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  }),
);

export type ChatFileReference = InferSelectModel<typeof chatFileReferences>;

// Conversational Memory Table for RAG-based context retention
export const conversationalMemory = pgTable(
  'conversational_memory',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().notNull(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chat.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: text('embedding').notNull(), // Vector embedding - handled as text in Drizzle, vector in DB
    sourceType: varchar('source_type', { enum: ['turn', 'summary'] }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    chatIdx: index('idx_conversational_memory_chat_id').on(table.chatId),
    createdAtIdx: index('idx_conversational_memory_created_at').on(
      table.createdAt,
    ),
    sourceTypeIdx: index('idx_conversational_memory_source_type').on(
      table.sourceType,
    ),
  }),
);

export type ConversationalMemory = InferSelectModel<
  typeof conversationalMemory
>;
