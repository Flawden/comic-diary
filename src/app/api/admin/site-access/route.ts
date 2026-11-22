import type { NextRequest } from "next/server";
import {
  invitationActor,
  invitationFields,
  invitationJson,
  invitationResponse,
} from "@/modules/auth/beta-invitation-http";
import {
  InvitationError,
  requireInvitationAdmin,
} from "@/modules/auth/beta-invitation-admin";
import {
  readSiteAccess,
  setSiteAccess,
} from "@/modules/auth/site-access-service";
import { db } from "@/db";
export function GET() {
  return invitationResponse(async () => {
    const actor = await invitationActor();
    return db.transaction(async (tx) => {
      await requireInvitationAdmin(tx, actor);
      return readSiteAccess(tx);
    });
  });
}
export function POST(request: NextRequest) {
  return invitationResponse(async () => {
    const v = invitationFields(await invitationJson(request), [
      "publicRegistration",
      "betaOnly",
      "revision",
    ]);
    if (
      typeof v.publicRegistration !== "boolean" ||
      typeof v.betaOnly !== "boolean" ||
      !Number.isSafeInteger(v.revision) ||
      Number(v.revision) < 1
    )
      throw new InvitationError(400, "invalid_request");
    return setSiteAccess(
      await invitationActor(),
      v.publicRegistration,
      v.betaOnly,
      Number(v.revision),
    );
  });
}
