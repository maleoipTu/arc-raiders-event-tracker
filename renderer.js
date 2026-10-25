const CACHE_KEY = 'arc-live-schedule-v1';
const FAVORITES_KEY = 'arc-favorites-v1';
const REGION_KEY = 'arc-region-v1';
const PLAYER_KEY = 'arc-steam-account-v1';
const SYNC_INTERVAL = 15 * 60 * 1000;

const conditionNames = {
  'Electromagnetic Storm': 'Электромагнитный шторм', 'Harvester': 'Харвестер', 'Hidden Bunker': 'Скрытый бункер',
  'Husk Graveyard': 'Могильщик панцирей', 'Launch Tower Loot': 'Добыча с пусковой башни', 'Lush Blooms': 'Пышное цветение',
  'Night Raid': 'Ночной рейд', 'Prospecting Probes': 'Ограбление зондов', 'Uncovered Caches': 'Скрытые тайники',
  'ARC Frigate': 'Фрегат ARC', 'Close Scrutiny': 'Пристальное внимание', 'Hurricane': 'Ураган', 'Locked Gate': 'Закрытые ворота',
  'Beachcombing': 'Прочёсывание пляжа', 'Bird City': 'Птичий город', 'Matriarch': 'Матриарх', 'Redirection': 'Перенаправление',
  'Cold Snap': 'Внезапное похолодание'
};
const mapNames = {
  'Buried City':'Погребённый город','Dam Battlegrounds':'Поле боя у дамбы','Dam Battleground':'Поле боя у дамбы',
  'Pendola Pass':'Перевал Пендола','Riven Tides':'Riven Tides','Spaceport':'Космопорт','The Spaceport':'Космопорт',
  'Stella Montis':'Стелла Монтис','The Blue Gate':'Синие ворота','Blue Gate':'Синие ворота'
};
const descriptions = {
  'Electromagnetic Storm':'Молнии, меньше точек возврата и повышенный шанс ценного лута.',
  'Harvester':'Разбитый Харвестер с ценной добычей под охраной Королевы.',
  'Hidden Bunker':'Активируйте антенны, чтобы открыть бункер с добычей.',
  'Husk Graveyard':'Останки крупных ARC содержат редкие механические компоненты.',
  'Launch Tower Loot':'Доберитесь до ценной добычи на вершине пусковой башни.',
  'Lush Blooms':'Повышенная частота природных ресурсов и ингредиентов.',
  'Night Raid':'Темнота, агрессивные ARC и более ценная добыча.',
  'Prospecting Probes':'На карту падает больше зондов, но вскрытие включает сирену.',
  'Uncovered Caches':'Ищите неотмеченные тайники по характерному сигналу.'
};
const weatherEvents = new Set(['Electromagnetic Storm','Night Raid','Hurricane','Cold Snap','Close Scrutiny']);
const objectiveEvents = new Set(['Harvester','Hidden Bunker','Launch Tower Loot','Locked Gate','Matriarch','ARC Frigate','Redirection']);
const categoryLabels = { weather:'Условие карты', objective:'Особый объект', loot:'Добыча' };
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2,'0');

let activeFilter='all', activeView='all', query='', syncInProgress=false;
let region=localStorage.getItem(REGION_KEY)||'europe';
let favorites=new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]'));
let schedule=loadCache();
let events=normalizeEvents(schedule?.events||[]);
let steamAccount=loadSteamAccount();
let playerLoading=false;
let systemSettings=null;

function loadCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY));}catch{return null;}}
function loadSteamAccount(){try{return JSON.parse(localStorage.getItem(PLAYER_KEY));}catch{return null;}}
function normalizeEvents(raw){return raw.map(event=>({...event,title:conditionNames[event.originalName]||event.originalName,location:mapNames[event.originalMap]||event.originalMap,start:new Date(event.start).toISOString(),duration:Math.round((event.end-event.start)/60000),description:descriptions[event.originalName]||'Официальное условие карты из текущей ротации Embark.',category:weatherEvents.has(event.originalName)?'weather':objectiveEvents.has(event.originalName)?'objective':'loot',favorite:favorites.has(event.originalName)}));}

