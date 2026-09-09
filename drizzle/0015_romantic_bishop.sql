ALTER TYPE "public"."administrative_audit_action" ADD VALUE 'CHAPTER_CREATE' BEFORE 'VK_IMPORT_APPLY';--> statement-breakpoint
ALTER TYPE "public"."administrative_audit_action" ADD VALUE 'CHAPTER_UPDATE' BEFORE 'VK_IMPORT_APPLY';--> statement-breakpoint
ALTER TYPE "public"."administrative_audit_action" ADD VALUE 'CHAPTER_REORDER' BEFORE 'VK_IMPORT_APPLY';--> statement-breakpoint
ALTER TYPE "public"."administrative_audit_action" ADD VALUE 'CHAPTER_ARCHIVE' BEFORE 'VK_IMPORT_APPLY';--> statement-breakpoint
ALTER TYPE "public"."administrative_audit_target" ADD VALUE 'CHAPTER' BEFORE 'IMPORT_BATCH';--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "source_url" text;