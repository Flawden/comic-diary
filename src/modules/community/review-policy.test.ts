import test from 'node:test';import assert from 'node:assert/strict';
import {reviewBody,reactionBody,reviewAverage} from './review-policy';
const valid={comicId:1,scores:[1,2,3,4,5]};
test('complete five-score work review, optional empty text, normalization and chapter score',()=>{
 assert.deepEqual(reviewBody(valid),{...valid,chapterId:null,body:'',spoiler:false,version:null});
 assert.equal(reviewBody({...valid,body:'  Привет\r\nмир 🐉  '}).body,'Привет\nмир 🐉');
 assert.deepEqual(reviewBody({comicId:1,chapterId:2,scores:[5]}).scores,[5]);assert.equal(reviewBody({comicId:1,chapterId:2,scores:[5]}).spoiler,true);
 assert.equal(reviewAverage([5,5,3,5,5]),4.6);
});
for(const [key,value] of [['scores',[]],['scores',[0,2,3,4,5]],['scores',[6,2,3,4,5]],['scores',[1.1,2,3,4,5]],['scores',['5',2,3,4,5]],['body',null],['body','x'.repeat(2001)],['body','\u0000'],['version',0],['userId',1],['parentId',1],['spoiler','false']] as const)test('review rejects invalid '+key+' '+String(value).slice(0,12),()=>assert.throws(()=>reviewBody({...valid,[key]:value})));
test('chapter accepts only one score and reactions are strict -1/0/1',()=>{
 assert.throws(()=>reviewBody({...valid,chapterId:1}));for(const value of [-1,0,1])assert.equal(reactionBody({value}),value);
 for(const value of [2,'1',null,true,NaN])assert.throws(()=>reactionBody({value}));assert.throws(()=>reactionBody({value:1,userId:2}));
});
