ALTER TABLE "processing_job" ADD COLUMN "kind" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_job" ADD COLUMN "heartbeat_at" timestamp;