-- Context Management Tables Migration
-- Adds conversation_entities, conversation_summaries, and chat_file_references tables

-- Entity tracking across conversations
CREATE TABLE IF NOT EXISTS "conversation_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" varchar NOT NULL,
	"entity_value" text NOT NULL,
	"message_id" uuid,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_id" text NOT NULL
);

-- Conversation summaries for long chats
CREATE TABLE IF NOT EXISTS "conversation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"summary_text" text NOT NULL,
	"messages_covered_start" timestamp with time zone NOT NULL,
	"messages_covered_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_id" text NOT NULL
);

-- File references and metadata
CREATE TABLE IF NOT EXISTS "chat_file_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid,
	"file_type" varchar NOT NULL,
	"file_metadata" json,
	"document_metadata_id" text,
	"document_chunk_id" bigint,
	"artifact_document_id" uuid,
	"artifact_document_created_at" timestamp without time zone,
	"client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign key constraints for conversation_entities
DO $$ BEGIN
 ALTER TABLE "conversation_entities" ADD CONSTRAINT "conversation_entities_chat_id_Chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "conversation_entities" ADD CONSTRAINT "conversation_entities_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "conversation_entities" ADD CONSTRAINT "conversation_entities_message_id_Message_v2_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."Message_v2"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "conversation_entities" ADD CONSTRAINT "conversation_entities_client_id_Clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."Clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Foreign key constraints for conversation_summaries
DO $$ BEGIN
 ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_chat_id_Chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_client_id_Clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."Clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Foreign key constraints for chat_file_references
DO $$ BEGIN
 ALTER TABLE "chat_file_references" ADD CONSTRAINT "chat_file_references_chat_id_Chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "chat_file_references" ADD CONSTRAINT "chat_file_references_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "chat_file_references" ADD CONSTRAINT "chat_file_references_message_id_Message_v2_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."Message_v2"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "chat_file_references" ADD CONSTRAINT "chat_file_references_client_id_Clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."Clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "chat_file_references" ADD CONSTRAINT "chat_file_references_document_metadata_id_document_metadata_id_fk" FOREIGN KEY ("document_metadata_id") REFERENCES "public"."document_metadata"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "chat_file_references" ADD CONSTRAINT "chat_file_references_document_chunk_id_documents_id_fk" FOREIGN KEY ("document_chunk_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "chat_file_references" ADD CONSTRAINT "chat_file_references_artifact_fk" FOREIGN KEY ("artifact_document_id","artifact_document_created_at") REFERENCES "public"."Document"("id","createdAt") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS "idx_conversation_entities_chat_user" ON "conversation_entities" ("chat_id","user_id");

CREATE INDEX IF NOT EXISTS "idx_conversation_entities_type" ON "conversation_entities" ("entity_type");

CREATE INDEX IF NOT EXISTS "idx_conversation_entities_client" ON "conversation_entities" ("client_id");

CREATE INDEX IF NOT EXISTS "idx_conversation_summaries_chat_user" ON "conversation_summaries" ("chat_id","user_id");

CREATE INDEX IF NOT EXISTS "idx_conversation_summaries_client" ON "conversation_summaries" ("client_id");

CREATE INDEX IF NOT EXISTS "idx_chat_file_references_chat_user" ON "chat_file_references" ("chat_id","user_id");

CREATE INDEX IF NOT EXISTS "idx_chat_file_references_type" ON "chat_file_references" ("file_type");

CREATE INDEX IF NOT EXISTS "idx_chat_file_references_client" ON "chat_file_references" ("client_id"); 