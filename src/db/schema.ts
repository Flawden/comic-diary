import {
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