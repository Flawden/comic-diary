import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { administrativeAuditEvents, comics, comicVolumeTitles } from "@/db/schema";
import { authorizeSharedCatalogMutationRequest } from "@/modules/catalog/shared-catalog-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 2048;

function respond(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
function error(kind: string, status: number) {
  return respond({ ok: false, error: { kind } }, status);
}

/** PUT is idempotent. A blank title clears only its optional metadata row. */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Authorize before parsing any supplied body, matching existing admin routes.
  const access = await authorizeSharedCatalogMutationRequest(request);
  if (!access.ok) return error(access.kind, access.status);

  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return error("invalid-comic-id", 400);
  const comicId = Number(id);
  if (!Number.isSafeInteger(comicId)) return error("invalid-comic-id", 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return error("unsupported-media-type", 415);
  }
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BYTES) return error("request-too-large", 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) return error("request-too-large", 413);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return error("invalid-json", 400); }
  if (typeof value !== "object" || !value || Array.isArray(value)) return error("invalid-volume-title", 400);
  const body = value as Record<string, unknown>;
  const number = body.volumeNumber;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1 || number > 99 || typeof body.title !== "string") {
    return error("invalid-volume-title", 400);
  }
  const title = body.title.trim();
  if (title.length > 160 || /[\u0000-\u001f\u007f]/u.test(title)) return error("invalid-volume-title", 400);

  try {
    const result = await db.transaction(async tx => {
      const [comic] = await tx.select({ id: comics.id, slug: comics.slug })
        .from(comics).where(and(eq(comics.id, comicId), eq(comics.visibility, "SHARED"))).limit(1);
      if (!comic) return null;
      if (title) {
        await tx.insert(comicVolumeTitles).values({ comicId, volumeNumber: number, title })
          .onConflictDoUpdate({
            target: [comicVolumeTitles.comicId, comicVolumeTitles.volumeNumber],
            set: { title },
          });
      } else {
        await tx.delete(comicVolumeTitles).where(and(
          eq(comicVolumeTitles.comicId, comicId),
          eq(comicVolumeTitles.volumeNumber, number),
        ));
      }
      await tx.insert(administrativeAuditEvents).values({
        actorUserId: access.currentUser.id,
        actorRole: access.currentUser.role,
        action: "COMIC_UPDATE",
        targetType: "COMIC",
        targetId: comic.id,
        targetKey: comic.slug,
        details: { channel: "manual", field: "volume-title", volumeNumber: number, title },
      });
      return { volumeNumber: number, title };
    });
    if (!result) return error("comic-not-found", 404);
    return respond({ ok: true, ...result });
  } catch (cause) {
    console.error("Volume title update failed", cause);
    return error("volume-title-write-failed", 500);
  }
}
