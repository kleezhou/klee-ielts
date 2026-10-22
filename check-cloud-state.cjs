const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {sanitize,merge,BOOK_ID}=require('./dist/cloud-state.js');
const ids=Array.from({length:526},(_,i)=>i+1),words=['resemble','buildings','focus','save'],today=localDay(),yesterday=addDays(today,-1),tomorrow=addDays(today,1),farDay=addDays(today,-40);
function localDay(){const d=new Date();return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;}
function addDays(day,amount){const [y,m,d]=day.split('-').map(Number),date=new Date(0);date.setHours(12,0,0,0);date.setFullYear(y,m-1,d+amount);return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;}
function dueAt(day,hour=4){const [y,m,d]=day.split('-').map(Number),date=new Date(0);date.setFullYear(y,m-1,d);date.setHours(hour,0,0,0);return date.getTime();}
function progress(day,extras={}){return {grade:'known',day,firstLearnedDay:day,due:dueAt(addDays(day,1)),...extras};}
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;}

const phone={bookId:BOOK_ID,progress:{1:progress(yesterday,{reviewStage:2}),4:progress(farDay)},mastered:[3],saved:['resemble'],checkins:{[yesterday]:{newIds:[1,2,3,4,5],reviewIds:[],dueIds:[],checked:true}},celebrations:[`${yesterday}:new`],settings:{voice:'phone-en-GB',rate:0.75,dailyGoal:5},loops:{new:{items:[1]}},spelling:{review:{queue:[1]}},index:21};
const cloud={bookId:BOOK_ID,progress:{2:progress(farDay,{reviewStage:4}),4:progress(today,{reviewStage:1})},mastered:[6],saved:['buildings'],checkins:{[today]:{newIds:[],reviewIds:[2],dueIds:[2],checked:true}},celebrations:[`${today}:review`],settings:{voice:'',rate:1,dailyGoal:20}};
const frozenPhone=deepFreeze(structuredClone(phone)),frozenCloud=deepFreeze(structuredClone(cloud));
const migrated=merge(null,frozenPhone,frozenCloud,ids,words);
assert.deepEqual(Object.keys(migrated).sort(),['bookId','celebrations','checkins','mastered','progress','saved','settings','version'].sort(),'only durable state is returned');
assert.equal(migrated.progress[1].reviewStage,2);assert.equal(migrated.progress[2].reviewStage,4);assert.equal(migrated.progress[4].day,today,'first migration keeps the newer completion');
assert.deepEqual(migrated.mastered,[3,6]);assert.deepEqual(migrated.saved,['buildings','resemble']);
assert.equal(migrated.checkins[yesterday].checked,true);assert.deepEqual(migrated.checkins[yesterday].newIds,[1,2,3,4,5]);
assert.deepEqual(migrated.checkins[today].reviewIds,[2]);assert.equal(migrated.checkins[today].checked,true);
assert.equal(migrated.settings.rate,0.75);assert.equal(migrated.settings.dailyGoal,5);
assert.equal(JSON.stringify(phone),JSON.stringify(frozenPhone));assert.equal(JSON.stringify(cloud),JSON.stringify(frozenCloud),'merge leaves its inputs unchanged');
const freshDevice=sanitize(migrated,ids,words);assert.deepEqual(freshDevice,migrated,'cloud data restores the complete durable subset on a fresh device');
assert.equal('loops' in freshDevice,false);assert.equal('spelling' in freshDevice,false);assert.equal('index' in freshDevice,false);
const browser={IELTS_DATA:{cards:ids.map(id=>({id})),glossary:Object.fromEntries(words.map(word=>[word,{}]))}};
vm.runInNewContext(fs.readFileSync('dist/cloud-state.js','utf8'),{window:browser});
assert.equal(browser.IELTS_CLOUD_STATE.merge(null,phone,cloud).progress[4].day,today,'the browser UMD API resolves the current book lists automatically');

