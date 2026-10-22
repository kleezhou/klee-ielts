const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const core=require('./dist/cloud-state.js');
const dataContext={window:{}};vm.runInNewContext(fs.readFileSync('dist/data.js','utf8'),dataContext);
const data=dataContext.window.IELTS_DATA,ids=data.cards.map(c=>c.id),words=Object.keys(data.glossary);
const empty=()=>core.sanitize(null,ids,words),clone=value=>JSON.parse(JSON.stringify(value));
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_cloud_sync.sql','utf8'));
 return {sql,prepare(query){const stmt=sql.prepare(query);const bind=(...args)=>({first:async()=>stmt.get(...args)||null,run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})});return {...bind(),bind};}};
}
async function main(){
 const worker=(await import('data:text/javascript;base64,'+fs.readFileSync('dist/server/index.js').toString('base64'))).default;
 const DB=database();
 async function call(method='GET',body,user='owner',origin='https://test.local'){
  const headers={'oai-authenticated-user-id':user,origin,'content-type':'application/json'};
  const response=await worker.fetch(new Request('https://test.local/api/sync',{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),{DB});
  return {status:response.status,value:await response.json()};
 }
 assert.equal((await call('GET',undefined,'')).status,401);
 assert.equal((await call()).value.state,null);
 assert.equal((await call('PUT',{revision:0,state:empty()},'owner','https://elsewhere.local')).status,403);
 assert.equal((await call('PUT',{revision:-1,state:empty()})).status,400);
 assert.equal((await call('PUT',{revision:0,state:{bookId:'other'}})).status,400);
 const initial=empty();initial.progress[1]={day:'2026-10-20',firstLearnedDay:'2026-10-20',grade:'known',due:1792555200000,reviewStage:0};
 const body={revision:0,state:initial,initialState:initial,deviceId:'11111111-1111-4111-8111-111111111111'};
 assert.equal((await call('PUT',body)).status,200);
 assert.equal((await call('PUT',body)).status,409);
 assert.equal((await call('PUT',{revision:1,state:empty()})).status,422);
 assert.equal((await call('GET',undefined,'another-user')).value.state,null);
 assert.equal(DB.sql.prepare('SELECT count(*) AS n FROM study_backups').get().n,1);
 assert.equal((await call('PUT',{...body,revision:1})).status,200);
 assert.equal(DB.sql.prepare('SELECT count(*) AS n FROM study_backups').get().n,1,'initial backup is immutable');
 console.log('PASS: actual SQLite migration, authenticated per-user API, origin protection, validation, revision conflicts, overwrite guard, immutable initial backup.');

 // Run the actual browser adapter in independent devices against the same Worker/database.
 let serial=1;
 function device(initialLocal=empty(),user='sync-owner'){
  let state=clone(initialLocal),unavailable=false,hold=null,release=null;const values=new Map(),statuses=[],timers=new Map();
  const window={IELTS_DATA:data,crypto:{randomUUID:()=>`11111111-1111-4111-8111-${String(serial++).padStart(12,'0')}`},navigator:{onLine:true},document:{hidden:false,addEventListener(){}},addEventListener(){}};
  window.fetch=async(path,options)=>{
   if(unavailable)throw Error('offline');
   if(options.method==='PUT'&&hold){const wait=hold;hold=null;await wait;}
   return worker.fetch(new Request('https://test.local'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':user,origin:'https://test.local'}}),{DB});
  };
  const context=vm.createContext({window,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},AbortController,Date,JSON,console,setTimeout:fn=>{const id=serial++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),setInterval(){}});
  for(const file of ['cloud-state.js','cloud.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context);
  window.IELTS_CLOUD.start({getState:()=>state,applyState:next=>{state=clone(next);},onStatus:info=>statuses.push(info)});
  return {sync:()=>window.IELTS_CLOUD.syncNow(),get state(){return state;},set state(next){state=next;},values,statuses,offline:value=>{unavailable=value;},holdPut(){hold=new Promise(resolve=>{release=resolve;});},release:()=>release()};
 }
 const legacy=empty();legacy.mastered=[1];legacy.saved=[words[0]];legacy.settings.dailyGoal=20;
 const a=device(legacy);await a.sync();assert.equal(a.statuses.at(-1).kind,'synced');
 assert.ok(a.values.get('klee-ielts-v1-before-cloud'));
 const b=device();await b.sync();assert.deepEqual(b.state.mastered,[1]);assert.equal(b.state.settings.dailyGoal,20);
 a.state.mastered=[];a.state.saved=[];a.offline(true);await a.sync();assert.equal(a.statuses.at(-1).kind,'pending');
 b.state.mastered.push(2);b.state.progress[3]=clone(initial.progress[1]);await b.sync();
 a.offline(false);await a.sync();assert.deepEqual(a.state.mastered,[2]);assert.deepEqual(a.state.saved,[]);assert.ok(a.state.progress[3]);
 await b.sync();assert.deepEqual(b.state.mastered,[2]);assert.deepEqual(b.state.saved,[]);
 a.state.mastered.push(4);b.state.mastered.push(5);await Promise.all([a.sync(),b.sync()]);await a.sync();await b.sync();assert.deepEqual(a.state.mastered,[2,4,5]);assert.deepEqual(b.state.mastered,[2,4,5]);
 // Change the local record while its upload is in flight.
 a.state.mastered.push(6);a.holdPut();const inFlight=a.sync();
 await new Promise(resolve=>setImmediate(resolve));a.state.mastered.push(7);a.release();await inFlight;
 assert.ok(a.state.mastered.includes(7));await a.sync();await b.sync();assert.deepEqual(b.state.mastered,[2,4,5,6,7]);
 // Missing network never destroys the local data or pretends it synchronized.
 b.offline(true);b.state.settings.dailyGoal=15;await b.sync();assert.equal(b.state.settings.dailyGoal,15);assert.equal(b.statuses.at(-1).kind,'pending');
 b.offline(false);await b.sync();await a.sync();assert.equal(a.state.settings.dailyGoal,15);
 console.log('PASS: actual browser adapter migration, second device restore, offline edits, explicit unmark/unsave, concurrent CAS retries, in-flight edits, reconnect and settings.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
