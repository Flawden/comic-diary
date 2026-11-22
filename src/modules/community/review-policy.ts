import type {PublicAppearance} from '@/modules/appearance/policy';
import { record,exactKeys,positiveId,textValue,invalid } from "./policy";
export const reviewCriteria=[['plot','Сюжет'],['characters','Персонажи'],['art','Рисовка'],['depth','Глубина'],['world','Мир']] as const;
export type Review = { id:number; mine:boolean; author:string; appearance?:PublicAppearance; scores:number[]; body:string; spoiler:boolean; version:number; createdAt:string; updatedAt:string; up:number; down:number; reaction:number; hidden:boolean };
export type ReviewPage={items:Review[];mine:Review|null;total:number;nextCursor:string|null};
export type ReviewFilter='all'|'text'|'scores'|'hidden';
export function reviewBody(input:unknown){
 const v=record(input);exactKeys(v,['comicId','chapterId','scores','body','spoiler','version']);
 const chapterId=v.chapterId==null?null:positiveId(v.chapterId);
 if(!Array.isArray(v.scores)||v.scores.length!==(chapterId===null?5:1)||v.scores.some(x=>typeof x!=='number'||!Number.isInteger(x)||x<1||x>5))invalid();
 if(v.spoiler!==undefined&&typeof v.spoiler!=='boolean')invalid();
 if(v.body!==undefined&&typeof v.body!=='string')invalid();
 const body=typeof v.body==='string'&&v.body.trim()?textValue(v.body):'';
 return {comicId:positiveId(v.comicId),chapterId,scores:v.scores as number[],body,spoiler:(v.spoiler??chapterId!==null) as boolean,version:v.version==null?null:positiveId(v.version)};
}
export function reactionBody(input:unknown){const v=record(input);exactKeys(v,['value']);if(![-1,0,1].includes(v.value as number))invalid();return v.value as number;}
export function reviewAverage(scores:number[]){return scores.reduce((a,b)=>a+b,0)/scores.length;}
