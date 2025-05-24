-- Migration: Add Cascade Delete Support and Conversational Memory
-- This migration adds proper cascade delete constraints for Message_v2 and Vote_v2 tables
-- and introduces the conversational_memory table for RAG-based context retention

-- Step 1: Update Message_v2 foreign key to include cascade delete
ALTER TABLE "Message_v2" DROP CONSTRAINT IF EXISTS "Message_v2_chatId_Chat_id_fk";

DO $$ BEGIN
 ALTER TABLE "Message_v2" ADD CONSTRAINT "Message_v2_chatId_Chat_id_fk" 
 FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Step 2: Update Vote_v2 foreign keys to include cascade delete
ALTER TABLE "Vote_v2" DROP CONSTRAINT IF EXISTS "Vote_v2_chatId_Chat_id_fk";
ALTER TABLE "Vote_v2" DROP CONSTRAINT IF EXISTS "Vote_v2_messageId_Message_v2_id_fk";

DO $$ BEGIN
 ALTER TABLE "Vote_v2" ADD CONSTRAINT "Vote_v2_chatId_Chat_id_fk" 
 FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Vote_v2" ADD CONSTRAINT "Vote_v2_messageId_Message_v2_id_fk" 
 FOREIGN KEY ("messageId") REFERENCES "public"."Message_v2"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Step 3: Create conversational_memory table for RAG-based context retention
CREATE TABLE IF NOT EXISTS "conversational_memory" (
	"id" bigserial PRIMARY KEY,
	"chat_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL, -- OpenAI embedding dimension
	"source_type" varchar NOT NULL CHECK (source_type IN ('turn', 'summary')),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Step 4: Add foreign key constraint for conversational_memory
DO $$ BEGIN
 ALTER TABLE "conversational_memory" ADD CONSTRAINT "conversational_memory_chat_id_Chat_id_fk" 
 FOREIGN KEY ("chat_id") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Step 5: Create performance indexes for conversational_memory
CREATE INDEX IF NOT EXISTS "idx_conversational_memory_chat_id" 
ON "conversational_memory" USING btree ("chat_id");

CREATE INDEX IF NOT EXISTS "idx_conversational_memory_created_at" 
ON "conversational_memory" USING btree ("created_at");

CREATE INDEX IF NOT EXISTS "idx_conversational_memory_source_type" 
ON "conversational_memory" USING btree ("source_type");

-- Step 6: Create vector similarity index for embedding search
-- IVFFlat index for approximate similarity search
CREATE INDEX IF NOT EXISTS "idx_conversational_memory_embedding" 
ON "conversational_memory"
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100); -- Adjust based on expected data size

-- Step 7: Create the RPC function for similarity search (if not exists)
CREATE OR REPLACE FUNCTION match_conversational_history (
  query_embedding vector(1536),
  match_chat_id UUID,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  source_type TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.content,
    cm.source_type,
    cm.created_at,
    1 - (cm.embedding <=> query_embedding) AS similarity
  FROM
    conversational_memory cm
  WHERE
    cm.chat_id = match_chat_id
  ORDER BY
    cm.embedding <=> query_embedding
  LIMIT
    match_count;
END;
$$;

-- Migration complete!
-- Summary of changes:
-- 1. Added cascade delete to Message_v2 -> Chat relationship
-- 2. Added cascade delete to Vote_v2 -> Chat and Vote_v2 -> Message_v2 relationships  
-- 3. Created conversational_memory table with proper cascade delete to Chat
-- 4. Added performance indexes and vector similarity search capability
-- 5. Created RPC function for similarity search

-- Final cascade delete chain when Chat is deleted:
-- Chat (deleted) 
-- ├── Message_v2 (cascade delete) ✓
-- ├── Vote_v2 (cascade delete) ✓
-- ├── conversation_entities (cascade delete) ✓ (from previous migration)
-- ├── conversation_summaries (cascade delete) ✓ (from previous migration)
-- ├── chat_file_references (cascade delete) ✓ (from previous migration)
-- └── conversational_memory (cascade delete) ✓ (new) 