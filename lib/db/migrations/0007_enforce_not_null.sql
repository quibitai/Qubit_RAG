-- Migration 0007: Enforcing NOT NULL constraint on client_id columns
-- This migration:
-- 1. Creates a default client if it doesn't exist
-- 2. Populates empty client_id values with 'default'
-- 3. Makes client_id NOT NULL in all tables

-- 1. Create a default client if it doesn't exist
INSERT INTO "Clients" ("id", "name", "createdAt")
VALUES ('default', 'Default Client', NOW())
ON CONFLICT DO NOTHING;

-- 2. Populate empty client_id values with 'default'
UPDATE "User" SET "client_id" = 'default' WHERE "client_id" IS NULL;
UPDATE "Chat" SET "client_id" = 'default' WHERE "client_id" IS NULL;
UPDATE "Message_v2" SET "client_id" = 'default' WHERE "client_id" IS NULL;
UPDATE "Document" SET "client_id" = 'default' WHERE "client_id" IS NULL;
UPDATE "Suggestion" SET "client_id" = 'default' WHERE "client_id" IS NULL;
UPDATE "Vote_v2" SET "client_id" = 'default' WHERE "client_id" IS NULL;

-- 3. Make client_id required in all tables
ALTER TABLE "User" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "Chat" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "Message_v2" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "Suggestion" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "Vote_v2" ALTER COLUMN "client_id" SET NOT NULL;

-- Verify all columns are now NOT NULL
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND column_name = 'client_id'
AND table_name IN ('User', 'Chat', 'Message_v2', 'Document', 'Suggestion', 'Vote_v2')
ORDER BY table_name; 