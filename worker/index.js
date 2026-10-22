// Sites authenticates the private site before forwarding requests. Keep per-user data scoped here.
const CloudState=globalThis.IELTS_CLOUD_STATE;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
async function readRecord(db,user){return db.prepare('SELECT revision,state_json,updated_at FROM study_sync WHERE user_id=?').bind(user).first();}
function envelope(row,user){return {owner:user,revision:row?.revision||0,state:row?JSON.parse(row.state_json):null,updatedAt:row?.updated_at||null};}
function checkinPayload(row,now=new Date()){
 if(!row)return null;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const key=day.split('-').map(Number).join('-'),entry=JSON.parse(row.state_json).checkins?.[key];
 // Share only confirmed check-in evidence, never learning records or account identity.
 const checkedIn=!!entry&&(entry.newIds?.length>=5||(entry.dueIds?.length>0&&entry.dueIds.every(id=>entry.reviewIds?.includes(id))));
 return {day,checkedIn,revision:row.revision,sourceUpdatedAt:row.updated_at};
}
async function publishCheckin(env,row){
 if(!env.CHECKIN_PUBLISH_URL||!env.CHECKIN_WRITE_KEY||!row)return;
 try{
  await fetch(env.CHECKIN_PUBLISH_URL,{method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer '+env.CHECKIN_WRITE_KEY},body:JSON.stringify(checkinPayload(row)),signal:AbortSignal.timeout(4000)});
 }catch{} // The local and private cloud progress still save if the small report is temporarily offline.
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path.startsWith('/api/')){
   if(!env.DB)return json({error:'云端数据库暂不可用，本机记录仍保留。'},503);
   try{
    if(path==='/api/cloud-health'&&request.method==='GET'){
     await env.DB.prepare('SELECT 1 AS ready').first();
     return json({ready:true,storage:'Cloudflare D1'});
    }
    const user=request.headers.get('oai-authenticated-user-id');
    if(!user||user.length>300)return json({error:'请使用自己的 ChatGPT 账号登录网站后重试。'},401);
    if(path==='/api/checkin-link'&&request.method==='GET')return json({url:env.CHECKIN_READ_URL||null});
    if(path!=='/api/sync')return json({error:'Not found'},404);
    if(request.method==='GET'){const row=await readRecord(env.DB,user);await publishCheckin(env,row);return json(envelope(row,user));}
    if(request.method!=='PUT')return json({error:'Method not allowed'},405);
    if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Invalid request origin or content type'},403);
    if(Number(request.headers.get('content-length')||0)>4*1024*1024)return json({error:'Record too large'},413);
    const text=await request.text();if(new TextEncoder().encode(text).length>4*1024*1024)return json({error:'Record too large'},413);
    let body;try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON'},400);}
    if(!Number.isSafeInteger(body.revision)||body.revision<0)return json({error:'Invalid revision'},400);
    const state=CloudState.sanitize(body.state,CLOUD_CARD_IDS,CLOUD_WORDS);
    const previous=await readRecord(env.DB,user);
    if((previous?.revision||0)!==body.revision)return json(envelope(previous,user),409);
    if(previous){
     const old=JSON.parse(previous.state_json);
     if(Object.keys(old.progress).some(id=>!Object.hasOwn(state.progress,id))||Object.keys(old.checkins).some(day=>!Object.hasOwn(state.checkins,day)))return json({error:'云端已有记录未包含在本次上传中，已停止覆盖。'},422);
    }
    const updatedAt=new Date().toISOString();
    if(body.initialState&&/^[a-zA-Z0-9-]{16,100}$/.test(body.deviceId||'')){
     const initial=CloudState.sanitize(body.initialState,CLOUD_CARD_IDS,CLOUD_WORDS);
     await env.DB.prepare('INSERT OR IGNORE INTO study_backups(user_id,device_id,state_json,created_at) VALUES(?,?,?,?)').bind(user,body.deviceId,JSON.stringify(initial),updatedAt).run();
    }
    const result=previous
     ?await env.DB.prepare('UPDATE study_sync SET revision=revision+1,state_json=?,updated_at=? WHERE user_id=? AND revision=?').bind(JSON.stringify(state),updatedAt,user,body.revision).run()
     :await env.DB.prepare('INSERT OR IGNORE INTO study_sync(user_id,revision,state_json,updated_at) VALUES(?,1,?,?)').bind(user,JSON.stringify(state),updatedAt).run();
    const current=await readRecord(env.DB,user);
    await publishCheckin(env,current);
    return json(envelope(current,user),result.meta.changes?200:409);
   }catch(error){
    if(error instanceof TypeError||error instanceof RangeError)return json({error:'学习记录格式不正确，已保留本机记录。'},400);
    return json({error:'暂时无法同步，本机记录仍保留，稍后会重试。'},503);
   }
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const key=path==='/'?'/index.html':path,asset=CLOUD_ASSETS[key];
  if(!asset)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:asset.body,{headers:{'content-type':asset.type,'cache-control':key==='/index.html'?'no-cache':'public,max-age=300','x-content-type-options':'nosniff'}});
 }
};
export {checkinPayload};
