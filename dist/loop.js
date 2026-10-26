// 每个词三轮回忆；答题与核对分开提交，支持刷新续学。
(function(root) {
  function create(kind, day) {return {version:1,recallGap:6,spacingVersion:2,kind,day,turn:0,serial:0,lastId:null,items:[],current:null};}
  function restore(raw, validIds, kind) {
    if(!raw || raw.version!==1 || raw.kind!==kind || !Array.isArray(raw.items) || typeof raw.day!=='string')return null;
    const loop=create(kind,raw.day), seen=new Set();
    for(const value of raw.items) {
      if(!validIds.includes(value.id)||seen.has(value.id)||![1,2,3].includes(value.stage))continue;
      seen.add(value.id);
      loop.items.push({id:value.id,stage:value.stage,done:value.done===true,spelled:value.spelled===true,introduced:value.introduced===true,readyAt:Number.isSafeInteger(value.readyAt)&&value.readyAt>=0?value.readyAt:0,lapses:Number.isSafeInteger(value.lapses)&&value.lapses>=0?value.lapses:0});
    }
    for(const key of ['turn','serial'])if(Number.isSafeInteger(raw[key])&&raw[key]>=0)loop[key]=raw[key];
    if(validIds.includes(raw.lastId))loop.lastId=raw.lastId;
    if(kind==='new'&&raw.recallGap!==6)for(const item of loop.items){
      if(item.stage===2&&!item.done)item.readyAt+=Math.max(0,Math.min(6,loop.items.filter(i=>!i.done&&i.id!==item.id).length)-1);
    }
    const q=raw.current, item=loop.items.find(i=>i.id===q?.id&&!i.done);
    // Extend waiting cards once without resetting stages, lapses or the visible question.
    if(raw.spacingVersion!==2)for(const pending of loop.items){
      if(pending.introduced&&!pending.done&&pending.id!==item?.id){
        const gap=Math.min(kind==='new'&&pending.stage===2?6:5,loop.items.filter(i=>!i.done&&i.id!==pending.id).length);
        pending.readyAt=Math.max(pending.readyAt,loop.turn+gap);
      }
    }
    if(item&&q.stage===item.stage&&['question','reveal'].includes(q.phase)&&Array.isArray(q.order)&&q.order.length===4&&new Set(q.order).size===4&&q.order.every(n=>[0,1,2,3].includes(n))&&(q.phase==='question'||typeof q.correct==='boolean')) {
      loop.current={id:q.id,stage:q.stage,phase:q.phase,serial:loop.serial,autoIntro:q.autoIntro===true,correct:q.correct===true,choice:[0,1,2,3].includes(q.choice)?q.choice:null,order:q.order,wrongChoices:q.stage===1&&Array.isArray(q.wrongChoices)?[...new Set(q.wrongChoices.filter(n=>[1,2,3].includes(n)))]:[]};
    }
    return loop;
  }
  function sync(loop, ids, day) {
    const wanted=new Set(ids), newDay=loop.day!==day;
    loop.day=day;
    loop.items=loop.items.filter(i=>newDay?(!i.done||(loop.kind==='review'&&!i.spelled))&&(i.introduced||wanted.has(i.id)):i.done||i.introduced||wanted.has(i.id));
    for(const id of ids)if(!loop.items.some(i=>i.id===id))loop.items.push({id,stage:1,done:false,spelled:false,introduced:false,readyAt:0,lapses:0});
    if(loop.current&&!loop.items.some(i=>i.id===loop.current.id&&!i.done))loop.current=null;
    return loop;
  }
  function next(loop, random=Math.random) {
    if(loop.current)return loop.current;
    const pending=loop.items.filter(i=>!i.done);
    if(!pending.length)return null;
    const others=pending.filter(i=>i.id!==loop.lastId);
    const candidates=others.length?others:pending;
    const ready=candidates.filter(i=>i.readyAt<=loop.turn);
    // At the end of a short batch, use the longest-waiting card, not source order.
    const earliest=Math.min(...candidates.map(i=>i.readyAt));
    const pool=ready.length?ready:candidates.filter(i=>i.readyAt===earliest);
    const fresh=pool.filter(i=>!i.introduced), recall=pool.filter(i=>i.introduced);
    // 先按源顺序引入新词；到间隔后，再穿插回忆。
    const preferRecall=loop.turn>=2&&loop.turn%2===0;
    const firstRecall=loop.kind==='new'?ready.filter(i=>i.stage===2).sort((a,b)=>a.readyAt-b.readyAt)[0]:null;
    const item=firstRecall||(preferRecall?(recall[0]||fresh[0]):(fresh[0]||recall[0]));
    const autoIntro=loop.kind==='new'&&!item.introduced;
    item.introduced=true;
    const order=[0,1,2,3];
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    loop.serial++;
    return loop.current={id:item.id,stage:item.stage,phase:'question',serial:loop.serial,autoIntro,correct:false,choice:null,order,wrongChoices:[]};
  }
  function answer(loop, correct, choice=null) {
    const q=loop.current;
    if(!q||q.phase!=='question')return false;
    if(q.stage===1){
      if(![0,1,2,3].includes(choice))return false;
      q.choice=choice;
      if(choice!==0){if(!q.wrongChoices.includes(choice))q.wrongChoices.push(choice);return true;}
      correct=q.wrongChoices.length===0;
    }
    q.phase='reveal';q.correct=!!correct;q.choice=choice;
    return true;
  }
  function mistake(loop) {if(loop.current?.phase!=='reveal')return false;loop.current.correct=false;return true;}
  function advance(loop) {
    const q=loop.current;
    if(!q||q.phase!=='reveal')return {advanced:false,completedId:null};
    const item=loop.items.find(i=>i.id===q.id);
    let completedId=null;
    if(!q.correct){item.stage=1;item.lapses++;}
    else if(q.stage===3){item.done=true;completedId=item.id;}
    else item.stage++;
    const gap=Math.min(loop.kind==='new'&&q.stage===1?6:5,loop.items.filter(i=>!i.done&&i.id!==q.id).length);
    loop.turn++;item.readyAt=loop.turn+gap;loop.lastId=item.id;loop.current=null;
    return {advanced:true,completedId};
  }
  function createSpelling(kind,day) {return {version:1,kind,day,serial:0,ids:[],queue:[],passed:[],current:null};}
  function restoreSpelling(raw,validIds,kind) {
    if(!raw||raw.version!==1||raw.kind!==kind||typeof raw.day!=='string'||!Array.isArray(raw.ids)||!Array.isArray(raw.passed)||!Array.isArray(raw.queue))return null;
    const spell=createSpelling(kind,raw.day), unique=values=>[...new Set(values.filter(id=>validIds.includes(id)))];
    spell.serial=Number.isSafeInteger(raw.serial)&&raw.serial>=0?raw.serial:0;
    spell.ids=unique(raw.ids);spell.passed=unique(raw.passed).filter(id=>spell.ids.includes(id));
    spell.queue=unique(raw.queue).filter(id=>spell.ids.includes(id)&&!spell.passed.includes(id));
    const q=raw.current;
    if(q&&spell.ids.includes(q.id)&&!spell.passed.includes(q.id)&&['question','reveal'].includes(q.phase)&&(q.phase==='question'||typeof q.correct==='boolean'))spell.current={id:q.id,serial:spell.serial,phase:q.phase,correct:q.correct===true&&q.forgotten!==true,forgotten:q.forgotten===true,answer:typeof q.answer==='string'?q.answer.slice(0,200):''};
    if(spell.current)spell.queue=spell.queue.filter(id=>id!==spell.current.id);
    return spell;
  }
  function syncSpelling(spell,ids,day) {
    spell.day=day;spell.ids=[...new Set(ids)];
    spell.passed=spell.passed.filter(id=>spell.ids.includes(id));
    if(spell.current&&(!spell.ids.includes(spell.current.id)||spell.passed.includes(spell.current.id)))spell.current=null;
    spell.queue=spell.queue.filter(id=>spell.ids.includes(id)&&!spell.passed.includes(id)&&spell.current?.id!==id);
    for(const id of spell.ids)if(!spell.passed.includes(id)&&spell.current?.id!==id&&!spell.queue.includes(id))spell.queue.push(id);
    return spell;
  }
  function nextSpelling(spell) {
    // Passed IDs are authoritative, including when an older saved queue has repeats.
    spell.queue=[...new Set(spell.queue)].filter(id=>spell.ids.includes(id)&&!spell.passed.includes(id));
    if(spell.current&&spell.passed.includes(spell.current.id)&&spell.current.phase==='question')spell.current=null;
    if(spell.current)return spell.current;
    const id=spell.queue.shift();
    if(id===undefined)return null;spell.serial++;
    return spell.current={id,serial:spell.serial,phase:'question',correct:false,forgotten:false,answer:''};
  }
  function normalizeSpelling(value) {return String(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');}
  function compareSpelling(value,accepted) {
    const answer=normalizeSpelling(value);
    // Align insertions/deletions so one missing letter does not mark the entire suffix wrong.
    function align(expected) {
      const a=[...answer],b=[...normalizeSpelling(expected)];
      const dp=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));
      for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+Number(a[i-1]!==b[j-1]));
      const cells=[];let i=a.length,j=b.length;
      while(i||j){
        if(i&&j&&dp[i][j]===dp[i-1][j-1]+Number(a[i-1]!==b[j-1])){cells.push({answer:a[--i],expected:b[--j],wrong:a[i]!==b[j]});}
        else if(i&&dp[i][j]===dp[i-1][j]+1)cells.push({answer:a[--i],expected:'',wrong:true});
        else cells.push({answer:'',expected:b[--j],wrong:true});
      }
      return {answer,expected:b.join(''),distance:dp[a.length][b.length],cells:cells.reverse()};
    }
    return accepted.map(align).reduce((best,next)=>!best||next.distance<best.distance?next:best,null);
  }
  function submitSpelling(spell,value,accepted) {
    if(!spell.current||spell.current.phase!=='question')return false;
    const answer=normalizeSpelling(value);if(!answer)return false;
    spell.current.phase='reveal';spell.current.answer=String(value).slice(0,200);
    spell.current.correct=accepted.some(word=>normalizeSpelling(word)===answer);
    return true;
  }
  function forgetSpelling(spell) {
    if(!spell?.current||spell.current.phase!=='question')return false;
    Object.assign(spell.current,{phase:'reveal',correct:false,forgotten:true,answer:''});return true;
  }
  function advanceSpelling(spell) {
    const q=spell.current;
    if(!q||q.phase!=='reveal')return {advanced:false,completedId:null};
    spell.queue=spell.queue.filter(id=>id!==q.id&&!spell.passed.includes(id));
    if(q.correct){if(!spell.passed.includes(q.id))spell.passed.push(q.id);}else if(!spell.passed.includes(q.id))spell.queue.push(q.id);
    spell.current=null;return {advanced:true,completedId:q.correct?q.id:null};
  }
  const api={create,restore,sync,next,answer,mistake,advance,createSpelling,restoreSpelling,syncSpelling,nextSpelling,submitSpelling,forgetSpelling,advanceSpelling,normalizeSpelling,compareSpelling};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.IELTS_LOOP=api;
})(typeof window==='object'?window:globalThis);
