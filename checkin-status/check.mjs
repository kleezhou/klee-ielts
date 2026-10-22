import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import worker,{today,describe} from './worker/index.js';
const key=()=>randomBytes(32).toString('base64url'),hash=x=>createHash('sha256').update(x).digest('hex');
const read=key(),write=key(),sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_checkin_status.sql','utf8'));
const DB={prepare(query){const stmt=sql.prepare(query),bind=(...args)=>({first:async()=>stmt.get(...args)||null,run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})});return {...bind(),bind};}};
const env={DB,READ_KEY_HASH:hash(read),WRITE_KEY_HASH:hash(write)};
const readUrl=`https://status.test/s/${read}`;
async function call(path=readUrl,method='GET',body,token=write){return worker.fetch(new Request(path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);}
assert.equal((await call('https://status.test/')).status,404);
assert.equal((await call('https://status.test/s/'+key())).status,404);
assert.equal((await call(readUrl,'PUT',{})).status,405);
assert.equal((await call('https://status.test/publish','GET')).status,405);
assert.equal((await call('https://status.test/publish','PUT',{},read)).status,401,'read key cannot write');
assert.equal((await call('https://status.test/publish','PUT',{})).status,400);
let result=await (await call()).json();assert.equal(result.checkedIn,null);assert.equal(result.status,'awaiting_sync');
assert.equal(today(new Date('2026-10-21T15:59:59Z')),'2026-10-21');assert.equal(today(new Date('2026-10-21T16:00:00Z')),'2026-10-22');
const body={day:today(),checkedIn:true,revision:10,sourceUpdatedAt:new Date().toISOString()};
assert.equal((await call('https://status.test/publish','PUT',body)).status,200);
result=await (await call()).json();assert.equal(result.checkedIn,true);
assert.equal((await call('https://status.test/publish','PUT',{...body,revision:9,checkedIn:false})).status,200);
assert.equal((await (await call()).json()).checkedIn,true,'older source cannot overwrite');
assert.equal((await call('https://status.test/publish','PUT',{...body,revision:11,checkedIn:false})).status,200);
assert.equal((await (await call()).json()).checkedIn,false);
assert.equal(describe({day:'2020-01-01',checked_in:1,received_at:new Date().toISOString()}).checkedIn,false,'yesterday never counts today');
const reportKeys=['date','timeZone','checkedIn','status','lastSyncedAt','sourceUpdatedAt','note'];assert.deepEqual(Object.keys(result),reportKeys);
const html=await worker.fetch(new Request(readUrl),env);assert.equal(html.status,200);assert.match(await html.text(),/今日未打卡/);assert.match(html.headers.get('cache-control'),/no-store/);assert.match(html.headers.get('referrer-policy'),/no-referrer/);assert.match(html.headers.get('x-robots-tag'),/noindex/);
// Exercise the original private Worker -> protected writer -> read-only report using real SQLite.
const original=(await import('data:text/javascript;base64,'+fs.readFileSync('../dist/server/index.js').toString('base64')));
const privateSql=new DatabaseSync(':memory:');privateSql.exec(fs.readFileSync('../drizzle/0000_cloud_sync.sql','utf8'));
const privateDB={prepare(query){const stmt=privateSql.prepare(query),bind=(...args)=>({first:async()=>stmt.get(...args)||null,run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})});return {...bind(),bind};}};
const day=today().split('-').map(Number).join('-'),state={checkins:{[day]:{newIds:[1,2,3,4,5],reviewIds:[],dueIds:[]}},progress:{secret:'must not leave private app'},email:'private@example.test'};
const row={revision:12,state_json:JSON.stringify(state),updated_at:new Date().toISOString()};
assert.deepEqual(Object.keys(original.checkinPayload(row)),['day','checkedIn','revision','sourceUpdatedAt']);assert.equal(original.checkinPayload(row).checkedIn,true);assert.equal(original.checkinPayload(null),null);
privateSql.prepare('INSERT INTO study_sync(user_id,revision,state_json,updated_at) VALUES(?,?,?,?)').run('private-owner',12,row.state_json,row.updated_at);
let published=null;const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{published=JSON.parse(options.body);return worker.fetch(new Request(url,options),env);};
try{
 const source=await original.default.fetch(new Request('https://private.test/api/sync',{headers:{'oai-authenticated-user-id':'private-owner'}}),{DB:privateDB,CHECKIN_PUBLISH_URL:'https://status.test/publish',CHECKIN_WRITE_KEY:write});
 assert.equal(source.status,200);assert.equal(published.checkedIn,true);assert.equal((await (await call()).json()).checkedIn,true);assert.ok(!JSON.stringify(published).includes('secret'));assert.ok(!JSON.stringify(published).includes('private-owner'));
 globalThis.fetch=async()=>{throw Error('report offline');};
 assert.equal((await original.default.fetch(new Request('https://private.test/api/sync',{headers:{'oai-authenticated-user-id':'private-owner'}}),{DB:privateDB,CHECKIN_PUBLISH_URL:'https://status.test/publish',CHECKIN_WRITE_KEY:write})).status,200,'report outage must not interrupt private sync');
}finally{globalThis.fetch=realFetch;}
console.log('PASS: anonymous capability reads; separate read/write keys; no progress/identity exposure; unknown state; Shanghai midnight; real SQLite; revision ordering; original private Worker publishes; report outage preserves cloud sync.');
