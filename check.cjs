const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync('dist/data.js','utf8'),context);
const {cards,glossary} = context.window.IELTS_DATA;
assert.equal(cards.length,526);
assert.equal(new Set(cards.map(c=>c.id)).size,526);
assert.equal(cards[0].word,'resemble');
for (const c of cards) {
  assert.ok(c.ipa && c.meaning && c.translation && c.note);
  assert.ok(glossary[c.word],c.word);
  for(const token of c.example.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)) assert.ok(glossary[token.toLowerCase()],`${c.word}: missing ${token}`);
  for(const phrase of c.synonyms) assert.ok(glossary[phrase],`missing expression: ${phrase}`);
}
assert.equal(glossary.buildings.lemma,'building');
assert.equal(glossary.coined.lemma,'coin');
assert.equal(glossary.children.lemma,'child');
const html=fs.readFileSync('dist/index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'duplicate element IDs');
console.log(`PASS: ${cards.length} cards, every example token and synonym has an offline definition, inflections, unique HTML IDs.`);

const {localDay,buildPlan,recordGrade,validGoal}=require('./dist/plan.js');
const now=new Date(2026,9,19,9,0,0), day=localDay(now), yesterday=new Date(2026,9,18,9,0,0);
assert.ok(validGoal(1)&&validGoal(200));
for(const goal of [0,201,-1,1.5,'10',NaN])assert.equal(validGoal(goal),false);
let progress={};
let plan=buildPlan(cards,progress,2,now);
assert.equal(plan.remainingNew,2);
assert.deepEqual(Array.from(plan.newCards,c=>c.id),[1,2]);
progress[1]=recordGrade(undefined,'known',now);
plan=buildPlan(cards,progress,2,now);
assert.equal(plan.newToday,1);assert.equal(plan.remainingNew,1);assert.equal(plan.newCards[0].id,2);
progress[1]=recordGrade(progress[1],'again',now);
assert.equal(buildPlan(cards,progress,2,now).newToday,1,'repeating a word must not count twice');
progress[2]=recordGrade(undefined,'known',yesterday);
progress[2]=recordGrade(progress[2],'known',now);
plan=buildPlan(cards,progress,2,now);
assert.equal(plan.newToday,1,'reviewing yesterday’s word must not consume today’s new quota');
assert.equal(progress[2].firstLearnedDay,localDay(yesterday));
assert.equal(plan.studiedToday,2);
assert.equal(buildPlan(cards,progress,1,now).remainingNew,0,'lowered goal must not erase progress');
assert.equal(buildPlan(cards,progress,4,now).remainingNew,3,'raised goal should offer more new cards');
const nextDay=new Date(2026,9,20,0,0,0);
assert.equal(buildPlan(cards,progress,2,nextDay).newToday,0,'new quota resets at local midnight');
assert.equal(buildPlan(cards,progress,2,nextDay).remainingNew,2);
const reviewProgress={
  1:{grade:'again',day:localDay(yesterday),firstLearnedDay:localDay(yesterday),due:now.getTime()-1000},
  2:{grade:'again',day:localDay(yesterday),firstLearnedDay:localDay(yesterday),due:new Date(2026,9,19,23,59,59,999).getTime()},
  3:{grade:'known',day:localDay(yesterday),firstLearnedDay:localDay(yesterday),due:nextDay.getTime()}
};
plan=buildPlan(cards,reviewProgress,10,now);
assert.equal(plan.dueNow.length,1);assert.equal(plan.dueToday.length,2);assert.equal(plan.laterToday,1);
assert.equal(plan.nextReviewAt,reviewProgress[2].due);
const legacy={1:{grade:'known',day:localDay(yesterday),due:now.getTime()-1}};
assert.equal(buildPlan(cards,legacy,10,now).newToday,0);
assert.equal(recordGrade(legacy[1],'known',now).firstLearnedDay,localDay(yesterday));
const almostDone=Object.fromEntries(cards.slice(0,-1).map(c=>[c.id,recordGrade(undefined,'known',yesterday)]));
assert.equal(buildPlan(cards,almostDone,200,now).remainingNew,1,'remaining new cannot exceed word bank');
assert.equal(recordGrade(undefined,'again',now).due-now.getTime(),600000);
assert.throws(()=>recordGrade(undefined,'invalid',now),RangeError);
console.log('PASS: daily quotas, review isolation, repeats, legacy records, changed goals, local midnight, overdue/later/tomorrow reviews, remaining words.');

const Loop=require('./dist/loop.js');
for(const card of cards){assert.equal(card.distractors.length,3);assert.equal(new Set([card.meaning,...card.distractors.map(d=>d.meaning)]).size,4);for(const d of card.distractors)assert.ok(d.word&&d.meaning);}
let loop=Loop.create('new',day);Loop.sync(loop,[1,2,3,4],day);
const trace=[],done=[];
for(let n=0;n<20;n++){
  const q=Loop.next(loop,()=>0.4);if(!q)break;
  trace.push(`${q.id}:${q.stage}`);
  assert.equal(new Set(q.order).size,4);
  assert.equal(q.autoIntro,q.stage===1);
  Loop.answer(loop,true,0);
  const result=Loop.advance(loop);
  if(result.completedId!==null)done.push(result.completedId);
}
assert.deepEqual(trace.slice(0,5),['1:1','2:1','3:1','4:1','1:2'],'small daily batches use every available other word before first recall');
assert.equal(trace.length,12);assert.equal(done.length,4);assert.equal(loop.items.filter(i=>i.done).length,4);
assert.equal(Loop.next(loop),null);
loop=Loop.create('review',day);Loop.sync(loop,[1,2],day);
assert.equal(Loop.next(loop).autoIntro,false,'due review must not autoplay the question');
Loop.answer(loop,false,2);
assert.equal(loop.current.phase,'question');
assert.equal(Loop.advance(loop).advanced,false,'wrong options must not advance the card');
loop=Loop.restore(JSON.parse(JSON.stringify(loop)),[1,2],'review');
assert.equal(loop.current.choice,2);assert.equal(loop.current.correct,false);
assert.deepEqual(loop.current.wrongChoices,[2]);
Loop.answer(loop,true,0);
assert.equal(loop.current.phase,'reveal');
assert.equal(loop.current.correct,false,'correcting a previously wrong choice must retain the memory lapse');
assert.equal(Loop.advance(loop).completedId,null);
assert.equal(loop.items[0].stage,1);assert.equal(loop.items[0].lapses,1);
assert.equal(Loop.next(loop).id,2,'a missed word must not immediately repeat when another is available');
Loop.answer(loop,true,0);Loop.advance(loop);
assert.equal(Loop.next(loop).id,1);assert.equal(loop.current.stage,1);assert.equal(loop.current.autoIntro,false);
loop=Loop.create('new',day);Loop.sync(loop,[1],day);
for(let stage=1;stage<3;stage++){assert.equal(Loop.next(loop).stage,stage);Loop.answer(loop,true,0);assert.equal(Loop.advance(loop).completedId,null);}
assert.equal(Loop.next(loop).stage,3);Loop.answer(loop,true);Loop.mistake(loop);
assert.equal(Loop.advance(loop).completedId,null,'self-correction at round 3 must prevent completion');
assert.equal(loop.items[0].stage,1);assert.equal(loop.items[0].done,false);assert.equal(Loop.next(loop).autoIntro,false);
const restored=Loop.restore(JSON.parse(JSON.stringify(loop)),[1],'new');
assert.equal(restored.current.stage,1);assert.equal(restored.current.serial,loop.current.serial);
assert.deepEqual(restored.current.order,loop.current.order,'answer order must survive refresh');
loop=Loop.create('new',day);Loop.sync(loop,[1,2,3],day);Loop.next(loop);Loop.sync(loop,[2],day);
assert.deepEqual(loop.items.map(i=>i.id),[1,2],'lowering the daily goal must retain a word already being learned');
const completion=require('./dist/plan.js').recordCompletion;
const first=completion(undefined,'new',now);
assert.equal(new Date(first.due).getDate(),20);assert.equal(new Date(first.due).getHours(),4);
const reviewed=completion(first,'review',nextDay);
assert.equal(reviewed.firstLearnedDay,first.firstLearnedDay);
assert.equal(new Date(reviewed.due).getDate(),23);assert.equal(new Date(reviewed.due).getHours(),4);
assert.equal(buildPlan(cards,{1:reviewed},10,nextDay).newToday,0,'a review completion must not become a new word');
let ladder=first;
for(const days of [3,7,14,30,60,60]){ladder=completion(ladder,'review',now);const due=new Date(ladder.due),expected=new Date(now);expected.setDate(expected.getDate()+days);expected.setHours(4,0,0,0);assert.equal(ladder.due,expected.getTime(),`clean reviews advance to ${days} days`);assert.equal(due.getHours(),4);}
const lapse=completion(ladder,'review',now,true);assert.equal(lapse.reviewStage,0);assert.equal(new Date(lapse.due).getDate(),20,'a lapse returns tomorrow');
const afterLapse=completion(lapse,'review',now);assert.equal(afterLapse.reviewStage,1);assert.equal(new Date(afterLapse.due).getDate(),22,'the next clean review restarts at three days');
const retiredDue={1:completion(undefined,'new',yesterday)};retiredDue[1].due=now.getTime()-1;
assert.equal(buildPlan(cards,retiredDue,1,now,[1]).dueNow.length,0,'mastered overdue words stay retired');
assert.equal(buildPlan(cards,{},1,now,[1]).newCards[0].id,2,'mastered unseen words do not consume the new goal');
assert.equal(require('./dist/plan.js').resumeProgress(retiredDue[1],now).firstLearnedDay,retiredDue[1].firstLearnedDay,'unmarking preserves learning history');
console.log('PASS: all three rounds, interleaving, confusable distractors, wrong-answer reset, self-correction, refresh resume, review silence flag, completion-only scheduling.');

let spelling=Loop.createSpelling('review',day);Loop.syncSpelling(spelling,[1,2],day);
assert.equal(Loop.nextSpelling(spelling).id,1);
assert.equal(Loop.submitSpelling(spelling,'assemble',['resemble']),true);assert.equal(spelling.current.correct,false);
assert.equal(Loop.advanceSpelling(spelling).completedId,null);
assert.equal(Loop.nextSpelling(spelling).id,2,'spelling errors must be interleaved');
Loop.submitSpelling(spelling,'  FERTILIZER  ',['fertiliser','fertilizer']);assert.equal(spelling.current.correct,true);
spelling=Loop.restoreSpelling(JSON.parse(JSON.stringify(spelling)),[1,2],'review');
assert.equal(spelling.current.correct,true);assert.equal(Loop.advanceSpelling(spelling).completedId,2);
assert.equal(Loop.nextSpelling(spelling).id,1);Loop.submitSpelling(spelling,'resemble',['resemble']);Loop.advanceSpelling(spelling);
assert.equal(Loop.nextSpelling(spelling),null);assert.equal(spelling.passed.length,2);
assert.equal(Loop.normalizeSpelling(' Rather   Than '),'rather than');

// 在隔离的 DOM 桩中跑应用的真实流程；不触碰浏览器或用户记录。
function appHarness(seed={},hash='#study',speechOptions={}) {
  const elements=new Map(),events={},audio=[],utterances=[],timers=new Map();
  let clock=0,nextTimer=0,canceled=0;
  const classFlags=new Map(),styles=new Map(),viewportEvents={};
  const classes={add(name){classFlags.set(name,true);},remove(name){classFlags.set(name,false);},toggle(name,value){classFlags.set(name,!!value);}};
  function element(key){if(!elements.has(key))elements.set(key,{id:key,innerHTML:'',textContent:'',value:'',hidden:false,open:false,classList:classes,dataset:{},setAttribute(name,value){(this.attributes ||= {})[name]=value;},removeAttribute(name){delete (this.attributes||{})[name];},addEventListener(){},append(){},focus(){},blur(){},showModal(){this.open=true;},close(){this.open=false;},setCustomValidity(){},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},reportValidity(){}});return elements.get(key);}
  const document={hidden:false,documentElement:{style:{setProperty:(name,value)=>styles.set(name,value)}},body:{classList:classes},querySelector:selector=>element(selector),querySelectorAll:()=>[],getElementById:id=>element('#'+id),createElement:tag=>element('created:'+tag),addEventListener:(name,handler)=>{events[name]=handler;}};
  const location={hash};const history={pushState(_s,_t,url){location.hash=url;},replaceState(_s,_t,url){location.hash=url;}};
  const store=new Map([['klee-ielts-v1',JSON.stringify(seed)]]);
  const synthesis={paused:false,speaking:false,pending:false,cancel(){canceled++;this.speaking=false;this.pending=false;},getVoices(){return speechOptions.voices||[];},addEventListener(){},speak(u){audio.push(u.text);utterances.push(u);if(speechOptions.onSpeak){speechOptions.onSpeak(u,audio.length,this);return;}this.speaking=true;u.onstart?.();this.speaking=false;u.onend?.({elapsedTime:1});},resume(){this.paused=false;}};
  const window={scrollTo(){},addEventListener(){},speechSynthesis:synthesis,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}};
  window.innerHeight=speechOptions.viewport?.layoutHeight||700;
  if(speechOptions.viewport)window.visualViewport={...speechOptions.viewport,addEventListener:(name,handler)=>{viewportEvents[name]=handler;}};
  const timeout=(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,due:clock+delay});return id;};
  const ctx=vm.createContext({window,document,location,history,localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},SpeechSynthesisUtterance:window.SpeechSynthesisUtterance,setTimeout:timeout,clearTimeout:id=>timers.delete(id),setInterval:()=>0,console});
  for(const file of ['data.js','plan.js','loop.js','app.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),ctx);
  function advance(ms){const end=clock+ms;for(let count=0;count<100;count++){const due=[...timers.entries()].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!due)break;timers.delete(due[0]);clock=due[1].due;due[1].fn();}clock=end;}
  return {run:code=>vm.runInContext(code,ctx),click:dataset=>events.click({target:{closest:()=>({dataset})}}),element,audio,utterances,store,location,synthesis,advance,styles,classFlags,emitViewport:name=>viewportEvents[name]?.(),canceled:()=>canceled};
}
const oldDay=new Date();oldDay.setDate(oldDay.getDate()-1);
let harness=appHarness({progress:{1:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-1000}},saved:['buildings'],settings:{dailyGoal:2}},'#review');
assert.equal(harness.audio.length,0,'review recognition question must start silently');
for(let stage=1;stage<=3;stage++){
  assert.equal(harness.run('currentLoop().current.stage'),stage);
  assert.equal(harness.element('#study-card').innerHTML.includes('quiz-example'),stage===2,'only round 2 questions show the example');
  harness.run('answerQuestion(true,0)');
  assert.equal(harness.audio.length,stage,'revealing a review card must read word and example once');
  harness.run('continueLearning()');
}
assert.equal(harness.location.hash,'#spell-review','review must proceed to spelling after three rounds');
assert.equal(harness.run('dailyPlan().dueNow.length'),1,'three recall rounds alone must not clear the due review');
assert.ok(!harness.element('#study-card').innerHTML.includes('resemble'),'spelling question must contain no English answer');
assert.ok(harness.element('#study-card').innerHTML.includes('像；与……相似'));
assert.equal(harness.audio.length,3,'spelling question must be silent');
let spellingRefresh;
harness.run("submitSpellingForm({value:'assemble',setCustomValidity(){},reportValidity(){}})");
spellingRefresh=appHarness(JSON.parse(harness.store.get('klee-ielts-v1')),'#spell-review');
assert.equal(spellingRefresh.run('currentSpelling().current.correct'),false,'wrong spelling feedback survives refresh');
spellingRefresh.run('continueSpelling()');assert.equal(spellingRefresh.run('state.loops.review.items[0].lapses'),1,'spelling lapse evidence is stored with its review card');
spellingRefresh.run("submitSpellingForm({value:'resemble',setCustomValidity(){},reportValidity(){}})");spellingRefresh.run('continueSpelling()');
assert.equal(new Date(spellingRefresh.run('state.progress[1].due')).getDate(),new Date(Date.now()+86400000).getDate(),'wrong-then-right spelling still schedules tomorrow');
harness.run('continueSpelling()');
assert.equal(harness.run('dailyPlan().dueNow.length'),1,'wrong spelling must keep review pending');
harness.run("submitSpellingForm({value:'resemble',setCustomValidity(){},reportValidity(){}})");harness.run('continueSpelling()');
assert.equal(harness.run('dailyPlan().dueNow.length'),0);assert.equal(harness.run('state.loops.review.items[0].spelled'),true);
assert.equal(harness.run('dailyPlan().newToday'),0,'old-word spelling must not consume the new quota');
assert.equal(harness.run('state.saved[0]'),'buildings','existing bookmarks must survive');
harness=appHarness({settings:{dailyGoal:2}},'#new');
assert.equal(harness.audio.length,0,'first new question must be silent');
assert.ok(!harness.element('#study-card').innerHTML.includes(cards[0].example),'first round must hide the example');
assert.ok(!harness.element('#study-card').innerHTML.includes('data-speak'),'first round must not expose pronunciation clues');
let completedBefore=false;
for(let n=0;n<25;n++){
  if(!harness.run('currentLoop().current'))break;
  const stage=harness.run('currentLoop().current.stage');
  const before=harness.audio.length;
  const question=harness.element('#study-card').innerHTML;
  if(stage===1){assert.ok(!question.includes('quiz-example'));assert.ok(!question.includes('data-speak'));}
  if(stage===2)assert.ok(question.includes('quiz-example'));
  if(stage===3)assert.ok(!question.includes('quiz-example'));
  harness.run('answerQuestion(true,0)');
  assert.equal(harness.audio.length,before+1,'every reveal must read the full card, including first new words');
  if(n===2){harness.run('markMistake()');assert.equal(harness.run('currentLoop().current.correct'),false);}
  if(stage<3&&!completedBefore)assert.equal(harness.run('dailyPlan().newToday'),0,'first two rounds must not count as a completed word');
  const afterReveal=harness.audio.length;
  harness.run('continueLearning()');
  assert.equal(harness.audio.length,afterReveal,'all subsequent questions must be silent');
  if(harness.run('dailyPlan().newToday')>0)completedBefore=true;
}
assert.equal(harness.run('dailyPlan().newToday'),2);
assert.equal(harness.element('#spelling-entry').hidden,false,'finishing the day must unlock spelling on the homepage');
harness.run("navigate('spell-new')");
assert.ok(!harness.element('#study-card').innerHTML.includes('resemble'));
const currentId=harness.run('currentSpelling().current.id');
assert.ok(harness.run('currentSpelling().ids.length')===2);
const audioBefore=harness.audio.length;
harness.run('renderStudy()');assert.equal(harness.audio.length,audioBefore,'rerendering must not repeat automatic speech');
console.log('PASS: integrated new/review rounds, audio timing, mandatory review spelling, wrong spelling retry, Chinese-only prompts, daily spelling unlock, preserved bookmarks.');

