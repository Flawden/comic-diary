import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

// A public, read-only readiness probe. It exposes no database or user details.
// The public BR02 smoke test verifies the deployed commit as well as DB access.
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);

    return NextResponse.json(
      {
        status: "ready",
        commit: process.env.COMIC_DIARY_BUILD_SHA ?? "unversioned",
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers },
    );
  }
}
