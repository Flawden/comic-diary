export const ageRatings = [0,6,12,16,18] as const;
export type PresentationInput = { revision:number; ageRating:number|null; genres:string[]; chapters:{id:number;pageCount:number|null;readingMinutes:number|null}[] };
export class PresentationError extends Error {
  constructor(public status:number,public code:string){super(code);}
}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new PresentationError(400,'invalid_metadata');return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k))||allowed.some(k=>!(k in v)))throw new PresentationError(400,'invalid_metadata');}
export function optionalPositive(v:unknown):number|null {
  if(v===null)return null;
  if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>100000)throw new PresentationError(400,'invalid_metadata');
  return v;
}
export function parsePresentation(input:unknown):PresentationInput {
  const v=object(input);keys(v,['revision','ageRating','genres','chapters']);
  if(typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<0||v.revision>=2147483647)throw new PresentationError(400,'invalid_metadata');
  if(v.ageRating!==null&&!ageRatings.includes(v.ageRating as typeof ageRatings[number]))throw new PresentationError(400,'invalid_metadata');
  if(!Array.isArray(v.genres)||v.genres.length>10)throw new PresentationError(400,'invalid_metadata');
  const names=v.genres.map(x=>{
    if(typeof x!=='string')throw new PresentationError(400,'invalid_metadata');
    const name=x.normalize('NFKC').trim().replace(/\s+/g,' ');
    if(name.length>48||name.toLocaleLowerCase('ru').length>64||! /^[\p{L}\p{N}][\p{L}\p{N} &’'\-]*$/u.test(name))throw new PresentationError(400,'invalid_metadata');
    return name;
  });
  if(new Set(names.map(x=>x.toLocaleLowerCase('ru'))).size!==names.length)throw new PresentationError(400,'duplicate_genre');
  if(!Array.isArray(v.chapters)||v.chapters.length>500)throw new PresentationError(400,'invalid_metadata');
  const chapters=v.chapters.map(x=>{const c=object(x);keys(c,['id','pageCount','readingMinutes']);if(typeof c.id!=='number'||!Number.isSafeInteger(c.id)||c.id<=0||c.id>2147483647)throw new PresentationError(400,'invalid_metadata');return {id:c.id,pageCount:optionalPositive(c.pageCount),readingMinutes:optionalPositive(c.readingMinutes)};});
  if(new Set(chapters.map(c=>c.id)).size!==chapters.length)throw new PresentationError(400,'invalid_metadata');
  return {revision:v.revision,ageRating:v.ageRating as number|null,genres:names,chapters};
}

export type ChapterMeasure={id:number;status:string;kind:string;pageCount?:number|null;readingMinutes?:number|null};
export function chapterCountLabel(count:number,kind='MAIN'){
  const form=new Intl.PluralRules('ru').select(count);
  const word=kind==='MAIN'?(form==='one'?'глава':form==='few'?'главы':'глав'):(form==='one'?'спецвыпуск':form==='few'?'спецвыпуска':'спецвыпусков');
  return `${count} ${word}`;
}
export function readingMeasures(chapters:readonly ChapterMeasure[],read:ReadonlySet<number>,kind='MAIN'){
  const released=chapters.filter(c=>c.status==='RELEASED'&&c.kind===kind);
  const complete=(field:'pageCount'|'readingMinutes')=>released.length>0&&released.every(c=>typeof c[field]==='number'&&c[field]!>0);
  const totalPages=complete('pageCount')?released.reduce((s,c)=>s+c.pageCount!,0):null;
  const minutes=complete('readingMinutes')?released.reduce((s,c)=>s+c.readingMinutes!,0):null;
  const readPages=totalPages===null?null:released.filter(c=>read.has(c.id)).reduce((s,c)=>s+c.pageCount!,0);
  const readChapters=released.filter(c=>read.has(c.id)).length;
  return {totalChapters:released.length,readChapters,chapterPercent:released.length?Math.round(readChapters/released.length*100):null,totalPages,readPages,pagePercent:totalPages===null?null:Math.round(readPages!/totalPages*100),minutes,knownPageChapters:released.filter(c=>c.pageCount!=null).length};
}
