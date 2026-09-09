CREATE INDEX "chapters_comic_id_idx" ON "chapters" USING btree ("comic_id");--> statement-breakpoint
CREATE INDEX "chapters_comic_sort_order_idx" ON "chapters" USING btree ("comic_id","sort_order");--> statement-breakpoint
CREATE INDEX "chapters_status_released_idx" ON "chapters" USING btree ("status","released_at");--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_comic_display_code_unique" UNIQUE("comic_id","display_code");