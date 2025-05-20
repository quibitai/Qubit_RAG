-- Start a transaction so we can roll back if anything fails
BEGIN;

-- Check for inconsistent foreign key references before making any changes
DO $$
DECLARE
  invalid_chat_count INTEGER;
BEGIN
  -- Check if there are any references in Chat to non-existent User records
  SELECT COUNT(*) INTO invalid_chat_count
  FROM "Chat" c
  LEFT JOIN "User" u ON c."userId" = u.id
  WHERE u.id IS NULL;
  
  IF invalid_chat_count > 0 THEN
    RAISE NOTICE 'Found % Chat records referencing non-existent User records', invalid_chat_count;
    
    -- Option 1: Delete invalid Chat records (safer approach)
    DELETE FROM "Chat" 
    WHERE "userId" NOT IN (SELECT id FROM "User");
    
    RAISE NOTICE 'Deleted invalid Chat records';
  END IF;
END $$;

-- Now it's safe to proceed with the table renames
-- Rename all NextAuth.js tables from PascalCase to lowercase
ALTER TABLE IF EXISTS "User" RENAME TO "user";
ALTER TABLE IF EXISTS "Account" RENAME TO account;
ALTER TABLE IF EXISTS "Session" RENAME TO session;
ALTER TABLE IF EXISTS "VerificationToken" RENAME TO verificationtoken;

-- Rename the compound key constraint for Account -> account
ALTER INDEX IF EXISTS "Account_provider_providerAccountId_key" RENAME TO account_provider_provideraccountid_key;

-- Drop foreign keys first before recreating them (to avoid circular dependency issues)
ALTER TABLE IF EXISTS account DROP CONSTRAINT IF EXISTS "Account_userId_User_id_fk";
ALTER TABLE IF EXISTS session DROP CONSTRAINT IF EXISTS "Session_userId_User_id_fk";
ALTER TABLE IF EXISTS "Chat" DROP CONSTRAINT IF EXISTS "Chat_userId_User_id_fk";
ALTER TABLE IF EXISTS "Document" DROP CONSTRAINT IF EXISTS "Document_userId_User_id_fk";
ALTER TABLE IF EXISTS "Suggestion" DROP CONSTRAINT IF EXISTS "Suggestion_userId_User_id_fk";

-- Now add the constraints back with the correct references to lowercase "user" table
ALTER TABLE IF EXISTS account
  ADD CONSTRAINT account_userid_user_id_fk FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS session
  ADD CONSTRAINT session_userid_user_id_fk FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS "Chat"
  ADD CONSTRAINT "Chat_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"(id);

ALTER TABLE IF EXISTS "Document"
  ADD CONSTRAINT "Document_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"(id);

ALTER TABLE IF EXISTS "Suggestion"
  ADD CONSTRAINT "Suggestion_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "user"(id);

-- Commit the transaction
COMMIT; 