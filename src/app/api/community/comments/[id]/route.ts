import type { NextRequest } from "next/server";
import { commentPatch, commentDelete } from "@/modules/community/http";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) { return commentPatch(request, (await context.params).id); }
export async function DELETE(request: NextRequest, context: Context) { return commentDelete(request, (await context.params).id); }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
