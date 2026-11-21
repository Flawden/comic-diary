import {exactKeys,invalid,positiveId,record} from './policy';

export function chapterRatingBody(input:unknown){
 const v=record(input);exactKeys(v,['comicId','chapterId','rating','version']);
 if(v.rating!==null&&(typeof v.rating!=='number'||!Number.isInteger(v.rating)||v.rating<1||v.rating>5))invalid();
 return {comicId:positiveId(v.comicId),chapterId:positiveId(v.chapterId),rating:v.rating as number|null,version:v.version==null?null:positiveId(v.version)};
}
export type OwnChapterRating={rating:number|null;version:number|null;hidden:boolean};
