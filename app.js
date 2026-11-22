import {STATUS, selectLeads, safeState, csvCell, safeUrl} from './logic.js';

const $ = selector => document.querySelector(selector);
const storageKey = 'signal-tg-outreach-v1';
const filters = {language:'all',category:'all',status:'all',query:'',sort:'priority',view:'all'};
const drafts = new Map();
const openCards = new Set();
let leads = [];
let loadState = 'loading';
let state = {};
let storageAvailable = true;
let toastTimer;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = (url,label,classes='') => `<a href="${escape(safeUrl(url))}" target="_blank" rel="noopener noreferrer" class="${classes}">${escape(label)}</a>`;
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${({star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',chevron:'<path d="m7 9 5 5 5-5"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>'})[name]}</svg>`;
const displayDate = date => date.split('-').reverse().join('.');
let latestCheck = '';

try { state = safeState(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch { storageAvailable = false; }

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200);
}

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; notify('браузер не сохранил отметки. скачай базу, чтобы их не потерять.'); }
}

function updateMetrics() {
  const ru = leads.filter(x => x.language === 'ru').length;
  const contacted = leads.filter(x => ['sent','replied'].includes(state[x.id]?.status)).length;
  const saved = leads.filter(x => state[x.id]?.saved).length;
  for (const [selector,value] of Object.entries({'#total-count':leads.length,'#nav-count':leads.length,'#tab-all':leads.length,'#ru-count':ru,'#tab-ru':ru,'#foreign-count':leads.length-ru,'#tab-foreign':leads.length-ru,'#saved-count':saved,'#work-count':contacted})) $(selector).textContent = value;
  $('#contact-count').innerHTML = `${contacted}<span> / ${leads.length}</span>`;
  const percent = leads.length ? Math.round(contacted/leads.length*100) : 0;
  $('#contact-percent').textContent = `${percent}%`;
  $('#progress-fill').style.width = `${percent}%`;
  $('.progress-track').setAttribute('aria-valuenow',String(percent));
  for (const status of ['sent','replied']) $('#'+status+'-count').textContent = leads.filter(x=>state[x.id]?.status===status).length;
  $('#pending-count').textContent = leads.filter(x=>!state[x.id]?.status || state[x.id].status==='new').length;
  const recent = leads.filter(x=>x.addedAt==='2026-11-22').length;
  $('#recent-count').textContent = recent;
  $('#new-count').textContent = recent;
  $('#export').disabled = !leads.length;
}

function detail(item) {
  const current = drafts.get(item.id) ?? item.message;
  const botStatus = item.botCheck.status === 'not_found' ? 'бот не найден в проверенной части' : 'проверка бота неполная';
  const contact = item.contact?.url ? link(item.contact.url,item.contact.label,'button primary') : '<span class="pill caution">контакт не подтверждён</span>';
  return `<div class="row-detail" id="detail-${escape(item.id)}" ${openCards.has(item.id)?'':'hidden'}>
    <div><h3 class="detail-label">почему именно этот канал</h3><p class="detail-reason">${escape(item.whyFit)}</p><span class="detail-label">идея небольшого проекта</span><p class="detail-reason">${escape(item.opportunity)}</p><div class="detail-links">${contact}${link(item.url,'открыть канал','button secondary')}</div>
    <details class="proof"><summary>проверка и источники</summary><p><b>${escape(botStatus)}</b><br>${escape(item.botCheck.scope)}</p><p>${escape(item.botCheck.notes)}</p>${item.country?`<p><b>страна:</b> ${escape(item.country)}</p>`:""}<p><b>аудитория:</b> ${escape(item.membersLabel)}<br><b>проверено:</b> ${escape(item.checkedAt)}</p><p><b>активность:</b> ${escape(item.activity?.lastPostDate || 'дата последнего поста не установлена')}. ${escape(item.activity?.notes)}</p><ul>${item.sources.map(s=>`<li>${link(s.url,s.title)}<br>${escape(s.note)}</li>`).join('')}</ul><p>потребность и бюджет пока не подтверждены. перед контактом перепроверь актуальные ссылки и закреп.</p></details></div>
    <div><div class="pitch-top"><label class="detail-label" for="message-${escape(item.id)}">сообщение для первого контакта</label><span class="pitch-language">${escape((item.messageLanguage || item.language).toUpperCase())}</span></div>${item.messageNote?`<p class="message-note">${escape(item.messageNote)}</p>`:""}<textarea id="message-${escape(item.id)}" class="pitch-text" data-id="${escape(item.id)}" maxlength="5000" spellcheck="true">${escape(current)}</textarea><div class="pitch-actions"><span>правь под себя.<br>текст хранится до перезагрузки.</span><button class="button primary copy" data-id="${escape(item.id)}">скопировать ${icon('copy')}</button></div><button class="text-button pitch-reset" data-reset-message="${escape(item.id)}">вернуть исходный текст</button></div>
  </div>`;
}

function card(item) {
  const local = state[item.id] || {};
  const initials = item.name.replace(/[^\p{L}\p{N}\s]/gu,'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toLocaleLowerCase('ru');
  const subscribers = item.members == null ? 'размер не установлен' : (/≈|около|округл/i.test(item.membersLabel)?'≈ ':'') + new Intl.NumberFormat('ru-RU').format(item.members) + ' подп.';
  const language = item.language === 'ru' ? 'ru' : item.language;
  return `<article class="lead-row" data-card="${escape(item.id)}" aria-label="${escape(item.name)}"><div class="row-main">
    <div class="row-number"><span>${String(item.number).padStart(2,'0')}</span><button class="star ${local.saved?'saved':''}" data-save="${escape(item.id)}" aria-label="${local.saved?'убрать из избранного':'в избранное'}: ${escape(item.name)}" aria-pressed="${!!local.saved}">${icon('star')}</button></div>
    <div class="channel-cell"><span class="channel-avatar avatar-${item.number%5}" aria-hidden="true">${escape(initials)}</span><div class="channel-info">${link(item.url,item.name,'channel-name')}<span class="channel-handle">${escape(item.handle)}</span><div class="channel-meta"><span>${escape(subscribers)}</span><span class="dot-separator">·</span><span>${escape(item.category)}</span><span class="pill">${escape(language)}</span></div></div></div>
    <div class="offer-cell"><div class="offer-title">${escape(item.offer)}</div><div class="offer-bottom"><span class="pill ${item.botCheck.status==='not_found'?'verified':'caution'}">${item.botCheck.status==='not_found'?'бот не найден':'уточнить наличие бота'}</span>${item.addedAt==='2026-11-22'?'<span class="pill fresh">новый</span>':item.priority==='high'?'<span class="pill">начать здесь</span>':''}</div></div>
    <select class="status-select" data-id="${escape(item.id)}" data-value="${escape(local.status||'new')}" aria-label="статус контакта: ${escape(item.name)}">${Object.entries(STATUS).map(([key,label])=>`<option value="${key}" ${(local.status||'new')===key?'selected':''}>${label}</option>`).join('')}</select>
    <button class="expand" data-expand="${escape(item.id)}" aria-expanded="${openCards.has(item.id)}" aria-controls="detail-${escape(item.id)}">${openCards.has(item.id)?'свернуть':'оффер'}${icon('chevron')}</button>
    </div>${detail(item)}</article>`;
}

function render() {
  if (loadState !== 'ready') return;
  const selected = selectLeads(leads,filters,state);
  $('#result-count').textContent = selected.length;
  $('#footer-count').textContent = `показано ${selected.length} из ${leads.length} · даты проверки внутри карточек`;
  $('#list').innerHTML = selected.length ? selected.map(card).join('') : '<div class="empty-state"><strong>пока ничего не нашлось</strong><p>попробуй другую нишу или убери фильтры. избранное появится после нажатия на звёздочку.</p><button class="button secondary" data-reset>показать все каналы</button></div>';
  $('#reset').hidden = filters.language==='all' && filters.category==='all' && filters.status==='all' && !filters.query && filters.view==='all' && filters.sort==='priority';
  updateMetrics();
}

function renderKeepingFocus(control, selector) {
  const oldIndex = [...document.querySelectorAll(selector)].indexOf(control);
  const id = control.dataset.id || control.dataset.save;
  render();
  const controls = [...document.querySelectorAll(selector)];
  const same = controls.find(element => (element.dataset.id || element.dataset.save) === id);
  const fallback = controls[Math.min(Math.max(oldIndex,0),controls.length-1)] || $('#search');
  (same || fallback).focus({preventScroll:true});
}

function resetFilters() {
  Object.assign(filters,{language:'all',category:'all',status:'all',query:'',sort:'priority',view:'all'});
  $('#search').value = '';
  $('#category').value = 'all';
  $('#status-filter').value = 'all';
  $('#sort').value = 'priority';
  document.querySelectorAll('[data-language]').forEach(b=>{b.classList.toggle('selected',b.dataset.language==='all');b.setAttribute('aria-pressed',b.dataset.language==='all');});
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view==='all');b.setAttribute('aria-pressed',b.dataset.view==='all');});
  render();
}