let masterApp=appHarness({progress:{1:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-1000}},checkins:{[localDay()]:{dueIds:[1],reviewIds:[],newIds:[],checked:false}},settings:{dailyGoal:1}},'#review');
assert.ok(masterApp.element('#study-card').innerHTML.includes('data-master-card'),'recall question offers a mastery skip without revealing its full card');
masterApp.run('answerQuestion(true,0)');assert.ok(masterApp.element('#study-card').innerHTML.includes('data-master-card'),'full reveal includes mastery control');
masterApp.run('toggleMastered(1)');
assert.equal(masterApp.run('dailyPlan().dueNow.length'),0);assert.equal(masterApp.run('currentLoop().items.length'),0);
assert.deepEqual(Array.from(masterApp.run('state.checkins[localDay()].dueIds')),[],'retirement removes the current due ID');
assert.equal(masterApp.run('state.checkins[localDay()].checked'),false,'retirement of the only outstanding due word does not award a check-in');
assert.deepEqual(JSON.parse(masterApp.store.get('klee-ielts-v1')).mastered,[1]);
masterApp=appHarness({progress:{1:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-86400000}},mastered:[1]},'#review');
assert.equal(masterApp.run('dailyPlan().dueNow.length'),0,'retirement survives refresh and a much later due date');
masterApp=appHarness({progress:{1:{grade:'known',day:localDay(),firstLearnedDay:localDay(oldDay),due:Date.now()-1000}},checkins:{[localDay()]:{dueIds:[1],reviewIds:[1],newIds:[],checked:true}}},'#library');
masterApp.run('toggleMastered(1)');assert.equal(masterApp.run('state.checkins[localDay()].checked'),true,'mastering a completed review retains its earned check-in');
masterApp=appHarness({progress:{1:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-1000}},mastered:[1]},'#library');
masterApp.run('renderLibrary()');assert.equal(masterApp.element('#mastered-count').textContent,1);
masterApp.run("libraryFilter='mastered';renderLibrary()");assert.ok(masterApp.element('#word-list').innerHTML.includes('data-open-card="1"'),'mastered filter restores the card to browse');
masterApp.run('toggleMastered(1)');assert.equal(masterApp.run('state.mastered.length'),0);assert.equal(masterApp.run('dailyPlan().dueNow.length'),0,'unmarking a learned word schedules tomorrow');
assert.equal(masterApp.run('state.progress[1].firstLearnedDay'),localDay(oldDay),'unmarking preserves its original learning day');
masterApp=appHarness({mastered:[1]},'#library');masterApp.run('toggleMastered(1)');
assert.equal(masterApp.run('dailyPlan().newCards[0].id'),1,'unmarking an unseen word returns it to the new pool');
let partialMaster=appHarness({progress:{1:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-1000}},settings:{dailyGoal:1}},'#review');
for(let i=0;i<3;i++){partialMaster.run('answerQuestion(true,0)');partialMaster.run('continueLearning()');}
assert.equal(partialMaster.location.hash,'#spell-review');assert.ok(partialMaster.element('#study-card').innerHTML.includes('data-master-card'),'spelling question offers a mastery skip without revealing its answer');
partialMaster.run("submitSpellingForm({value:'assemble',setCustomValidity(){},reportValidity(){}})");assert.ok(partialMaster.element('#study-card').innerHTML.includes('data-master-card'),'spelling reveal provides mastery control');
partialMaster.run('toggleMastered(1)');assert.equal(partialMaster.run('currentSpelling().ids.length'),0);assert.equal(partialMaster.run('dailyPlan().dueNow.length'),0);
assert.ok(!partialMaster.element('#study-card').innerHTML.includes('先完成三轮'),'retiring the final review word exits to a neutral empty state');
console.log('PASS: permanent mastery across recall/spelling, current due-set reconciliation, restored library filter, undo semantics, and no mastery-only check-in.');

