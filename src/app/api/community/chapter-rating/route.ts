import type {NextRequest} from 'next/server';
import {getCurrentSession} from '@/modules/auth/request-identity';
import {mutation,respond} from '@/modules/community/http';
import {CommunityError,targetQuery} from '@/modules/community/policy';
import {ownChapterRating,saveChapterRating} from '@/modules/community/review-service';

export function GET(request:NextRequest){return respond(async()=>{
 const q=request.nextUrl.searchParams;
 for(const k of q.keys())if(!['comicId','chapterId'].includes(k)||q.getAll(k).length!==1)throw new CommunityError(400,'invalid_request');
 const target=targetQuery(q);if(target.chapterId===null)throw new CommunityError(400,'invalid_request');
 const session=await getCurrentSession();if(!session)throw new CommunityError(401,'unauthenticated');
 return {body:await ownChapterRating(target,{userId:session.user.id,sessionId:session.sessionId})};
});}
export function PUT(request:NextRequest){return mutation(request,async(actor,body)=>({body:await saveChapterRating(actor,body)}));}