async function syncSchedule(manual=false){
  if(syncInProgress)return; syncInProgress=true; setSyncState('loading'); if(manual)$('#refreshEvents').disabled=true;
  try{const result=await window.arcApp.fetchSchedule(region);schedule=result;localStorage.setItem(CACHE_KEY,JSON.stringify(result));events=normalizeEvents(result.events);setSyncState('online');render();scheduleDesktopNotifications();}
  catch(error){console.error(error);setSyncState(schedule?'cached':'offline');}
  finally{syncInProgress=false;$('#refreshEvents').disabled=false;}
}
function scheduleDesktopNotifications(){return window.arcApp.scheduleNotifications(events.map(event=>({title:event.title,location:event.location,start:new Date(event.start).getTime()})));}
function setSyncState(state){const title=$('#syncTitle'),text=$('#syncText'),pulse=$('#syncPulse');pulse.classList.toggle('offline',state==='offline');if(state==='loading'){title.textContent='СИНХРОНИЗАЦИЯ';text.textContent='Получаю расписание от Embark…';}if(state==='online'){title.textContent='В ЭФИРЕ · EMBARK';text.textContent=`Обновлено ${new Date(schedule.syncedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})} · каждые 15 мин`;}if(state==='cached'){title.textContent='ОФЛАЙН-КОПИЯ';text.textContent=`Копия от ${new Date(schedule.syncedAt).toLocaleString('ru-RU')}`;}if(state==='offline'){title.textContent='НЕТ СОЕДИНЕНИЯ';text.textContent='Не удалось загрузить официальное расписание.';}}

const timeRange=(e)=>({start:new Date(e.start),end:new Date(new Date(e.start).getTime()+e.duration*60000)});
function formatCountdown(ms){if(ms<=0)return'АКТИВНО';const t=Math.floor(ms/1000),d=Math.floor(t/86400),h=Math.floor((t%86400)/3600),m=Math.floor((t%3600)/60),s=t%60;return d?`${d}Д ${pad(h)}:${pad(m)}`:`${pad(h)}:${pad(m)}:${pad(s)}`;}
function statusFor(e,now=new Date()){const{start,end}=timeRange(e);if(now>=start&&now<end)return{text:'● ИДЁТ СЕЙЧАС',cls:'live'};if(now>=end)return{text:'ЗАВЕРШЕНО',cls:''};const mins=(start-now)/60000;if(mins<120)return{text:`ЧЕРЕЗ ${Math.max(1,Math.ceil(mins))} МИН`,cls:'soon'};return{text:start.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}).toUpperCase(),cls:''};}
function visibleEvents(){const now=new Date();return events.filter(e=>{const{end}=timeRange(e);if(activeView==='favorite'&&!e.favorite)return false;if(activeView==='history'&&end>now)return false;if(activeView!=='history'&&end<=now)return false;if(activeFilter!=='all'&&e.category!==activeFilter)return false;return`${e.title} ${e.location}`.toLowerCase().includes(query);}).sort((a,b)=>new Date(a.start)-new Date(b.start));}

