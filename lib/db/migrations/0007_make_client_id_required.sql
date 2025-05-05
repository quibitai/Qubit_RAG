-- Migration 0007: Making client_id columns required
-- This file should be run manually after 0006_data_population.sql has been executed
-- and all data has been verified to have client_id values

-- Make client_id required in User table
ALTER TABLE "User" ALTER COLUMN "client_id" SET NOT NULL;

-- Make client_id required in Chat table
ALTER TABLE "Chat" ALTER COLUMN "client_id" SET NOT NULL;

-- Make client_id required in Message_v2 table
ALTER TABLE "Message_v2" ALTER COLUMN "client_id" SET NOT NULL;

-- Make client_id required in Document table
ALTER TABLE "Document" ALTER COLUMN "client_id" SET NOT NULL;

-- Make client_id required in Suggestion table
ALTER TABLE "Suggestion" ALTER COLUMN "client_id" SET NOT NULL;

-- Make client_id required in Vote_v2 table
ALTER TABLE "Vote_v2" ALTER COLUMN "client_id" SET NOT NULL;

-- Verify all columns are now NOT NULL
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND column_name = 'client_id'
AND table_name IN ('User', 'Chat', 'Message_v2', 'Document', 'Suggestion', 'Vote_v2')
ORDER BY table_name; 