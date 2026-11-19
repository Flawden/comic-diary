import type { NextRequest } from "next/server";
import { commentReport } from "@/modules/community/http";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return commentReport(request, (await context.params).id); }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
