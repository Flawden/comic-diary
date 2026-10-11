import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth/request-identity";
import { exportUserDiary } from "@/modules/library/queries/export-user-diary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const diary = await exportUserDiary(user.id);
    return new NextResponse(JSON.stringify(diary, null, 2), {
      headers: {
        ...headers, "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="comic-diary-${diary.exportedAt.slice(0, 10)}.json"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "export_failed" }, { status: 500, headers });
  }
}