// 隔日继续未完成拼写时保留失误；下一批真正重学时清除上一批失误。
const carriedLoop=Loop.create('review',localDay(oldDay));
carriedLoop.items=[1,2].map(id=>({id,stage:3,done:true,spelled:id===1,introduced:true,readyAt:0,lapses:id===2?1:0}));
const carriedSpell=Loop.createSpelling('review',localDay(oldDay));
carriedSpell.ids=[1,2];carriedSpell.passed=[1];carriedSpell.current={id:2,serial:1,phase:'question',correct:false,forgotten:false,answer:''};
let carriedApp=appHarness({progress:{1:{...completion(undefined,'review'),due:Date.now()+86400000},2:{...completion(undefined,'review'),due:Date.now()-1000,reviewStage:4}},loops:{review:carriedLoop},spelling:{review:carriedSpell}},'#review');
assert.equal(carriedApp.run('currentSpelling().current.id'),2);
assert.equal(carriedApp.run('state.loops.review.items[0].lapses'),1,'dropping yesterday’s passed word must not clear the unfinished word’s lapse');
carriedApp.run("submitSpellingForm({value:'recognize'});continueSpelling()");
assert.equal(carriedApp.run('state.progress[2].reviewStage'),0);
carriedApp.run(`state.loops.review.day=${JSON.stringify(localDay(oldDay))};state.progress[2].due=Date.now()-1;navigate('review')`);
assert.equal(carriedApp.run('currentLoop().items[0].lapses'),0,'a fresh review batch starts with no old errors');
for(let round=0;round<3;round++)carriedApp.run('answerQuestion(true,0);continueLearning()');
carriedApp.run("submitSpellingForm({value:'recognize'});continueSpelling()");
assert.equal(carriedApp.run('state.progress[2].reviewStage'),1,'the next clean full review advances to three days');

let forgottenReview=appHarness({progress:{1:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-1000,reviewStage:4}}},'#review');
for(let round=0;round<3;round++)forgottenReview.run('answerQuestion(true,0);continueLearning()');
forgottenReview.run('forgetCurrentSpelling()');
forgottenReview=appHarness(JSON.parse(forgottenReview.store.get('klee-ielts-v1')),'#spell-review');
forgottenReview.run("continueSpelling();submitSpellingForm({value:'resemble'});continueSpelling()");
assert.equal(forgottenReview.run('state.progress[1].reviewStage'),0,'forgotten spelling after refresh resets a long interval');
let cleanReview=appHarness({progress:{1:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-1000,reviewStage:4}}},'#review');
for(let round=0;round<3;round++)cleanReview.run('answerQuestion(true,0);continueLearning()');
cleanReview=appHarness(JSON.parse(cleanReview.store.get('klee-ielts-v1')),'#spell-review');
assert.equal(cleanReview.run('state.progress[1].reviewStage'),4,'refresh preserves the earned interval stage');
cleanReview.run("submitSpellingForm({value:'resemble'});continueSpelling()");
assert.equal(cleanReview.run('state.progress[1].reviewStage'),5);
assert.equal(cleanReview.run('state.progress[1].due'),completion({reviewStage:4},'review').due);
assert.equal(buildPlan(cards,retiredDue,10,new Date(2040,0,1),[1]).dueNow.length,0,'mastered words remain excluded years later');
console.log('PASS: carried-over spelling lapses, clean future batches, forgotten spelling after refresh, persisted long intervals, and permanent retirement.');

