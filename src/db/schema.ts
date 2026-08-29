import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const comics = pgTable("comics", {
  id: serial("id").primaryKey(),

  slug: varchar("slug", { length: 160 })
    .notNull()
    .unique(),

  title: varchar("title", { length: 255 }).notNull(),

  description: text("description"),

  coverUrl: text("cover_url"),

  sourceUrl: text("source_url").notNull(),

  totalChapters: integer("total_chapters"),

  categoryId: integer("category_id").references(
    () => categories.id,
    { onDelete: "set null" },
  ),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
