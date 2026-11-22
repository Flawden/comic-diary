import type { NextRequest } from "next/server";
import { actor, jsonBody, response } from "@/modules/appearance/http";
import { AppearanceError, strictObject } from "@/modules/appearance/policy";
import { changeAccountLifecycle } from "@/modules/auth/account-lifecycle";
import { clearSessionCookie } from "@/modules/auth/session-cookie";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest) {
  try {
    const who=await actor(request), body=strictObject(await jsonBody(request),["password","confirm"]);
    if(body.confirm!=="УДАЛИТЬ"||typeof body.password!=="string")throw new AppearanceError(400,"invalid_confirmation");
    const result=await changeAccountLifecycle(who,who.userId,"SELF_DELETE",body.password);
    const res=response(result); clearSessionCookie(res); return res;
  } catch(e) {
    return response({error:e instanceof AppearanceError?e.kind:"account_change_unavailable"},e instanceof AppearanceError?e.status:503);
  }
}
