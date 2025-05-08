-- Add bitContextId and updatedAt columns to Chat table
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "bitContextId" text;
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;
