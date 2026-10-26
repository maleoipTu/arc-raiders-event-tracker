const CACHE_KEY = 'arc-live-schedule-v1';
const FAVORITES_KEY = 'arc-favorites-v1';
const REGION_KEY = 'arc-region-v1';
const PLAYER_KEY = 'arc-steam-account-v1';
const QUEST_PROGRESS_KEY = 'arc-quest-progress-v1';
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
const questMapNames = {
  'blue-gate':'Синие ворота','dam-battleground':'Поле боя у дамбы','pendola-pass':'Перевал Пендола',
  'the-spaceport':'Космопорт','buried-city':'Погребённый город','riven-tides':'Riven Tides','stella-montis':'Стелла Монтис'
};
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
const questCatalog=window.ARC_QUEST_CATALOG||{quests:[],count:0};
let questProgress=loadQuestProgress(),questQuery='',questTrader='all',questMap='all',questStatus='all',selectedQuestId=null;

function loadCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY));}catch{return null;}}
function loadSteamAccount(){try{return JSON.parse(localStorage.getItem(PLAYER_KEY));}catch{return null;}}
function loadQuestProgress(){try{return JSON.parse(localStorage.getItem(QUEST_PROGRESS_KEY))||{};}catch{return {};}}
function saveQuestProgress(){localStorage.setItem(QUEST_PROGRESS_KEY,JSON.stringify(questProgress));}
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