function renderHero(){const now=new Date(),relevant=events.filter(e=>timeRange(e).end>now).sort((a,b)=>new Date(a.start)-new Date(b.start));const next=relevant.find(e=>{const r=timeRange(e);return now>=r.start&&now<r.end;})||relevant[0],card=$('#nextEventCard');if(!next){card.innerHTML='<div class="card-kicker">ЭФИР ЧИСТ</div><h2>Нет данных о событиях</h2><p class="next-location">Обновите официальное расписание</p>';}else{const{start,end}=timeRange(next),live=now>=start&&now<end;card.innerHTML=`<div class="card-kicker">${live?'АКТИВНОЕ СОБЫТИЕ':'СЛЕДУЮЩИЙ СИГНАЛ'}</div><h2>${escapeHtml(next.title)}</h2><p class="next-location">${escapeHtml(next.location)} · ${categoryLabels[next.category]}</p><div class="countdown"><strong>${live?formatCountdown(end-now):formatCountdown(start-now)}</strong><span>${live?'ДО ЗАВЕРШЕНИЯ':'ДО НАЧАЛА'}</span></div><div class="next-meta"><strong>${start.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</strong><small>${start.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'long'})}</small></div>`;}$('#statUpcoming').textContent=events.filter(e=>new Date(e.start)>now).length;$('#statActive').textContent=events.filter(e=>{const r=timeRange(e);return now>=r.start&&now<r.end;}).length;$('#statFavorite').textContent=events.filter(e=>e.favorite&&timeRange(e).end>now).length;}
function renderTimeline(){const now=new Date(),today=events.filter(e=>new Date(e.start).toDateString()===now.toDateString());$('#miniTimeline').innerHTML=Array.from({length:12},(_,i)=>{const hour=i*2,hot=today.some(e=>{const s=new Date(e.start).getHours();return s>=hour&&s<hour+2;});return`<span class="${hot?'hot':''}" style="height:${12+((i*17)%47)}px" data-hour="${pad(hour)}"></span>`;}).join('');}
function escapeHtml(value=''){const div=document.createElement('div');div.textContent=value;return div.innerHTML;}
function plural(n,one,few,many){const m=n%100;if(m>=11&&m<=19)return many;const d=n%10;return d===1?one:d>=2&&d<=4?few:many;}
function renderList(){const list=visibleEvents();$('#resultCount').textContent=`${list.length} ${plural(list.length,'событие','события','событий')}`;$('#sectionTitle').textContent=activeView==='favorite'?'Избранные события':activeView==='history'?'Завершённые события':'Ближайшие события';$('#eventList').innerHTML=list.length?list.map(e=>{const{start,end}=timeRange(e),status=statusFor(e),live=new Date()>=start&&new Date()<end;return`<article class="event-card ${live?'active-now':''}"><div class="event-time"><strong>${start.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</strong><small>${start.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</small></div><div class="event-accent ${e.category}"></div><div class="event-main"><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.description)}</p></div><div class="event-location"><small>ЛОКАЦИЯ</small><strong>${escapeHtml(e.location)}</strong></div><div class="event-status ${status.cls}">${status.text}</div><div class="card-actions"><button class="icon-button ${e.favorite?'favorite':''}" data-action="favorite" data-name="${escapeHtml(e.originalName)}" title="Избранное">${e.favorite?'★':'☆'}</button></div></article>`;}).join(''):'<div class="empty"><strong>Сигналов не обнаружено</strong>Измените фильтр или обновите расписание.</div>';}
function render(){renderHero();renderTimeline();renderList();}

function showView(view){
  const player=view==='player';
  const help=view==='help';
  $('#eventsView').hidden=player||help; $('#playerView').hidden=!player; $('#helpView').hidden=!help;
  $('#mainTitle').textContent=player?'Статистика игрока':help?'Справка':'События в ARC';
  $('#mainEyebrow').childNodes[0].textContent=player?'ЛИЧНОЕ ДЕЛО РЕЙДЕРА ':help?'ЦЕНТР ПОДДЕРЖКИ ':'ОПЕРАТИВНАЯ СВОДКА ';
  $('.top-actions').hidden=player||help;
  if(player){renderSteamProfile();loadPlayerData();}
}

function renderSteamProfile(){
  const box=$('#steamProfile');
  if(!steamAccount){box.innerHTML='<div class="player-avatar placeholder">◎</div><div class="player-identity"><div class="eyebrow">ПРОФИЛЬ РЕЙДЕРА</div><h2>Steam не подключён</h2><p>Авторизация откроется на официальном сайте Steam. Пароль не передаётся приложению.</p></div><button class="steam-button" id="steamLogin">Войти через Steam</button>';return;}
  const profile=steamAccount.profile||{};
  box.innerHTML=`${profile.avatar?`<img class="player-avatar" src="${escapeHtml(profile.avatar)}" alt="">`:'<div class="player-avatar placeholder">◎</div>'}<div class="player-identity"><div class="eyebrow">STEAM ПОДКЛЮЧЁН</div><h2>${escapeHtml(profile.name||'Рейдер')}</h2><p>${profile.privacy==='private'?'Профиль закрыт — часы и достижения могут быть недоступны.':'Профиль подтверждён официальным Steam OpenID.'}</p><div class="player-id">STEAM ID · ${escapeHtml(steamAccount.steamId)}</div></div><button class="secondary" id="steamDisconnect">Отключить</button>`;
}

