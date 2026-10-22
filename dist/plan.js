// 自适应每日计划；日期按使用设备的本地日历计算。
(function (root) {
  const dayMs=24*60*60*1000, reviewDays=[3,7,14,30,60];
  function localDay(date = new Date()) { return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`; }
  function validGoal(value) { return Number.isInteger(value) && value >= 1 && value <= 200; }
  function buildPlan(cards, progress, goal, now = new Date(), mastered=[]) {
    goal = validGoal(goal) ? goal : 10;
    const retired=new Set(mastered);
    const today = localDay(now), end = new Date(now);
    end.setHours(23,59,59,999);
    const records = Object.values(progress);
    const newToday = records.filter(p => (p.firstLearnedDay || p.day) === today).length;
    const unseen = cards.filter(c => !progress[c.id]&&!retired.has(c.id));
    const remainingNew = Math.min(Math.max(goal-newToday,0),unseen.length);
    const dueNow = cards.filter(c => !retired.has(c.id) && progress[c.id] && progress[c.id].due <= now.getTime()).sort((a,b)=>progress[a.id].due-progress[b.id].due||Number(!!progress[b.id].lastReviewHadError)-Number(!!progress[a.id].lastReviewHadError));
    const dueToday = cards.filter(c => !retired.has(c.id) && progress[c.id] && progress[c.id].due <= end.getTime());
    const later = dueToday.filter(c => progress[c.id].due > now.getTime());
    return {goal,today,newToday,remainingNew,newCards:unseen.slice(0,remainingNew),unseen:unseen.length,dueNow,dueToday,laterToday:later.length,nextReviewAt:later.length?Math.min(...later.map(c=>progress[c.id].due)):null,studiedToday:records.filter(p=>p.day===today).length,known:records.filter(p=>p.grade==='known').length};
  }
  function dueAt(now,days) {const next=new Date(now);next.setDate(next.getDate()+days);next.setHours(4,0,0,0);return next.getTime();}
  function recordGrade(previous,grade,now=new Date()) {
    if(!['again','unsure','known'].includes(grade))throw new RangeError('Unknown grade');
    const delay={again:10*60*1000,unsure:dayMs,known:3*dayMs}[grade];
    const day=localDay(now);return {grade,day,firstLearnedDay:previous?.firstLearnedDay||previous?.day||day,due:now.getTime()+delay};
  }
  function recordCompletion(previous, kind, now = new Date(), hadError=false) {
    const day=localDay(now), firstLearnedDay=previous?.firstLearnedDay||previous?.day||day;
    const stage=kind==='new'?0:hadError?0:Math.min(5,(Number.isInteger(previous?.reviewStage)?previous.reviewStage:0)+1);
    const days=kind==='new'||hadError?1:reviewDays[Math.min(stage-1,reviewDays.length-1)];
    return {grade:'known',day,firstLearnedDay,due:dueAt(now,days),reviewStage:stage,lastReviewHadError:kind==='review'&&hadError};
  }
  function resumeProgress(previous,now=new Date()) {
    if(!previous)return null;
    return {...previous,reviewStage:0,manualUnmarked:true,due:dueAt(now,1)};
  }
  // 将旧版固定的当地 09:00 到期安排移至同一天 04:00；不改短期重练时间。
  function migrateReviewTime(progress) {
    let changed=false;
    for(const record of Object.values(progress)) {
      const due=new Date(record.due);
      if(due.getHours()===9&&due.getMinutes()===0&&due.getSeconds()===0&&due.getMilliseconds()===0) {
        due.setHours(4,0,0,0);record.due=due.getTime();changed=true;
      }
    }
    return changed;
  }
  function recordCheckin(journal,day,activity={}) {
    const previous=JSON.stringify(journal[day]);
    const entry=journal[day]||(journal[day]={newIds:[],reviewIds:[],dueIds:[],checked:false});
    for(const key of ['newIds','reviewIds','dueIds'])entry[key]=[...new Set([...entry[key],...(activity[key]||[])])].sort((a,b)=>a-b);
    entry.checked=entry.newIds.length>=5||(entry.dueIds.length>0&&entry.dueIds.every(id=>entry.reviewIds.includes(id)));
    return previous!==JSON.stringify(entry);
  }
  function restoreCheckins(raw,validIds) {
    const journal={};
    if(!raw||typeof raw!=='object')return journal;
    for(const [day,value] of Object.entries(raw)){
      if(!/^\d{4}-\d{1,2}-\d{1,2}$/.test(day)||!value||typeof value!=='object')continue;
      const [y,m,d]=day.split('-').map(Number);if(localDay(new Date(y,m-1,d))!==day)continue;
      const activity={};for(const key of ['newIds','reviewIds','dueIds'])activity[key]=Array.isArray(value[key])?value[key].filter(id=>validIds.includes(id)):[];
      recordCheckin(journal,day,activity);
    }
    return journal;
  }
  const api = {localDay,validGoal,buildPlan,recordGrade,recordCompletion,resumeProgress,migrateReviewTime,recordCheckin,restoreCheckins};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IELTS_PLAN = api;
})(typeof window === 'object' ? window : globalThis);
