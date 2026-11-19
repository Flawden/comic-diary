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
  uuid,
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
    "ACTIVATION_DISPATCH_CONTROL_CHANGE",
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
    "ACTIVATION_DISPATCH_CONTROL",
  ],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),

  email: varchar("email", { length: 320 })
    .notNull()
    .unique(),

  // AUTH-01C2A: null means mailbox ownership has NOT been demonstrated.
  // Historical accounts stay unverified until a secure verification flow runs.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

  // AUTH-01C2B4A: nullable legacy marker; DB default applies ONLY to new rows.
  // This is NOT mailbox proof and must never grant access by itself.
  verificationRequiredAt: timestamp("verification_required_at", { withTimezone: true }).defaultNow(),

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
export const comicWorkType = pgEnum("comic_work_type", ["UNKNOWN", "MANGA", "MANHWA", "MANHUA", "COMIC", "OTHER", "GRAPHIC_NOVEL"]);
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

    bannerUrl: text("banner_url"),

    sourceUrl: text("source_url"),

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



// Optional titles for volume groups. Chapter identity and reading history are untouched.
export const comicVolumeTitles = pgTable(
  "comic_volume_titles",
  {
    comicId: integer("comic_id").notNull().references(() => comics.id, { onDelete: "cascade" }),
    volumeNumber: integer("volume_number").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
  },
  (table) => [
    primaryKey({ name: "comic_volume_titles_pkey", columns: [table.comicId, table.volumeNumber] }),
    check("comic_volume_titles_number_valid", sql`${table.volumeNumber} BETWEEN 1 AND 99`),
    check("comic_volume_titles_title_nonempty", sql`length(btrim(${table.title})) > 0`),
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

    // Optional local chapter artwork; no impact on reading identity or ordering.
    coverUrl: text("cover_url"),

    kind: varchar("kind", { length: 16 }).default("MAIN").notNull(),
    supersedesChapterId: integer("supersedes_chapter_id")
      .references((): AnyPgColumn => chapters.id, { onDelete: "restrict" }),

    sortOrder: integer(
      "sort_order",
    ).notNull(),

    // Optional editorial grouping. Never changes chapter identity or reading history.
    volumeNumber: integer("volume_number"),

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
    check("chapters_volume_number_valid", sql`${table.volumeNumber} IS NULL OR ${table.volumeNumber} BETWEEN 1 AND 99`),

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

/**
 * AUTH-01B1. Only hashed recovery tokens are persisted.
 * Issuance and redemption policies are introduced in a separate, tested stage.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_id_idx").on(table.userId),
    index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
    uniqueIndex("password_reset_tokens_one_open_per_user_idx")
      .on(table.userId)
      .where(sql`${table.consumedAt} IS NULL AND ${table.revokedAt} IS NULL`),
    check(
      "password_reset_tokens_hash_sha256_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "password_reset_tokens_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "password_reset_tokens_one_terminal_state_check",
      sql`NOT (${table.consumedAt} IS NOT NULL AND ${table.revokedAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * AUTH-01C2B1. This table stores verification challenges only; it does not
 * attest mailbox ownership until a future verified, atomic redeem service.
 * `emailSnapshot` binds an issued challenge to the address at that moment.
 */
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailSnapshot: varchar("email_snapshot", { length: 320 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("email_verification_tokens_token_hash_unique").on(table.tokenHash),
    index("email_verification_tokens_user_id_idx").on(table.userId),
    index("email_verification_tokens_expires_at_idx").on(table.expiresAt),
    uniqueIndex("email_verification_tokens_one_open_per_user_idx")
      .on(table.userId)
      .where(sql`${table.consumedAt} IS NULL AND ${table.revokedAt} IS NULL`),
    check(
      "email_verification_tokens_hash_sha256_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "email_verification_tokens_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "email_verification_tokens_one_terminal_state_check",
      sql`NOT (${table.consumedAt} IS NOT NULL AND ${table.revokedAt} IS NOT NULL)`,
    ),
  ],
);


/**
 * AUTH-01 / R1B2A: inert encrypted recovery-mail storage (NO dispatcher).
 * A separate password-reset table prevents reusing activation token semantics.
 * Raw email and reset code MUST NOT be stored in plaintext in this table.
 */
export const passwordResetMailOutbox = pgTable(
  "password_reset_mail_outbox",
  {
    id: serial("id").primaryKey(),
    passwordResetTokenId: integer("password_reset_token_id")
      .notNull()
      .references(() => passwordResetTokens.id, { onDelete: "cascade" }),
    payloadCiphertext: text("payload_ciphertext").notNull(),
    payloadNonce: varchar("payload_nonce", { length: 16 }).notNull(),
    payloadKeyId: varchar("payload_key_id", { length: 64 }).notNull(),
    payloadDigest: varchar("payload_digest", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    state: varchar("state", { length: 16 }).default("ready").notNull(),
    claimId: varchar("claim_id", { length: 64 }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    dispatchFenceAt: timestamp("dispatch_fence_at", { withTimezone: true }),
    dispatchReservationAt: timestamp("dispatch_reservation_at", { withTimezone: true }),
    dispatchReservationGeneration: integer("dispatch_reservation_generation"),
    dispatchStartedAt: timestamp("dispatch_started_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("password_reset_mail_outbox_token_unique").on(table.passwordResetTokenId),
    unique("password_reset_mail_outbox_idempotency_unique").on(table.idempotencyKey),
    unique("password_reset_mail_outbox_claim_unique").on(table.claimId),
    index("password_reset_mail_outbox_ready_expiry_idx")
      .on(table.expiresAt).where(sql`${table.state} = 'ready'`),
    index("password_reset_mail_outbox_state_updated_idx")
      .on(table.state, table.updatedAt),
    check("password_reset_mail_outbox_digest_check", sql`${table.payloadDigest} ~ '^[0-9a-f]{64}$'`),
    check("password_reset_mail_outbox_nonce_check", sql`${table.payloadNonce} ~ '^[A-Za-z0-9_-]{16}$'`),
    check("password_reset_mail_outbox_key_id_check", sql`${table.payloadKeyId} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`),
    check("password_reset_mail_outbox_ciphertext_check", sql`length(${table.payloadCiphertext}) BETWEEN 32 AND 20000 AND ${table.payloadCiphertext} ~ '^[A-Za-z0-9_-]+$'`),
    check("password_reset_mail_outbox_idempotency_check", sql`${table.idempotencyKey} ~ '^[A-Za-z0-9_-]{22,64}$'`),
    check("password_reset_mail_outbox_time_check", sql`${table.expiresAt} > ${table.createdAt} AND ${table.updatedAt} >= ${table.createdAt} AND (${table.finalizedAt} IS NULL OR ${table.finalizedAt} >= ${table.createdAt})`),
    check("password_reset_mail_outbox_state_check", sql`
      (${table.state} = 'ready' AND ${table.claimId} IS NULL AND ${table.claimedAt} IS NULL AND ${table.attemptCount} = 0 AND ${table.finalizedAt} IS NULL)
      OR (${table.state} = 'expired' AND ${table.claimId} IS NULL AND ${table.claimedAt} IS NULL AND ${table.attemptCount} = 0 AND ${table.finalizedAt} IS NOT NULL)
      OR (${table.state} = 'in_flight' AND ${table.claimId} IS NOT NULL AND ${table.claimedAt} IS NOT NULL AND ${table.attemptCount} = 1 AND ${table.finalizedAt} IS NULL)
      OR (${table.state} IN ('accepted', 'rejected', 'uncertain') AND ${table.claimId} IS NOT NULL AND ${table.claimedAt} IS NOT NULL AND ${table.attemptCount} = 1 AND ${table.finalizedAt} IS NOT NULL)
    `),
    check("password_reset_mail_outbox_claim_id_check", sql`${table.claimId} IS NULL OR ${table.claimId} ~ '^[A-Za-z0-9_-]{32}$'`),
    check("password_reset_mail_outbox_claim_times_check", sql`${table.claimedAt} IS NULL OR (${table.claimedAt} >= ${table.createdAt} AND ${table.updatedAt} >= ${table.claimedAt} AND (${table.finalizedAt} IS NULL OR ${table.finalizedAt} >= ${table.claimedAt}))`),
    check("password_reset_mail_outbox_dispatch_fence_check", sql`
      ${table.dispatchFenceAt} IS NULL OR (
        ${table.state} IN ('in_flight', 'accepted', 'rejected', 'uncertain')
        AND ${table.claimId} IS NOT NULL
        AND ${table.claimedAt} IS NOT NULL
        AND ${table.dispatchFenceAt} >= ${table.claimedAt}
        AND ${table.dispatchFenceAt} >= ${table.createdAt}
        AND ${table.updatedAt} >= ${table.dispatchFenceAt}
        AND ${table.dispatchFenceAt} < ${table.expiresAt}
      )
    `),
    check("password_reset_mail_outbox_dispatch_reservation_shape_check", sql`
      (${table.dispatchReservationAt} IS NULL AND ${table.dispatchReservationGeneration} IS NULL)
      OR (
        ${table.dispatchReservationAt} IS NOT NULL
        AND ${table.dispatchReservationGeneration} IS NOT NULL
        AND ${table.dispatchReservationGeneration} > 0
        AND ${table.dispatchFenceAt} IS NOT NULL
        AND ${table.state} IN ('in_flight', 'accepted', 'rejected', 'uncertain')
        AND ${table.attemptCount} = 1
        AND ${table.claimId} IS NOT NULL
        AND ${table.claimedAt} IS NOT NULL
        AND ${table.dispatchReservationAt} >= ${table.dispatchFenceAt}
        AND ${table.dispatchReservationAt} >= ${table.claimedAt}
        AND ${table.dispatchReservationAt} < ${table.expiresAt}
        AND ${table.updatedAt} >= ${table.dispatchReservationAt}
      )
    `),
    check("password_reset_mail_outbox_dispatch_reservation_presence_check", sql`
      (${table.dispatchReservationAt} IS NULL AND ${table.dispatchReservationGeneration} IS NULL)
      OR (${table.dispatchReservationAt} IS NOT NULL AND ${table.dispatchReservationGeneration} IS NOT NULL)
    `),
    check("password_reset_mail_outbox_dispatch_start_check", sql`
      ${table.dispatchStartedAt} IS NULL OR (
        ${table.dispatchReservationAt} IS NOT NULL
        AND ${table.dispatchReservationGeneration} IS NOT NULL
        AND ${table.dispatchStartedAt} >= ${table.dispatchReservationAt}
        AND ${table.dispatchStartedAt} < ${table.expiresAt}
        AND ${table.updatedAt} >= ${table.dispatchStartedAt}
        AND ${table.state} IN ('in_flight', 'accepted', 'rejected', 'uncertain')
      )
    `),
  ],
);

/**
 * AUTH-01C2B4D2C1. INERT STORAGE DEFINITION ONLY: no enqueue, no mail, no DB write.
 * `payloadCiphertext` is for a future AEAD-encrypted immutable envelope; a raw
 * activation code or recipient MUST NEVER be written to this table. Encryption,
 * decryption, AAD binding, lifecycle/claim transaction and key rotation are NOT
 * implemented here. Do not enable delivery based on this schema alone.
 */
export const activationMailOutbox = pgTable(
  "activation_mail_outbox",
  {
    id: serial("id").primaryKey(),
    verificationTokenId: integer("verification_token_id")
      .notNull()
      .references(() => emailVerificationTokens.id, { onDelete: "cascade" }),
    payloadCiphertext: text("payload_ciphertext").notNull(),
    payloadNonce: varchar("payload_nonce", { length: 16 }).notNull(),
    payloadKeyId: varchar("payload_key_id", { length: 64 }).notNull(),
    payloadDigest: varchar("payload_digest", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    state: varchar("state", { length: 16 }).default("ready").notNull(),
    claimId: varchar("claim_id", { length: 64 }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    dispatchFenceAt: timestamp("dispatch_fence_at", { withTimezone: true }),
    dispatchReservationAt: timestamp("dispatch_reservation_at", { withTimezone: true }),
    dispatchReservationGeneration: integer("dispatch_reservation_generation"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    providerMessageId: varchar("provider_message_id", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("activation_mail_outbox_token_unique").on(table.verificationTokenId),
    unique("activation_mail_outbox_idempotency_unique").on(table.idempotencyKey),
    unique("activation_mail_outbox_claim_unique").on(table.claimId),
    index("activation_mail_outbox_ready_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.state} = 'ready'`),
    index("activation_mail_outbox_state_updated_idx")
      .on(table.state, table.updatedAt),
    check("activation_mail_outbox_digest_check", sql`${table.payloadDigest} ~ '^[0-9a-f]{64}$'`),
    check("activation_mail_outbox_nonce_check", sql`${table.payloadNonce} ~ '^[A-Za-z0-9_-]{16}$'`),
    check("activation_mail_outbox_key_id_check", sql`${table.payloadKeyId} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`),
    check("activation_mail_outbox_ciphertext_check", sql`length(${table.payloadCiphertext}) BETWEEN 32 AND 20000 AND ${table.payloadCiphertext} ~ '^[A-Za-z0-9_-]+$'`),
    check("activation_mail_outbox_idempotency_check", sql`${table.idempotencyKey} ~ '^[A-Za-z0-9_-]{22,64}$'`),
    check("activation_mail_outbox_claim_id_check", sql`${table.claimId} IS NULL OR ${table.claimId} ~ '^[A-Za-z0-9_-]{22,64}$'`),
    check("activation_mail_outbox_time_check", sql`${table.expiresAt} > ${table.createdAt} AND ${table.updatedAt} >= ${table.createdAt} AND (${table.claimedAt} IS NULL OR ${table.claimedAt} < ${table.expiresAt}) AND (${table.finalizedAt} IS NULL OR ${table.finalizedAt} >= ${table.createdAt})`),
    check("activation_mail_outbox_dispatch_fence_shape_check", sql`
      ${table.dispatchFenceAt} IS NULL OR (
        ${table.state} IN ('in_flight', 'accepted', 'rejected', 'uncertain')
        AND ${table.attemptCount} = 1
        AND ${table.claimId} IS NOT NULL
        AND ${table.claimedAt} IS NOT NULL
        AND ${table.dispatchFenceAt} >= ${table.claimedAt}
        AND ${table.dispatchFenceAt} < ${table.expiresAt}
        AND ${table.updatedAt} >= ${table.dispatchFenceAt}
      )
    `),
    check("activation_mail_outbox_dispatch_reservation_shape_check", sql`
      (${table.dispatchReservationAt} IS NULL AND ${table.dispatchReservationGeneration} IS NULL)
      OR (
        ${table.dispatchReservationAt} IS NOT NULL
        AND ${table.dispatchReservationGeneration} > 0
        AND ${table.dispatchFenceAt} IS NOT NULL
        AND ${table.state} IN ('in_flight', 'accepted', 'rejected', 'uncertain')
        AND ${table.attemptCount} = 1
        AND ${table.claimId} IS NOT NULL
        AND ${table.dispatchReservationAt} >= ${table.dispatchFenceAt}
        AND ${table.dispatchReservationAt} < ${table.expiresAt}
        AND ${table.updatedAt} >= ${table.dispatchReservationAt}
      )
    `),
    // 0038: SQL CHECK accepts UNKNOWN; explicitly reject timestamp + NULL epoch.
    check("activation_mail_outbox_reservation_generation_present_check", sql`
      ${table.dispatchReservationAt} IS NULL
      OR ${table.dispatchReservationGeneration} IS NOT NULL
    `),
    check("activation_mail_outbox_state_shape_check", sql`
      (${table.state} = 'ready' AND ${table.attemptCount} = 0 AND ${table.claimId} IS NULL AND ${table.claimedAt} IS NULL AND ${table.finalizedAt} IS NULL AND ${table.providerMessageId} IS NULL)
      OR (${table.state} = 'in_flight' AND ${table.attemptCount} = 1 AND ${table.claimId} IS NOT NULL AND ${table.claimedAt} IS NOT NULL AND ${table.finalizedAt} IS NULL AND ${table.providerMessageId} IS NULL)
      OR (${table.state} IN ('accepted', 'rejected', 'uncertain') AND ${table.attemptCount} = 1 AND ${table.claimId} IS NOT NULL AND ${table.claimedAt} IS NOT NULL AND ${table.finalizedAt} IS NOT NULL)
      OR (${table.state} = 'expired' AND ${table.attemptCount} = 0 AND ${table.claimId} IS NULL AND ${table.claimedAt} IS NULL AND ${table.finalizedAt} IS NOT NULL AND ${table.providerMessageId} IS NULL)
    `),
  ],
);

/**
 * AUTH-01C2B4D2C4B3B3B: one shared, persisted, default-OFF operator switch.
 * No API/worker/operator ON action is provided in this stage. A missing or OFF
 * row blocks all new reservations. Epoch is durable and is never an auth token.
 */
export const activationMailDispatchControl = pgTable("activation_mail_dispatch_control", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  generation: integer("generation").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("activation_mail_dispatch_control_singleton_check", sql`${table.id} = 1`),
  check("activation_mail_dispatch_control_generation_check", sql`${table.generation} >= 0`),
]);

/**
 * AUTH-01 / R1C2C3: independent persisted, default-OFF password recovery gate.
 * This does not expose an operator ON endpoint and is not a send capability.
 * A missing row or disabled gate fails closed for all new reservations.
 */
export const passwordResetMailDispatchControl = pgTable("password_reset_mail_dispatch_control", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  generation: integer("generation").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("password_reset_mail_dispatch_control_singleton_check", sql`${table.id} = 1`),
  check("password_reset_mail_dispatch_control_generation_check", sql`
    ${table.generation} >= 0 AND (${table.enabled} = false OR ${table.generation} > 0)
  `),
]);

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
    inLibrary: boolean("in_library").default(true).notNull(),

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


// COMMUNITY-01: public content, independent from private diary/ratings.
export const communityComments = pgTable("community_comments", {
  id: serial("id").primaryKey(),
  comicId: integer("comic_id").notNull().references(() => comics.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").references(() => chapters.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").references(() => users.id, { onDelete: "set null" }),
  parentId: integer("parent_id").references((): AnyPgColumn => communityComments.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").notNull(),
  requestDigest: varchar("request_digest", { length: 64 }).notNull(),
  body: text("body"),
  spoiler: boolean("spoiler").notNull().default(false),
  status: varchar("status", { length: 24 }).notNull().default("VISIBLE"),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true, precision: 3 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true, precision: 3 }),
}, t => [
  unique("community_comments_request_unique").on(t.authorUserId, t.requestId),
  index("community_comments_target_cursor_idx").on(t.comicId, t.chapterId, t.createdAt, t.id),
  index("community_comments_parent_idx").on(t.parentId),
  check("community_comments_status_check", sql`${t.status} IN ('VISIBLE','REMOVED_BY_AUTHOR','HIDDEN_BY_MODERATOR')`),
  check("community_comments_body_check", sql`(${t.status} = 'REMOVED_BY_AUTHOR' AND ${t.body} IS NULL AND ${t.deletedAt} IS NOT NULL) OR (${t.status} <> 'REMOVED_BY_AUTHOR' AND char_length(${t.body}) BETWEEN 1 AND 2000 AND ${t.body} IS NOT NULL AND ${t.deletedAt} IS NULL)`),
  check("community_comments_parent_check", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  check("community_comments_digest_check", sql`${t.requestDigest} ~ '^[0-9a-f]{64}$'`),
  check("community_comments_time_check", sql`${t.updatedAt} >= ${t.createdAt} AND (${t.editedAt} IS NULL OR ${t.editedAt} >= ${t.createdAt}) AND (${t.deletedAt} IS NULL OR ${t.deletedAt} >= ${t.createdAt})`),
]);

// One row per participant is both the comment restriction and distributed quota lock.
export const communityControls = pgTable("community_comment_restrictions", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  blockedUntil: timestamp("blocked_until", { withTimezone: true, precision: 3 }),
  reason: varchar("reason", { length: 500 }).notNull().default(""),
  moderatorUserId: integer("moderator_user_id").references(() => users.id, { onDelete: "set null" }),
  lastPostAt: timestamp("last_post_at", { withTimezone: true, precision: 3 }),
  postWindowAt: timestamp("post_window_at", { withTimezone: true, precision: 3 }),
  postCount: integer("post_count").notNull().default(0),
  reportWindowAt: timestamp("report_window_at", { withTimezone: true, precision: 3 }),
  reportCount: integer("report_count").notNull().default(0),
  editWindowAt: timestamp("edit_window_at", { withTimezone: true, precision: 3 }),
  editCount: integer("edit_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, t => [check("community_controls_counts_check", sql`${t.postCount} >= 0 AND ${t.reportCount} >= 0 AND ${t.editCount} >= 0`)]);

export const communityReports = pgTable("community_comment_reports", {
  id: serial("id").primaryKey(),
  commentId: integer("comment_id").notNull().references(() => communityComments.id, { onDelete: "cascade" }),
  reporterUserId: integer("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
  reason: varchar("reason", { length: 16 }).notNull(),
  note: varchar("note", { length: 300 }),
  status: varchar("status", { length: 16 }).notNull().default("OPEN"),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, precision: 3 }),
  moderatorUserId: integer("moderator_user_id").references(() => users.id, { onDelete: "set null" }),
}, t => [
  unique("community_reports_reporter_unique").on(t.commentId, t.reporterUserId),
  index("community_reports_queue_idx").on(t.status, t.createdAt, t.id),
  index("community_reports_reporter_idx").on(t.reporterUserId),
  check("community_reports_reason_check", sql`${t.reason} IN ('SPAM','INSULT','SPOILER','OTHER')`),
  check("community_reports_status_check", sql`${t.status} IN ('OPEN','RESOLVED','REJECTED')`),
  check("community_reports_resolution_check", sql`(${t.status} = 'OPEN' AND ${t.resolvedAt} IS NULL) OR (${t.status} <> 'OPEN' AND ${t.resolvedAt} IS NOT NULL)`),
]);

export const communityModerationEvents = pgTable("community_comment_moderation_events", {
  id: serial("id").primaryKey(),
  actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 16 }).notNull(),
  // Historical target references intentionally survive actual target deletion.
  commentId: integer("comment_id"),
  reportId: integer("report_id"),
  targetUserId: integer("target_user_id"),
  reason: varchar("reason", { length: 500 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, t => [
  index("community_events_cursor_idx").on(t.createdAt, t.id),
  index("community_events_actor_idx").on(t.actorUserId),
  check("community_events_action_check", sql`${t.action} IN ('HIDE','RESTORE','RESOLVE','REJECT','RESTRICT','UNRESTRICT')`),
]);
