import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

export const comicVisibility = pgEnum(
  "comic_visibility",
  [
    "SHARED",
    "PRIVATE",
  ],
);

export const userRole = pgEnum(
  "user_role",
  [
    "USER",
    "EDITOR",
    "ADMIN",
  ],
);

export const accountEntitlement = pgEnum(
  "account_entitlement",
  [
    "PRIVATE_CATALOG",
  ],
);



export const administrativeAuditAction = pgEnum(
  "administrative_audit_action",
  [
    "CATEGORY_CREATE",
    "CATEGORY_UPDATE",
    "COMIC_CREATE",
    "COMIC_UPDATE",
    "CHAPTER_CREATE",
    "CHAPTER_UPDATE",
    "CHAPTER_REORDER",
    "CHAPTER_ARCHIVE",
    "VK_IMPORT_APPLY",
    "ACCOUNT_ROLE_CHANGE",
    "ACCOUNT_ACTIVE_CHANGE",
    "ACCOUNT_ENTITLEMENTS_CHANGE",
  ],
);

export const administrativeAuditTarget = pgEnum(
  "administrative_audit_target",
  [
    "CATEGORY",
    "COMIC",
    "CHAPTER",
    "IMPORT_BATCH",
    "USER",
  ],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),

  email: varchar("email", { length: 320 })
    .notNull()
    .unique(),

  displayName: varchar("display_name", { length: 120 }),

  /*
   * Nullable during the R6 migration because the
   * pre-auth development user already exists.
   *
   * R6.2 will require a strong password hash for
   * password-authenticated accounts.
   */
  passwordHash: text("password_hash"),

  role: userRole("role")
    .default("USER")
    .notNull(),

  isActive: boolean("is_active")
    .default(true)
    .notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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



export const chapterStatus = pgEnum(
  "chapter_status",
  [
    "SCHEDULED",
    "RELEASED",
    "ARCHIVED",
  ],
);
export const comicWorkType = pgEnum("comic_work_type", ["UNKNOWN", "MANGA", "MANHWA", "MANHUA", "COMIC", "OTHER"]);
export const comicWorkFormat = pgEnum("comic_work_format", ["UNKNOWN", "PAGED", "WEBTOON", "OTHER"]);

export const comicSeriesStatus = pgEnum("comic_series_status", ["UNKNOWN", "ONGOING", "FINISHED", "HIATUS", "CANCELLED"]);

export const comics = pgTable(
  "comics",
  {
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

    workType: comicWorkType("work_type").default("UNKNOWN").notNull(),
    workFormat: comicWorkFormat("work_format").default("UNKNOWN").notNull(),
    seriesStatus: comicSeriesStatus("series_status").default("UNKNOWN").notNull(),

    publicationStatus: comicPublicationStatus(
      "publication_status",
    )
      .default("PUBLISHED")
      .notNull(),

    visibility: comicVisibility(
      "visibility",
    )
      .default("SHARED")
      .notNull(),

    ownerUserId: integer(
      "owner_user_id",
    ).references(
      () => users.id,
      { onDelete: "cascade" },
    ),

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
  },
  (table) => [
    index(
      "comics_owner_user_id_idx",
    ).on(
      table.ownerUserId,
    ),

    check(
      "comics_visibility_owner_check",
      sql`(
        (${table.visibility} = 'SHARED' AND ${table.ownerUserId} IS NULL)
        OR
        (${table.visibility} = 'PRIVATE' AND ${table.ownerUserId} IS NOT NULL)
      )`,
    ),
  ],
);



export const chapters = pgTable(
  "chapters",
  {
    id: serial("id").primaryKey(),

    comicId: integer("comic_id")
      .notNull()
      .references(
        () => comics.id,
        { onDelete: "cascade" },
      ),

    displayCode: varchar(
      "display_code",
      { length: 160 },
    ).notNull(),

    title: varchar(
      "title",
      { length: 255 },
    ),

    sourceUrl: text(
      "source_url",
    ),

    kind: varchar("kind", { length: 16 }).default("MAIN").notNull(),
    supersedesChapterId: integer("supersedes_chapter_id")
      .references((): AnyPgColumn => chapters.id, { onDelete: "restrict" }),

    sortOrder: integer(
      "sort_order",
    ).notNull(),

    status: chapterStatus(
      "status",
    )
      .default("SCHEDULED")
      .notNull(),

    releasedAt: timestamp(
      "released_at",
      { withTimezone: true },
    ),

    // Optional plan with explicit YEAR / MONTH / DAY precision.
    expectedRelease: varchar("expected_release", { length: 10 }),

    createdAt: timestamp(
      "created_at",
      { withTimezone: true },
    )
      .defaultNow()
      .notNull(),

    updatedAt: timestamp(
      "updated_at",
      { withTimezone: true },
    )
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("chapters_comic_display_code_active_unique")
      .on(table.comicId, table.displayCode)
      .where(sql`${table.status} <> 'ARCHIVED' AND ${table.displayCode} <> ''`),
    uniqueIndex("chapters_supersedes_unique").on(table.supersedesChapterId),
    check("chapters_kind_valid", sql`${table.kind} IN ('MAIN', 'SPECIAL')`),

    index(
      "chapters_comic_id_idx",
    ).on(
      table.comicId,
    ),

    index(
      "chapters_comic_sort_order_idx",
    ).on(
      table.comicId,
      table.sortOrder,
    ),

    index(
      "chapters_status_released_idx",
    ).on(
      table.status,
      table.releasedAt,
    ),
  ],
);

