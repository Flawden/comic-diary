import {test} from 'node:test';import assert from 'node:assert/strict';
import {parsePresentation,readingMeasures} from './work-presentation-policy';
const base={revision:0,ageRating:null,genres:[],chapters:[]};
test('all editorial values are optional and null is retained',()=>assert.deepEqual(parsePresentation({...base,chapters:[{id:1,pageCount:null,readingMinutes:null}]}),{...base,chapters:[{id:1,pageCount:null,readingMinutes:null}]}));
for(const age of [0,6,12,16,18])test('age '+age,()=>assert.equal(parsePresentation({...base,ageRating:age}).ageRating,age));
for(const invalid of [-1,0,1.5,'24',NaN,Infinity,100001,undefined])test('invalid pages/minutes '+String(invalid),()=>{for(const field of ['pageCount','readingMinutes'])assert.throws(()=>parsePresentation({...base,chapters:[{id:1,pageCount:24,readingMinutes:3,[field]:invalid}]}));});
test('strict shape, age, IDs, revision and duplicate tags',()=>{
 for(const input of [{...base,userId:1},{...base,revision:-1},{...base,ageRating:'12'},{...base,ageRating:7},{...base,genres:['Драма','драма']},{...base,genres:['<script>']},{...base,chapters:[{id:2,pageCount:null,readingMinutes:null},{id:2,pageCount:1,readingMinutes:2}]}])assert.throws(()=>parsePresentation(input));
 assert.deepEqual(parsePresentation({...base,genres:['  Научная   фантастика ','Драма']}).genres,['Научная фантастика','Драма']);
 assert.throws(()=>parsePresentation({...base,chapters:[{id:2147483648,pageCount:1,readingMinutes:1}]}));
});
const rows=[24,28,22,26,30].map((n,i)=>({id:i+1,status:'RELEASED',kind:'MAIN',pageCount:n,readingMinutes:3}));
test('concept values sum to 130, pages are from whole read chapters',()=>assert.deepEqual(readingMeasures(rows,new Set([1])),{totalChapters:5,readChapters:1,chapterPercent:20,totalPages:130,readPages:24,pagePercent:18,minutes:15,knownPageChapters:5}));
test('missing pages/time hides misleading totals and percentages',()=>{const r=readingMeasures([...rows,{id:6,status:'RELEASED',kind:'MAIN',pageCount:null,readingMinutes:null}],new Set([6]));assert.equal(r.totalPages,null);assert.equal(r.pagePercent,null);assert.equal(r.minutes,null);assert.equal(r.knownPageChapters,5);});
test('scheduled, archived and special do not affect main progress or exceed 100%',()=>{const r=readingMeasures([...rows,...['SCHEDULED','ARCHIVED'].map((status,i)=>({...rows[0],id:10+i,status})),{...rows[0],id:12,kind:'SPECIAL'}],new Set([1,2,3,4,5,10,11,12]));assert.equal(r.chapterPercent,100);assert.equal(r.pagePercent,100);assert.equal(r.totalPages,130);});
test('empty, guest, unread and special section',()=>{assert.equal(readingMeasures([],new Set()).chapterPercent,null);assert.equal(readingMeasures(rows,new Set()).pagePercent,0);assert.equal(readingMeasures([{...rows[0],kind:'SPECIAL'}],new Set([1]),'SPECIAL').pagePercent,100);});