function questRecord(id){return questProgress[id]||{completed:false,objectives:[]};}
function questState(quest){const progress=questRecord(quest.id),done=Boolean(progress.completed),started=!done&&(progress.objectives||[]).some(Boolean);return done?'completed':started?'active':'new';}
function visibleQuests(){
  return questCatalog.quests.filter(quest=>{
    if(questTrader!=='all'&&quest.trader!==questTrader)return false;
    if(questMap!=='all'&&!quest.maps.includes(questMap))return false;
    if(questStatus!=='all'&&questState(quest)!==questStatus)return false;
    const haystack=[quest.name,quest.nameEn,quest.trader,quest.description,...quest.objectives.map(item=>item.text),...quest.maps.map(map=>questMapNames[map]||map)].join(' ').toLowerCase();
    return haystack.includes(questQuery);
  });
}
function formatItem(item){const name=item.id.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());return `${item.quantity}× ${name}`;}
function questImageUrl(url){try{const parsed=new URL(url);return parsed.protocol==='https:'&&parsed.hostname==='cdn.arctracker.io'?url:'';}catch{return '';}}
function questTips(quest){
  const tips=[];
  const maps=quest.maps.map(map=>questMapNames[map]||map);
  if(maps.length===1)tips.push(`Выберите карту «${maps[0]}» — все полевые цели задания находятся там.`);
  else if(maps.length>1)tips.push(`Цели распределены по картам: ${maps.join(', ')}. Отмечайте выполненные пункты после каждой вылазки.`);
  if(quest.oneRaid)tips.push('Все последовательные шаги нужно выполнить за один рейд. Не эвакуируйтесь, пока цепочка не засчитается полностью.');
  else if(quest.ordered&&quest.objectives.length>1)tips.push('Цели идут последовательно: завершите текущий пункт, прежде чем переходить к следующему.');
  if(quest.requiredItems.length)tips.push(`Подготовьте заранее: ${quest.requiredItems.map(formatItem).join(', ')}. Не продавайте эти предметы до сдачи задания.`);
  const text=quest.objectives.map(item=>item.text.toLowerCase()).join(' ');
  if(/сфотограф|сделайте фото|снимок/.test(text))tips.push('Для фото подойдите к объекту до появления контекстного действия — обычный взгляд на цель может не засчитаться.');
  if(/достав|принес|передайте|отдайте/.test(text)&&!quest.requiredItems.length)tips.push('Предмет для передачи должен сохраниться до эвакуации; после рейда сдайте его нужному торговцу.');
  if(/найдите|отыщите|обыщите|поищите/.test(text))tips.push('Ориентируйтесь на названия районов в описании цели и проверяйте появление маркера взаимодействия вблизи объекта.');
  if(/уничтож|нанесите урон|убейте|ликвидируйте/.test(text))tips.push('Боевые цели безопаснее выполнять с заранее подготовленным боезапасом и свободным маршрутом к точке эвакуации.');
  if(quest.objectives.some(item=>item.optional))tips.push('Необязательные пункты можно пропустить — они не блокируют завершение основной цепочки.');
  if(!tips.length)tips.push('Закрепите задание в игре и сверяйте формулировку каждой цели перед эвакуацией.');
  return tips.slice(0,5);
}
function renderQuestSummary(){
  const all=questCatalog.quests,completed=all.filter(quest=>questState(quest)==='completed').length,active=all.filter(quest=>questState(quest)==='active').length;
  const totalObjectives=all.reduce((sum,quest)=>sum+quest.objectives.length,0),doneObjectives=all.reduce((sum,quest)=>sum+(questRecord(quest.id).objectives||[]).filter(Boolean).length,0),percent=all.length?Math.round(completed/all.length*100):0;
  $('#questTotal').textContent=all.length;$('#questActive').textContent=active;$('#questCompleted').textContent=completed;$('#questObjectivesDone').textContent=doneObjectives;$('#questObjectivesTotal').textContent=`из ${totalObjectives}`;$('#questProgressPercent').textContent=`${percent}%`;$('#questProgressRing').style.setProperty('--progress',percent);
}
function renderQuestList(){
  const list=visibleQuests();
  if(!selectedQuestId||!list.some(quest=>quest.id===selectedQuestId))selectedQuestId=list[0]?.id||null;
  $('#questResultCount').textContent=`${list.length} ${plural(list.length,'задание','задания','заданий')}`;
  $('#questList').innerHTML=list.length?list.map(quest=>{const progress=questRecord(quest.id),done=(progress.objectives||[]).filter(Boolean).length,state=questState(quest);return`<button class="quest-card ${state} ${selectedQuestId===quest.id?'selected':''}" data-quest-id="${escapeHtml(quest.id)}"><span class="quest-card-art">${escapeHtml(quest.trader.slice(0,1))}</span><span class="quest-card-main"><strong>${escapeHtml(quest.name)}</strong><span>${escapeHtml(quest.trader)} · ${escapeHtml(quest.maps.map(map=>questMapNames[map]||map).join(', ')||'Любая карта')}</span></span><span class="quest-card-progress"><strong>${state==='completed'?'ГОТОВО':`${done}/${quest.objectives.length}`}</strong><span>${quest.xp?`${quest.xp.toLocaleString('ru-RU')} XP`:'ЗАДАНИЕ'}</span></span></button>`;}).join(''):'<div class="empty"><strong>Квесты не найдены</strong>Измените запрос или фильтры.</div>';
  renderQuestDetail();
}
function renderQuestDetail(){
  const quest=questCatalog.quests.find(item=>item.id===selectedQuestId),detail=$('#questDetail');
  if(!quest){detail.innerHTML='<div class="quest-detail-empty"><span>◇</span><strong>Выберите квест</strong><p>Здесь появятся цели, маршрут, награды и связанные задания.</p></div>';return;}
  const progress=questRecord(quest.id),state=questState(quest),previous=quest.previousQuestIds.map(id=>questCatalog.quests.find(item=>item.id===id)).filter(Boolean),next=quest.nextQuestIds.map(id=>questCatalog.quests.find(item=>item.id===id)).filter(Boolean),image=questImageUrl(quest.imageUrl);
  const objectives=quest.objectives.map((objective,index)=>`<label class="quest-objective"><input type="checkbox" data-objective-index="${index}" ${progress.objectives?.[index]?'checked':''}><span>${escapeHtml(objective.text)} ${objective.optional?'<em>· НЕОБЯЗАТЕЛЬНО</em>':''}</span></label>`).join('')||'<div class="empty">Для этого задания нет отдельных целей.</div>';
  const meta=[quest.maps.length?['КАРТА',quest.maps.map(map=>questMapNames[map]||map).join(', ')]:null,quest.xp?['ОПЫТ',`${quest.xp.toLocaleString('ru-RU')} XP`]:null,quest.requiredItems.length?['НУЖНО ПРИНЕСТИ',quest.requiredItems.map(formatItem).join(' · ')]:null,quest.rewardItems.length?['НАГРАДЫ',quest.rewardItems.map(formatItem).join(' · ')]:null].filter(Boolean);
  detail.innerHTML=`<div class="quest-detail-cover">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:''}<div class="eyebrow">${escapeHtml(quest.trader)} · ${quest.oneRaid?'ОДИН РЕЙД':'ЗАДАНИЕ'}</div><h2>${escapeHtml(quest.name)}</h2><p>${escapeHtml(quest.nameEn)}</p></div><div class="quest-detail-body"><p class="quest-description">${escapeHtml(quest.description)}</p><section class="quest-block"><h3>ЦЕЛИ · ${quest.ordered?'ПО ПОРЯДКУ':'В ЛЮБОМ ПОРЯДКЕ'}</h3><div class="quest-objectives">${objectives}</div></section><section class="quest-block"><h3>КАК ВЫПОЛНИТЬ</h3><ul class="quest-tips">${questTips(quest).map(tip=>`<li>${escapeHtml(tip)}</li>`).join('')}</ul></section>${meta.length?`<section class="quest-block"><h3>СВОДКА</h3><div class="quest-meta-grid">${meta.map(([label,value])=>`<div class="quest-meta-card"><small>${label}</small><strong>${escapeHtml(value)}</strong></div>`).join('')}</div></section>`:''}${previous.length||next.length?`<section class="quest-block"><h3>ЦЕПОЧКА ЗАДАНИЙ</h3><div class="quest-chain">${previous.map(item=>`<button data-related-quest="${escapeHtml(item.id)}">← ${escapeHtml(item.name)}</button>`).join('')}${next.map(item=>`<button data-related-quest="${escapeHtml(item.id)}">${escapeHtml(item.name)} →</button>`).join('')}</div></section>`:''}<button class="primary quest-complete ${state==='completed'?'done':''}" data-quest-complete>${state==='completed'?'✓ Задание завершено':'Отметить задание выполненным'}</button></div>`;
}
function renderQuestView(){renderQuestSummary();renderQuestList();}
function setupQuestFilters(){
  const traders=[...new Set(questCatalog.quests.map(quest=>quest.trader))].sort((a,b)=>a.localeCompare(b,'ru')),maps=[...new Set(questCatalog.quests.flatMap(quest=>quest.maps))].sort((a,b)=>(questMapNames[a]||a).localeCompare(questMapNames[b]||b,'ru'));
  $('#questTraderFilter').insertAdjacentHTML('beforeend',traders.map(trader=>`<option value="${escapeHtml(trader)}">${escapeHtml(trader)}</option>`).join(''));
  $('#questMapFilter').insertAdjacentHTML('beforeend',maps.map(map=>`<option value="${escapeHtml(map)}">${escapeHtml(questMapNames[map]||map)}</option>`).join(''));
  const date=questCatalog.syncedAt?new Date(questCatalog.syncedAt).toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'}):'локальная база';$('#questDataDate').textContent=`Обновлено ${date}`;
}