document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>{
  filters.language=button.dataset.language;
  document.querySelectorAll('[data-language]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',b===button);});render();
}));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  filters.view=button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===filters.view);b.setAttribute('aria-pressed',b.dataset.view===filters.view);});render();
  if(button.classList.contains('inline-action')) $('#directory').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}));
$('#search').addEventListener('input',event=>{filters.query=event.target.value;render();});
for (const [id,key] of [['category','category'],['status-filter','status'],['sort','sort']]) $('#'+id).addEventListener('change',event=>{filters[key]=event.target.value;render();});
$('#reset').addEventListener('click',resetFilters);

$('#list').addEventListener('input',event=>{if(event.target.matches('.pitch-text')) drafts.set(event.target.dataset.id,event.target.value);});
$('#list').addEventListener('change',event=>{
  if (!event.target.matches('.status-select')) return;
  const id=event.target.dataset.id;
  state[id]={...state[id],status:event.target.value};persist();renderKeepingFocus(event.target,'.status-select');
});
$('#list').addEventListener('click',async event=>{
  const button=event.target.closest('button'); if(!button)return;
  if(button.hasAttribute('data-reset')){resetFilters();$('#search').focus();return;}
  if(button.dataset.save){
    const id=button.dataset.save;state[id]={...state[id],saved:!state[id]?.saved};persist();renderKeepingFocus(button,'.star');return;
  }
  if(button.dataset.expand){
    const id=button.dataset.expand;const open=!openCards.has(id);if(open)openCards.add(id);else openCards.delete(id);
    $('#detail-'+id).hidden=!open;button.setAttribute('aria-expanded',open);button.innerHTML=(open?'свернуть':'оффер')+icon('chevron');return;
  }
  if(button.dataset.resetMessage){const id=button.dataset.resetMessage;drafts.delete(id);$('#message-'+id).value=leads.find(x=>x.id===id).message;notify('исходный текст восстановлен');return;}
  if(button.classList.contains('copy')){
    const textarea=$('#message-'+button.dataset.id);button.disabled=true;
    try {await navigator.clipboard.writeText(textarea.value);notify('сообщение скопировано. можно открыть контакт и написать.');}
    catch {textarea.focus();textarea.select();notify('копирование недоступно. текст выделен — скопируй его вручную.');}
    finally {button.disabled=false;}
  }
});