async function loadPlayerData(){
  if(playerLoading)return;playerLoading=true;setPlayerMessage('Обновляю данные игрока…');
  try{
    const credentialState=await window.arcApp.credentialStatus();
    setConnectionBadge('#steamConnection',Boolean(steamAccount)&&credentialState.steamApiKey);
    setConnectionBadge('#arcConnection',credentialState.arcAppKey&&credentialState.arcUserKey);
    const tasks=[];
    if(steamAccount)tasks.push(loadSteamStats());
    if(credentialState.arcAppKey&&credentialState.arcUserKey)tasks.push(loadArcStats());
    await Promise.allSettled(tasks);
    setPlayerMessage(tasks.length?'Данные обновлены.':'Подключите Steam и ключи источников ниже.');
  }catch(error){setPlayerMessage(error.message||'Не удалось обновить статистику.',true);}
  finally{playerLoading=false;}
}

async function loadSteamStats(){
  const data=await window.arcApp.fetchSteamStats(steamAccount.steamId);
  if(data.needsKey){$('#playerHours').textContent='—';$('#playerAchievements').textContent='—';return;}
  $('#playerHours').textContent=data.playtimeMinutes==null?'—':Math.round(data.playtimeMinutes/60).toLocaleString('ru-RU');
  $('#playerAchievements').textContent=data.total?`${data.unlocked}/${data.total}`:'—';
  if(data.player){steamAccount.profile={...steamAccount.profile,name:data.player.personaname||steamAccount.profile?.name,avatar:data.player.avatarfull||steamAccount.profile?.avatar};localStorage.setItem(PLAYER_KEY,JSON.stringify(steamAccount));renderSteamProfile();}
}

