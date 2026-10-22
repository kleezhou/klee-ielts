// Same-origin, authenticated cloud sync. Keep the full local state and session drafts on this device.
(function(root){
 'use strict';
 const core=root.IELTS_CLOUD_STATE,KEY='klee-ielts-cloud-v1',BACKUP='klee-ielts-v1-before-cloud';
 let config,meta={},timer,running=false,again=false,applying=false,paused=false,retry=0;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const snapshot=()=>core.sanitize(config.getState(),root.IELTS_DATA.cards.map(c=>c.id),Object.keys(root.IELTS_DATA.glossary));
 const status=(kind,message)=>config?.onStatus({kind,message,updatedAt:meta.updatedAt||null});
 function schedule(delay=650){if(!config||paused||applying)return;clearTimeout(timer);timer=setTimeout(syncNow,delay);}
 function saveMeta(){try{localStorage.setItem(KEY,JSON.stringify(meta));}catch{status('pending','本机存储不足，请导出备份');}}
 async function request(method,body){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await root.fetch('/api/sync',{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
   if(!response.headers.get('content-type')?.includes('application/json'))throw Error('请登录网站后重试云端同步');
   const value=await response.json();
   if(response.status===409)return {conflict:true};
   if(!response.ok)throw Error(value.error||'云端暂不可用，本机已保存');
   if(typeof value.owner!=='string'||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('云端返回异常，本机已保存');
   return value;
  }finally{clearTimeout(timeout);}
 }
 async function syncNow(){
  if(!config||paused)return;if(running){again=true;return;}
  clearTimeout(timer);running=true;again=false;status('syncing','正在同步云端…');
  try{
   for(let attempt=0;attempt<4;attempt++){
    const remote=await request('GET');
    if(meta.owner&&meta.owner!==remote.owner){paused=true;status('error','登录账号已改变，已暂停同步并保留本机记录');return;}
    const local=snapshot(),merged=core.merge(meta.base||null,local,remote.state);
    let ack=remote;
    if(!same(merged,remote.state)||!meta.backupUploaded){
     ack=await request('PUT',{revision:remote.revision,state:merged,deviceId:meta.deviceId,...(!meta.backupUploaded?{initialState:initialState}: {})});
     if(ack.conflict)continue;
    }
    // Learning can continue during the request. Rebase those edits on the acknowledged state.
    const current=snapshot(),next=core.merge(local,current,ack.state);
    meta={...meta,owner:ack.owner,revision:ack.revision,base:ack.state,updatedAt:ack.updatedAt,backupUploaded:true};saveMeta();
    applying=true;try{if(!same(current,next))config.applyState(next);}finally{applying=false;}
    retry=0;
    if(!same(snapshot(),ack.state)){again=true;status('pending','本机已保存，继续同步…');}
    else status('synced','云端已同步 ✓');
    return;
   }
   throw Error('其他设备正在更新，稍后自动重试');
  }catch(error){
   status('pending',root.navigator?.onLine===false?'离线，本机已保存':(error.name==='AbortError'?'连接超时，本机已保存':error.message));
   retry=Math.min(retry+1,6);schedule(Math.min(60000,1000*2**retry));
  }finally{running=false;if(again)schedule();}
 }
 let initialState;
 function start(options){
  if(config||typeof root.fetch!=='function'||!core)return;config=options;
  try{meta=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{meta={};}
  if(!meta.deviceId||!/^[a-zA-Z0-9-]{16,100}$/.test(meta.deviceId))meta={deviceId:root.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`};
  initialState=snapshot();
  try{if(!localStorage.getItem(BACKUP))localStorage.setItem(BACKUP,JSON.stringify(config.getState()));}catch{}
  root.addEventListener('online',()=>schedule(0));
  root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden)schedule(0);});
  setInterval(()=>{if(!root.document.hidden)schedule(0);},60000);
  schedule(0);
 }
 root.IELTS_CLOUD={start,changed:()=>{if(config&&!applying){status('pending','本机已保存，待同步');schedule();}},syncNow};
})(window);