$('#export').addEventListener('click',()=>{
  const header=['номер','канал','ссылка','язык','подписчики','ниша','контакт','ссылка контакта','услуга','сообщение','статус','избранное','проверка бота','область проверки','дата проверки','источники'];
  const rows=leads.map(x=>[x.number,x.name,x.url,x.language,x.membersLabel,x.category,x.contact?.label,x.contact?.url,x.offer,drafts.get(x.id)??x.message,STATUS[state[x.id]?.status||'new'],state[x.id]?.saved?'да':'нет',x.botCheck.status==='not_found'?'не найден в проверенной части':'нужна проверка',x.botCheck.scope,x.checkedAt,x.sources.map(s=>s.url).join(' | ')]);
  const blob=new Blob(['\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`signal-tg-${latestCheck}.csv`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('база с текущими отметками подготовлена для скачивания');
});

async function load() {
  loadState='loading';
  $('#list').setAttribute('aria-busy','true');
  const retry=$('#retry'); if(retry){retry.disabled=true;retry.textContent='загружаем…';}
  try {
    const response=await fetch('./leads.json');if(!response.ok)throw new Error('http '+response.status);
    const data=await response.json();if(!Array.isArray(data)||!data.length)throw new Error('empty dataset');
    leads=data;latestCheck=leads.map(x=>x.checkedAt).sort().at(-1);
    $('#dataset-date').textContent='последнее пополнение '+displayDate(latestCheck);
    const categories=[...new Set(leads.map(x=>x.category))].map(name=>({name,count:leads.filter(x=>x.category===name).length})).sort((a,b)=>b.count-a.count);
    $('#category-chart').innerHTML=categories.map(({name,count})=>`<div class="chart-row"><span>${escape(name)}</span><span class="chart-track" aria-hidden="true"><i style="width:${count/leads.length*100}%"></i></span><b>${count}</b></div>`).join('');
    loadState='ready';render();
    if(!storageAvailable)notify('отметки могут не сохраняться в этом браузере. используй скачивание базы.');
  } catch {
    loadState='error';
    $('#list').innerHTML='<div class="error-state"><strong>база не загрузилась</strong><p>проверь подключение и попробуй ещё раз. твои сохранённые отметки остаются в браузере.</p><button class="button primary" id="retry">повторить загрузку</button></div>';
    $('#retry').addEventListener('click',load);$('#footer-count').textContent='не удалось получить данные';
  } finally {$('#list').setAttribute('aria-busy','false');}
}
load();

const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('[data-glow]').forEach(card=>{
  card.addEventListener('pointermove',event=>{
    if(reducedMotion.matches||event.pointerType==='touch')return;
    const rect=card.getBoundingClientRect();
    card.style.setProperty('--mouse-x',`${event.clientX-rect.left}px`);
    card.style.setProperty('--mouse-y',`${event.clientY-rect.top}px`);
  });
  card.addEventListener('focusin',()=>{card.style.setProperty('--mouse-x','50%');card.style.setProperty('--mouse-y','50%');});
});