async function loadArcStats(){
  const data=await window.arcApp.fetchArcStats();if(data.needsKeys)return;const s=data.summary||{};
  $('#playerExtraction').textContent=`${s.extractionRate??0}%`;$('#playerRounds').textContent=s.total??0;$('#playerKills').textContent=(s.kills??0).toLocaleString('ru-RU');$('#playerArcKills').textContent=(s.arcKills??0).toLocaleString('ru-RU');
  renderArcCharts(data.rounds||[],s);
}
function renderArcCharts(rounds,summary){
  $('#analyticsRange').textContent=rounds.length?`Последние ${rounds.length} ${plural(rounds.length,'рейд','рейда','рейдов')}`:'Нет рейдов';
  const chronological=rounds.slice(0,12).reverse();
  const maxDamage=Math.max(1,...chronological.map(round=>Number(round.damage)||0));
  const average=rounds.length?Math.round(rounds.reduce((total,round)=>total+(Number(round.damage)||0),0)/rounds.length):0;
  $('#damageAverage').textContent=rounds.length?average.toLocaleString('ru-RU'):'—';
  $('#roundTrend').innerHTML=chronological.length?chronological.map((round,index)=>`<span class="round-bar" data-result="${round.extracted?'win':'lost'}" data-label="${index+1}" title="${escapeHtml(round.map)} · ${Number(round.damage||0).toLocaleString('ru-RU')} урона" style="height:${Math.max(8,Math.round((Number(round.damage)||0)/maxDamage*100))}%"></span>`).join(''):'<div class="analytics-empty">Нет синхронизированных рейдов</div>';
  const rate=summary.extractionRate||0;
  $('#outcomeDonut').style.setProperty('--success',rate);$('#outcomeDonut').innerHTML=`<strong>${rate}%</strong><span>эвакуаций</span>`;
  $('#outcomeLegend').innerHTML=`<span>Успех<strong>${summary.extracted||0}</strong></span><span>Потери<strong>${summary.died||0}</strong></span>`;
  const maps=new Map();rounds.forEach(round=>maps.set(round.map,(maps.get(round.map)||0)+1));const sortedMaps=[...maps.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);const maxMap=sortedMaps[0]?.[1]||1;
  $('#mapBreakdown').innerHTML=sortedMaps.length?sortedMaps.map(([name,count])=>`<div class="map-row"><span title="${escapeHtml(name)}">${escapeHtml(name)}</span><div class="map-track"><i style="width:${Math.round(count/maxMap*100)}%"></i></div><strong>${count}</strong></div>`).join(''):'<div class="analytics-empty">Нет данных по картам</div>';
}
function setConnectionBadge(selector,connected){const badge=$(selector);badge.textContent=connected?'ПОДКЛЮЧЁН':'НЕ ПОДКЛЮЧЁН';badge.classList.toggle('connected',connected);}
function setPlayerMessage(message,error=false){const element=$('#playerMessage');element.textContent=message;element.style.color=error?'var(--danger)':'var(--amber)';}
async function loadSystemSettings(){
  systemSettings=await window.arcApp.getSettings();
  $('#minimizeToTray').checked=systemSettings.minimizeToTray;$('#launchAtStartup').checked=systemSettings.launchAtStartup;$('#eventNotifications').checked=systemSettings.notifications;$('#notifyLeadMinutes').value=String(systemSettings.notifyLeadMinutes);$('#updateManifestUrl').value=systemSettings.updateManifestUrl||'';
}
function renderDiagnostics(result){
  $('#diagnosticsList').innerHTML=result.checks.map(check=>`<article class="diagnostic-row ${check.status}"><span class="diagnostic-dot"></span><div><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></div></article>`).join('');
}
async function performUpdateCheck(){
  const button=$('#checkUpdates');button.disabled=true;$('#updateStatus').textContent='Ищу новую версию…';$('#downloadUpdate').hidden=true;$('#revealUpdate').hidden=true;
  try{const result=await window.arcApp.checkUpdates();if(!result.configured){$('#updateStatus').textContent='Канал релизов не настроен. Укажите HTTPS-манифест.';return;}if(result.available){$('#updateStatus').textContent=`Доступна версия ${result.version}. ${result.notes||''}`;$('#downloadUpdate').hidden=false;}else $('#updateStatus').textContent=`Установлена актуальная версия ${result.currentVersion}.`;}
  catch(error){$('#updateStatus').textContent=error.message||'Не удалось проверить обновления.';}finally{button.disabled=false;}
}

