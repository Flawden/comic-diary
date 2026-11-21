import {and,eq,isNull,sql} from "drizzle-orm";
import {db} from "@/db";
import {communityReviews as reviews,communityReviewReactions as reactions,communityModerationEvents} from "@/db/schema";
import {mutate,lockTarget,requireUnrestricted,consume,type Context} from "./service";
import {CommunityError,decodeCursor,encodeCursor,positiveId,publicAlias,textValue,record,exactKeys,type Actor,type Target} from "./policy";
import {reviewBody,reactionBody,type Review,type ReviewPage,type ReviewFilter} from "./review-policy";
import {chapterRatingBody,type OwnChapterRating} from './chapter-rating-policy';
type Row=typeof reviews.$inferSelect;
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const whereTarget=(t:Target)=>and(eq(reviews.comicId,t.comicId),t.chapterId===null?isNull(reviews.chapterId):eq(reviews.chapterId,t.chapterId));
async function live(c:Context){const result=await c.tx.execute(sql`SELECT 1 FROM sessions WHERE id=${c.actor.sessionId} AND user_id=${c.actor.userId} AND expires_at>clock_timestamp()`);if(result.rows.length!==1)throw new CommunityError(401,'unauthenticated');}
const scores=(r:Row)=>r.chapterId===null?[r.ratingPlot!,r.ratingCharacters!,r.ratingArt!,r.ratingDepth!,r.ratingWorld!]:[r.rating!];
export async function saveReview(actor:Actor,input:unknown){return writeReview(actor,input);}
/** The score-only interface never returns chapter text or other readers' records. */
export async function ownChapterRating(target:Target,actor:Actor):Promise<OwnChapterRating>{
 if(target.chapterId===null)throw new CommunityError(400,'invalid_request');
 return db.transaction(async tx=>{await lockTarget(tx,target);
 const session=await tx.execute(sql`SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=${actor.sessionId} AND s.user_id=${actor.userId} AND s.expires_at>clock_timestamp() AND u.is_active AND (u.email_verified_at IS NOT NULL OR u.verification_required_at IS NULL)`);
 if(session.rows.length!==1)throw new CommunityError(401,'unauthenticated');
 const [row]=await tx.select({rating:reviews.rating,version:reviews.version,hiddenAt:reviews.hiddenAt,deletedAt:reviews.deletedAt}).from(reviews).where(and(whereTarget(target),eq(reviews.userId,actor.userId)));
 return {rating:row&&!row.deletedAt?row.rating:null,version:row?.version??null,hidden:!!row?.hiddenAt};
 },{isolationLevel:'repeatable read'});
}
export async function saveChapterRating(actor:Actor,input:unknown){
 const v=chapterRatingBody(input);
 if(v.rating!==null)return writeReview(actor,{comicId:v.comicId,chapterId:v.chapterId,scores:[v.rating],version:v.version},true);
 return mutate(actor,async c=>{await lockTarget(c.tx,v);requireUnrestricted(c);
 const [row]=await c.tx.select().from(reviews).where(and(whereTarget(v),eq(reviews.userId,actor.userId))).for('update');
 if(!row||row.deletedAt){await live(c);return {ok:true,replay:true};}
 if(row.version!==v.version)throw new CommunityError(409,'review_changed');
 await consume(c,'edit');await c.tx.delete(reactions).where(eq(reactions.reviewId,row.id));
 // Preserve historical text and score bytes; withdrawing a vote uses the existing tombstone.
 await c.tx.update(reviews).set({deletedAt:c.now,updatedAt:c.now,version:row.version+1}).where(eq(reviews.id,row.id));
 await live(c);return {ok:true,replay:false};
 });
}
async function writeReview(actor:Actor,input:unknown,ratingOnly=false){const v=reviewBody(input);return mutate(actor,async c=>{
 await lockTarget(c.tx,v);requireUnrestricted(c);
 const [old]=await c.tx.select().from(reviews).where(and(whereTarget(v),eq(reviews.userId,actor.userId))).for('update');
 if(old?.hiddenAt)throw new CommunityError(403,'review_hidden');
 // A score-only edit must preserve previously written chapter text and its spoiler flag.
 if(ratingOnly){v.body=old?.body??'';v.spoiler=old?.spoiler??false;}
 const fields=v.chapterId===null?{ratingPlot:v.scores[0],ratingCharacters:v.scores[1],ratingArt:v.scores[2],ratingDepth:v.scores[3],ratingWorld:v.scores[4],rating:null}:
  {ratingPlot:null,ratingCharacters:null,ratingArt:null,ratingDepth:null,ratingWorld:null,rating:v.scores[0]};
 if(old&&!old.deletedAt&&old.body===v.body&&old.spoiler===v.spoiler&&JSON.stringify(scores(old))===JSON.stringify(v.scores)){await live(c);return {id:old.id,version:old.version,replay:true};}
 if(old&&!old.deletedAt&&v.version!==old.version)throw new CommunityError(409,'review_changed');
 if(old?.deletedAt&&v.version!==null&&v.version!==old.version)throw new CommunityError(409,'review_changed');
 if(!old&&v.version!==null)throw new CommunityError(409,'review_changed');
 await consume(c,old&&!old.deletedAt?'edit':'post');
 // Also clear reactions left on tombstones by older application versions.
 if(old?.deletedAt)await c.tx.delete(reactions).where(eq(reactions.reviewId,old.id));
 const [row]=old?await c.tx.update(reviews).set({...fields,body:v.body,spoiler:v.spoiler,deletedAt:null,updatedAt:c.now,version:old.version+1}).where(and(eq(reviews.id,old.id),eq(reviews.version,old.version))).returning():
  await c.tx.insert(reviews).values({...fields,comicId:v.comicId,chapterId:v.chapterId,userId:actor.userId,body:v.body,spoiler:v.spoiler,createdAt:c.now,updatedAt:c.now}).returning();
 if(!row)throw new CommunityError(409,'review_changed');await live(c);return {id:row.id,version:row.version,replay:false};
});}
export async function removeReview(actor:Actor,id:number,version:number){positiveId(id);positiveId(version);return mutate(actor,async c=>{
 const [hint]=await c.tx.select().from(reviews).where(eq(reviews.id,id));if(!hint)throw new CommunityError(404,'not_found');
 await lockTarget(c.tx,hint);const [row]=await c.tx.select().from(reviews).where(eq(reviews.id,id)).for('update');
 if(!row||row.userId!==actor.userId)throw new CommunityError(403,'forbidden');
 if(row.deletedAt){await c.tx.delete(reactions).where(eq(reactions.reviewId,id));await live(c);return {ok:true};}if(row.version!==version)throw new CommunityError(409,'review_changed');
 requireUnrestricted(c);await consume(c,'edit');await c.tx.delete(reactions).where(eq(reactions.reviewId,id));await c.tx.update(reviews).set({deletedAt:c.now,updatedAt:c.now,version:row.version+1}).where(eq(reviews.id,id));await live(c);return {ok:true};
});}
export async function reactToReview(actor:Actor,id:number,input:unknown){positiveId(id);const value=reactionBody(input);return mutate(actor,async c=>{
 const [hint]=await c.tx.select().from(reviews).where(eq(reviews.id,id));if(!hint||hint.chapterId!==null)throw new CommunityError(404,'not_found');await lockTarget(c.tx,hint);
 const [row]=await c.tx.select().from(reviews).where(eq(reviews.id,id)).for('update');if(!row||row.deletedAt||row.hiddenAt)throw new CommunityError(404,'not_found');
 if(row.userId===actor.userId)throw new CommunityError(403,'own_reaction');requireUnrestricted(c);
 const [old]=await c.tx.select().from(reactions).where(and(eq(reactions.reviewId,id),eq(reactions.userId,actor.userId)));
 if((old?.value??0)===value){await live(c);return {ok:true};}await consume(c,'edit');
 if(value===0)await c.tx.delete(reactions).where(and(eq(reactions.reviewId,id),eq(reactions.userId,actor.userId)));
 else await c.tx.insert(reactions).values({reviewId:id,userId:actor.userId,value}).onConflictDoUpdate({target:[reactions.reviewId,reactions.userId],set:{value}});
 await live(c);return {ok:true};
});}
export async function listReviews(target:Target,viewer:number|null,cursor:string|null=null,filter:ReviewFilter='all',order:'new'|'old'='new',moderator:Actor|null=null):Promise<ReviewPage>{
 if(filter==='hidden'&&!moderator)throw new CommunityError(403,'forbidden');
 const after=decodeCursor(cursor);const read=async(tx:Tx)=>{
  await lockTarget(tx,target);
  const targetCondition=sql`r.comic_id=${target.comicId} AND r.chapter_id IS NOT DISTINCT FROM ${target.chapterId}::integer AND r.deleted_at IS NULL`;
  const condition=sql`${targetCondition} ${filter==='hidden'?sql`AND r.hidden_at IS NOT NULL`:sql`AND r.hidden_at IS NULL`}`;
  const filtered=filter==='text'?sql`AND r.body<>''`:filter==='scores'?sql`AND r.body=''`:sql``;
  const boundary=!after?sql``:order==='new'?sql`AND (r.created_at,r.id)<(${after.at},${after.id})`:sql`AND (r.created_at,r.id)>(${after.at},${after.id})`;
  const sort=order==='new'?sql`DESC`:sql`ASC`;
  type Entry=Row & {name:string|null;active:boolean;up:number;down:number;reaction:number};
  const selection=sql`SELECT r.id,r.comic_id AS "comicId",r.chapter_id AS "chapterId",r.user_id AS "userId",r.rating_plot AS "ratingPlot",r.rating_characters AS "ratingCharacters",r.rating_art AS "ratingArt",r.rating_depth AS "ratingDepth",r.rating_world AS "ratingWorld",r.rating,r.body,r.spoiler,r.version,r.created_at AS "createdAt",r.updated_at AS "updatedAt",r.deleted_at AS "deletedAt",u.display_name AS name,u.is_active AS active,
   (SELECT count(*)::int FROM community_review_reactions x WHERE x.review_id=r.id AND x.value=1) AS up,
   (SELECT count(*)::int FROM community_review_reactions x WHERE x.review_id=r.id AND x.value=-1) AS down,
   coalesce((SELECT value FROM community_review_reactions x WHERE x.review_id=r.id AND x.user_id=${viewer}),0) AS reaction
   ,r.hidden_at AS "hiddenAt" FROM community_reviews r JOIN users u ON u.id=r.user_id`;
  const found=await tx.execute<Entry>(sql`${selection} WHERE ${condition} ${filtered} ${boundary} ORDER BY r.created_at ${sort},r.id ${sort} LIMIT 21`);
  const own=viewer===null?null:(await tx.execute<Entry>(sql`${selection} WHERE ${targetCondition} AND r.user_id=${viewer}`)).rows[0]??null;
  const dto=(r:Entry):Review=>({id:r.id,mine:r.userId===viewer,author:publicAlias(r.name,r.active),scores:scores(r),body:r.body,spoiler:r.spoiler,version:r.version,createdAt:new Date(r.createdAt).toISOString(),updatedAt:new Date(r.updatedAt).toISOString(),up:r.up,down:r.down,reaction:r.reaction,hidden:r.hiddenAt!==null});
  const rows=found.rows.slice(0,20),last=rows.at(-1);const count=await tx.execute<{n:number}>(sql`SELECT count(*)::int n FROM community_reviews r WHERE ${condition} ${filtered}`);
  return {items:rows.map(dto),mine:own?dto(own):null,total:count.rows[0].n,nextCursor:found.rows.length>20&&last?encodeCursor(new Date(last.createdAt),last.id):null};
 };return filter==='hidden'?mutate(moderator!,async c=>{const result=await read(c.tx);await live(c);return result;},true):db.transaction(read,{isolationLevel:'repeatable read'});
}
export async function getReviewCounts(comicId:number){const result=await db.execute<{chapterId:number|null;n:number}>(sql`SELECT r.chapter_id AS "chapterId",count(*)::int n FROM community_reviews r JOIN comics c ON c.id=r.comic_id WHERE r.comic_id=${comicId} AND r.deleted_at IS NULL AND r.hidden_at IS NULL AND c.visibility='SHARED' AND c.publication_status='PUBLISHED' GROUP BY r.chapter_id`);return {work:result.rows.find(x=>x.chapterId===null)?.n??0,chapters:Object.fromEntries(result.rows.filter(x=>x.chapterId!==null).map(x=>[x.chapterId,x.n]))};}
export async function moderateReview(actor:Actor,id:number,input:unknown){positiveId(id);const v=record(input);exactKeys(v,['action','reason']);if(v.action!=='HIDE'&&v.action!=='RESTORE')throw new CommunityError(400,'invalid_request');const action=v.action;const reason=textValue(v.reason,450);return mutate(actor,async c=>{
 const [hint]=await c.tx.select().from(reviews).where(eq(reviews.id,id));if(!hint)throw new CommunityError(404,'not_found');await lockTarget(c.tx,hint);
 const [row]=await c.tx.select().from(reviews).where(eq(reviews.id,id)).for('update');if(!row)throw new CommunityError(404,'not_found');
 const hide=action==='HIDE';if(!!row.hiddenAt===hide){await live(c);return {ok:true};}await consume(c,'edit');
 await c.tx.update(reviews).set({hiddenAt:hide?c.now:null,updatedAt:c.now,version:row.version+1}).where(eq(reviews.id,id));
 await c.tx.insert(communityModerationEvents).values({actorUserId:actor.userId,action,reviewId:id,targetUserId:row.userId,reason,createdAt:c.now});await live(c);return {ok:true};
 },true);}
