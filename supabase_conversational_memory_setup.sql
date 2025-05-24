-- Conversational Memory Setup for Supabase
-- Run this SQL in your Supabase SQL editor to set up the conversational memory functionality

-- 1. Create the conversational_memory table
CREATE TABLE IF NOT EXISTS conversational_memory (
  id BIGSERIAL PRIMARY KEY,
  chat_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL, -- Adjust dimension based on your embedding model
  source_type TEXT NOT NULL CHECK (source_type IN ('turn', 'summary')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Optional: For linking summaries to the turns they cover
  -- summarized_turn_ids BIGINT[], 
  
  -- Foreign key constraint (adjust if your chat table has a different name/structure)
  CONSTRAINT fk_conversational_memory_chat_id 
    FOREIGN KEY(chat_id) 
    REFERENCES "Chat"(id) -- Now both chat_id and Chat.id are UUID
    ON DELETE CASCADE
);

-- 2. Create indexes for performance
-- Index on chat_id for faster filtering
CREATE INDEX IF NOT EXISTS idx_conversational_memory_chat_id 
ON conversational_memory(chat_id);

-- Index on created_at for chronological ordering
CREATE INDEX IF NOT EXISTS idx_conversational_memory_created_at 
ON conversational_memory(created_at);

-- IVFFlat index for approximate similarity search
-- Adjust 'lists' parameter based on expected table size:
-- - For smaller tables (< 1M rows): lists = sqrt(num_rows)
-- - For larger tables: lists = num_rows / 1000
CREATE INDEX IF NOT EXISTS idx_conversational_memory_embedding 
ON conversational_memory
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100); -- Adjust based on your expected data size

-- 3. Create the RPC function for similarity search
CREATE OR REPLACE FUNCTION match_conversational_history (
  query_embedding VECTOR(1536), -- Adjust dimension to match your embedding model
  match_chat_id UUID, -- Changed from TEXT to UUID
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  source_type TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT -- Cosine similarity score
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
    1 - (cm.embedding <=> query_embedding) AS similarity -- Cosine similarity (1 - cosine distance)
  FROM
    conversational_memory cm
  WHERE
    cm.chat_id = match_chat_id
  ORDER BY
    cm.embedding <=> query_embedding -- Order by cosine distance (ascending = most similar first)
  LIMIT
    match_count;
END;
$$;

-- 4. Grant necessary permissions (adjust as needed for your setup)
-- These permissions allow your application to read/write conversational memory
-- You may need to adjust the role name based on your Supabase setup

-- Allow authenticated users to query their own conversational memory
-- Note: You may want to add Row Level Security (RLS) policies for better security
-- For now, this allows basic access to the function and table

-- Grant usage on the function
GRANT EXECUTE ON FUNCTION match_conversational_history TO authenticated;
GRANT EXECUTE ON FUNCTION match_conversational_history TO service_role;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON conversational_memory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversational_memory TO service_role;

-- Grant sequence permissions for the auto-incrementing ID
GRANT USAGE, SELECT ON SEQUENCE conversational_memory_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE conversational_memory_id_seq TO service_role;

-- 5. Optional: Create Row Level Security (RLS) policies
-- Uncomment and modify these if you want to add user-level security
-- This would require a way to link chat_id to user_id in your schema

/*
-- Enable RLS
ALTER TABLE conversational_memory ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access conversational memory for chats they own
-- Note: This assumes you have a way to determine chat ownership
-- You'll need to adjust this based on your actual schema
CREATE POLICY "Users can access their own conversational memory" ON conversational_memory
  FOR ALL USING (
    -- Replace this condition with your actual ownership logic
    -- For example, if you have a chats table with user_id:
    -- chat_id IN (SELECT id FROM "Chat" WHERE "userId" = auth.uid())
    true -- Placeholder - replace with actual ownership check
  );
*/

-- 6. Verify the setup
-- Run these queries to test your setup (optional):

/*
-- Test inserting a sample conversational memory entry
INSERT INTO conversational_memory (chat_id, content, embedding, source_type)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, -- Use proper UUID format
  'User: Hello\nAI: Hi there! How can I help you today?',
  '[1,0,0,...]'::vector, -- Replace with actual embedding
  'turn'
);

-- Test the similarity search function
SELECT * FROM match_conversational_history(
  '[1,0,0,...]'::vector, -- Replace with actual query embedding
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid, -- Use proper UUID format
  5
);
*/

-- Setup complete!
-- Make sure to:
-- 1. Adjust the embedding dimension (1536) if you're using a different model
-- 2. Update the foreign key reference if your chat table has a different name
-- 3. Configure RLS policies based on your authentication setup
-- 4. Adjust the IVFFlat index 'lists' parameter based on your expected data volume 