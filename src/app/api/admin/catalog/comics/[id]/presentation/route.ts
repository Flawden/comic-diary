import {NextResponse,type NextRequest} from 'next/server';
import {getCurrentSession} from '@/modules/auth/request-identity';
import {isSameOriginRequest} from '@/modules/auth/request-origin';
import {hasPermission} from '@/modules/auth/permissions';
import {PresentationError} from '@/modules/catalog/work-presentation-policy';
import {readPresentation,savePresentation} from '@/modules/catalog/work-presentation-service';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function handle(request:NextRequest,context:Context,write:boolean){
  try{
    if(write&&!isSameOriginRequest(request))throw new PresentationError(403,'forbidden_origin');
    const session=await getCurrentSession();
    if(!session)throw new PresentationError(401,'unauthorized');
    if(!hasPermission(session.user.role,'EDIT_SHARED_CATALOG'))throw new PresentationError(403,'forbidden');
    const {id}=await context.params;const comicId=Number(id);
    if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(comicId)||comicId>2147483647)throw new PresentationError(400,'invalid_id');
    const actor={userId:session.user.id,sessionId:session.sessionId};
    let result;
    if(write){
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new PresentationError(415,'unsupported_media');
      const reader=request.body?.getReader();if(!reader)throw new PresentationError(400,'invalid_metadata');
      const parts:Uint8Array[]=[];let size=0;
      try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>128*1024){await reader.cancel();throw new PresentationError(413,'too_large');}parts.push(r.value);}}finally{reader.releaseLock();}
      let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}catch{throw new PresentationError(400,'invalid_metadata');}
      result=await savePresentation(actor,comicId,input);
    }else result=await readPresentation(actor,comicId);
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
  }catch(e){const known=e instanceof PresentationError;return NextResponse.json({error:known?e.code:'unavailable'},{status:known?e.status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}
export const GET=(request:NextRequest,context:Context)=>handle(request,context,false);
export const PUT=(request:NextRequest,context:Context)=>handle(request,context,true);