function speechHarness(options={}) {const h=appHarness({},'#new',options);h.run('answerQuestion(true,0)');return h;}
// iPhone Safari 语音回归：空闲取消、无回调、当前请求取消及首次手势失败。
harness=appHarness();harness.run("speak('hello',null)");harness.run("speak('again',null)");
assert.equal(harness.canceled(),0,'idle speech must not cancel the Safari queue');
assert.equal(harness.element('#voice-status').textContent,'朗读结束。');
const voice={name:'Local English',lang:'en-GB',voiceURI:'test',localService:true};
harness=speechHarness({voices:[voice],onSpeak(u,n,synth){if(n===1)return;synth.speaking=true;u.onstart();synth.speaking=false;u.onend({elapsedTime:1});}});
assert.equal(harness.run('audioStamp'),'','enqueuing is not proof playback started');
assert.equal(harness.element('#auto-audio').hidden,false,'manual play must be visible immediately while waiting');
harness.advance(6000);harness.advance(120);
assert.equal(harness.audio.length,2,'a silent engine must be recovered once');
assert.equal(harness.utterances[0].voice.voiceURI,'test');assert.equal(harness.utterances[1].voice,undefined,'recovery must let iOS choose its default English voice');
assert.ok(harness.run('audioStamp').length>0);assert.equal(harness.element('#auto-audio').hidden,true);
assert.equal(harness.element('#voice-status').textContent,'朗读结束。');
harness=speechHarness({onSpeak(){}});harness.advance(12500);
assert.equal(harness.audio.length,2,'silent engines must not enter an infinite automatic retry loop');
assert.equal(harness.element('#auto-audio').hidden,false);
assert.equal(harness.run('audioStamp'),'','failed autoplay must remain replayable');
assert.ok(!harness.element('#voice-status').textContent.includes('正在'));
harness.run('announceCurrent()');assert.equal(harness.audio.length,3,'a failed item must not be skipped as already read');
harness=speechHarness({onSpeak(u,n){if(n===1)u.onerror({error:'canceled'});else{u.onstart();u.onend({elapsedTime:1});}}});
harness.advance(120);assert.equal(harness.audio.length,2,'canceled current requests must recover rather than stay preparing');
assert.equal(harness.element('#voice-status').textContent,'朗读结束。');
harness=speechHarness({onSpeak(u,n){if(n===1)u.onerror({error:'not-allowed'});else{u.onstart();u.onend({elapsedTime:1});}}});
assert.equal(harness.element('#auto-audio').hidden,false);assert.equal(harness.run('audioStamp'),'');
harness.run('speak(autoAudioText,null,false,true,autoAudioStamp)');
assert.equal(harness.audio.length,2);assert.equal(harness.element('#voice-status').textContent,'朗读结束。');
console.log('PASS: Safari idle-cancel avoidance, silent-start recovery, current-cancel recovery, bounded retry, immediate retry control, played-only-after-start, user-gesture retry.');

let staleError;
harness=speechHarness({onSpeak(u,n,synth){if(n===1){staleError=u.onerror;synth.speaking=true;u.onstart();return;}synth.speaking=true;u.onstart();synth.speaking=false;u.onend({elapsedTime:1});}});
harness.run("speak('replacement sentence',null)");
assert.equal(harness.audio.length,1,'replacement must wait for Safari cancellation to settle');
harness.advance(120);assert.equal(harness.audio.length,2);assert.equal(harness.canceled(),1);
staleError({error:'canceled'});assert.equal(harness.audio.length,2,'a stale cancel callback must not restart the new sentence');
assert.equal(harness.element('#voice-status').textContent,'朗读结束。');
console.log('PASS: delayed replacement and stale Safari cancel callbacks.');

// 引擎已在播放但没有 start 回调时，启动检测不能把例句拦腰取消。
harness=speechHarness({onSpeak(u,n,synth){synth.speaking=true;}});
harness.advance(2500);
assert.equal(harness.canceled(),0,'missing start events must not cancel a sentence already being spoken');
assert.equal(harness.audio.length,1,'playing speech must never be restarted by the startup watchdog');
assert.ok(harness.element('#voice-status').textContent.startsWith('正在朗读'));
harness.synthesis.speaking=false;harness.utterances[0].onend({elapsedTime:5});
assert.equal(harness.element('#voice-status').textContent,'朗读结束。');
console.log('PASS: speech without a start event completes without a watchdog cancellation.');


harness=speechHarness({onSpeak(u,n,synth){synth.speaking=true;u.onstart();}});
harness.advance(12000);
assert.equal(harness.canceled(),0,'long sentences must have no playback cutoff');
assert.equal(harness.audio.length,1);
harness.synthesis.speaking=false;harness.utterances[0].onerror({error:'interrupted'});
harness.advance(15000);
assert.equal(harness.audio.length,1,'an interrupted sentence must not be replayed automatically from the beginning');
assert.ok(harness.element('#voice-status').textContent.includes('中断'));
assert.equal(harness.element('#auto-audio').hidden,false);

harness=speechHarness({onSpeak(){}});
harness.utterances[0].onboundary({charIndex:4});harness.advance(10000);
assert.equal(harness.canceled(),0,'word boundaries must count as positive playback evidence');
assert.ok(harness.element('#voice-status').textContent.startsWith('正在朗读'));
harness.utterances[0].onend({elapsedTime:8});
assert.equal(harness.element('#voice-status').textContent,'朗读结束。');
console.log('PASS: long sentences, boundary events, and truthful interruption status without replay loops.');

harness=speechHarness({onSpeak(){}});
harness.advance(3000);
assert.equal(harness.canceled(),0,'a slow cold start must not be canceled after 2.2 seconds');
harness.synthesis.speaking=true;harness.advance(5000);
assert.equal(harness.canceled(),0,'engine playback discovered later must clear the startup watchdog');
assert.equal(harness.audio.length,1);
assert.ok(harness.element('#voice-status').textContent.startsWith('正在朗读'));
harness.synthesis.speaking=false;harness.utterances[0].onend({elapsedTime:6});
assert.equal(harness.element('#voice-status').textContent,'朗读结束。');
console.log('PASS: delayed engine start with no start event.');

harness=speechHarness({onSpeak(){}});
harness.utterances[0].onend({elapsedTime:6,charIndex:45});
harness.advance(15000);
assert.equal(harness.audio.length,1,'a completed utterance with a missing start event must not restart');
assert.equal(harness.canceled(),0);
assert.equal(harness.element('#voice-status').textContent,'朗读结束。');
console.log('PASS: a completion event with playback evidence does not cause a false retry.');


// 逐词弹窗展示独立词条的多词性，而不是仅显示例句中的一种用法。
for(const [word,entry] of Object.entries(glossary)) {
  assert.ok(entry.senses?.length,word+' must have part-of-speech senses');
  assert.equal(new Set(entry.senses.map(s=>s.pos)).size,entry.senses.length,word+' duplicate part of speech');
  for(const sense of entry.senses)assert.ok(sense.pos&&sense.meaning,word+' empty sense');
  if(entry.senseWord)assert.ok(glossary[entry.senseWord],word+' missing sense headword');
}
assert.deepEqual(Array.from(glossary.light.senses,s=>s.pos),['n.','v.','adj.','adv.']);
assert.deepEqual(Array.from(glossary.water.senses,s=>s.pos),['n.','v.']);
assert.equal(glossary.prompt.senses.length,4);assert.equal(glossary.that.senses.length,4);
assert.equal(glossary.buildings.senseWord,'building');
assert.ok(glossary.coined.senses.some(s=>s.pos==='n.'),'coined popup must include the noun use of its headword coin');
harness=appHarness({},'#new');
for(const word of Object.keys(glossary))for(const sense of glossary[word].senses)assert.ok(harness.run('POS_NAMES['+JSON.stringify(sense.pos)+']'),'unknown label '+sense.pos);
harness.run("showWord('water')");
let detail=harness.element('#word-detail').innerHTML;
assert.ok(detail.includes('名词')&&detail.includes('动词')&&detail.includes('浇水'));
assert.ok(detail.includes('data-speak="water"'),'pronunciation control must be preserved');
harness.run("showWord('coined')");detail=harness.element('#word-detail').innerHTML;
assert.ok(detail.includes('原形：coin')&&detail.includes('原形 coin 的词性与释义')&&detail.includes('硬币'));
harness.run("showWord('that')");detail=harness.element('#word-detail').innerHTML;
for(const pos of ['代词','限定词','连词','副词'])assert.ok(detail.includes(pos));
assert.ok(!detail.includes('本页例句所用释义'),'definitions must not claim to be limited to the example');
console.log('PASS: '+Object.keys(glossary).length+' glossary entries with labeled senses, polysemy, inflected headwords, and preserved speech controls.');


