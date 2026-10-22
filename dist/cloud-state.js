// Durable cross-device state only. Session queues and spelling drafts stay local.
(function(root) {
  const BOOK_ID='liu-hongbo-reading-538', MAX_IDS=1000, MAX_WORDS=50000, MAX_DAYS=6000, MAX_LIST=20000;
  const grades=new Set(['again','unsure','known']), celebrationKinds=new Set(['new','review','spelling']);
  const defaults={voice:'',rate:0.9,dailyGoal:10};
  const has=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function validDay(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{1,2}-\d{1,2}$/.test(value))return false;
    const [year,month,day]=value.split('-').map(Number);if(year<1||month<1||month>12||day<1||day>31)return false;
    const date=new Date(0);date.setUTCHours(0,0,0,0);date.setUTCFullYear(year,month-1,day);
    return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
  }
  function canonicalDay(value) {if(!validDay(value))return null;const [year,month,day]=value.split('-').map(Number);return `${year}-${month}-${day}`;}
  function dayNumber(value) {
    const [year,month,day]=value.split('-').map(Number),date=new Date(0);
    date.setUTCHours(0,0,0,0);date.setUTCFullYear(year,month-1,day);return date.getTime();
  }
  function localDay(date=new Date()) {return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;}
  function idSet(values) {return new Set((Array.isArray(values)?values:[]).slice(0,MAX_IDS).filter(id=>Number.isSafeInteger(id)&&id>0));}
  function wordSet(values) {
    const list=values instanceof Set?[...values].slice(0,MAX_WORDS):Array.isArray(values)?values.slice(0,MAX_WORDS):[];
    return new Set(list.filter(word=>typeof word==='string'&&word.length>0&&word.length<=100&&!/[\u0000-\u001f\u007f]/.test(word)));
  }
  function checked(entry) {return entry.newIds.length>=5||(entry.dueIds.length>0&&entry.dueIds.every(id=>entry.reviewIds.includes(id)));}
  function reconcileToday(entry,progress,mastered) {
    const end=new Date();end.setHours(23,59,59,999);const retired=new Set(mastered);
    entry.dueIds=entry.dueIds.filter(id=>entry.reviewIds.includes(id)||(!retired.has(id)&&(!progress[id]||progress[id].due<=end.getTime())));
    entry.checked=checked(entry);
  }
  function sanitize(raw,validIds,validWords) {
    const ids=idSet(validIds),words=wordSet(validWords);
    if(raw?.bookId!==undefined&&raw.bookId!==BOOK_ID)throw new RangeError('Book mismatch');
    if(raw?.version!==undefined&&raw.version!==1)throw new RangeError('Unsupported durable state version');
    const result={version:1,bookId:BOOK_ID,progress:{},mastered:[],saved:[],checkins:{},celebrations:[],settings:{...defaults}};
    if(!object(raw))return result;
    const retired=new Set();
    if(Array.isArray(raw.mastered))for(const id of raw.mastered.slice(0,MAX_IDS))if(ids.has(id))retired.add(id);
    result.mastered=[...retired].sort((a,b)=>a-b);

    if(object(raw.progress))for(const id of ids) {
      const value=raw.progress[id];
      if(!object(value)||!grades.has(value.grade)||!validDay(value.day)||!Number.isSafeInteger(value.due)||Math.abs(value.due)>8640000000000000||!Number.isFinite(new Date(value.due).getTime()))continue;
      const day=canonicalDay(value.day),firstValue=canonicalDay(value.firstLearnedDay);
      const firstLearnedDay=firstValue&&dayNumber(firstValue)<=dayNumber(day)?firstValue:day;
      const record={grade:value.grade,day,firstLearnedDay,due:value.due};
      if(Number.isInteger(value.reviewStage)&&value.reviewStage>=0&&value.reviewStage<=5)record.reviewStage=value.reviewStage;
      if(typeof value.lastReviewHadError==='boolean')record.lastReviewHadError=value.lastReviewHadError;
      if(value.manualUnmarked===true)record.manualUnmarked=true;
      result.progress[id]=record;
    }
    if(Array.isArray(raw.saved))result.saved=[...new Set(raw.saved.slice(0,MAX_LIST).filter(word=>typeof word==='string'&&words.has(word)))].sort();

    if(object(raw.checkins)) {
      let count=0;
      for(const day in raw.checkins) {
        if(++count>MAX_DAYS)break;
        if(!has(raw.checkins,day)||!validDay(day))continue;
        const value=raw.checkins[day];if(!object(value))continue;
        const key=canonicalDay(day),entry=result.checkins[key]||{newIds:[],reviewIds:[],dueIds:[],checked:false};
        const idsFor=key=>Array.isArray(value[key])?[...new Set(value[key].slice(0,MAX_IDS).filter(id=>ids.has(id)))].sort((a,b)=>a-b):[];
        for(const field of ['newIds','reviewIds','dueIds'])entry[field]=[...new Set([...entry[field],...idsFor(field)])].sort((a,b)=>a-b);
        result.checkins[key]=entry;
      }
      // Validation must not depend on the server's timezone. Only the client merge reconciles today.
      for(const entry of Object.values(result.checkins))entry.checked=checked(entry);
    }
    if(Array.isArray(raw.celebrations))result.celebrations=[...new Set(raw.celebrations.slice(0,MAX_LIST).map(value=>{
      if(typeof value!=='string')return null;const match=/^(\d{4}-\d{1,2}-\d{1,2}):(new|review|spelling)$/.exec(value);
      return match&&validDay(match[1])&&celebrationKinds.has(match[2])?`${canonicalDay(match[1])}:${match[2]}`:null;
    }).filter(Boolean))].sort();
    if(object(raw.settings)) {
      const s=raw.settings;
      if(typeof s.voice==='string'&&s.voice.length<=200&&!/[\u0000-\u001f\u007f]/.test(s.voice))result.settings.voice=s.voice;
      if([0.75,0.9,1].includes(s.rate))result.settings.rate=s.rate;
      if(Number.isInteger(s.dailyGoal)&&s.dailyGoal>=1&&s.dailyGoal<=200)result.settings.dailyGoal=s.dailyGoal;
    }
    return result;
  }
  function resolveLists(validIds,validWords) {
    const data=root.IELTS_DATA;
    const ids=validIds||(data?.cards||[]).map(card=>card.id);
    const words=validWords||(data?.glossary?Object.keys(data.glossary):[]);
    if(!ids.length||!words.length)throw new TypeError('merge requires the book card IDs and glossary words');
    return [ids,words];
  }
  function same(a,b) {return JSON.stringify(a)===JSON.stringify(b);}
  function chooseProgress(left,right) {
    if(!left)return right;if(!right)return left;
    const ld=dayNumber(left.day),rd=dayNumber(right.day);
    if(ld!==rd)return ld>rd?left:right;
    if(left.lastReviewHadError!==right.lastReviewHadError)return left.lastReviewHadError?left:right;
    if(left.lastReviewHadError&&right.lastReviewHadError) {
      const first=left.due<=right.due?left:right;
      return {...first,firstLearnedDay:dayNumber(left.firstLearnedDay)<=dayNumber(right.firstLearnedDay)?left.firstLearnedDay:right.firstLearnedDay,reviewStage:Math.min(left.reviewStage??0,right.reviewStage??0),lastReviewHadError:true};
    }
    const leftStage=left.reviewStage??-1,rightStage=right.reviewStage??-1;
    const first=leftStage!==rightStage?(leftStage>rightStage?left:right):left.due>=right.due?left:right;
    return {...first,firstLearnedDay:dayNumber(left.firstLearnedDay)<=dayNumber(right.firstLearnedDay)?left.firstLearnedDay:right.firstLearnedDay};
  }
  function merge(base,local,remote,validIds,validWords) {
    [validIds,validWords]=resolveLists(validIds,validWords);
    const l=sanitize(local,validIds,validWords),r=sanitize(remote,validIds,validWords),b=base==null?null:sanitize(base,validIds,validWords),out=sanitize(null,validIds,validWords);
    const first=b===null;
    for(const id of idSet(validIds)) {
      const key=String(id),bv=b?.progress[key],lv=l.progress[key],rv=r.progress[key];let selected;
      if(first)selected=chooseProgress(lv,rv);
      else if(same(lv,bv))selected=rv||lv;
      else if(same(rv,bv))selected=lv||rv;
      else selected=chooseProgress(lv,rv);
      if(selected){
        const first=[bv,lv,rv].filter(value=>value?.firstLearnedDay).map(value=>value.firstLearnedDay).sort((a,b)=>dayNumber(a)-dayNumber(b))[0];
        out.progress[key]={...selected,...(first?{firstLearnedDay:first}:{})};
      }
    }
    function setMerge(left,right,previous) {
      const a=new Set(left),z=new Set(right),old=new Set(previous||[]),all=new Set([...a,...z,...old]),merged=[];
      for(const value of all) {
        const hasBase=old.has(value),inLocal=a.has(value),inRemote=z.has(value);
        const keep=first?inLocal||inRemote:inLocal===hasBase?inRemote:inRemote===hasBase?inLocal:inLocal;
        if(keep)merged.push(value);
      }
      return merged;
    }
    out.mastered=setMerge(l.mastered,r.mastered,b?.mastered||[]).sort((a,b)=>a-b);
    out.saved=setMerge(l.saved,r.saved,b?.saved||[]).sort();
    out.celebrations=[...new Set([...l.celebrations,...r.celebrations,...(b?.celebrations||[])])].sort();
    const days=new Set([...Object.keys(l.checkins),...Object.keys(r.checkins),...Object.keys(b?.checkins||{})]);
    for(const day of days) {
      const left=l.checkins[day],right=r.checkins[day],prior=b?.checkins[day];
      const union=key=>[...new Set([...(left?.[key]||[]),...(right?.[key]||[]),...(prior?.[key]||[])])].sort((a,b)=>a-b);
      const entry={newIds:union('newIds'),reviewIds:union('reviewIds'),dueIds:union('dueIds'),checked:false};
      if(day===localDay())reconcileToday(entry,out.progress,out.mastered);else entry.checked=checked(entry);
      out.checkins[day]=entry;
    }
    for(const key of ['voice','rate','dailyGoal']) {
      if(first)out.settings[key]=!Object.is(l.settings[key],defaults[key])?l.settings[key]:r.settings[key];
      else if(Object.is(l.settings[key],b.settings[key]))out.settings[key]=r.settings[key];
      else if(Object.is(r.settings[key],b.settings[key]))out.settings[key]=l.settings[key];
      else out.settings[key]=l.settings[key];
    }
    return out;
  }
  const api={sanitize,merge,BOOK_ID};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.IELTS_CLOUD_STATE=api;
})(typeof window==='object'?window:globalThis);
