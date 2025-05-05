-- Data population script for multi-tenant migration
-- This file should be run manually after 0006_open_venom.sql migration

-- Insert a default client
INSERT INTO "Clients" ("id", "name")
VALUES ('default', 'Default Client')
ON CONFLICT DO NOTHING;

-- Update all existing user records to reference the default client
UPDATE "User"
SET "client_id" = 'default'
WHERE "client_id" IS NULL;

-- Update all existing chat records to reference the default client
UPDATE "Chat"
SET "client_id" = 'default'
WHERE "client_id" IS NULL;

-- Update all existing message records to reference the default client
UPDATE "Message_v2"
SET "client_id" = 'default'
WHERE "client_id" IS NULL;

-- Update all existing document records to reference the default client
UPDATE "Document"
SET "client_id" = 'default'
WHERE "client_id" IS NULL;

-- Update all existing suggestion records to reference the default client
UPDATE "Suggestion"
SET "client_id" = 'default'
WHERE "client_id" IS NULL;

-- Update all existing vote records to reference the default client
UPDATE "Vote_v2"
SET "client_id" = 'default'
WHERE "client_id" IS NULL;

-- Verify all records have been updated
SELECT 'User' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "User"
UNION ALL
SELECT 'Chat' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Chat"
UNION ALL
SELECT 'Message_v2' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Message_v2"
UNION ALL
SELECT 'Document' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Document"
UNION ALL
SELECT 'Suggestion' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Suggestion"
UNION ALL
SELECT 'Vote_v2' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Vote_v2";

-- If all counts match (total = with_client_id) for all tables, then proceed with the next migration file 