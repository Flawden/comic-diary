import {and,eq,sql} from 'drizzle-orm';
import {db} from '@/db';
import {users,sessions,comics,chapters,genres,comicGenres,administrativeAuditEvents} from '@/db/schema';
import {hasPermission} from '@/modules/auth/permissions';
import {SHARED_CATALOG_ADVISORY_LOCK} from './canonical-catalog-write';
import {parsePresentation,PresentationError} from './work-presentation-policy';
export type PresentationActor={userId:number;sessionId:number};
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function authorize(tx:Tx,actor:PresentationActor){
  const [user]=await tx.select({id:users.id,role:users.role,active:users.isActive}).from(users).where(eq(users.id,actor.userId)).for('share');
  if(!user?.active||!hasPermission(user.role,'EDIT_SHARED_CATALOG'))throw new PresentationError(403,'forbidden');
  const live=await tx.select({id:sessions.id}).from(sessions).where(and(eq(sessions.id,actor.sessionId),eq(sessions.userId,actor.userId),sql`${sessions.expiresAt}>clock_timestamp()`)).for('share');
  if(!live.length)throw new PresentationError(401,'unauthorized');
  return user;
}
export async function getComicGenreNames(comicId:number){
  return (await db.select({name:genres.name}).from(comicGenres).innerJoin(genres,eq(genres.id,comicGenres.genreId)).where(eq(comicGenres.comicId,comicId)).orderBy(genres.name)).map(x=>x.name);
}
export async function readPresentation(actor:PresentationActor,comicId:number){
  return db.transaction(async tx=>{
    await authorize(tx,actor);
    const [comic]=await tx.select({revision:comics.presentationRevision,ageRating:comics.ageRating}).from(comics).where(and(eq(comics.id,comicId),eq(comics.visibility,'SHARED')));
    if(!comic)throw new PresentationError(404,'not_found');
    const names=await tx.select({name:genres.name}).from(comicGenres).innerJoin(genres,eq(genres.id,comicGenres.genreId)).where(eq(comicGenres.comicId,comicId)).orderBy(genres.name);
    const rows=await tx.select({id:chapters.id,title:chapters.title,code:chapters.displayCode,status:chapters.status,pageCount:chapters.pageCount,readingMinutes:chapters.readingMinutes}).from(chapters).where(eq(chapters.comicId,comicId)).orderBy(chapters.sortOrder,chapters.id);
    return {...comic,genres:names.map(x=>x.name),chapters:rows};
  },{isolationLevel:'repeatable read'});
}
export async function savePresentation(actor:PresentationActor,comicId:number,input:unknown){
  const value=parsePresentation(input);
  return db.transaction(async tx=>{
    // Shared catalog lock -> USER SHARE -> SESSION SHARE -> COMIC UPDATE -> CHAPTER UPDATE.
    // No lock upgrade; normal catalog/import paths retain the same advisory lock.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SHARED_CATALOG_ADVISORY_LOCK})`);
    const user=await authorize(tx,actor);
    const [comic]=await tx.select({revision:comics.presentationRevision,slug:comics.slug}).from(comics).where(and(eq(comics.id,comicId),eq(comics.visibility,'SHARED'))).for('update');
    if(!comic)throw new PresentationError(404,'not_found');
    if(comic.revision!==value.revision)throw new PresentationError(409,'metadata_changed');
    for(const c of [...value.chapters].sort((a,b)=>a.id-b.id)){
      const result=await tx.update(chapters).set({pageCount:c.pageCount,readingMinutes:c.readingMinutes,updatedAt:new Date()}).where(and(eq(chapters.id,c.id),eq(chapters.comicId,comicId))).returning({id:chapters.id});
      if(result.length!==1)throw new PresentationError(400,'chapter_not_in_work');
    }
    await tx.delete(comicGenres).where(eq(comicGenres.comicId,comicId));
    for(const name of value.genres){
      const key=name.toLocaleLowerCase('ru');
      await tx.insert(genres).values({key,name}).onConflictDoNothing({target:genres.key});
      const [genre]=await tx.select({id:genres.id}).from(genres).where(eq(genres.key,key));
      await tx.insert(comicGenres).values({comicId,genreId:genre.id});
    }
    await tx.update(comics).set({ageRating:value.ageRating,presentationRevision:value.revision+1,updatedAt:new Date()}).where(eq(comics.id,comicId));
    await tx.insert(administrativeAuditEvents).values({actorUserId:user.id,actorRole:user.role,action:'COMIC_UPDATE',targetType:'COMIC',targetId:comicId,targetKey:comic.slug,details:{channel:'presentation',chapterCount:value.chapters.length,genreCount:value.genres.length}});
    return {ok:true,revision:value.revision+1};
  });
}
