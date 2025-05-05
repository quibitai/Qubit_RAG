-- Migration 0006: Adding multi-tenant support with Clients table and client_id columns

-- 1. Create the Clients table first
CREATE TABLE IF NOT EXISTS "Clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- NOTE: We removed the DROP TABLE statements for "Message" and "Vote" as they may be required or already gone

-- 2. Update timestamp format for Message_v2 table
ALTER TABLE "Message_v2" ALTER COLUMN "createdAt" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "Message_v2" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint

-- 3. Add client_id columns to all tables (NULLABLE initially to allow populating data)
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "client_id" text;--> statement-breakpoint
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "client_id" text;--> statement-breakpoint
ALTER TABLE "Message_v2" ADD COLUMN IF NOT EXISTS "client_id" text;--> statement-breakpoint
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "client_id" text;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "client_id" text;--> statement-breakpoint
ALTER TABLE "Vote_v2" ADD COLUMN IF NOT EXISTS "client_id" text;--> statement-breakpoint

-- 4. Add foreign key constraints to client_id columns
DO $$ BEGIN
 ALTER TABLE "Chat" ADD CONSTRAINT "Chat_client_id_Clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."Clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Document" ADD CONSTRAINT "Document_client_id_Clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."Clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Message_v2" ADD CONSTRAINT "Message_v2_client_id_Clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."Clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_client_id_Clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."Clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "User" ADD CONSTRAINT "User_client_id_Clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."Clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Vote_v2" ADD CONSTRAINT "Vote_v2_client_id_Clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."Clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- IMPORTANT: After running this migration:
-- 1. Create at least one default client in the Clients table
-- 2. Populate client_id values for all existing rows in all tables
-- 3. Then run the following ALTER TABLE statements to make client_id NOT NULL:

/*
-- Future migration to make client_id required after data population:
ALTER TABLE "Chat" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "Message_v2" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "Suggestion" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "client_id" SET NOT NULL;
ALTER TABLE "Vote_v2" ALTER COLUMN "client_id" SET NOT NULL;
*/