// 新学与复习：错项留在题面，只读易混词；选对后才展开完整卡片。
for(const kind of ['new','review']) {
 const seed={settings:{dailyGoal:2}};
 if(kind==='review')seed.progress={1:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-1000},2:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-1000}};
 let h=appHarness(seed,'#'+kind);
 const originalOrder=Array.from(h.run('currentLoop().current.order'));
 for(const choice of [1,2,1]) {
  h.run('answerQuestion(false,'+choice+')');
  assert.equal(h.run('currentLoop().current.phase'),'question');
  assert.equal(h.audio.at(-1),cards[0].distractors[choice-1].word,'wrong feedback must read only its corresponding English word');
  const question=h.element('#study-card').innerHTML;
  assert.ok(question.includes('wrong-choice')&&question.includes(cards[0].distractors[choice-1].word));
  assert.ok(!question.includes(cards[0].example)&&!question.includes('full-card'),'wrong feedback must not leak the example or full card');
  assert.equal(h.element('#learning-actions').innerHTML,'');
 }
 assert.equal(h.run('currentLoop().current.wrongChoices.length'),2,'repeated taps must not duplicate mistakes');
 assert.equal(h.run('currentLoop().items[0].lapses'),0,'the round must not advance while still choosing');
 h=appHarness(JSON.parse(h.store.get('klee-ielts-v1')),'#'+kind);
 assert.equal(h.audio.length,0,'refresh must restore wrong feedback silently');
 assert.deepEqual(Array.from(h.run('currentLoop().current.order')),originalOrder);
 assert.equal((h.element('#study-card').innerHTML.match(/class="wrong-choice"/g)||[]).length,2);
 h.run('answerQuestion(true,0)');
 assert.equal(h.run('currentLoop().current.phase'),'reveal');
 assert.ok(h.element('#study-card').innerHTML.includes('full-card'));
 assert.equal(h.audio.at(-1),cards[0].word+'. '+cards[0].example);
 assert.equal(h.run('currentLoop().current.correct'),false);
 assert.equal(h.run('dailyPlan().newToday'),0);
 h.run('continueLearning()');
 assert.equal(h.run('currentLoop().items[0].stage'),1);assert.equal(h.run('currentLoop().items[0].lapses'),1);
 assert.equal(h.run('currentLoop().current.id'),2,'the missed word must still be interleaved with another word');
}
harness=appHarness({},'#new',{onSpeak(u){u.onerror({error:'not-allowed'});}});
harness.run('answerQuestion(false,1)');
assert.ok(harness.element('#auto-audio').textContent.includes(cards[0].distractors[0].word));
assert.ok(!harness.element('#auto-audio').textContent.includes('例句'),'wrong-word speech retries must not offer the hidden example');
assert.equal(harness.run('autoAudioText'),cards[0].distractors[0].word);
console.log('PASS: wrong choices stay red in place, speak only the distractor, restore after refresh, and reveal only on the correct choice while retaining the review lapse.');

const {recordCheckin,restoreCheckins}=require('./dist/plan.js');
let journal={};
recordCheckin(journal,day,{});assert.equal(journal[day].checked,false,'no due reviews must not automatically check in');
recordCheckin(journal,day,{newIds:[1,2,3,4]});assert.equal(journal[day].checked,false);
recordCheckin(journal,day,{newIds:[4,5]});assert.equal(journal[day].checked,true);assert.equal(journal[day].newIds.length,5);
const nextLocalDay=localDay(nextDay);recordCheckin(journal,nextLocalDay,{});assert.equal(journal[nextLocalDay].checked,false,'each local day is independent');
let reviewJournal={};recordCheckin(reviewJournal,day,{dueIds:[1,2],reviewIds:[1]});assert.equal(reviewJournal[day].checked,false,'later-today reviews must also be completed');
recordCheckin(reviewJournal,day,{reviewIds:[2]});assert.equal(reviewJournal[day].checked,true);
assert.deepEqual(restoreCheckins(JSON.parse(JSON.stringify(journal)),cards.map(c=>c.id)),journal);
assert.deepEqual(restoreCheckins({'2026-2-30':{},bad:{},'2026-10-19':{newIds:[1,1,999]}},[1]),{'2026-10-19':{newIds:[1],reviewIds:[],dueIds:[],checked:false}});
let h=appHarness({settings:{dailyGoal:5}},'#new');
for(let i=0;i<15;i++){
 h.run('answerQuestion(true,0)');
 if(i===14)assert.equal(h.run('state.checkins[localDay()].checked'),false,'the last reveal alone must not finish a word');
 h.run('continueLearning()');
}
assert.equal(h.run('state.checkins[localDay()].newIds.length'),5);assert.equal(h.run('state.checkins[localDay()].checked'),true);
h=appHarness(JSON.parse(h.store.get('klee-ielts-v1')));assert.ok(h.element('#checkin-status').textContent.includes('已自动打卡'));
h.run('renderCalendar()');assert.ok(h.element('#calendar-grid').innerHTML.includes('checked'));assert.ok(h.element('#calendar-detail').innerHTML.includes('新词完成 5 个'));
const reviewSeed={progress:{1:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:Date.now()-1000}}};
h=appHarness(reviewSeed,'#review');
for(let i=0;i<3;i++){h.run('answerQuestion(true,0)');h.run('continueLearning()');}
assert.equal(h.run('state.checkins[localDay()].checked'),false,'three review rounds without spelling are insufficient');
h.run("submitSpellingForm({value:'assemble',setCustomValidity(){},reportValidity(){}})");h.run('continueSpelling()');
assert.equal(h.run('state.checkins[localDay()].checked'),false,'wrong spelling is insufficient');
h.run("submitSpellingForm({value:'resemble',setCustomValidity(){},reportValidity(){}})");h.run('continueSpelling()');
assert.equal(h.run('state.checkins[localDay()].checked'),true);
assert.equal(h.run('state.checkins[localDay()].reviewIds.length'),1);
h=appHarness(JSON.parse(h.store.get('klee-ielts-v1')));assert.equal(h.run('state.checkins[localDay()].checked'),true,'completed reviews stay checked after rescheduling and refresh');
console.log('PASS: automatic calendar check-ins, five fully completed new words, full review plus spelling, empty review days, duplicates, dates, calendar records, and refresh persistence.');


// 忘记拼写只展开答案并安排重试，不能变成完成记录。
spelling=Loop.createSpelling('review',localDay());Loop.syncSpelling(spelling,[1,2],localDay());Loop.nextSpelling(spelling);
assert.ok(Loop.forgetSpelling(spelling));assert.equal(spelling.current.forgotten,true);assert.equal(spelling.current.correct,false);
spelling=Loop.restoreSpelling(JSON.parse(JSON.stringify(spelling)),[1,2],'review');assert.equal(spelling.current.forgotten,true);
assert.equal(Loop.advanceSpelling(spelling).completedId,null);assert.equal(Loop.nextSpelling(spelling).id,2);
for(const kind of ['new','review']) {
 const seed=kind==='new'?{settings:{dailyGoal:1}}:reviewSeed;
 let a=appHarness(seed,kind==='new'?'#new':'#review');
 for(let i=0;i<3;i++){a.run('answerQuestion(true,0)');a.run('continueLearning()');}
 if(kind==='new')a.run("navigate('spell-new')");
 assert.ok(a.element('#study-card').innerHTML.includes('data-forget-spelling'));
 assert.ok(!a.element('#study-card').innerHTML.includes('full-card'));
 const played=a.audio.length;a.run('forgetCurrentSpelling()');
 assert.equal(a.audio.length,played+1);assert.equal(a.run('currentSpelling().current.correct'),false);
 assert.ok(a.element('#study-card').innerHTML.includes('没关系，先看一遍'));
 a=appHarness(JSON.parse(a.store.get('klee-ielts-v1')),'#spell-'+kind);
 assert.ok(a.element('#study-card').innerHTML.includes('没关系，先看一遍'),'forgotten state survives refresh');
 a.run('continueSpelling()');assert.equal(a.run('currentSpelling().passed.length'),0);
 assert.equal(a.run('currentSpelling().current.id'),1);
 if(kind==='review')assert.equal(a.run('dailyPlan().dueToday.length'),1);
}
// 三类庆祝都只在真实完成时发生，并且跨刷新去重。
let a=appHarness({settings:{dailyGoal:1}},'#new');
for(let i=0;i<3;i++){a.run('answerQuestion(true,0)');if(i===2)assert.equal(a.run('state.celebrations.length'),0);a.run('continueLearning()');}
assert.equal(a.run('state.celebrations[0]'),localDay()+':new');assert.equal(a.element('#celebration').hidden,false);
assert.ok(a.element('#celebration-message').textContent.includes('首页已解锁拼写'));
a.advance(3400);assert.equal(a.element('#celebration').hidden,true);
a.run("navigate('spell-new');forgetCurrentSpelling();continueSpelling()");
assert.equal(a.run('state.celebrations.length'),1,'forgetting does not finish spelling');
a.run("submitSpellingForm({value:'resemble',setCustomValidity(){},reportValidity(){}})");
assert.equal(a.run('state.celebrations.length'),1,'the last reveal is not yet a completion');
a.run('continueSpelling()');assert.equal(a.run('state.celebrations[1]'),localDay()+':spelling');
assert.ok(a.element('#celebration-sparkles').innerHTML.includes('class='));
a=appHarness(JSON.parse(a.store.get('klee-ielts-v1')),'#spell-new');assert.equal(a.element('#celebration').hidden,true);
assert.equal(a.run("celebrate('spelling')"),false,'refresh and repeat practice must not repeat today’s celebration');
a=appHarness(reviewSeed,'#review');
for(let i=0;i<3;i++){a.run('answerQuestion(true,0)');a.run('continueLearning()');}
assert.equal(a.run('state.celebrations.length'),0,'review needs spelling before celebration');
a.run("submitSpellingForm({value:'resemble',setCustomValidity(){},reportValidity(){}})");a.run('continueSpelling()');
assert.equal(a.run('state.celebrations[0]'),localDay()+':review');
assert.ok(a.element('#celebration-title').textContent.includes('今日复习'));
// 假设 Safari 只缩小可见视口并向下平移，布局必须同时追踪两个值。
a=appHarness({},'#study',{viewport:{height:300,offsetTop:180,layoutHeight:700}});
a.run("document.activeElement={id:'spell-answer'};fitSessionViewport()");
assert.equal(a.styles.get('--session-height'),'300px');assert.equal(a.styles.get('--session-top'),'180px');
assert.equal(a.classFlags.get('keyboard-open'),true);assert.equal(a.classFlags.get('compact-session'),true);
a.run('window.visualViewport.offsetTop=225');a.emitViewport('scroll');assert.equal(a.styles.get('--session-top'),'225px');
a.run('document.activeElement=null;window.visualViewport.height=700;window.visualViewport.offsetTop=0');a.emitViewport('resize');
assert.equal(a.styles.get('--session-top'),'0px');assert.equal(a.styles.get('--session-height'),'700px');assert.equal(a.classFlags.get('keyboard-open'),false);
console.log('PASS: forgotten spelling retries without credit, persisted feedback, all three completion celebrations, replay suppression, and Safari viewport resize plus pan tracking.');

