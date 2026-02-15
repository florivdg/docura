ALTER TABLE "document" ADD COLUMN "is_favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "trashed_at" timestamp;--> statement-breakpoint
CREATE INDEX "document_isFavorite_idx" ON "document" USING btree ("is_favorite");--> statement-breakpoint
CREATE INDEX "document_trashedAt_idx" ON "document" USING btree ("trashed_at");--> statement-breakpoint
CREATE INDEX "document_archivedAt_idx" ON "document" USING btree ("archived_at");