/** Historical messages remain readable as a flat archive; no reply/mutation API. */
export async function reviewHistory(target:Target,cursor:string|null=null,viewer:number|null=null){const after=decodeCursor(cursor);return db.transaction(async tx=>{
 await lockTarget(tx,target);
 const rows=await tx.execute<{id:number;userId:number|null;body:string|null;spoiler:boolean;status:string;createdAt:string;name:string|null;active:boolean}>(sql`SELECT c.id,c.author_user_id AS "userId",c.body,c.spoiler,c.status,c.created_at AS "createdAt",u.display_name AS name,u.is_active AS active FROM community_comments c LEFT JOIN users u ON u.id=c.author_user_id WHERE c.comic_id=${target.comicId} AND c.chapter_id IS NOT DISTINCT FROM ${target.chapterId}::integer ${after?sql`AND (c.created_at,c.id)>(${after.at},${after.id})`:sql``} ORDER BY c.created_at,c.id LIMIT 21`);
 const items=rows.rows.slice(0,20),last=items.at(-1);
 return {items:items.map(r=>({id:r.id,mine:viewer!==null&&r.userId===viewer,author:publicAlias(r.name,r.active),body:r.status==='VISIBLE'?r.body:null,spoiler:r.status==='VISIBLE'&&r.spoiler,status:r.status,createdAt:new Date(r.createdAt).toISOString()})),nextCursor:rows.rows.length>20&&last?encodeCursor(new Date(last.createdAt),last.id):null};
},{isolationLevel:'repeatable read'});}
