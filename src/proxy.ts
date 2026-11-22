import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAppearance } from "@/db/schema";
import { readSiteAccess } from "@/modules/auth/site-access-service";
import {
  canEnterBeta,
  accessGateExempt,
  BETA_WAIT_MESSAGE,
} from "@/modules/auth/site-access-policy";
import { readSessionToken } from "@/modules/auth/session-cookie-reader";
import { getAuthenticatedSession } from "@/modules/auth/session-service";
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (accessGateExempt(path)) return NextResponse.next();
  try {
    const policy = await readSiteAccess();
    if (!policy.betaOnly) return NextResponse.next();
    const token = readSessionToken(request.cookies);
    const session = token ? await getAuthenticatedSession(token) : null;
    const [appearance] = session
      ? await db
          .select({ participant: userAppearance.betaParticipant })
          .from(userAppearance)
          .where(eq(userAppearance.userId, session.user.id))
      : [];
    if (
      canEnterBeta(
        true,
        session?.user.role ?? null,
        appearance?.participant === true,
      )
    )
      return NextResponse.next();
    const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
    if (path.startsWith("/api/") || path.startsWith("/media/"))
      return NextResponse.json(
        { error: "closed_beta", message: BETA_WAIT_MESSAGE },
        { status: 403, headers },
      );
    return NextResponse.redirect(new URL("/beta-wait", request.url), {
      status: 307,
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: "access_check_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const config = { matcher: "/((?!_next/static|_next/image).*)" };
