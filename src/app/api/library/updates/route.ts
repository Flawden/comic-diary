import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { getUnreadChapters, parseUpdatesOptions } from "@/modules/library/queries/get-reading-updates";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const p = request.nextUrl.searchParams;
  const comicId = Number(p.get("comicId"));
  const offset = Number(p.get("offset") ?? 0);
  if (!Number.isSafeInteger(comicId) || comicId <= 0 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }
  const { kind } = parseUpdatesOptions({ kind: p.get("kind") ?? undefined });
  return NextResponse.json(await getUnreadChapters(user.id, comicId, kind, offset), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
