import type {NextRequest} from 'next/server';
import {getCurrentSession} from '@/modules/auth/request-identity';
import {mutation,respond} from './http';
import {CommunityError,exactKeys,record,positiveId,queryId,targetQuery} from './policy';
import {saveReview,listReviews,reactToReview,removeReview,reviewHistory,moderateReview} from './review-service';
export function reviewsGet(request:NextRequest){return respond(async()=>{
 const q=request.nextUrl.searchParams;for(const key of q.keys())if(!['comicId','chapterId','cursor','filter','order'].includes(key)||q.getAll(key).length!==1)throw new CommunityError(400,'invalid_request');
 const filter=q.get('filter')??'all',order=q.get('order')??'new';if(!['all','text','scores','hidden'].includes(filter)||!['new','old'].includes(order))throw new CommunityError(400,'invalid_request');
 const target=targetQuery(new URLSearchParams([...q].filter(([k])=>['comicId','chapterId'].includes(k))));
 const session=await getCurrentSession();return {body:await listReviews(target,session?.user.id??null,q.get('cursor'),filter as 'all'|'text'|'scores'|'hidden',order as 'new'|'old',session?{userId:session.user.id,sessionId:session.sessionId}:null)};
});}
export function reviewsPut(request:NextRequest){return mutation(request,async(actor,body)=>({body:await saveReview(actor,body)}));}
export function reactionPut(request:NextRequest,id:string){return mutation(request,async(actor,body)=>({body:await reactToReview(actor,queryId(id),body)}));}
export function reviewDelete(request:NextRequest,id:string){return mutation(request,async(actor,body)=>{const v=record(body);exactKeys(v,['version']);return {body:await removeReview(actor,queryId(id),positiveId(v.version))};});}
export function historyGet(request:NextRequest){return respond(async()=>{const q=request.nextUrl.searchParams;for(const k of q.keys())if(!['comicId','chapterId','cursor'].includes(k)||q.getAll(k).length!==1)throw new CommunityError(400,'invalid_request');return {body:await reviewHistory(targetQuery(q),q.get('cursor'),(await getCurrentSession())?.user.id??null)};});}
export function moderationPut(request:NextRequest,id:string){return mutation(request,async(actor,body)=>({body:await moderateReview(actor,queryId(id),body)}));}
