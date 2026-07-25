CREATE TABLE "correspondent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "correspondent_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "document_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "correspondent_name_lower_idx" ON "correspondent" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_correspondent_id_correspondent_id_fk" FOREIGN KEY ("correspondent_id") REFERENCES "public"."correspondent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_correspondentId_idx" ON "document" USING btree ("correspondent_id");--> statement-breakpoint
CREATE INDEX "document_documentDate_idx" ON "document" USING btree ("document_date");--> statement-breakpoint
CREATE UNIQUE INDEX "document_sha256_idx" ON "document" USING btree ("sha256");