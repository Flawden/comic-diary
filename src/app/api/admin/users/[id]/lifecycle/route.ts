import type { NextRequest } from "next/server";
import { actor, envelope, jsonBody } from "@/modules/appearance/http";
import { AppearanceError, strictObject } from "@/modules/appearance/policy";
import { changeAccountLifecycle } from "@/modules/auth/account-lifecycle";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  return envelope(async()=>{
    const who=await actor(request,true), {id}=await params;
    const body=strictObject(await jsonBody(request),["action","confirm"]);
    if(!/^[1-9]\d*$/.test(id)||!["BAN","UNBAN","DELETE"].includes(String(body.action))||body.confirm!==`${body.action}:${id}`)
      throw new AppearanceError(400,"invalid_confirmation");
    return changeAccountLifecycle(who,Number(id),body.action as "BAN"|"UNBAN"|"DELETE");
  });
}
