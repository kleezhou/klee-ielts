const headers={'cache-control':'no-store, private','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
function today(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
async function matches(token,expected){
 if(typeof token!=='string'||token.length!==43||!expected)return false;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const actual=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(expected.length!==actual.length)return false;let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
}
function valid(body){
 return body&&/^\d{4}-\d{2}-\d{2}$/.test(body.day)&&body.day===today()&&typeof body.checkedIn==='boolean'&&Number.isSafeInteger(body.revision)&&body.revision>=1&&typeof body.sourceUpdatedAt==='string'&&Number.isFinite(Date.parse(body.sourceUpdatedAt))&&Date.parse(body.sourceUpdatedAt)<=Date.now()+60000;
}
function describe(row){
 const day=today(),checkedIn=!!row&&row.day===day&&row.checked_in===1;
 return {date:day,timeZone:'Asia/Shanghai',checkedIn:row?checkedIn:null,status:row?(checkedIn?'checked_in':'not_checked_in'):'awaiting_sync',lastSyncedAt:row?.received_at||null,sourceUpdatedAt:row?.source_updated_at||null,note:row?'仅代表已同步的词卡记录；离线进度需联网同步。':'尚未收到记录，请先在原手机刷新词卡并完成云同步。'};
}
function page(result){
 const title=result.checkedIn===null?'等待同步':result.checkedIn?'今日已打卡':'今日未打卡';
 const latest=result.lastSyncedAt?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'short'}).format(new Date(result.lastSyncedAt)):'尚未收到';
 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>${title} · 词卡</title><style>body{margin:0;background:#f6f5ef;color:#293c2f;font:16px/1.7 system-ui,sans-serif;min-height:100dvh;display:grid;place-items:center}main{box-sizing:border-box;width:min(88%,400px);padding:32px;border:1px solid #dde3d3;border-radius:24px;background:#fffdf8}small,p{color:#71806c}h1{font-size:28px;margin:12px 0}strong{color:#596f3f}p{font-size:13px}hr{border:0;border-top:1px solid #e6eadf;margin:24px 0}</style></head><body><main><small>今日词卡 · 只读状态</small><h1>${result.checkedIn?'✓ ':''}${title}</h1><strong>${result.date} · 北京时间</strong><hr><p>最近收到同步：${latest}</p><p>${result.note}</p><p>此页面只查询状态，不能替你打卡。</p></main></body></html>`;
 return new Response(html,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  try{
   if(path==='/robots.txt')return new Response('User-agent: *\nDisallow: /\n',{headers:{...headers,'content-type':'text/plain'}});
   if(path==='/publish'){
    if(request.method!=='PUT')return json({error:'Method not allowed'},405);
    if(!await matches(request.headers.get('authorization')?.replace(/^Bearer /,''),env.WRITE_KEY_HASH))return json({error:'Unauthorized'},401);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
    const text=await request.text();if(new TextEncoder().encode(text).length>2048)return json({error:'Too large'},413);
    let body;try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON'},400);}
    if(!valid(body))return json({error:'Invalid status'},400);
    await env.DB.prepare('INSERT INTO checkin_status(id,day,checked_in,source_revision,source_updated_at,received_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET day=excluded.day,checked_in=excluded.checked_in,source_revision=excluded.source_revision,source_updated_at=excluded.source_updated_at,received_at=excluded.received_at WHERE excluded.source_revision>=checkin_status.source_revision AND excluded.day>=checkin_status.day').bind(body.day,Number(body.checkedIn),body.revision,body.sourceUpdatedAt,new Date().toISOString()).run();
    return json({ok:true});
   }
   const match=/^\/s\/([A-Za-z0-9_-]{43})$/.exec(path);
   if(!match||!await matches(match[1],env.READ_KEY_HASH))return json({error:'Not found'},404);
   if(!['GET','HEAD'].includes(request.method))return json({error:'Read only'},405);
   const row=await env.DB.prepare('SELECT day,checked_in,source_updated_at,received_at FROM checkin_status WHERE id=1').first();
   const response=url.searchParams.get('format')==='json'||request.headers.get('accept')?.includes('application/json')?json(describe(row)):page(describe(row));
   return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
  }catch{return json({error:'Status temporarily unavailable. Do not treat this as a missed check-in.'},503);}
 }
};
export {today,describe};
