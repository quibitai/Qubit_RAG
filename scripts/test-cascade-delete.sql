-- Test Script: Cascade Delete Verification
-- This script tests that cascade delete is working properly across all related tables
-- WARNING: This will create and delete test data. Do not run on production!

-- Step 1: Create test data
BEGIN;

-- Create test client (if not exists)
INSERT INTO "Clients" (id, name, client_display_name, client_core_mission)
VALUES ('test-client', 'Test Client', 'Test Client Display', 'Testing cascade delete')
ON CONFLICT (id) DO NOTHING;

-- Create test user
INSERT INTO "User" (id, email, "client_id")
VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'test@example.com', 'test-client')
ON CONFLICT (id) DO NOTHING;

-- Create test chat
INSERT INTO "Chat" (id, "createdAt", "updatedAt", title, "userId", "client_id")
VALUES (
  'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  NOW(),
  NOW(),
  'Test Chat for Cascade Delete',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'test-client'
) ON CONFLICT (id) DO NOTHING;

-- Create test messages
INSERT INTO "Message_v2" (id, "chatId", role, parts, attachments, "client_id")
VALUES (
  'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa',
  'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  'user',
  '["Test user message for cascade delete"]',
  '[]',
  'test-client'
), (
  'dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb',
  'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  'assistant',
  '["Test assistant response for cascade delete"]',
  '[]',
  'test-client'
) ON CONFLICT (id) DO NOTHING;

-- Create test vote
INSERT INTO "Vote_v2" ("chatId", "messageId", "isUpvoted", "client_id")
VALUES (
  'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa',
  true,
  'test-client'
) ON CONFLICT ("chatId", "messageId") DO NOTHING;

-- Create test conversation entities
INSERT INTO "conversation_entities" (id, chat_id, user_id, entity_type, entity_value, message_id, client_id)
VALUES (
  'eeeeeeee-ffff-aaaa-bbbb-cccccccccccc',
  'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'address',
  '123 Test Street, Test City',
  'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa',
  'test-client'
) ON CONFLICT (id) DO NOTHING;

-- Create test conversation summary
INSERT INTO "conversation_summaries" (id, chat_id, user_id, summary_text, messages_covered_start, messages_covered_end, client_id)
VALUES (
  'ffffffff-aaaa-bbbb-cccc-dddddddddddd',
  'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'Test conversation summary for cascade delete testing',
  NOW() - INTERVAL '1 hour',
  NOW(),
  'test-client'
) ON CONFLICT (id) DO NOTHING;

-- Create test chat file reference
INSERT INTO "chat_file_references" (id, chat_id, user_id, message_id, file_type, file_metadata, client_id)
VALUES (
  'aaaabbbb-cccc-dddd-eeee-ffffffffffff',
  'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa',
  'document',
  '{"name": "test.pdf", "size": 1024}',
  'test-client'
) ON CONFLICT (id) DO NOTHING;

-- Create test conversational memory (only if the table exists)
-- Note: Using a dummy embedding vector - in practice this would be real embeddings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversational_memory') THEN
    INSERT INTO "conversational_memory" (chat_id, content, embedding, source_type)
    VALUES (
      'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      'User: Test message\nAI: Test response',
      '[0.1,0.2,0.3]'::vector, -- Minimal test vector
      'turn'
    ) ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;

-- Step 2: Verify test data was created
SELECT 'Test data verification:' AS status;

SELECT 
  'Chat count:' AS table_name,
  COUNT(*) AS count
FROM "Chat" 
WHERE id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Message count:' AS table_name,
  COUNT(*) AS count
FROM "Message_v2" 
WHERE "chatId" = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Vote count:' AS table_name,
  COUNT(*) AS count
FROM "Vote_v2" 
WHERE "chatId" = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Entities count:' AS table_name,
  COUNT(*) AS count
FROM "conversation_entities" 
WHERE chat_id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Summaries count:' AS table_name,
  COUNT(*) AS count
FROM "conversation_summaries" 
WHERE chat_id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'File refs count:' AS table_name,
  COUNT(*) AS count
FROM "chat_file_references" 
WHERE chat_id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Memory count:' AS table_name,
  COALESCE((
    SELECT COUNT(*) 
    FROM information_schema.tables 
    WHERE table_name = 'conversational_memory'
  ), 0) AS count;

-- Step 3: Test cascade delete by deleting the chat
SELECT 'Performing cascade delete test...' AS status;

DELETE FROM "Chat" 
WHERE id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

-- Step 4: Verify cascade delete worked (all counts should be 0)
SELECT 'Post-delete verification (all should be 0):' AS status;

SELECT 
  'Chat count:' AS table_name,
  COUNT(*) AS count
FROM "Chat" 
WHERE id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Message count:' AS table_name,
  COUNT(*) AS count
FROM "Message_v2" 
WHERE "chatId" = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Vote count:' AS table_name,
  COUNT(*) AS count
FROM "Vote_v2" 
WHERE "chatId" = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Entities count:' AS table_name,
  COUNT(*) AS count
FROM "conversation_entities" 
WHERE chat_id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Summaries count:' AS table_name,
  COUNT(*) AS count
FROM "conversation_summaries" 
WHERE chat_id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'File refs count:' AS table_name,
  COUNT(*) AS count
FROM "chat_file_references" 
WHERE chat_id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

UNION ALL

SELECT 
  'Memory count:' AS table_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversational_memory') THEN
      (SELECT COUNT(*) FROM "conversational_memory" WHERE chat_id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff')
    ELSE 0
  END AS count;

-- Step 5: Clean up test user and client
DELETE FROM "User" WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
DELETE FROM "Clients" WHERE id = 'test-client';

SELECT 'Cascade delete test completed!' AS status;

-- Summary of what this test verified:
-- ✓ Chat deletion cascades to Message_v2
-- ✓ Chat deletion cascades to Vote_v2  
-- ✓ Chat deletion cascades to conversation_entities
-- ✓ Chat deletion cascades to conversation_summaries
-- ✓ Chat deletion cascades to chat_file_references
-- ✓ Chat deletion cascades to conversational_memory (if table exists) 