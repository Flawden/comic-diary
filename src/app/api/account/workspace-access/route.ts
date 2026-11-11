import { NextResponse } from "next/server";
import { getAdminWorkspaceAccess } from "@/modules/admin-ui/admin-page-access";

export const dynamic = "force-dynamic";

/** Only a boolean UI hint, never a substitute for the /admin route guard. */
export async function GET() {
  const access = await getAdminWorkspaceAccess();
  return NextResponse.json(
    { canAccessWorkspace: access.canAccessWorkspace },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