const lateToday=new Date();lateToday.setHours(23,59,59,999);
a=appHarness({progress:{...reviewSeed.progress,2:{grade:'known',day:localDay(oldDay),firstLearnedDay:localDay(oldDay),due:lateToday.getTime()}}},'#review');
for(let i=0;i<3;i++){a.run('answerQuestion(true,0)');a.run('continueLearning()');}
a.run("submitSpellingForm({value:'resemble',setCustomValidity(){},reportValidity(){}})");a.run('continueSpelling()');
assert.equal(a.run('state.celebrations.length'),0,'a finished batch is not the full day when later reviews remain');
a.run("state.progress[2].due=Date.now()-1;navigate('review')");
for(let i=0;i<3;i++){a.run('answerQuestion(true,0)');a.run('continueLearning()');}
a.run("submitSpellingForm({value:'recognize',setCustomValidity(){},reportValidity(){}})");a.run('continueSpelling()');
assert.equal(a.run('state.celebrations[0]'),localDay()+':review');
const partial={settings:{dailyGoal:2},progress:{1:{grade:'known',day:localDay(),firstLearnedDay:localDay(),due:Date.now()+86400000}}};
a=appHarness(partial,'#spell-new');a.run("submitSpellingForm({value:'resemble',setCustomValidity(){},reportValidity(){}})");a.run('continueSpelling()');
assert.equal(a.run('state.celebrations.length'),0,'partial new-word spelling must not celebrate before the daily learning goal');
console.log('PASS: daily completion celebrations wait for later due reviews and the complete daily new-word set.');


const oldLoop=Loop.create('new',localDay(oldDay));Loop.sync(oldLoop,[1,2,3,4,5],localDay(oldDay));
for(let i=0;i<15;i++){Loop.next(oldLoop);Loop.answer(oldLoop,true,0);Loop.advance(oldLoop);}
const priorProgress=Object.fromEntries([1,2,3,4,5].map(id=>[id,completion(undefined,'new',oldDay)]));
a=appHarness({progress:priorProgress,loops:{new:oldLoop},settings:{dailyGoal:5}},'#new');
assert.equal(a.run('state.checkins['+JSON.stringify(localDay(oldDay))+'].checked'),true,'opening a new-day deep link must preserve yesterday’s proven completion before loop rollover');
assert.equal(a.run('state.checkins['+JSON.stringify(localDay(oldDay))+'].newIds.length'),5);
console.log('PASS: calendar migration preserves verified previous-day completions before route rollover.');

// 凌晨四点边界及旧版九点安排的无损迁移。
const {migrateReviewTime}=require('./dist/plan.js');
const fourDue=new Date(2026,9,20,4,0,0,0);
assert.equal(buildPlan(cards,{1:first},10,new Date(fourDue.getTime()-1)).dueNow.length,0);
assert.equal(buildPlan(cards,{1:first},10,fourDue).dueNow.length,1);
const oldSchedule={1:{...first,due:new Date(2026,9,20,9,0,0,0).getTime()},2:{...reviewed,due:new Date(2026,9,23,9,0,0,0).getTime()},3:{...first,due:new Date(2026,9,20,9,10,0,0).getTime()}};
const originalSchedule=JSON.parse(JSON.stringify(oldSchedule));
assert.equal(migrateReviewTime(oldSchedule),true);
for(const id of [1,2]){assert.equal(new Date(oldSchedule[id].due).getHours(),4);assert.equal(localDay(new Date(oldSchedule[id].due)),localDay(new Date(originalSchedule[id].due)));assert.deepEqual({...oldSchedule[id],due:0},{...originalSchedule[id],due:0});}
assert.deepEqual(oldSchedule[3],originalSchedule[3]);
assert.equal(migrateReviewTime(oldSchedule),false,'refresh must not move an already migrated schedule again');
const rollover=completion(undefined,'new',new Date(2026,11,31,22));
assert.equal(localDay(new Date(rollover.due)),'2027-1-1');assert.equal(new Date(rollover.due).getHours(),4);
const migrationApp=appHarness({progress:originalSchedule,saved:['buildings'],settings:{dailyGoal:5}});
assert.equal(migrationApp.run('state.progress[1].due'),fourDue.getTime());
assert.equal(JSON.parse(migrationApp.store.get('klee-ielts-v1')).progress[1].due,fourDue.getTime());
assert.equal(migrationApp.run('state.saved[0]'),'buildings');
console.log('PASS: reviews unlock at 04:00 local time, boundary and year rollover, existing 09:00 schedules migrate once on load and persist without changing learning records.');

