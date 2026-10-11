DROP INDEX "processingJob_documentId_idx";--> statement-breakpoint
CREATE INDEX "processingJob_documentId_createdAt_idx" ON "processing_job" USING btree ("document_id","created_at");