import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const readingStatus = pgEnum("reading_status", [
  "WANT_TO_READ",
  "READING",
  "COMPLETED",
  "ON_HOLD",
]);

export const comicPublicationStatus = pgEnum(
  "comic_publication_status",
  [
    "PUBLISHED",
    "HIDDEN",
    "ARCHIVED",
  ],
);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),

  slug: varchar("slug", { length: 160 })
    .notNull()
    .unique(),

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

  authorName: varchar("author_name", {
    length: 255,
  }),

  translatorName: varchar("translator_name", {
    length: 255,
  }),

  translatorNote: text("translator_note"),

  coverUrl: text("cover_url"),

  sourceUrl: text("source_url").notNull(),

  totalChapters: integer("total_chapters"),

  publicationStatus: comicPublicationStatus(
    "publication_status",
  )
    .default("PUBLISHED")
    .notNull(),

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

export const users = pgTable("users", {
  id: serial("id").primaryKey(),

  email: varchar("email", { length: 320 })
    .notNull()
    .unique(),

  displayName: varchar("display_name", { length: 120 }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userComics = pgTable(
  "user_comics",
  {
    id: serial("id").primaryKey(),

    userId: integer("user_id")
      .notNull()
      .references(
        () => users.id,
        { onDelete: "cascade" },
      ),

    comicId: integer("comic_id")
      .notNull()
      .references(
        () => comics.id,
        { onDelete: "cascade" },
      ),

    status: readingStatus("status")
      .default("WANT_TO_READ")
      .notNull(),

    currentChapter: integer("current_chapter")
      .default(0)
      .notNull(),

    ratingPlot: integer("rating_plot"),

    ratingCharacters: integer("rating_characters"),

    ratingArt: integer("rating_art"),

    ratingDepth: integer("rating_depth"),

    ratingWorld: integer("rating_world"),

    personalNote: text("personal_note"),

    startedAt: timestamp("started_at", {
      withTimezone: true,
    }),

    completedAt: timestamp("completed_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("user_comics_user_id_comic_id_unique").on(
      table.userId,
      table.comicId,
    ),

    check(
      "user_comics_current_chapter_non_negative",
      sql`${table.currentChapter} >= 0`,
    ),

    check(
      "user_comics_rating_plot_range",
      sql`${table.ratingPlot} IS NULL OR (${table.ratingPlot} >= 1 AND ${table.ratingPlot} <= 5)`,
    ),

    check(
      "user_comics_rating_characters_range",
      sql`${table.ratingCharacters} IS NULL OR (${table.ratingCharacters} >= 1 AND ${table.ratingCharacters} <= 5)`,
    ),

    check(
      "user_comics_rating_art_range",
      sql`${table.ratingArt} IS NULL OR (${table.ratingArt} >= 1 AND ${table.ratingArt} <= 5)`,
    ),

    check(
      "user_comics_rating_depth_range",
      sql`${table.ratingDepth} IS NULL OR (${table.ratingDepth} >= 1 AND ${table.ratingDepth} <= 5)`,
    ),

    check(
      "user_comics_rating_world_range",
      sql`${table.ratingWorld} IS NULL OR (${table.ratingWorld} >= 1 AND ${table.ratingWorld} <= 5)`,
    ),
  ],
);
