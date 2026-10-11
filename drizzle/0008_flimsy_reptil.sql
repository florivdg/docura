CREATE TABLE "document_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"document_name" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb,
	"batch_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_activity_actor_type_check" CHECK ("document_activity"."actor_type" in ('user', 'system')),
	CONSTRAINT "document_activity_action_check" CHECK ("document_activity"."action" in ('uploaded', 'updated', 'archived', 'unarchived', 'trashed', 'restored', 'deleted', 'reprocess_requested'))
);
--> statement-breakpoint
ALTER TABLE "document_activity" ADD CONSTRAINT "document_activity_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_activity" ADD CONSTRAINT "document_activity_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documentActivity_documentId_createdAt_idx" ON "document_activity" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "documentActivity_createdAt_idx" ON "document_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documentActivity_actorId_idx" ON "document_activity" USING btree ("actor_id");