export const catalogImportReceipts = pgTable(
  "catalog_import_receipts",
  {
    id: serial("id").primaryKey(),

    candidateSha256: varchar(
      "candidate_sha256",
      { length: 64 },
    ).notNull(),

    snapshotSha256: varchar(
      "snapshot_sha256",
      { length: 64 },
    ).notNull(),

    communityId: integer(
      "community_id",
    ).notNull(),

    candidateId: varchar(
      "candidate_id",
      { length: 160 },
    ).notNull(),

    albumId: integer(
      "album_id",
    ).notNull(),

    comicSlug: varchar(
      "comic_slug",
      { length: 160 },
    ).notNull(),

    canonicalSha256: varchar(
      "canonical_sha256",
      { length: 64 },
    ).notNull(),

    appliedAction: varchar(
      "applied_action",
      { length: 16 },
    ).notNull(),

    importedAt: timestamp(
      "imported_at",
      { withTimezone: true },
    )
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique(
      "catalog_import_receipts_identity_unique",
    ).on(
      table.candidateSha256,
      table.candidateId,
      table.canonicalSha256,
    ),

    check(
      "catalog_import_receipts_action_check",
      sql`${table.appliedAction} IN ('create', 'update', 'unchanged')`,
    ),
  ],
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id:
      serial("id")
        .primaryKey(),

    scope:
      varchar(
        "scope",
        {
          length: 80,
        },
      )
        .notNull(),

    keyHash:
      varchar(
        "key_hash",
        {
          length: 64,
        },
      )
        .notNull(),

    windowStartedAt:
      timestamp(
        "window_started_at",
        {
          withTimezone: true,
        },
      )
        .notNull(),

    requestCount:
      integer(
        "request_count",
      )
        .notNull(),

    updatedAt:
      timestamp(
        "updated_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
  },
  (table) => [
    unique(
      "auth_rate_limits_scope_key_unique",
    ).on(
      table.scope,
      table.keyHash,
    ),

    index(
      "auth_rate_limits_updated_at_idx",
    ).on(
      table.updatedAt,
    ),

    check(
      "auth_rate_limits_key_hash_sha256_check",
      sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`,
    ),

    check(
      "auth_rate_limits_request_count_positive_check",
      sql`${table.requestCount} >= 1`,
    ),
  ],
);




export const administrativeAuditEvents = pgTable(
  "administrative_audit_events",
  {
    id: serial("id").primaryKey(),

    actorUserId: integer("actor_user_id")
      .notNull()
      .references(
        () => users.id,
      ),

    actorRole: userRole("actor_role")
      .notNull(),

    action: administrativeAuditAction(
      "action",
    ).notNull(),

    targetType: administrativeAuditTarget(
      "target_type",
    ).notNull(),

    targetId: integer("target_id"),

    targetKey: varchar(
      "target_key",
      { length: 320 },
    ).notNull(),

    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),

    occurredAt: timestamp(
      "occurred_at",
      { withTimezone: true },
    )
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index(
      "administrative_audit_events_occurred_at_idx",
    ).on(
      table.occurredAt,
    ),

    index(
      "administrative_audit_events_actor_user_id_idx",
    ).on(
      table.actorUserId,
    ),

    index(
      "administrative_audit_events_target_idx",
    ).on(
      table.targetType,
      table.targetKey,
    ),
  ],
);

export const userEntitlements = pgTable(
  "user_entitlements",
  {
    userId: integer("user_id")
      .notNull()
      .references(
        () => users.id,
        { onDelete: "cascade" },
      ),

    entitlement: accountEntitlement(
      "entitlement",
    ).notNull(),

    grantedAt: timestamp(
      "granted_at",
      { withTimezone: true },
    )
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.userId,
        table.entitlement,
      ],
      name: "user_entitlements_user_id_entitlement_pk",
    }),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),

    userId: integer("user_id")
      .notNull()
      .references(
        () => users.id,
        { onDelete: "cascade" },
      ),

    /*
     * The browser receives a high-entropy opaque
     * session secret. PostgreSQL stores only its
     * SHA-256 digest.
     */
    tokenHash: varchar("token_hash", {
      length: 64,
    }).notNull(),

    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique(
      "sessions_token_hash_unique",
    ).on(
      table.tokenHash,
    ),

    index(
      "sessions_user_id_idx",
    ).on(
      table.userId,
    ),

    index(
      "sessions_expires_at_idx",
    ).on(
      table.expiresAt,
    ),

    check(
      "sessions_token_hash_sha256_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

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

    promptChapterRating: boolean("prompt_chapter_rating").default(true).notNull(),
    trackingEnabled: boolean("tracking_enabled").default(true).notNull(),

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


export const userChapterReads = pgTable("user_chapter_reads", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").notNull().references(() => chapters.id, { onDelete: "restrict" }),
  readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
  rating: integer("rating"),
  origin: varchar("origin", { length: 16 }).default("EXPLICIT").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.chapterId] }),
  check("user_chapter_reads_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
  index("user_chapter_reads_chapter_idx").on(table.chapterId),
]);