function showView(view){
  const player=view==='player';
  const help=view==='help';
  const quests=view==='quests';
  $('#eventsView').hidden=player||help||quests; $('#playerView').hidden=!player; $('#helpView').hidden=!help; $('#questsView').hidden=!quests;
  $('#mainTitle').textContent=player?'Статистика игрока':help?'Справка':quests?'Квесты ARC Raiders':'События в ARC';
  $('#mainEyebrow').childNodes[0].textContent=player?'ЛИЧНОЕ ДЕЛО РЕЙДЕРА ':help?'ЦЕНТР ПОДДЕРЖКИ ':quests?'АРХИВ ЗАДАНИЙ ':'ОПЕРАТИВНАЯ СВОДКА ';
  $('.top-actions').hidden=player||help||quests;
  if(player){renderSteamProfile();loadPlayerData();}
  if(quests)renderQuestView();
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
function activateView(view){activeView=view;$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));showView(view);if(!['player','help','quests'].includes(view))renderList();}
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
$('#questSearch').addEventListener('input',e=>{questQuery=e.target.value.trim().toLowerCase();renderQuestList();});
$('#questTraderFilter').addEventListener('change',e=>{questTrader=e.target.value;renderQuestList();});
$('#questMapFilter').addEventListener('change',e=>{questMap=e.target.value;renderQuestList();});
$('#questStatusFilters').addEventListener('click',e=>{const button=e.target.closest('[data-quest-status]');if(!button)return;questStatus=button.dataset.questStatus;$$('[data-quest-status]').forEach(item=>item.classList.toggle('active',item===button));renderQuestList();});
$('#questList').addEventListener('click',e=>{const card=e.target.closest('[data-quest-id]');if(!card)return;selectedQuestId=card.dataset.questId;renderQuestList();});
$('#questDetail').addEventListener('change',e=>{const checkbox=e.target.closest('[data-objective-index]');if(!checkbox||!selectedQuestId)return;const progress=questRecord(selectedQuestId);progress.objectives=[...(progress.objectives||[])];progress.objectives[Number(checkbox.dataset.objectiveIndex)]=checkbox.checked;questProgress[selectedQuestId]=progress;saveQuestProgress();renderQuestView();});
$('#questDetail').addEventListener('click',e=>{const related=e.target.closest('[data-related-quest]');if(related){selectedQuestId=related.dataset.relatedQuest;questQuery='';questTrader='all';questMap='all';questStatus='all';$('#questSearch').value='';$('#questTraderFilter').value='all';$('#questMapFilter').value='all';$$('[data-quest-status]').forEach(item=>item.classList.toggle('active',item.dataset.questStatus==='all'));renderQuestView();return;}const complete=e.target.closest('[data-quest-complete]');if(!complete||!selectedQuestId)return;const progress=questRecord(selectedQuestId);progress.completed=!progress.completed;if(progress.completed)progress.objectives=questCatalog.quests.find(quest=>quest.id===selectedQuestId).objectives.map(()=>true);questProgress[selectedQuestId]=progress;saveQuestProgress();renderQuestView();});
$('#questsView').addEventListener('click',async e=>{const external=e.target.closest('[data-external]');if(external)await window.arcApp.openExternal(external.dataset.external);});
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
if(schedule){setSyncState('cached');render();scheduleDesktopNotifications();}setupQuestFilters();renderSteamProfile();window.arcApp.version().then(version=>{$('#appVersion').textContent=`v${version}`;});loadSystemSettings();window.arcApp.credentialStatus().then(state=>{setConnectionBadge('#steamConnection',Boolean(steamAccount)&&state.steamApiKey);setConnectionBadge('#arcConnection',state.arcAppKey&&state.arcUserKey);});syncSchedule();
