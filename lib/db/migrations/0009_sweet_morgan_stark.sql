ALTER TABLE "Chat" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "bitContextId" text;--> statement-breakpoint
ALTER TABLE "Clients" ADD COLUMN "client_display_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "Clients" ADD COLUMN "client_core_mission" text;--> statement-breakpoint
ALTER TABLE "Clients" DROP COLUMN IF EXISTS "enabledBits";