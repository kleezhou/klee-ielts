'use strict';
const {cards, glossary, book} = window.IELTS_DATA;
const cardIds = cards.map(c=>c.id);
const {localDay,validGoal,buildPlan,recordCompletion,resumeProgress,migrateReviewTime,recordCheckin,restoreCheckins} = window.IELTS_PLAN;
const Loop = window.IELTS_LOOP;
const $ = selector => document.querySelector(selector);
const icon = name => `<svg aria-hidden="true"><use href="#${name}"/></svg>`;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE_KEY = 'klee-ielts-v1';
const POS_NAMES = {'phr.':'短语','adj. phr.':'形容词短语','prep./adv.':'介词 / 副词','det. phr.':'限定词短语','n.':'名词','v.':'动词','adj.':'形容词','adv.':'副词','prep.':'介词','conj.':'连词','pron.':'代词','det.':'限定词','art.':'冠词','num.':'数词','det./num.':'限定词 / 序数词','inf.':'不定式标记','aux. v.':'助动词','modal v.':'情态动词','interj.':'感叹词','phr. v.':'短语动词','v. phr.':'动词短语','prep. phr.':'介词短语','conj. phr.':'连词短语','adv. phr.':'副词短语'};
const defaultState = () => ({index:0, progress:{}, mastered:[], saved:[], checkins:{}, celebrations:[], loops:{new:null,review:null}, spelling:{new:null,review:null}, settings:{voice:'',rate:0.9,dailyGoal:10},bookId:book?.id||'liu-hongbo-reading-538'});
let state = defaultState();
let storageAvailable = true;
try {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (data && typeof data === 'object') {
    state.checkins=restoreCheckins(data.checkins,cardIds);
    if(Array.isArray(data.mastered))state.mastered=[...new Set(data.mastered.filter(id=>cardIds.includes(id)))];
    if(Array.isArray(data.celebrations))state.celebrations=[...new Set(data.celebrations.filter(key=>typeof key==='string'&&/^\d{4}-\d{1,2}-\d{1,2}:(new|review|spelling)$/.test(key)))];
    if (Number.isInteger(data.index)) state.index = Math.max(0, Math.min(cards.length, data.index));
    if (Array.isArray(data.saved)) state.saved = [...new Set(data.saved.filter(key => typeof key === 'string' && Object.hasOwn(glossary,key)))];
    for (const card of cards) {
      const p = data.progress?.[card.id];
      if (p && ['again','unsure','known'].includes(p.grade) && Number.isFinite(p.due) && typeof p.day === 'string') state.progress[card.id] = {grade:p.grade, due:p.due, day:p.day, firstLearnedDay:typeof p.firstLearnedDay==='string'?p.firstLearnedDay:p.day, ...(Number.isInteger(p.reviewStage)&&p.reviewStage>=0&&p.reviewStage<=5?{reviewStage:p.reviewStage}:{}),...(p.lastReviewHadError===true?{lastReviewHadError:true}:{}),...(p.manualUnmarked===true?{manualUnmarked:true}:{})};
    }
    for(const kind of ['new','review']) {state.loops[kind]=Loop.restore(data.loops?.[kind],cardIds,kind);state.spelling[kind]=Loop.restoreSpelling(data.spelling?.[kind],cardIds,kind);}
    if (validGoal(data.settings?.dailyGoal)) state.settings.dailyGoal = data.settings.dailyGoal;
    if (typeof data.settings?.voice === 'string') state.settings.voice = data.settings.voice;
    if ([0.75,0.9,1].includes(data.settings?.rate)) state.settings.rate = data.settings.rate;
  }
} catch { storageAvailable = false; }
let mode='new', activeTab='study', popupWord='', toastTimer, audioStamp='', autoAudioText='', autoAudioStamp='', autoAudioLabel='本张单词和例句',libraryFilter='all';
let calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),calendarDay=localDay();
let celebrationTimer;
function toast(message,undoId=null) { const el=$('#toast');el.textContent=message;if(undoId){const button=document.createElement('button');button.className='toast-undo';button.dataset.undoMaster=String(undoId);button.textContent='撤销';el.append(' ',button);}el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4000); }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; toast('浏览器无法保存记录；本次进度只在当前页面保留。'); }
  window.IELTS_CLOUD?.changed();
}
function pruneMastered() {
  const retired=new Set(state.mastered);
  for(const kind of ['new','review']) {
    const loop=state.loops[kind];if(loop){loop.items=loop.items.filter(item=>!retired.has(item.id));if(loop.current&&retired.has(loop.current.id))loop.current=null;}
    const spell=state.spelling[kind];if(spell){spell.ids=spell.ids.filter(id=>!retired.has(id));spell.passed=spell.passed.filter(id=>!retired.has(id));spell.queue=spell.queue.filter(id=>!retired.has(id));if(spell.current&&retired.has(spell.current.id))spell.current=null;}
  }
  const entry=state.checkins[localDay()];if(entry){const wasChecked=entry.checked;entry.dueIds=entry.dueIds.filter(id=>!retired.has(id)||entry.reviewIds.includes(id));entry.checked=wasChecked||entry.newIds.length>=5||(entry.dueIds.length>0&&entry.dueIds.every(id=>entry.reviewIds.includes(id)));}
}
const capturedNew=captureCompletedNew();pruneMastered();if(capturedNew||state.mastered.length)persist();
if(migrateReviewTime(state.progress))persist();
function hideCelebration(){clearTimeout(celebrationTimer);$('#celebration').hidden=true;}
function celebrate(kind) {
  const key=`${localDay()}:${kind}`;
  if(state.celebrations.includes(key))return false;
  const content={new:['今天的新词，全都过关啦！','首页已解锁拼写，把今天的进步再写一遍。'],review:['今日复习，全部完成！','三轮回忆和拼写都过关，记忆又扎实了一点。'],spelling:['今天的新词，都拼对啦！','一笔一字写下的，都是你的进步。']}[kind];
  if(!content)return false;
  state.celebrations.push(key);persist();clearTimeout(celebrationTimer);
  $('#celebration-title').textContent=content[0];$('#celebration-message').textContent=content[1];
  $('#celebration-sparkles').innerHTML=Array.from({length:28},(_,i)=>{const angle=i*Math.PI*2/28,r=105+(i%4)*27;return `<i class="${i%3===0?'star':''}" style="--x:${Math.cos(angle)*r}px;--y:${Math.sin(angle)*r}px;--turn:${i*47}deg;--color:${['#b6c982','#e8c46b','#d99887','#8fae9b'][i%4]};--delay:${(i%4)*.04}s"></i>`;}).join('');
  $('#celebration').hidden=false;celebrationTimer=setTimeout(hideCelebration,3400);return true;
}
function dailyPlan() { return buildPlan(cards,state.progress,state.settings.dailyGoal,new Date(),state.mastered); }
function captureCompletedNew() {
  const loop=state.loops.new;if(!loop)return false;
  const ids=loop.items.filter(i=>i.done&&(state.progress[i.id]?.firstLearnedDay||state.progress[i.id]?.day)===loop.day).map(i=>i.id);
  return ids.length?recordCheckin(state.checkins,loop.day,{newIds:ids}):false;
}
function updateCheckin(plan) {
  let changed=captureCompletedNew();
  changed=recordCheckin(state.checkins,plan.today,{dueIds:plan.dueToday.map(c=>c.id)})||changed;
  if(changed)persist();
  const entry=state.checkins[plan.today],total=Object.values(state.checkins).filter(e=>e.checked).length;
  $('#checkin-status').textContent=entry.checked?'今日已自动打卡 ✓':`今日未打卡 · 新词 ${entry.newIds.length}/5`;
  $('#checkin-summary').textContent=`累计 ${total} 天 · ${entry.dueIds.length?`复习 ${entry.reviewIds.filter(id=>entry.dueIds.includes(id)).length}/${entry.dueIds.length}`:'今日无待复习'}`;
  if($('#calendar-dialog').open)renderCalendar();
}
function renderCalendar() {
  const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth(),today=localDay();
  $('#calendar-month').textContent=`${y} 年 ${m+1} 月`;
  $('#calendar-next').disabled=y===new Date().getFullYear()&&m===new Date().getMonth();
  const padding=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate();
  $('#calendar-grid').innerHTML=Array(padding).fill('<span></span>').join('')+Array.from({length:days},(_,i)=>{
    const date=new Date(y,m,i+1),day=localDay(date),entry=state.checkins[day],future=date>new Date(new Date().setHours(23,59,59,999));
    return `<button data-calendar-day="${day}" class="${entry?.checked?'checked ':''}${day===today?'today':''}" aria-label="${m+1}月${i+1}日${entry?.checked?'已打卡':'未打卡'}" aria-pressed="${day===calendarDay}"${future?' disabled':''}>${i+1}${entry?.checked?'<small>✓</small>':''}</button>`;
  }).join('');
  const entry=state.checkins[calendarDay],reviewed=entry?.reviewIds.filter(id=>entry.dueIds.includes(id)).length||0;
  $('#calendar-detail').innerHTML=`<strong>${escapeHTML(calendarDay.replaceAll('-',' / '))} · ${entry?.checked?'已打卡 ✓':'未打卡'}</strong><p>新词完成 ${entry?.newIds.length||0} 个（三轮）<br>${entry?.dueIds.length?`复习完成 ${reviewed} / ${entry.dueIds.length} 个（三轮＋拼写）`:'无当天待复习记录'}</p>`;
}
function currentLoop() { return state.loops[mode]; }
function isSpelling() {return mode.startsWith('spell-');}
function spellingKind() {return mode==='spell-review'?'review':'new';}
function currentSpelling() {return state.spelling[spellingKind()];}
function activeCard() { return mode==='all'?cards[state.index]:cards.find(c=>c.id===(isSpelling()?currentSpelling()?.current?.id:currentLoop()?.current?.id)); }
function syncLoop(kind) {
  const plan=dailyPlan();
  const loop=state.loops[kind] || Loop.create(kind,localDay());
  Loop.sync(loop,(kind==='new'?plan.newCards:plan.dueNow).map(c=>c.id),localDay());
  state.loops[kind]=loop;
  return loop;
}
function prepareSession(kind) { mode=kind; Loop.next(syncLoop(kind)); persist(); }
function navigate(route,replace=false) {
  if(location.hash!==`#${route}`)history[replace?'replaceState':'pushState'](null,'',`#${route}`);
  showRoute(route);
}
function resetSessionPosition() {
  if(activeTab!=='session')return;
  $('#session-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
  fitSessionViewport();
}
function updateStats() {
  const plan=dailyPlan();
  updateCheckin(plan);
  const inProgress=state.loops.new?.items.filter(i=>!i.done&&i.introduced).length||0;
  $('#today-count').textContent=plan.studiedToday;
  $('#known-count').textContent=plan.known;
  const learned=cards.filter(c=>state.progress[c.id]).length,percent=cards.length?learned/cards.length*100:0;
  $('#book-progress').setAttribute('aria-valuemax',String(cards.length));$('#book-progress').setAttribute('aria-valuenow',String(learned));
  $('#book-progress').setAttribute('aria-valuetext',`本书已学 ${learned} / ${cards.length} 个，标记已掌握 ${state.mastered.length} 个，完成 ${Math.floor(percent)}%`);
  $('#book-progress').setAttribute('title',`${book?.title||'本书'} · 已学 ${learned} / ${cards.length} · 已掌握 ${state.mastered.length}`);
  $('#book-progress-note').textContent=`${learned} / ${cards.length}`;
  $('#book-ring-value').setAttribute('stroke-dasharray',`${percent} 100`);
  $('#browse-all').textContent=`自由浏览全部 ${cards.length} 张 ↗`;
  $('#library-summary').textContent=`${book?.title||'当前词书'} · ${cards.length} 张词卡`;
  $('#book-source-note').textContent=`本书 ${cards.length} 个词／词组 · 主词及彩色替换词已导入`;

  $('#new-count').textContent=Math.max(plan.remainingNew,inProgress);
  $('#due-count').textContent=plan.dueToday.length;
  $('#daily-goal-label').textContent=`每天新学 ${plan.goal} 个`;
  $('#new-summary').textContent=`今日已完成 ${plan.newToday} / ${plan.goal}${inProgress?` · 练习中 ${inProgress}`:''}`;
  $('#review-summary').textContent=plan.dueToday.length?`现在到期 ${plan.dueNow.length} · 稍后到期 ${plan.laterToday}`:'今天暂时没有到期词卡';
  let message=inProgress?`还有 ${inProgress} 个词正在三轮练习中，可以接着上次的位置继续。`:plan.remainingNew?'选释义 → 借助例句回忆 → 只看单词回忆。':plan.newToday>=plan.goal?'今天的新词目标完成啦。还有余力，可以自由浏览。':'词库中的新词都学过啦，接下来按时复习就好。';
  if(plan.laterToday)message+=` 今天稍后还有 ${plan.laterToday} 个词到期。`;
  $('#plan-status').textContent=message;$('#saved-dot').hidden=state.saved.length===0;
  const ids=todayNewIds();
  $('#spelling-entry').hidden=!newSpellingReady(plan);
  const passed=state.spelling.new?.day===localDay()?state.spelling.new.passed.filter(id=>ids.includes(id)).length:0;
  $('#spelling-entry-note').textContent=`${passed?`已拼对 ${passed} / ${ids.length} · `:''}只看中文，试试能否写出来 ↗`;
}
function tokenize(text, target='') {
  const targetWords = target.toLowerCase().split(' ');
  return text.split(/([A-Za-z]+(?:['-][A-Za-z]+)*)/g).map(part => {
    const key = part.toLowerCase();
    if (!/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(part)) return escapeHTML(part);
    const root = glossary[key]?.lemma || key;
    const highlight = targetWords.includes(key) || targetWords.includes(root);
    return `<button class="token${highlight?' target':''}" data-word="${escapeHTML(key)}" aria-label="查看 ${escapeHTML(part)} 的释义">${escapeHTML(part)}</button>`;
  }).join('');
}
function savedButton(key) {
  const saved = state.saved.includes(key);
  return `<button class="save-button${saved?' saved':''}" data-save="${escapeHTML(key)}" aria-label="${saved?'移出生词本':'加入生词本'}" aria-pressed="${saved}">${icon('star')}</button>`;
}
function fullCardHtml(c) {
  return `<article class="word-card full-card"><div class="card-meta"><span>WORD ${String(c.order||c.id).padStart(2,'0')}</span><span class="tag">阅读考点</span></div><div class="card-title"><h2>${escapeHTML(c.word)}</h2><button class="pronounce" data-speak="${escapeHTML(c.word)}" aria-label="朗读 ${escapeHTML(c.word)}">${icon('sound')}</button></div><p class="ipa">${escapeHTML(c.ipa)}</p><div class="meaning-row"><p class="meaning">${escapeHTML(c.meaning)}</p>${savedButton(c.word)}${masteryButton(c)}</div>
  <div class="detail-switch" role="group" aria-label="词卡内容"><button data-card-panel="example" aria-pressed="true">例句</button><button data-card-panel="notes" aria-pressed="false">表达与用法</button><button class="detail-audio" data-speak="${escapeHTML(c.example)}" aria-label="朗读例句">${icon('sound')}</button><button data-speak="${escapeHTML(c.example)}" data-slow="true" aria-label="慢速朗读例句">0.75×</button></div>
  <div class="card-detail" data-detail="example"><div class="micro-heading"><span>在句子里认识它</span><span>点词查意思 ↗</span></div><p class="example">${tokenize(c.example,c.word)}</p><p class="translation">${escapeHTML(c.translation)}</p></div>
  <div class="card-detail" data-detail="notes" hidden><div class="micro-heading">一起记的表达</div><div class="synonyms">${c.synonyms.map(s=>`<button class="synonym" data-word="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('')}</div><p class="note">${escapeHTML(c.note)}</p></div></article>`;
}
function masteryButton(c) {const mastered=state.mastered.includes(c.id);return `<button class="master-toggle${mastered?' mastered':''}" data-master-card="${c.id}" aria-pressed="${mastered}" title="${mastered?'点击取消已掌握，恢复学习':'不再安排这个词的学习和复习'}">${mastered?'✓ 已掌握':'已掌握'}</button>`;}
function switchCardPanel(name) {
  if(!['example','notes'].includes(name))return;
  document.querySelectorAll('#study-card [data-detail]').forEach(panel=>{panel.hidden=panel.dataset.detail!==name;});
  document.querySelectorAll('#study-card [data-card-panel]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.cardPanel===name)));
}
function todayNewIds() {const today=localDay(),retired=new Set(state.mastered);return cards.filter(c=>!retired.has(c.id)&&state.progress[c.id]&&!state.progress[c.id].manualUnmarked&&(state.progress[c.id].firstLearnedDay||state.progress[c.id].day)===today).map(c=>c.id);}
function newSpellingReady(plan=dailyPlan()){return todayNewIds().length>0&&plan.newToday>0&&plan.remainingNew===0&&!state.loops.new?.items.some(i=>!i.done&&i.introduced);}
function reviewSpellReady() {const loop=state.loops.review;return !!(loop&&loop.items.length&&!loop.current&&loop.items.every(i=>i.done));}
function prepareSpelling(kind) {
  const ids=kind==='new'?todayNewIds():(state.loops.review?.items.filter(i=>i.done).map(i=>i.id)||[]);
  let spell=state.spelling[kind];
  if(!spell||(kind==='new'&&spell.day!==localDay()))spell=Loop.createSpelling(kind,localDay());
  // Review passes belong to this recall batch, rather than an earlier review day.
  if(kind==='review'){
    const items=state.loops.review?.items||[],passed=items.filter(item=>item.done&&item.spelled).map(item=>item.id);
    spell.passed=passed;
  }
  Loop.syncSpelling(spell,ids,localDay());Loop.nextSpelling(spell);state.spelling[kind]=spell;persist();
}
function renderSpelling() {
  const kind=spellingKind();
  $('#session-title').textContent=kind==='new'?'拼写今日新词':'复习拼写';
  $('#browse-pager').hidden=true;$('#learning-actions').innerHTML='';$('#loop-note').textContent='';
  $('#session-label').textContent='根据词性和中文释义，拼写英文单词或短语';
  if(kind==='review'&&!reviewSpellReady()) {
    const empty=state.loops.review?.items.length===0;
    $('#session-progress-text').textContent=empty?'没有待拼写词':'先完成三轮';$('#session-progress').value=0;
    $('#study-card').innerHTML=empty?'<div class="empty"><h2>当前没有待拼写的复习词。</h2><button class="primary" data-view="study">返回首页</button></div>':'<div class="empty"><h2>先完成三轮复习，再来拼写。</h2><button class="primary" data-session="review">继续三轮复习</button></div>';return;
  }
  const spell=currentSpelling(),q=spell?.current,total=spell?.ids.length||0;
  const passed=(spell?.passed.length||0)+(q?.phase==='reveal'&&q.correct&&!spell.passed.includes(q.id)?1:0);
  $('#session-progress-text').textContent=`已过 ${passed} / ${total}`;$('#session-progress').value=total?passed/total*100:0;
  if(!q) {
    $('#study-card').innerHTML=`<div class="empty">${icon('check')}<h2>${kind==='review'?(dailyPlan().dueToday.length?'本轮复习完成啦。':'今日复习完成啦。'):total?'这些词，都拼对啦。':'现在没有待拼写的新词。'}</h2><p>${kind==='review'?'三轮回忆和拼写均已完成，已经安排下次复习。':total?'今天的新词都拼对了，进步已经记下。':'当天新词背完后，就可以在首页进入拼写。'}</p><button class="primary" data-view="study">返回首页</button>${kind==='new'&&total?'<button class="text-button full" data-repeat-spelling="new">再拼一遍今日新词</button>':''}</div>`;return;
  }
  const c=activeCard();
  if(q.phase==='question') {
    $('#study-card').innerHTML=`<article class="word-card spelling-card"><div class="spelling-question-top"><p class="eyebrow">只看中文，写出英文</p>${masteryButton(c)}</div><h2 class="spell-meaning" id="spell-meaning">${escapeHTML(c.meaning)}</h2><form id="spell-form"><label class="sr-only" for="spell-answer">输入英文单词或短语</label><input id="spell-answer" type="text" name="spelling" class="spell-raw" tabindex="-1" aria-hidden="true" value="${escapeHTML(q.answer||'')}" readonly inputmode="none" aria-controls="spell-keyboard" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" maxlength="100" aria-describedby="spell-meaning" enterkeyhint="done" required><div id="spell-slots" class="spell-slots" role="textbox" tabindex="0" aria-label="拼写答案" aria-readonly="true" aria-describedby="spell-meaning">${spellingSlotsHtml(c,q.answer||'')}</div>${spellingKeyboardHtml()}<div class="spell-buttons"><button type="button" class="secondary" data-forget-spelling>忘记了</button><button type="submit" class="primary">提交拼写</button></div></form></article>`;
    $('#spell-answer').setSelectionRange?.((q.answer||'').length,(q.answer||'').length);
    $('#loop-note').textContent='每条短横线对应一个字母，短语中的空格也要输入。';
  } else {
    const lastCorrect=q.correct&&spell.ids.every(id=>id===q.id||spell.passed.includes(id));
    const missingSpaces=!q.correct&&!q.forgotten&&c.spellings.some(word=>Loop.normalizeSpelling(word).replace(/\s/g,'')===Loop.normalizeSpelling(q.answer).replace(/\s/g,''));
    const message=lastCorrect?`全部拼对啦！点下方按钮完成${kind==='review'?'复习':'今日拼写'}。`:q.correct?'这个词拼对了，继续保持。':q.forgotten?'没关系，先看一遍，稍后会再拼这个词。':missingSpaces?'字母拼对了，但词与词之间的空格不对。稍后再拼一次。':'对照标出的字母，核对后稍后再练。';
    $('#study-card').innerHTML=`<section class="spelling-feedback ${q.correct?'is-correct':q.forgotten?'is-forgotten':'is-wrong'}" role="status"><strong class="spelling-verdict">${q.correct?'✓ 拼对了':q.forgotten?'没想起来，先记一遍':'✕ 拼错了'}</strong><p>${escapeHTML(message)}</p>${spellingComparisonHtml(c,q)}</section>${fullCardHtml(c)}`;
    $('#learning-actions').innerHTML=`<button class="primary" data-continue-spelling>${lastCorrect?(kind==='review'?'完成复习':'完成今日拼写'):q.correct?'继续':'继续，稍后重新拼写'}</button>`;
  }
}
function spellingComparisonHtml(card,q) {
  const diff=Loop.compareSpelling(q.answer,card.spellings);
  const letters=field=>diff.cells.map(cell=>`<span class="spell-letter${cell.wrong?' '+(field==='answer'?'letter-error':'letter-correction'):''}${cell[field]?'':' letter-gap'}" aria-hidden="true">${escapeHTML(cell[field]===' '?'␣':cell[field]||'□')}</span>`).join('');
  return `<div class="spelling-comparison"><div><span class="comparison-label">你的拼写</span><div class="comparison-word" aria-label="你的拼写：${escapeHTML(q.forgotten?'未作答':diff.answer)}">${q.forgotten?'<span class="no-answer">未作答</span>':letters('answer')}</div></div><div><span class="comparison-label">正确拼写</span><div class="comparison-word" aria-label="正确拼写：${escapeHTML(diff.expected)}">${letters('expected')}</div></div></div>${!q.forgotten&&diff.cells.some(cell=>!cell.answer||!cell.expected||cell.answer===' '||cell.expected===' ')?'<small class="comparison-legend">□ 表示此处没有字符 · ␣ 表示空格</small>':''}`;
}
function spellingKeyboardHtml() {
  const key=(value,label=value)=>`<button type="button" data-spell-key="${escapeHTML(value)}" aria-label="${escapeHTML(value==='backspace'?'删除一个字母':label)}">${escapeHTML(label)}</button>`;
  return `<div id="spell-keyboard" class="spell-keyboard" role="group" aria-label="拼写字母键盘">${['qwertyuiop','asdfghjkl','zxcvbnm'].map((row,i)=>`<div class="spell-key-row row-${i}">${[...row].map(letter=>key(letter)).join('')}</div>`).join('')}<div class="spell-key-row symbols">${key('-')}${key("'")}${key('space','空格')}${key('backspace','⌫ 删除')}</div></div>`;
}
function spellingSlotsHtml(card,answer,cursor=answer.length) {
  let offset=0;
  const words=card.word.split(' ');
  const slots=words.map((word,wordIndex)=>{
    const letters=[...word].map(char=>{const i=offset++;return `<span class="spell-slot${/[a-z]/i.test(char)?'':' spell-separator'}${i===cursor?' current':''}" aria-hidden="true">${escapeHTML(answer[i]===' '?'':answer[i]||(/[a-z]/i.test(char)?'':char))}</span>`;}).join('');
    const gap=wordIndex<words.length-1?`<span class="spell-slot spell-gap${offset===cursor?' current':''}" aria-hidden="true">${escapeHTML(answer[offset++]?.trim()||'')}</span>`:'';
    return `<span class="spell-slot-word">${letters}</span>${gap}`;
  }).join('');
  return slots+(answer.length>card.word.length?`<small class="spell-overflow">多输入了 ${answer.length-card.word.length} 个字符，可按删除键修改</small>`:'');
}
function pressSpellingKey(key) {
  if(!isSpelling()||currentSpelling()?.current?.phase!=='question')return;
  const input=$('#spell-answer');
  if(!/^[a-z'-]$/.test(key)&&!['space','backspace','delete'].includes(key))return;
  let start=input.selectionStart??input.value.length,end=input.selectionEnd??start,value=input.value;
  if(key==='backspace'&&start===end)start=Math.max(0,start-1);
  if(key==='delete'&&start===end)end=Math.min(value.length,end+1);
  const text=['backspace','delete'].includes(key)?'':key==='space'?' ':key;
  value=(value.slice(0,start)+text+value.slice(end)).slice(0,100);start=Math.min(start+text.length,value.length);
  input.value=value;input.setSelectionRange?.(start,start);input.setCustomValidity('');
  $('#spell-slots').innerHTML=spellingSlotsHtml(activeCard(),value,start);
  $('#spell-slots').setAttribute('aria-label',value?`拼写答案：${value}`:'拼写答案，尚未输入');
  currentSpelling().current.answer=value;persist();
}
function submitSpellingForm(input) {
  const spell=currentSpelling(),c=activeCard();
  if(!spell||!c)return;
  if(!Loop.normalizeSpelling(input.value)){toast('请先输入英文单词或短语。');return;}
  if(!Loop.submitSpelling(spell,input.value,c.spellings))return;
  $('#spell-answer')?.blur();
  persist();renderStudy();resetSessionPosition();announceCurrent();
}
function forgetCurrentSpelling(){
  if(!isSpelling()||!Loop.forgetSpelling(currentSpelling()))return;
  $('#spell-answer')?.blur();persist();renderStudy();resetSessionPosition();announceCurrent();
}
function continueSpelling() {
  if(!isSpelling())return;
  const spell=currentSpelling();if(!spell)return;
  const spellingQuestion=spell.current,reviewItem=spellingKind()==='review'?state.loops.review?.items.find(i=>i.id===spellingQuestion?.id):null;
  if(reviewItem&&spellingQuestion?.phase==='reveal'&&!spellingQuestion.correct)reviewItem.lapses++;
  const result=Loop.advanceSpelling(spell);if(!result.advanced)return;stopSpeech();
  if(result.completedId!==null&&spellingKind()==='review') {
    const completedItem=state.loops.review?.items.find(i=>i.id===result.completedId),hadError=!!completedItem?.lapses;
    state.progress[result.completedId]=recordCompletion(state.progress[result.completedId],'review',new Date(),hadError);
    recordCheckin(state.checkins,localDay(),{reviewIds:[result.completedId],dueIds:[result.completedId]});
    const item=state.loops.review?.items.find(i=>i.id===result.completedId);if(item)item.spelled=true;
  }
  Loop.nextSpelling(spell);persist();renderStudy();resetSessionPosition();announceCurrent();
  if(result.completedId!==null&&!spell.current&&spell.ids.length&&spell.passed.length===spell.ids.length){
    if(spellingKind()==='new'&&newSpellingReady()&&todayNewIds().every(id=>spell.passed.includes(id)))celebrate('spelling');
    const entry=state.checkins[localDay()];
    if(spellingKind()==='review'&&entry?.dueIds.length&&entry.dueIds.every(id=>entry.reviewIds.includes(id))&&dailyPlan().dueToday.length===0)celebrate('review');
  }
}
function optionData(card,key) { return key===0?{word:card.word,meaning:card.meaning}:card.distractors[key-1]; }
function choiceHtml(card,q,key,index) {
  const option=optionData(card,key),wrong=q.wrongChoices.includes(key);
  return `<button data-choice="${key}"${wrong?' class="wrong-choice"':''}><span>${'ABCD'[index]}</span><b>${escapeHTML(option.meaning.replace(/^(?:v\.|n\.|adj\.|pron\.|conj\.|短语)\s*/,''))}${wrong?`<small class="choice-word">× ${escapeHTML(option.word)} ${icon('sound')}</small>`:''}</b></button>`;
}
function renderStudy() {
  updateStats();
  if(activeTab!=='session')return;
  $('.voice-banner').hidden=mode!=='all';
  if(isSpelling()){renderSpelling();return;}
  $('#session-title').textContent={new:'今日新学',review:'今日复习',all:'自由浏览'}[mode];
  $('#session-label').textContent=mode==='all'?'自由浏览':'每个词三轮回忆，答错从第一轮再来';
  $('#browse-pager').hidden=mode!=='all';
  $('#learning-actions').innerHTML='';$('#loop-note').textContent='';
  let c;
  if(mode==='all') {
    c=activeCard();
    $('#session-progress-text').textContent=`${Math.min(state.index+1,cards.length)} / ${cards.length}`;
    $('#session-progress').value=Math.min(state.index,cards.length)/cards.length*100;
    $('#card-position').textContent=`${Math.min(state.index+1,cards.length)} / ${cards.length}`;
    $('#previous').disabled=state.index<=0;$('#next').disabled=!c;
    $('#study-card').innerHTML=c?fullCardHtml(c):`<div class="empty"><h2>这一组，看完啦。</h2><button class="primary" data-view="study">返回首页</button></div>`;
    return;
  }
  let loop=currentLoop();
  if(!loop||loop.day!==localDay()){loop=syncLoop(mode);Loop.next(loop);persist();}
  const q=loop.current;
  const total=loop.items.length, completed=loop.items.filter(i=>i.done).length;
  $('#session-progress-text').textContent=`已过 ${completed} / ${total}`;
  $('#session-progress').value=total?completed/total*100:0;
  if(!q) {
    const plan=dailyPlan();
    const title=total&&completed===total?(mode==='review'?'三轮过关，接下来练拼写。':'这一组，三轮都过关啦。'):mode==='new'?'今天的新词目标完成啦。':'现在没有到期词卡。';
    const message=mode==='new'&&todayNewIds().length?'首页已解锁“拼写今日新词”，可以只看中文练拼写。':mode==='review'&&plan.laterToday?`今天稍后还有 ${plan.laterToday} 个到期，最近一批在 ${new Date(plan.nextReviewAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}。`:total?'完成的词已安排下次复习。你可以回首页看看今日计划。':'可以返回首页查看计划，或在词库中查看全部单词。';
    $('#study-card').innerHTML=`<div class="empty">${icon('leaf')}<h2>${escapeHTML(title)}</h2><p>${escapeHTML(message)}</p>${mode==='review'&&total?'<button class="primary" data-session="spell-review">进入拼写</button>':'<button class="primary" data-view="study">返回首页</button>'}</div>`;
    return;
  }
  c=activeCard();
  const stageLabel=['','选出正确释义','借助例句回忆','只看单词回忆'][q.stage];
  const badge=`<div class="round-heading"><span>第 ${q.stage} 轮 · ${stageLabel}</span><span class="round-dots" aria-label="共三轮">${[1,2,3].map(n=>`<i class="${n<=q.stage?'filled':''}"></i>`).join('')}</span>${masteryButton(c)}</div>`;
  if(q.phase==='question') {
    const question=`<article class="word-card quiz-card">${badge}<div class="card-title"><h2>${escapeHTML(c.word)}</h2></div>${q.stage===2?`<p class="quiz-example">${escapeHTML(c.example)}</p>`:''}${q.stage===1?`<p class="quiz-instruction">${q.wrongChoices.length?'红色选项不是这个词的意思，再选一次。':'选出这个词的正确释义'}</p><div class="quiz-options">${q.order.map((key,i)=>choiceHtml(c,q,key,i)).join('')}</div>`:`<p class="recall-prompt">先在心里想好意思，再展开核对。</p>`}</article>`;
    $('#study-card').innerHTML=question;
    if(q.stage>1)$('#learning-actions').innerHTML=`<button class="secondary" data-recall="no">不记得</button><button class="primary" data-recall="yes">记得，展开核对</button>`;
    $('#loop-note').textContent=q.stage===1?'先选释义，选完再看例句、听发音。':'回忆时先不朗读，展开答案后再听。';
  } else {
    let feedback=q.correct?(q.stage===1?'选对了，看看它的用法。':'核对一下，你刚才想对了吗？'):'没关系，这个词会从第一轮重新练习。';
    if(q.stage===1&&q.choice===0&&q.wrongChoices.length)feedback='选对了！刚才有选错，这个词稍后会从第一轮再练。';
    if(q.stage===1&&q.choice!==null&&q.choice!==0){const chosen=optionData(c,q.choice);feedback=`你选的是 ${chosen.word}：${chosen.meaning}。本题是 ${c.word}。`;}
    $('#study-card').innerHTML=`<p class="answer-feedback ${q.correct?'':'needs-review'}" role="status">${escapeHTML(feedback)}</p>${fullCardHtml(c)}`;
    $('#learning-actions').innerHTML=`${q.correct?'<button class="secondary" data-mistake>其实记错了</button>':''}<button class="primary" data-continue>${q.correct?'核对好了，继续':'继续，稍后再练'}</button>`;
    $('#loop-note').textContent=q.correct?'记错了也没关系，点“其实记错了”就会重新安排。':'隔开其他词后再遇见；只剩一个词时会继续练它。';
  }
}
function answerQuestion(correct,choice=null) {
  if(!['new','review'].includes(mode)||!Loop.answer(currentLoop(),correct,choice))return;
  persist();renderStudy();
  const q=currentLoop().current;
  if(q.stage===1&&q.phase==='question'){
    const word=optionData(activeCard(),choice).word,button=$(`.quiz-options [data-choice="${choice}"]`);
    button?.focus({preventScroll:true});autoAudioText=word;autoAudioStamp=`${mode}:${q.serial}:wrong:${choice}`;autoAudioLabel=`易混词 ${word}`;
    speak(word,button,false,true,autoAudioStamp,autoAudioLabel);
  }else{resetSessionPosition();announceCurrent();}
}
function markMistake() {if(!['new','review'].includes(mode)||!Loop.mistake(currentLoop()))return;persist();renderStudy();resetSessionPosition();}
function continueLearning() {
  if(mode==='all'||currentLoop()?.current?.phase!=='reveal')return;
  stopSpeech();
  const result=Loop.advance(currentLoop());if(!result.advanced)return;
  if(result.completedId!==null&&mode==='new')state.progress[result.completedId]=recordCompletion(state.progress[result.completedId],'new');
  Loop.next(currentLoop());persist();
  if(mode==='review'&&reviewSpellReady()){navigate('spell-review',true);return;}
  renderStudy();resetSessionPosition();announceCurrent();
  if(mode==='new'&&result.completedId!==null&&newSpellingReady())celebrate('new');
}
function announceCurrent() {
  autoAudioLabel='本张单词和例句';
  $('#auto-audio').hidden=true;
  if(activeTab!=='session'||mode==='all')return;
  const spelling=isSpelling(),q=spelling?currentSpelling()?.current:currentLoop()?.current,c=activeCard();
  if(!q||!c){setSpeechStatus(spelling?'本轮拼写已完成，可以返回首页。':'本轮已结束，可以返回首页。');return;}
  if(q.phase==='question'){
    if(!spelling){stopSpeech();autoAudioText='';autoAudioStamp='';}
    setSpeechStatus(spelling?'每条横线填一个字母；短语的空格也要输入。':'这一轮先回忆，展开答案后再听单词和例句。');return;
  }
  const stamp=`${mode}:${q.serial}:${q.phase}`;
  if(audioStamp===stamp)return;
  autoAudioStamp=stamp;autoAudioText=`${c.word}. ${c.example}`;
  speak(autoAudioText,null,false,true,autoAudioStamp);
}
function renderLibrary() {
  if(activeTab!=='library')return;
  const query = $('#search').value.trim().toLowerCase();
  const retired=new Set(state.mastered);$('#mastered-count').textContent=retired.size;$('#library-total-count').textContent=cards.length;
  document.querySelectorAll('[data-library-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.libraryFilter===libraryFilter)));
  const filtered = cards.filter(c => (libraryFilter==='all'||retired.has(c.id))&&`${c.word} ${c.meaning} ${c.synonyms.join(' ')}`.toLowerCase().includes(query));
  $('#word-list').innerHTML = filtered.length ? filtered.map(c => `<div class="list-item"><span class="list-index">${String(c.order||c.id).padStart(2,'0')}</span><button class="list-main" data-open-card="${c.id}"><strong>${escapeHTML(c.word)}</strong><small>${escapeHTML(c.meaning)}</small></button><button class="pronounce" data-speak="${escapeHTML(c.word)}" aria-label="朗读 ${escapeHTML(c.word)}">${icon('sound')}</button>${savedButton(c.word)}</div>`).join('') : '<p class="empty">这本词书里还没有这个词。</p>';
}
function toggleMastered(id) {
  const card=cards.find(c=>c.id===id);if(!card)return;
  captureCompletedNew();stopSpeech();
  const index=state.mastered.indexOf(id),undo=index>=0;
  if(undo){state.mastered.splice(index,1);if(state.progress[id]){state.progress[id]=resumeProgress(state.progress[id]);for(const kind of ['new','review']){const loop=state.loops[kind];if(loop){loop.items=loop.items.filter(item=>item.id!==id);if(loop.current?.id===id)loop.current=null;}const spell=state.spelling[kind];if(spell){spell.ids=spell.ids.filter(value=>value!==id);spell.passed=spell.passed.filter(value=>value!==id);spell.queue=spell.queue.filter(value=>value!==id);if(spell.current?.id===id)spell.current=null;}}}}
  else state.mastered.push(id);
  pruneMastered();
  if(activeTab==='session'&&mode==='new'||activeTab==='session'&&mode==='review'){
    const loop=syncLoop(mode);Loop.next(loop);
  } else if(activeTab==='session'&&isSpelling()) {
    const kind=spellingKind(),spell=currentSpelling(),ids=kind==='new'?todayNewIds():(state.loops.review?.items.filter(i=>i.done).map(i=>i.id)||[]);
    if(spell){Loop.syncSpelling(spell,ids,localDay());Loop.nextSpelling(spell);}
  }
  persist();renderStudy();renderLibrary();resetSessionPosition();announceCurrent();
  toast(undo?'已撤销掌握；已学词安排明天复习。':'已加入已掌握，之后不会进入学习队列。',undo?null:id);
}
function renderSaved() {
  if(activeTab!=='saved')return;
  $('#saved-count').textContent = `已收下 ${state.saved.length} 个词与表达`;
  $('#saved-list').innerHTML = state.saved.length ? state.saved.map(key => `<div class="list-item"><button class="list-main" data-word="${escapeHTML(key)}"><strong>${escapeHTML(key)}</strong><small>${escapeHTML(glossary[key].meaning)}</small></button><button class="pronounce" data-speak="${escapeHTML(key)}" aria-label="朗读 ${escapeHTML(key)}">${icon('sound')}</button>${savedButton(key)}</div>`).join('') : `<div class="empty">${icon('star')}<p>例句里遇到不熟的词？<br>点它，再选“加入生词本”。</p></div>`;
}
function toggleSaved(key) {
  if (!Object.hasOwn(glossary,key)) return;
  const index = state.saved.indexOf(key);
  if (index < 0) state.saved.push(key); else state.saved.splice(index,1);
  persist();
  if (storageAvailable) toast(index < 0 ? '收进生词本了，下次再见。' : '已移出生词本');
  renderStudy(); renderLibrary(); renderSaved();
  if ($('#word-dialog').open && popupWord === key) updatePopupSave();
}
function updatePopupSave() {
  const button = $('#popup-save');
  if (!button) return;
  const saved = state.saved.includes(popupWord);
  button.textContent = saved ? '已收进生词本 · 点击移出' : '加入生词本';
  button.setAttribute('aria-pressed',saved);
}
function showWord(key) {
  key = key.toLowerCase();
  const entry = Object.hasOwn(glossary,key) ? glossary[key] : null;
  if (!entry) { toast('这个表达还未收录。'); return; }
  popupWord = key;
  const card = cards.find(c => c.word === key);
  const context = activeTab === 'session' ? activeCard()?.example : '';
  const senses=entry.senses||[];
  $('#word-detail').innerHTML = `<div class="popup-title"><h2>${escapeHTML(key)}</h2><button class="pronounce" data-speak="${escapeHTML(key)}" aria-label="朗读 ${escapeHTML(key)}">${icon('sound')}</button></div>${card?`<p class="ipa">${escapeHTML(card.ipa)}</p>`:''}${entry.lemma!==key?`<p class="lemma">原形：${escapeHTML(entry.lemma)}</p>`:''}${entry.senseWord?`<p class="popup-form">当前词形：${escapeHTML(entry.meaning)}</p>`:''}<p class="senses-heading">${entry.senseWord?`原形 ${escapeHTML(entry.senseWord)} 的词性与释义`:'词性与释义'}</p><dl class="word-senses">${senses.map(s=>`<div><dt><b>${escapeHTML(s.pos)}</b><span>${escapeHTML(POS_NAMES[s.pos]||'短语')}</span></dt><dd>${escapeHTML(s.meaning)}</dd></div>`).join('')}</dl>${context?`<details class="popup-example"><summary>查看原例句</summary><p class="popup-context">${escapeHTML(context)}</p></details>`:''}<p class="popup-footnote">同一个词在不同句子中，词性和意思可能不同。</p><button id="popup-save" class="primary full" data-save="${escapeHTML(key)}"></button>`;
  updatePopupSave();
  if (!$('#word-dialog').open) $('#word-dialog').showModal();
}
function showRoute(route) {
  if(!['study','new','review','browse','spell-new','spell-review','library','saved'].includes(route))route='study';
  hideCelebration();stopSpeech();
  if(['new','review'].includes(route))prepareSession(route);
  if(route==='review'&&reviewSpellReady()) {route='spell-review';history.replaceState(null,'','#spell-review');}
  activeTab=['new','review','browse','spell-new','spell-review'].includes(route)?'session':route;
  if(route==='browse')mode='all';
  if(route.startsWith('spell-')){mode=route;prepareSpelling(spellingKind());}
  for(const name of ['study','session','library','saved'])$(`#${name}-view`).hidden=name!==activeTab;
  for(const name of ['study','library','saved']){
    const navButton=document.querySelector(`.bottom-nav [data-view="${name}"]`);
    if(name===(activeTab==='session'?'study':activeTab))navButton.setAttribute('aria-current','page');else navButton.removeAttribute('aria-current');
  }
  document.body.classList.toggle('in-session',activeTab==='session');
  fitSessionViewport();
  document.title=`${{new:'今日新学 · ',review:'今日复习 · ',browse:'自由浏览 · ','spell-new':'拼写今日新词 · ','spell-review':'复习拼写 · '}[route]||''}Klee 的雅思词卡`;
  renderStudy();renderLibrary();renderSaved();window.scrollTo({top:0,behavior:'instant'});
  const heading=document.querySelector(`#${activeTab}-view h1`);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  announceCurrent();
}
// 直接在用户点击事件中 speak，保留移动端要求的用户手势。
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voices=[],speechId=0,currentUtterance=null,currentSpeech=null,speechTimer,speechDelay,lastSpeechCancel=0,speechSessionStarted=false;
function setSpeechStatus(message) {$('#voice-status').textContent=message;$('#settings-status').textContent=message;}
function refreshVoices() {
  voices=synth?synth.getVoices().filter(v=>/^en(?:[-_]|$)/i.test(v.lang)):[];
  const select=$('#voice-select');select.innerHTML='<option value="">自动选择（优先英式英语）</option>';
  for(const v of voices){const option=document.createElement('option');option.value=v.voiceURI;option.textContent=`${v.name} · ${v.lang}${v.localService?' · 本机':''}`;select.append(option);}
  select.value=voices.some(v=>v.voiceURI===state.settings.voice)?state.settings.voice:'';
}
function detachUtterance(u) {if(u)u.onstart=u.onboundary=u.onresume=u.onend=u.onerror=null;}
function stopSpeech() {
  speechId++;clearTimeout(speechTimer);clearTimeout(speechDelay);
  const busy=!!(currentUtterance||synth?.speaking||synth?.pending);
  detachUtterance(currentUtterance);currentSpeech=null;currentUtterance=null;
  // Safari 的取消操作可能异步完成，空闲时不要反复 cancel 后立刻 speak。
  if(synth&&busy){lastSpeechCancel=Date.now();synth.cancel();}
  document.querySelectorAll('.playing').forEach(b=>{b.classList.remove('playing');b.removeAttribute('aria-busy');});
}
function speak(text,button,slow=false,automatic=false,stamp='',label='本张单词和例句') {
  stopSpeech();
  if(!synth||!('SpeechSynthesisUtterance' in window)){
    setSpeechStatus('此浏览器没有朗读功能，请用 Safari 或 Chrome 打开。');
    if(!automatic&&!$('#settings-dialog').open)$('#settings-dialog').showModal();return;
  }
  const request={id:speechId,attempt:0,started:false};currentSpeech=request;
  function valid(u) {return currentSpeech===request&&speechId===request.id&&(!u||currentUtterance===u);}
  function clearRequest() {
    clearTimeout(speechTimer);clearTimeout(speechDelay);detachUtterance(currentUtterance);
    currentUtterance=null;currentSpeech=null;button?.classList.remove('playing');button?.removeAttribute('aria-busy');
  }
  function fail(message) {
    if(!valid())return;
    if(stamp&&audioStamp===stamp)audioStamp='';
    clearRequest();setSpeechStatus(message);
    if(automatic){$('#auto-audio').textContent=`🔊 重试${label}`;$('#auto-audio').hidden=false;}
  }
  function recover() {
    if(!valid())return;
    if(stamp&&audioStamp===stamp)audioStamp='';
    if(request.attempt>=1){
      const busy=!!(currentUtterance||synth.speaking||synth.pending);
      detachUtterance(currentUtterance);currentUtterance=null;
      if(busy){lastSpeechCancel=Date.now();synth.cancel();}
      fail(automatic?'手机语音还没有开始，点播放按钮直接播放。':'手机语音未开始，请再点一次小喇叭，或换一个英语声音。');return;
    }
    clearTimeout(speechTimer);detachUtterance(currentUtterance);currentUtterance=null;
    lastSpeechCancel=Date.now();synth.cancel();request.attempt++;request.started=false;
    setSpeechStatus('正在重新准备朗读…');speechDelay=setTimeout(launch,120);
  }
  function launch() {
    if(!valid())return;
    refreshVoices();
    const u=new SpeechSynthesisUtterance(text);
    // 重试时交给系统选择英语声音，避开尚未就绪的指定语音。
    const voice=request.attempt?null:(voices.find(v=>v.voiceURI===state.settings.voice)||voices.find(v=>v.localService&&/^en[-_]GB$/i.test(v.lang))||voices.find(v=>/^en[-_]GB$/i.test(v.lang))||voices.find(v=>v.localService)||voices[0]);
    if(voice){u.voice=voice;u.lang=voice.lang;}else u.lang='en-GB';
    u.rate=slow?0.75:state.settings.rate;u.volume=1;request.started=false;currentUtterance=u;
    function markStarted() {
      if(!valid(u)||request.started)return;request.started=true;speechSessionStarted=true;clearTimeout(speechTimer);
      if(stamp)audioStamp=stamp;
      $('#auto-audio').hidden=true;setSpeechStatus(`正在朗读 · ${voice?voice.name:'设备英语声音'}${slow?' · 慢速':''}`);
    }
    // start 通知可能迟到或缺失；词边界和引擎状态同样能证明已开始。
    u.onstart=u.onboundary=u.onresume=markStarted;
    u.onend=e=>{
      if(!valid(u))return;
      if(!request.started&&(e?.elapsedTime>0||e?.charIndex>0))markStarted();
      if(!request.started){recover();return;}
      clearRequest();$('#auto-audio').hidden=true;setSpeechStatus('朗读结束。');
    };
    u.onerror=e=>{
      if(!valid(u))return;
      if(e.error==='not-allowed'){
        fail('Safari 需要你点一下“播放”来开启本页声音。');return;
      }
      // 已经读到一半的请求不要自动从头重播；启动失败才自动重试。
      if(request.started)fail('朗读被设备中断，点播放按钮重读本张。');else recover();
    };
    function checkStart(waited=0) {
      if(!valid(u)||request.started)return;
      if(synth.speaking){markStarted();return;}
      if(waited>=6000){recover();return;}
      speechTimer=setTimeout(()=>checkStart(waited+200),200);
    }
    checkStart();
    try{synth.speak(u);if(valid(u)&&synth.paused)synth.resume();if(valid(u)&&synth.speaking)markStarted();}
    catch {recover();}
  }
  button?.classList.add('playing');button?.setAttribute('aria-busy','true');
  if(automatic){$('#auto-audio').textContent=`🔊 立即播放${label}`;$('#auto-audio').hidden=false;}
  setSpeechStatus('等待设备开始朗读；也可以点播放按钮立即播放。');
  // 已有语音正在播放时，让 Safari 先完成取消；首次手势中则立即启动。
  const wait=speechSessionStarted?Math.max(0,120-(Date.now()-lastSpeechCancel)):0;
  if(wait)speechDelay=setTimeout(launch,wait);else launch();
}
if(synth) {refreshVoices();synth.addEventListener('voiceschanged',refreshVoices);}
$('#rate-select').value=String(state.settings.rate);
$('#voice-select').addEventListener('change',e=>{state.settings.voice=e.target.value;persist();});
$('#rate-select').addEventListener('change',e=>{state.settings.rate=Number(e.target.value);persist();});
$('#settings-open').addEventListener('click',()=>{refreshVoices();$('#settings-dialog').showModal();});
for(const id of ['test-sound','settings-test']) $(`#${id}`).addEventListener('click',e=>speak('Hello Klee. Let us learn a little every day.',e.currentTarget));
$('#stop-sound').addEventListener('click',()=>{stopSpeech();setSpeechStatus('已停止朗读。');});
$('#search').addEventListener('input',renderLibrary);
$('#previous').addEventListener('click',()=>{if(mode!=='all')return;stopSpeech();state.index=Math.max(0,state.index-1);persist();renderStudy();resetSessionPosition();});
$('#next').addEventListener('click',()=>{if(mode!=='all'||!activeCard())return;stopSpeech();state.index++;persist();renderStudy();resetSessionPosition();});
$('#auto-audio').addEventListener('click',e=>speak(autoAudioText,e.currentTarget,false,true,autoAudioStamp,autoAudioLabel));
function browseAll() { navigate('browse'); }
$('#browse-all').addEventListener('click',browseAll);
$('#calendar-open').addEventListener('click',()=>{calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);calendarDay=localDay();updateStats();renderCalendar();$('#calendar-dialog').showModal();});
for(const [id,step] of [['calendar-prev',-1],['calendar-next',1]])$(`#${id}`).addEventListener('click',()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+step,1);calendarDay=localDay(calendarMonth);renderCalendar();});
$('#plan-open').addEventListener('click',()=>{ $('#daily-goal').value=String(state.settings.dailyGoal); $('#daily-goal').setCustomValidity(''); $('#plan-dialog').showModal(); });
$('#daily-goal').addEventListener('input',e=>e.target.setCustomValidity(''));
$('#daily-form').addEventListener('submit',e=>{
  e.preventDefault();
  const input=$('#daily-goal'), value=Number(input.value);
  if(!validGoal(value)) {input.setCustomValidity('请输入 1 到 200 之间的整数。');input.reportValidity();return;}
  state.settings.dailyGoal=value;persist();$('#plan-dialog').close();if(state.loops.new)syncLoop('new');renderStudy();
  if(storageAvailable)toast(`每天新学 ${value} 个，计划已保存。`);
});
$('#backup').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'Klee 雅思词卡',version:1,...state},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='klee-ielts-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
document.addEventListener('click',e=>{
  const button=e.target.closest('button'); if(!button)return;
  if(button.dataset.spellKey!==undefined)pressSpellingKey(button.dataset.spellKey);
  else if(button.dataset.cardPanel) switchCardPanel(button.dataset.cardPanel);
  else if(button.dataset.celebrationClose!==undefined)hideCelebration();
  else if(button.dataset.calendarDay){calendarDay=button.dataset.calendarDay;renderCalendar();}
  else if(button.dataset.masterCard)toggleMastered(Number(button.dataset.masterCard));
  else if(button.dataset.undoMaster)toggleMastered(Number(button.dataset.undoMaster));
  else if(button.dataset.libraryFilter){libraryFilter=button.dataset.libraryFilter;renderLibrary();}
  else if(button.dataset.speak!==undefined) speak(button.dataset.speak,button,button.dataset.slow==='true');
  else if(button.dataset.word!==undefined) showWord(button.dataset.word);
  else if(button.dataset.save!==undefined) toggleSaved(button.dataset.save);
  else if(button.dataset.close) document.getElementById(button.dataset.close)?.close();
  else if(button.dataset.view) navigate(button.dataset.view);
  else if(button.dataset.forgetSpelling!==undefined)forgetCurrentSpelling();
  else if(button.dataset.continueSpelling!==undefined) continueSpelling();
  else if(button.dataset.repeatSpelling) {state.spelling.new=Loop.createSpelling('new',localDay());navigate('spell-new');}
  else if(button.dataset.choice!==undefined) answerQuestion(Number(button.dataset.choice)===0,Number(button.dataset.choice));
  else if(button.dataset.recall) answerQuestion(button.dataset.recall==='yes');
  else if(button.dataset.mistake!==undefined) markMistake();
  else if(button.dataset.continue!==undefined) continueLearning();
  else if(button.dataset.session) navigate(button.dataset.session);
  else if(button.dataset.goal) {$('#daily-goal').value=button.dataset.goal;$('#daily-goal').setCustomValidity('');}
  else if(button.dataset.openCard) {state.index=cards.findIndex(c=>c.id===Number(button.dataset.openCard));persist();browseAll();}
});
for(const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
document.addEventListener('submit',e=>{if(e.target.id==='spell-form'){e.preventDefault();submitSpellingForm($('#spell-answer'));}});
document.addEventListener('input',e=>{if(e.target.id==='spell-answer')e.target.setCustomValidity('');});
document.addEventListener('keydown',e=>{
  if(!isSpelling()||currentSpelling()?.current?.phase!=='question'||!e.target.closest?.('#spell-form')||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='Enter'){e.preventDefault();submitSpellingForm($('#spell-answer'));return;}
  const key=e.key==='Backspace'?'backspace':e.key==='Delete'?'delete':e.key===' '?'space':e.key.toLowerCase();
  if(/^[a-z'-]$/.test(key)||['backspace','delete','space'].includes(key)){e.preventDefault();pressSpellingKey(key);}
});
window.addEventListener('hashchange',()=>showRoute(location.hash.slice(1)));
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopSpeech();setSpeechStatus('朗读已暂停；点小喇叭重新播放。');}else renderStudy();});
setInterval(()=>{if(!document.hidden){if(activeTab==='session'&&mode!=='all'&&!isSpelling()&&(!currentLoop()?.current||currentLoop().day!==localDay())){syncLoop(mode);Loop.next(currentLoop());persist();renderStudy();}else updateStats();}},60000);
function fitSessionViewport(){
  const viewport=window.visualViewport,height=viewport?.height||window.innerHeight;
  if(!Number.isFinite(height))return;
  document.documentElement?.style.setProperty('--session-height',`${height}px`);
  document.documentElement?.style.setProperty('--session-top',`${viewport?.offsetTop||0}px`);
  document.body.classList.toggle('compact-session',height<520);
  document.body.classList.toggle('keyboard-open',document.activeElement?.id==='spell-answer'&&window.innerHeight-height>100);
}
function refreshSessionViewport(){fitSessionViewport();window.requestAnimationFrame?.(fitSessionViewport);}
window.visualViewport?.addEventListener('resize',refreshSessionViewport);
window.visualViewport?.addEventListener('scroll',refreshSessionViewport);
window.addEventListener('resize',refreshSessionViewport);
document.addEventListener('focusin',fitSessionViewport);document.addEventListener('focusout',fitSessionViewport);
fitSessionViewport();
// 先保存上一次三轮完成的证据，再让路由切换到新的一天。
updateCheckin(dailyPlan());
showRoute(location.hash.slice(1)||'study');
if(!synth) setSpeechStatus('此浏览器不支持朗读，请在手机 Safari 或 Chrome 中打开。');
if(!storageAvailable) toast('浏览器未能读取记录；可继续学习，保存情况请留意提示。');

// Apply durable records without replacing this device's unfinished question or spelling draft.
function applyCloudState(next) {
  const previous=state.progress,oldMastered=new Set(state.mastered),currentId=activeCard()?.id;
  const changed=new Set(cardIds.filter(id=>JSON.stringify(previous[id])!==JSON.stringify(next.progress[id])));
  const removed=new Set([...changed,...next.mastered.filter(id=>!oldMastered.has(id))]);
  Object.assign(state,next);
  for(const kind of ['new','review']){
    const loop=state.loops[kind];
    if(loop){loop.items=loop.items.filter(item=>!removed.has(item.id));if(removed.has(loop.current?.id))loop.current=null;}
    const spell=state.spelling[kind];
    if(spell){for(const key of ['ids','queue','passed'])spell[key]=spell[key].filter(id=>!removed.has(id));if(removed.has(spell.current?.id))spell.current=null;}
  }
  pruneMastered();
  $('#rate-select').value=String(state.settings.rate);refreshVoices();
  if(activeTab==='session'&&removed.has(currentId)){
    stopSpeech();
    if(isSpelling())prepareSpelling(spellingKind());else if(mode!=='all'){Loop.next(syncLoop(mode));}
    renderStudy();resetSessionPosition();announceCurrent();
  }else updateStats();
  renderLibrary();renderSaved();persist();
}
window.IELTS_CLOUD?.start({getState:()=>state,applyState:applyCloudState,onStatus:info=>{
  const button=$('#cloud-sync');button.textContent=info.message;button.dataset.kind=info.kind;
  const detail=info.updatedAt?`最近同步：${new Date(info.updatedAt).toLocaleString()}。`:'';
  button.title=info.message+'。'+detail+'点击立即重试';
  $('#cloud-detail').textContent=info.message+'。'+detail;
}});
$('#cloud-sync').addEventListener('click',()=>window.IELTS_CLOUD?.syncNow());
$('#cloud-retry').addEventListener('click',()=>window.IELTS_CLOUD?.syncNow());

if(typeof window.fetch==='function')window.fetch('/api/checkin-link',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
  if(!data?.url)return;
  const url=new URL(data.url);if(url.protocol!=='https:')return;
  $('#checkin-share').href=url.href;$('#checkin-share-wrap').hidden=false;
}).catch(()=>{});