$('#todayLabel').textContent=new Date().toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase();$('#regionSelect').value=region;
$('#searchInput').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderList();});
$('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;activeFilter=b.dataset.filter;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));renderList();});
function activateView(view){activeView=view;$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));showView(view);if(!['player','help'].includes(view))renderList();}
$('.nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;activateView(b.dataset.view);});
$('#eventList').addEventListener('click',e=>{const b=e.target.closest('[data-action="favorite"]');if(!b)return;favorites.has(b.dataset.name)?favorites.delete(b.dataset.name):favorites.add(b.dataset.name);localStorage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]));events=normalizeEvents(schedule?.events||[]);render();});
$('#regionSelect').addEventListener('change',e=>{region=e.target.value;localStorage.setItem(REGION_KEY,region);syncSchedule(true);});
$('#refreshEvents').addEventListener('click',()=>syncSchedule(true));
$('#clearFavorites').addEventListener('click',()=>{favorites.clear();localStorage.setItem(FAVORITES_KEY,'[]');events=normalizeEvents(schedule?.events||[]);render();});
$('#playerView').addEventListener('click',async e=>{
  if(e.target.closest('#steamLogin')){setPlayerMessage('Ожидаю вход на официальной странице Steam…');try{steamAccount=await window.arcApp.loginWithSteam();localStorage.setItem(PLAYER_KEY,JSON.stringify(steamAccount));renderSteamProfile();await loadPlayerData();}catch(error){setPlayerMessage(error.message||'Вход Steam отменён.',true);}return;}
  if(e.target.closest('#steamDisconnect')){steamAccount=null;localStorage.removeItem(PLAYER_KEY);renderSteamProfile();setConnectionBadge('#steamConnection',false);$('#playerHours').textContent='—';$('#playerAchievements').textContent='—';setPlayerMessage('Steam отключён.');return;}
  const external=e.target.closest('[data-external]');if(external){await window.arcApp.openExternal(external.dataset.external);return;}
});
$('#helpView').addEventListener('click',async e=>{
  const target=e.target.closest('[data-help-target]');if(target){activateView(target.dataset.helpTarget);return;}
  const external=e.target.closest('[data-external]');if(external)await window.arcApp.openExternal(external.dataset.external);
});
$('#saveSystemSettings').addEventListener('click',async()=>{
  const button=$('#saveSystemSettings');button.disabled=true;
  try{systemSettings=await window.arcApp.saveSettings({minimizeToTray:$('#minimizeToTray').checked,launchAtStartup:$('#launchAtStartup').checked,notifications:$('#eventNotifications').checked,notifyLeadMinutes:Number($('#notifyLeadMinutes').value),updateManifestUrl:$('#updateManifestUrl').value.trim()});button.textContent='Сохранено';await scheduleDesktopNotifications();setTimeout(()=>{button.textContent='Сохранить настройки';},1500);}catch(error){button.textContent=error.message||'Ошибка';}finally{button.disabled=false;}
});
$('#runDiagnostics').addEventListener('click',async()=>{const button=$('#runDiagnostics');button.disabled=true;button.textContent='Проверяю…';$('#diagnosticsList').innerHTML='<div class="diagnostics-empty">Выполняю безопасную проверку…</div>';try{renderDiagnostics(await window.arcApp.runDiagnostics(steamAccount?.steamId));}catch(error){$('#diagnosticsList').innerHTML=`<div class="diagnostics-empty">${escapeHtml(error.message||'Диагностика не завершена')}</div>`;}finally{button.disabled=false;button.textContent='Запустить диагностику';}});
$('#checkUpdates').addEventListener('click',performUpdateCheck);
$('#downloadUpdate').addEventListener('click',async()=>{const button=$('#downloadUpdate');button.disabled=true;button.textContent='Загружаю…';try{const result=await window.arcApp.downloadUpdate();$('#updateStatus').textContent=`Версия ${result.version} скачана, SHA-256 проверен.`;button.hidden=true;$('#revealUpdate').hidden=false;}catch(error){$('#updateStatus').textContent=error.message||'Ошибка загрузки.';}finally{button.disabled=false;button.textContent='Скачать';}});
$('#revealUpdate').addEventListener('click',()=>window.arcApp.revealUpdate());
$('#saveConnections').addEventListener('click',async()=>{setPlayerMessage('Шифрую ключи и проверяю подключение…');try{await window.arcApp.saveCredentials({steamApiKey:$('#steamApiKey').value,arcAppKey:$('#arcAppKey').value,arcUserKey:$('#arcUserKey').value});$('#steamApiKey').value='';$('#arcAppKey').value='';$('#arcUserKey').value='';await loadPlayerData();}catch(error){setPlayerMessage(error.message||'Не удалось сохранить ключи.',true);}});
$('#playerRefresh').addEventListener('click',()=>loadPlayerData());
window.addEventListener('online',()=>syncSchedule());
window.arcApp.onAppRefresh(()=>{syncSchedule(true);if(activeView==='player')loadPlayerData();});
setInterval(()=>{renderHero();renderTimeline();renderList();},1000);setInterval(()=>syncSchedule(),SYNC_INTERVAL);
if(schedule){setSyncState('cached');render();scheduleDesktopNotifications();}renderSteamProfile();window.arcApp.version().then(version=>{$('#appVersion').textContent=`v${version}`;});loadSystemSettings();window.arcApp.credentialStatus().then(state=>{setConnectionBadge('#steamConnection',Boolean(steamAccount)&&state.steamApiKey);setConnectionBadge('#arcConnection',state.arcAppKey&&state.arcUserKey);});syncSchedule();