const base={bookId:BOOK_ID,progress:{1:progress(yesterday,{reviewStage:2}),2:progress(today)},mastered:[2],saved:['resemble'],checkins:{[today]:{newIds:[1],reviewIds:[],dueIds:[2],checked:false}},settings:{voice:'base',rate:0.9,dailyGoal:10}};
const local={...structuredClone(base),progress:{...structuredClone(base.progress),1:progress(today,{reviewStage:3})},mastered:[],saved:[],settings:{voice:'local',rate:0.9,dailyGoal:15}};
const remote={...structuredClone(base),progress:{...structuredClone(base.progress),1:progress(today,{reviewStage:0,lastReviewHadError:true}),3:progress(farDay,{reviewStage:1})},mastered:[2,4],saved:['resemble','buildings'],checkins:{[today]:{newIds:[1,2,3,4,5],reviewIds:[],dueIds:[2],checked:false}},settings:{voice:'base',rate:1,dailyGoal:10}};
const combined=merge(base,local,remote,ids,words);
assert.equal(combined.progress[1].lastReviewHadError,true,'same-day conflicts honor a lapse rather than lengthening the interval');
assert.equal(combined.progress[1].reviewStage,0);assert.equal(combined.progress[1].firstLearnedDay,yesterday);
assert.equal(combined.progress[3].reviewStage,1,'offline progress is merged by card');
assert.deepEqual(combined.mastered,[4],'an explicit unmark propagates while a remote addition remains');
assert.deepEqual(combined.saved,['buildings'],'an explicit unsave propagates while remote additions remain');
assert.equal(combined.settings.voice,'local');assert.equal(combined.settings.rate,1);assert.equal(combined.settings.dailyGoal,15);
assert.deepEqual(combined.checkins[today].newIds,[1,2,3,4,5],'actual check-in evidence unions across devices');
assert.deepEqual(combined.checkins[today].dueIds,[],'today’s outstanding due ID for an unmarked card is removed');
assert.equal(combined.checkins[today].checked,true,'five genuine new-word completions survive the merge');

const sameDayClean=merge(base,{...structuredClone(base),progress:{1:progress(today,{reviewStage:3})}},{...structuredClone(base),progress:{1:progress(today,{reviewStage:2})}},ids,words);
assert.equal(sameDayClean.progress[1].reviewStage,3,'same-day clean completion keeps the furthest clean stage');
assert.equal(!!sameDayClean.progress[1].lastReviewHadError,false);
const checkedMaster={bookId:BOOK_ID,mastered:[2],progress:{2:progress(today)},checkins:{[today]:{newIds:[],reviewIds:[2],dueIds:[2],checked:true}}};
const preserved= sanitize(checkedMaster,ids,words);assert.deepEqual(preserved.checkins[today].dueIds,[2]);assert.equal(preserved.checkins[today].checked,true,'completed retired reviews preserve earned evidence');
const metadata=sanitize({progress:{8:progress(today,{reviewStage:5,lastReviewHadError:true,manualUnmarked:true,firstLearnedDay:tomorrow})}},ids,words);
assert.equal(metadata.progress[8].reviewStage,5);assert.equal(metadata.progress[8].lastReviewHadError,true);assert.equal(metadata.progress[8].manualUnmarked,true);assert.equal(metadata.progress[8].firstLearnedDay,today,'future first-learned dates are corrected without changing the actual completion');

const hostile=JSON.parse(`{"bookId":"${BOOK_ID}","progress":{"1":{"grade":"known","day":"2026-2-30","firstLearnedDay":"2026-1-1","due":0},"999":{"grade":"known","day":"${today}","due":0},"__proto__":{"polluted":true}},"mastered":[999,1,"2"],"saved":["constructor","resemble",{},"not-a-word"],"checkins":{"2026-2-30":{"newIds":[1,999],"checked":true},"__proto__":{"newIds":[1]}},"celebrations":["2026-2-30:new","${today}:review","${today}:bad"],"settings":{"voice":"\\u0000unsafe","rate":4,"dailyGoal":999},"loops":{"secret":true}}`);
const clean=sanitize(hostile,ids,words);
assert.deepEqual(clean.progress,{});assert.deepEqual(clean.mastered,[1]);assert.deepEqual(clean.saved,['resemble']);
assert.deepEqual(Object.keys(clean.checkins),[]);assert.deepEqual(clean.celebrations,[`${today}:review`]);
assert.deepEqual(clean.settings,{voice:'',rate:0.9,dailyGoal:10});assert.equal(({}).polluted,undefined);
assert.throws(()=>sanitize({...phone,bookId:'another-book'},ids,words),/Book mismatch/);
assert.throws(()=>sanitize({...phone,version:8},ids,words),/Unsupported durable state version/);
assert.equal(sanitize(null,ids,words).bookId,BOOK_ID);
console.log('PASS: cloud durable-state sanitizer and three-way merge: migration, restore, offline edits, explicit removals, review metadata, check-ins, hostile payloads, and immutability.');