// 自带字母键盘：无系统输入法、可编辑草稿、立即显示正确计数且翻卡不重复。
for(const kind of ['new','review']) {
 const seed=kind==='new'?{settings:{dailyGoal:1},progress:{1:completion(undefined,'new')}}:reviewSeed;
 let k=appHarness(seed,kind==='new'?'#spell-new':'#review');
 if(kind==='review')for(let i=0;i<3;i++)k.run('answerQuestion(true,0);continueLearning()');
 const question=k.element('#study-card').innerHTML;
 assert.ok(question.includes('readonly inputmode="none"'));
 assert.ok(question.includes('v. 像；与……相似'));
 assert.ok(!question.includes('value="resemble"'));
 for(const letter of 'abcdefghijklmnopqrstuvwxyz')assert.ok(question.includes(`data-spell-key="${letter}"`));
 for(const key of ['space','backspace',"'",'-'])assert.ok(k.run('spellingKeyboardHtml()').includes(key==="'"?'&#39;':`data-spell-key="${key}"`));
 assert.ok(!question.includes('data-spell-key="clear"'));
 assert.ok(!/id="spell-keyboard"[^>]*\bhidden/.test(question));
 assert.ok(!question.includes('data-spell-key="hide"'));
 assert.equal((k.run("spellingSlotsHtml({word:'resemble'},'')").match(/class="spell-slot[ "]/g)||[]).length,8);
 k.run("pressSpellingKey('r');pressSpellingKey('e');pressSpellingKey('x');pressSpellingKey('backspace')");
 assert.equal(k.element('#spell-answer').value,'re');
 k.run(`pressSpellingKey('space');pressSpellingKey('-');pressSpellingKey("'")`);
 assert.equal(k.element('#spell-answer').value,"re -'");
 k.run("$('#spell-answer').setSelectionRange(0,2);pressSpellingKey('a')");assert.equal(k.element('#spell-answer').value,"a -'");
 k.run("$('#spell-answer').setSelectionRange(0,5);pressSpellingKey('backspace');pressSpellingKey('!')");assert.equal(k.element('#spell-answer').value,'');
 k.run("submitSpellingForm($('#spell-answer'))");assert.equal(k.run('currentSpelling().current.phase'),'question');
 assert.ok(k.element('#toast').textContent.includes('请先输入'));
 for(const letter of 'resemble')k.run(`pressSpellingKey('${letter}')`);
 assert.equal(k.run('currentSpelling().current.answer'),'resemble');
 const backup=JSON.parse(k.store.get('klee-ielts-v1'));
 k=appHarness(backup,'#spell-'+kind);assert.ok(k.element('#study-card').innerHTML.includes('value="resemble"'));
 k.run("$('#spell-answer').value='resemble';submitSpellingForm($('#spell-answer'))");
 const revealAudio=k.audio.length;k.run('announceCurrent();announceCurrent()');
 assert.equal(k.audio.length,revealAudio,'an already spoken spelling reveal must not autoplay twice');
 assert.equal(k.element('#session-progress-text').textContent,'已过 1 / 1');
 assert.equal(k.element('#session-progress').value,100);
 assert.equal(k.run('currentSpelling().passed.length'),0,'reveal counts immediately while confirmation remains pending');
 k=appHarness(JSON.parse(k.store.get('klee-ielts-v1')),'#spell-'+kind);
 assert.equal(k.element('#session-progress-text').textContent,'已过 1 / 1','refresh keeps immediate correct count');
 k.run('continueSpelling()');assert.equal(k.element('#session-progress-text').textContent,'已过 1 / 1');
 assert.equal(k.run('currentSpelling().passed.length'),1);
 if(kind==='new'){
  const progressBefore=k.run('JSON.stringify(state.progress)'),checkinsBefore=k.run('JSON.stringify(state.checkins)'),audioBefore=k.audio.length;
  k.click({repeatSpelling:'new'});
  assert.equal(k.location.hash,'#spell-new');assert.equal(k.run('currentSpelling().current.id'),1);
  assert.equal(k.run('currentSpelling().current.phase'),'question');assert.equal(k.run('currentSpelling().passed.length'),0);
  assert.equal(k.audio.length,audioBefore,'repeat practice begins with a silent spelling prompt');
  assert.equal(k.run('JSON.stringify(state.progress)'),progressBefore);assert.equal(k.run('JSON.stringify(state.checkins)'),checkinsBefore);
 }
}
console.log('PASS: spelling POS, readonly native-keyboard prevention, 26-letter custom keyboard, punctuation/space/editing, empty-answer handling, persisted drafts, and immediate correct counts across refresh and next-card confirmation for new/review spelling.');

const slotApp=appHarness();
const phraseSlots=slotApp.run("spellingSlotsHtml({word:'rely on'},'rely ')");
assert.equal((phraseSlots.match(/class="spell-slot[ "]/g)||[]).length,7);
assert.equal((phraseSlots.match(/spell-gap/g)||[]).length,1);
assert.equal((phraseSlots.match(/class="spell-slot(?! spell-gap)[ "]/g)||[]).length,6);
assert.ok(slotApp.run("spellingSlotsHtml({word:'coin'},'coined')").includes('多输入了 2 个字符'));
assert.ok(!slotApp.run("spellingSlotsHtml({word:'coin'},'')").includes('coin'),'blank slots must not leak the answer');
console.log('PASS: spelling keyboard is visible without a tap, has no collapse key, and slots match letter counts and phrase gaps without revealing the answer.');

// 整本覆盖、原有卡片身份和学习进度兼容。
const baseBook=JSON.parse(fs.readFileSync('source/book-base.json','utf8'));
const oldBook=JSON.parse(fs.readFileSync('source/legacy-data.json','utf8'));
assert.equal(context.window.IELTS_DATA.book.totalCards,526);
assert.equal(cards.filter(c=>c.sourceKind==='main').length,376);
for(const row of baseBook)assert.equal(cards.find(c=>c.id===row.id)?.word,row.word);
for(const original of oldBook.cards){const c=cards.find(c=>c.id===original.id);for(const key of Object.keys(original))assert.deepEqual(JSON.parse(JSON.stringify(c[key])),original[key],`preserve approved ${original.word}.${key}`);}
for(const c of cards){
 assert.ok(c.example.toLowerCase().includes(c.word.toLowerCase()),c.word+' absent from example');
 assert.ok(c.spellings.includes(c.word),c.word+' missing accepted spelling');
 for(const d of c.distractors)assert.notEqual(d.word.toLowerCase(),c.word.toLowerCase());
 const shown=[c.meaning,...c.distractors.map(d=>d.meaning)].map(m=>m.replace(/^(?:v\.|n\.|adj\.|pron\.|conj\.|短语)\s*/,''));
 assert.equal(new Set(shown).size,4,c.word+' has duplicate visible options');
}
let bookApp=appHarness({progress:{1:completion(undefined,'new')},settings:{dailyGoal:2},saved:['buildings']},'#new');
assert.equal(bookApp.element('#book-progress-note').textContent,'1 / 526');
for(let round=1;round<=3;round++){bookApp.run('answerQuestion(true,0)');if(round<3)bookApp.run('continueLearning()');}
assert.equal(bookApp.element('#book-progress-note').textContent,'1 / 526','unconfirmed third round must not count in total book progress');
bookApp.run('continueLearning()');assert.equal(bookApp.element('#book-progress-note').textContent,'2 / 526');
assert.equal(bookApp.element('#book-progress').attributes['aria-valuenow'],'2');
assert.equal(bookApp.element('#book-progress').attributes['aria-valuemax'],'526');
assert.ok(Math.abs(parseFloat(bookApp.element('#book-ring-value').attributes['stroke-dasharray'])-200/526)<0.00001);
bookApp=appHarness(JSON.parse(bookApp.store.get('klee-ielts-v1')));assert.equal(bookApp.element('#book-progress-note').textContent,'2 / 526');assert.equal(bookApp.run('state.saved[0]'),'buildings');
const hyphenSlots=bookApp.run("spellingSlotsHtml({word:'eco-friendly'},'')");
assert.equal((hyphenSlots.match(/spell-separator/g)||[]).length,1);
assert.equal((hyphenSlots.match(/class="spell-slot(?! spell-separator)[ "]/g)||[]).length,11);
console.log('PASS: complete audited 526-card book, all original 20 cards unchanged, full example/choice coverage, hyphenated spelling, and persistent completion-only book ring progress.');

// 复现旧队列残留：最后一词正确后，旧的重复条目不能让已通过的词再出现。
let staleSpell=Loop.createSpelling('review',day);Loop.syncSpelling(staleSpell,[1,2],day);
staleSpell.passed=[1];staleSpell.queue=[1,2,2];staleSpell.current={id:2,serial:1,phase:'reveal',correct:true,forgotten:false,answer:'recognize'};
assert.equal(Loop.advanceSpelling(staleSpell).completedId,2);assert.equal(Loop.nextSpelling(staleSpell),null);
assert.deepEqual(staleSpell.passed,[1,2]);assert.deepEqual(staleSpell.queue,[]);
staleSpell.current={id:2,serial:2,phase:'question',correct:false,forgotten:false,answer:''};staleSpell.queue=[2,1];
assert.equal(Loop.nextSpelling(staleSpell),null,'already passed current questions must also be discarded');

// 上一次复习的 passed 不能冒充本轮拼写通过。
const previousSpell=Loop.createSpelling('review',localDay(oldDay));previousSpell.ids=[1];previousSpell.passed=[1];
let finishApp=appHarness({...reviewSeed,spelling:{review:previousSpell}},'#review');
for(let i=0;i<3;i++)finishApp.run('answerQuestion(true,0);continueLearning()');
assert.equal(finishApp.run('currentSpelling().current.id'),1);
assert.equal(finishApp.run('currentSpelling().passed.length'),0,'a newly due review needs a new spelling pass');
finishApp.run("currentSpelling().queue=[1,1];submitSpellingForm({value:'resemble'})");
assert.ok(finishApp.element('#study-card').innerHTML.includes('全部拼对啦'));
assert.ok(finishApp.element('#learning-actions').innerHTML.includes('完成复习'));
finishApp.run('continueSpelling()');
assert.equal(finishApp.run('currentSpelling().current'),null);
assert.equal(finishApp.run('currentSpelling().queue.length'),0);
assert.ok(finishApp.element('#study-card').innerHTML.includes('今日复习完成啦'));
assert.equal(finishApp.run('dailyPlan().dueNow.length'),0);
assert.equal(finishApp.run('state.checkins[localDay()].checked'),true);
finishApp=appHarness(JSON.parse(finishApp.store.get('klee-ielts-v1')),'#spell-review');
assert.equal(finishApp.run('currentSpelling().current'),null,'refresh after finishing must not ask the last word again');
assert.ok(finishApp.element('#study-card').innerHTML.includes('今日复习完成啦'));

