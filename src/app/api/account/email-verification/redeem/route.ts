import type { NextRequest } from "next/server";
import { handleLegacyVerification } from "@/modules/auth/legacy-email-verification-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { return handleLegacyVerification(request, "redeem"); }
