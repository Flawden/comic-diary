import "dotenv/config";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { users, categories, comics, userComics, userEntitlements, administrativeAuditEvents } from "../src/db/schema";
import { createSharedCatalogComic, updateSharedCatalogComic } from "../src/modules/catalog/shared-catalog-mutations";
import { createOwnPrivateTitle, updateOwnPrivateTitleMetadata } from "../src/modules/private-catalog/private-title-mutations";
import { getComicBySlug } from "../src/modules/comics/queries/get-comic-by-slug";
import { getUserLibrary } from "../src/modules/library/queries/get-user-library";
import { isSeriesStatus } from "../src/modules/comics/series-status";
import { getComics } from "../src/modules/comics/queries/get-comics";
import type { CatalogComic } from "../src/catalog/catalog-data";

async function main() {
  // Keep integration probes on one connection; library queries still execute normally.
  db.$client.options.max = 1;
  if (process.env.COMIC_DIARY_TEST_ADAPTER) {
    const harness = await import(process.env.COMIC_DIARY_TEST_ADAPTER); await harness.attach(db.$client);
  }
  const stamp = `series-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const comicIds: number[] = [], userIds: number[] = [], categoryIds: number[] = [];
  try {
    const [owner, other] = await db.insert(users).values([{ email: `${stamp}@test.invalid` }, { email: `${stamp}-other@test.invalid` }]).returning();
    userIds.push(owner.id, other.id);
    const [category] = await db.insert(categories).values({ slug: stamp, name: stamp }).returning(); categoryIds.push(category.id);
    const input: CatalogComic = { slug: stamp, title: "Publication probe", description: null, authorName: null, translatorName: null,
      translatorNote: null, coverUrl: null, sourceUrl: "https://example.com", totalChapters: 12,
      publicationStatus: "PUBLISHED", categorySlug: category.slug };
    const actor = { userId: owner.id, role: "ADMIN" as const };
    const shared = await createSharedCatalogComic(input, actor); comicIds.push(shared.id);
    assert.equal((await getComicBySlug(stamp))!.seriesStatus, "UNKNOWN", "declared count cannot infer publication state");
    await db.insert(userComics).values({ userId: owner.id, comicId: shared.id, status: "COMPLETED", ratingArt: 5, personalNote: "Keep", trackingEnabled: false });
    for (const seriesStatus of ["ONGOING", "FINISHED", "HIATUS", "CANCELLED", "UNKNOWN"] as const) {
      await updateSharedCatalogComic({ ...input, seriesStatus }, actor);
      assert.equal((await getComicBySlug(stamp))!.seriesStatus, seriesStatus);
      const matched = await getComics({ categorySlug: stamp, seriesStatus, search: "Publication" });
      assert.deepEqual(matched.map(item => item.id), [shared.id]);
      const mismatch = seriesStatus === "ONGOING" ? "FINISHED" : "ONGOING";
      assert.equal((await getComics({ categorySlug: stamp, seriesStatus: mismatch })).length, 0);
      assert.equal((await getComics({ categorySlug: stamp, seriesStatus, search: "%" })).length, 0, "search percent is literal");
      assert.equal((await getUserLibrary(owner.id))[0].seriesStatus, seriesStatus);
    }
    await updateSharedCatalogComic({ ...input, seriesStatus: "ONGOING" }, actor);
    await updateSharedCatalogComic({ ...input, title: "Old importer metadata" }, actor);
    assert.equal((await getComicBySlug(stamp))!.seriesStatus, "ONGOING", "omitted field preserves known state");
    await assert.rejects(updateSharedCatalogComic({ ...input, seriesStatus: "INVALID" as never }, actor));
    const diary = (await getUserLibrary(owner.id))[0];
    assert.equal(diary.status, "COMPLETED"); assert.equal(diary.ratingArt, 5); assert.equal(diary.personalNote, "Keep"); assert.equal(diary.trackingEnabled, false);
    assert.equal(isSeriesStatus("FINISHED"), true); assert.equal(isSeriesStatus("toString"), false);
    await db.insert(userEntitlements).values({ userId: owner.id, entitlement: "PRIVATE_CATALOG" });
    const privateTitle = await createOwnPrivateTitle(owner.id, { title: stamp, sourceUrl: "https://example.com", totalChapters: null, seriesStatus: "HIATUS" });
    const privateComic = (await getComicBySlug(privateTitle.slug, owner.id))!; comicIds.push(privateComic.id);
    assert.equal(privateComic.seriesStatus, "HIATUS");
    assert.equal(await getComicBySlug(privateTitle.slug, other.id), null);
    await updateOwnPrivateTitleMetadata(owner.id, privateComic.id, { title: stamp, sourceUrl: "https://example.com", totalChapters: null, seriesStatus: "FINISHED" });
    assert.equal((await getComicBySlug(privateTitle.slug, owner.id))!.seriesStatus, "FINISHED");
    await updateOwnPrivateTitleMetadata(owner.id, privateComic.id, { title: stamp, sourceUrl: "https://example.com", totalChapters: null });
    assert.equal((await getComicBySlug(privateTitle.slug, owner.id))!.seriesStatus, "FINISHED");
    await assert.rejects(updateOwnPrivateTitleMetadata(other.id, privateComic.id, { title: stamp, sourceUrl: "https://example.com", totalChapters: null, seriesStatus: "ONGOING" }));
    assert.equal((await getComics({ search: stamp, seriesStatus: "FINISHED" })).some(item => item.id === privateComic.id), false, "private titles never enter public filters");
    for (const publicationStatus of ["HIDDEN", "ARCHIVED"] as const) {
      await db.update(comics).set({ publicationStatus }).where(eq(comics.id, shared.id));
      assert.equal((await getComics({ categorySlug: stamp, seriesStatus: "ONGOING" })).length, 0);
    }
    await db.update(comics).set({ publicationStatus: "PUBLISHED" }).where(eq(comics.id, shared.id));
    assert.equal((await getComics({ categorySlug: stamp })).length, 1, "default includes all states");
    console.log("PASS: combined catalog filters, literal search and public visibility boundary");
    console.log("PASS: shared/private publication metadata, unknown default, import compatibility, invalid state rejection, diary preservation and owner isolation");
  } finally {
    if (userIds.length) { await db.delete(administrativeAuditEvents).where(inArray(administrativeAuditEvents.actorUserId, userIds)); }
    if (comicIds.length) await db.delete(comics).where(inArray(comics.id, comicIds));
    if (categoryIds.length) await db.delete(categories).where(inArray(categories.id, categoryIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