const phraseFinish=appHarness({progress:{6:completion(undefined,'new')},settings:{dailyGoal:1}},'#spell-new');
phraseFinish.run("submitSpellingForm({value:'relyon'})");
assert.ok(phraseFinish.element('#study-card').innerHTML.includes('空格不对'));
assert.equal(phraseFinish.run('currentSpelling().current.correct'),false);
phraseFinish.run("continueSpelling();submitSpellingForm({value:'rely on'})");
assert.ok(phraseFinish.element('#study-card').innerHTML.includes('全部拼对啦'));
phraseFinish.run('continueSpelling()');assert.equal(phraseFinish.run('currentSpelling().current'),null);
console.log('PASS: passed/duplicate queue repairs, current review batch isolation, explicit final confirmation, completion/check-in/scheduling, refresh without last-word repetition, and missing-space feedback.');

{ // New-word spacing includes reloads; a small queue still finishes without importing extra words.
for(const size of [1,2,4,6,7,8,10,20]){
 let spaced=Loop.create('new',day);const ids=Array.from({length:size},(_,i)=>i+1);Loop.sync(spaced,ids,day);
 const seen=[],introduced=new Map();
 for(let turn=0;turn<size*3;turn++){
  const q=Loop.next(spaced,()=>.4);assert.ok(q,'an unfinished queue must not stall');
  if(q.stage===1)introduced.set(q.id,seen.length);
  if(q.stage===2){
   const intervening=seen.slice(introduced.get(q.id)+1);
   assert.equal(intervening.length,Math.min(6,size-1),`first recall gap for ${size} words, card ${q.id}`);
   assert.ok(intervening.every(id=>id!==q.id));
  }
  seen.push(q.id);Loop.answer(spaced,true,0);Loop.advance(spaced);
  spaced=Loop.restore(JSON.parse(JSON.stringify(spaced)),ids,'new');
 }
 assert.equal(Loop.next(spaced),null);assert.equal(spaced.items.filter(i=>i.done).length,size);
}
let legacy=Loop.create('new',day);Loop.sync(legacy,[1,2,3,4,5,6,7,8,9,10],day);Loop.next(legacy);Loop.answer(legacy,true,0);Loop.advance(legacy);
delete legacy.recallGap;legacy.items[0].readyAt=2;
let migrated=Loop.restore(JSON.parse(JSON.stringify(legacy)),cards.map(c=>c.id),'new');assert.equal(migrated.items[0].readyAt,7);
migrated=Loop.restore(JSON.parse(JSON.stringify(migrated)),cards.map(c=>c.id),'new');assert.equal(migrated.items[0].readyAt,7,'migration is not repeated on each refresh');
console.log('PASS: six intervening cards before first new-word recall; 1–20-word batches finish; reload preserves spacing; old waiting queues migrate once.');

// Every recall round and lapse uses the longer interval, including saved queues.
for(const kind of ['new','review'])for(const size of [1,2,4,5,6,7,10,20,200]){
 const ids=Array.from({length:size},(_,i)=>i+1),lastSeen=new Map(),mistakes=new Set(),seen=[];
 let spaced=Loop.create(kind,day);Loop.sync(spaced,ids,day);
 for(let turn=0;turn<size*20;turn++){
  const q=Loop.next(spaced,()=>.4);if(!q)break;
  if(lastSeen.has(q.id)){
   const between=seen.slice(lastSeen.get(q.id)+1),available=spaced.items.filter(i=>!i.done&&i.id!==q.id).length;
   assert.ok(new Set(between).size>=Math.min(5,available),`${kind}/${size}: card ${q.id} repeats too soon at stage ${q.stage}`);
  }
  lastSeen.set(q.id,seen.length);seen.push(q.id);
  const key=`${q.id}:${q.stage}`,wrong=!mistakes.has(key);mistakes.add(key);
  if(wrong&&q.stage===1)Loop.answer(spaced,false,1);
  Loop.answer(spaced,!(wrong&&q.stage===2),0);
  if(wrong&&q.stage===3)Loop.mistake(spaced);
  Loop.advance(spaced);spaced=Loop.restore(JSON.parse(JSON.stringify(spaced)),ids,kind);
 }
 assert.equal(Loop.next(spaced),null,`${kind}/${size}: all cards finish despite errors`);
 assert.equal(spaced.items.filter(i=>i.done).length,size);
 assert.equal(spaced.items.every(i=>i.lapses===3),true,'all three kinds of mistake stay recorded');
}
for(const kind of ['new','review']){
 const ids=[1,2,3,4,5,6,7],old=Loop.create(kind,day);Loop.sync(old,ids,day);
 old.turn=12;old.lastId=1;delete old.spacingVersion;
 Object.assign(old.items[0],{stage:3,introduced:true,readyAt:13,lapses:2});
 Object.assign(old.items[1],{stage:2,introduced:true,readyAt:13});
 Object.assign(old.items[6],{stage:3,introduced:true,done:true,spelled:true,lapses:1});
 Loop.next(old,()=>.4);Loop.answer(old,true,0);
 const before=JSON.stringify(old),restored=Loop.restore(old,ids,kind);
 assert.equal(JSON.stringify(old),before,'migration never mutates the saved input');
 assert.deepEqual(restored.current,old.current,'the visible reveal, answer and choice order survive');
 assert.equal(restored.items[0].readyAt,17,'waiting later rounds gain five intervening cards');
 assert.equal(restored.items[0].stage,3);assert.equal(restored.items[0].lapses,2);
 assert.deepEqual(restored.items[6],old.items[6],'completed/spelled evidence is unchanged');
 assert.deepEqual(Loop.restore(JSON.parse(JSON.stringify(restored)),ids,kind),restored,'refresh never extends the wait twice');
}
console.log('PASS: all new/review rounds and three mistake paths space repeats across five other words; 1–200-word batches finish; legacy queues migrate once with current cards, errors and completion evidence preserved.');

for(const [typed,expected,distance] of [['resmble','resemble',1],['reseemble','resemble',1],['resembel','resemble',2],['relyon','rely on',1],["isnt","isn't",1],['ecofriendly','eco-friendly',1],['RESEMBLE','resemble',0],['','resemble',8]]){
 const diff=Loop.compareSpelling(typed,[expected]);
 assert.equal(diff.distance,distance,typed);assert.equal(diff.cells.map(c=>c.answer).join(''),Loop.normalizeSpelling(typed));assert.equal(diff.cells.map(c=>c.expected).join(''),expected);
 assert.equal(diff.cells.filter(c=>c.wrong).length,distance);
}
assert.equal(Loop.compareSpelling('fertilizer',['fertiliser','fertilizer']).expected,'fertilizer','accepted spelling variants are not marked wrong');
assert.equal(Loop.compareSpelling('resmble',['resemble']).cells.filter(c=>c.answer&&c.wrong).length,0,'one missing letter leaves the suffix unmarked');
for(const kind of ['new','review']){
 const p=completion(undefined,'new');if(kind==='review')p.due=Date.now()-1000;
 let h=appHarness({progress:{1:p},settings:{dailyGoal:1}},kind==='new'?'#spell-new':'#review');
 if(kind==='review')for(let n=0;n<3;n++){h.run('answerQuestion(true,0);continueLearning()');}
 h.run("submitSpellingForm({value:'resmble'})");
 let rendered=h.element('#study-card').innerHTML;
 assert.ok(rendered.includes('is-wrong')&&rendered.includes('拼错了')&&rendered.includes('你的拼写')&&rendered.includes('正确拼写'));
 assert.ok(rendered.includes('letter-error')&&rendered.includes('letter-correction')&&rendered.includes('□'));
 h=appHarness(JSON.parse(h.store.get('klee-ielts-v1')),'#spell-'+kind);assert.ok(h.element('#study-card').innerHTML.includes('is-wrong'),'wrong feedback survives reload');
 h.run("continueSpelling();submitSpellingForm({value:'resemble'})");rendered=h.element('#study-card').innerHTML;
 assert.ok(rendered.includes('is-correct')&&rendered.includes('拼对了'));assert.ok(!rendered.includes('letter-error'));
 assert.equal(h.element('#session-progress-text').textContent,'已过 1 / 1');
 const escaped=h.run("spellingComparisonHtml(cards[0],{answer:'<script>',forgotten:false})");assert.ok(!escaped.includes('<script>'),'typed characters must remain escaped');
}
console.log('PASS: conspicuous correct/wrong spelling verdicts in new/review practice; aligned substitutions, insertions, omissions, spaces and punctuation; accepted variants, reload, immediate pass count, and escaped output.');

}
