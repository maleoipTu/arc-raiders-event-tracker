/* Local map viewer. Navigation and source links are owned by renderer.js. */
window.ARCMaps = (() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = (key,fallback) => {try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
  const kinds = {quest:'Квесты',container:'Контейнеры',arc:'Машины ARC',carryable:'Переносимые предметы',interactable:'Взаимодействие',location:'Места',event:'События',misc:'Прочее',hazard:'Опасности',nature:'Растения',personal:'Мои метки',extraction:'Эвакуации'};
  const labels = {questProp:'Цель задания',medCrate:'Медицинский ящик',ammoCrate:'Ящик с патронами',grenadeCrate:'Ящик с гранатами',weaponCase:'Оружейный кейс',husk:'Обломки ARC',raiderCache:'Тайник рейдера',raiderBackpack:'Рюкзак рейдера',fieldCrate:'Полевой ящик',weaponRack:'Оружейная стойка',fuelCell:'Топливная ячейка',huskCore:'Ядро обломков',zipline:'Трос',power:'Питание',battery:'Батарея',dropOffStation:'Пункт сдачи',fieldDepot:'Полевое хранилище',spawnGround:'Наземные ARC',assessor:'Оценщик',frigateDropsite:'Добыча фрегата',frigatePath:'Маршрут фрегата',frigatePose:'Фрегат',huskLoot:'Добыча из обломков',lockedRoom:'Запертая комната',mastLift:'Подъёмник',snowPile:'Сугроб',spawnTurret:'Турель',spawnSniper:'Стрелок',fruitBasket:'Корзина фруктов',camera:'Камера',carAlarm:'Автосигнализация',metalDetector:'Металлоискатель',spawnMonolith:'Монолит',spawnAir:'Летающие ARC',spawnSnitch:'Стукач',spawnSurveyor:'Наблюдатель',toxicSludge:'Токсичная жижа',raiderHatch:'Рейдерский люк',probeLanding:'Место посадки зонда',courierWreck:'Обломки курьера',crashedProbe:'Разбившийся зонд',extraction:'Эвакуация',playerSpawn:'Место появления рейдера',piano:'Пианино',harvester:'Сборщик',spawnBoss:'Крупный ARC',supplyCallStation:'Вызов припасов',agave:'Агава',apricot:'Абрикос',candleberries:'Восковые ягоды',fertilizer:'Удобрение',greatMullein:'Коровяк',mushroom:'Гриб',pricklyPear:'Опунция',roots:'Корни',volcanicRock:'Вулканическая порода'};
  const symbols={quest:'◇',container:'▪',arc:'△',carryable:'◆',interactable:'+',location:'●',event:'✦',misc:'·',hazard:'!',nature:'♧',personal:'★',extraction:'↗'};
  let catalog,model,navigate,openQuest,openSource,host,map,floor,pins=[],personal=[],state={},cache=new Map(),generation=0;
  let categories=new Set(['quest','extraction','location','personal']),query='',selected=null,addMode=false,scale=1,fitScale=1,tx=0,ty=0,drag=null,moved=false,pointers=new Map(),pinch=null;
  const questById = id => window.ARC_QUEST_CATALOG?.quests.find(quest=>quest.id===id);
  const category = pin => ['extraction','raiderHatch','mastLift'].includes(pin.subtype)?'extraction':pin.kind||'misc';
  const title = pin => pin.title || (pin.questId && questById(pin.questId)?.name) || labels[pin.subtype] || kinds[category(pin)] || 'Точка карты';
  function save(){try{localStorage.setItem('arc-map-settings-v1',JSON.stringify({...state,lastMap:map?.id}));localStorage.setItem('arc-map-pins-v1',JSON.stringify(personal));}catch{$('#mapMessage').textContent='Не удалось сохранить: хранилище устройства заполнено.';}}
  function init(options){({catalog,model,navigate,openQuest,openSource}=options);host=$('#mapsView');const raw=read('arc-map-settings-v1',{});state=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};personal=model.cleanPins(read('arc-map-pins-v1',[]),catalog.maps);}
  async function show(intent={}){
    const next=catalog.maps.find(item=>item.id===intent.id)||catalog.maps.find(item=>item.id===state.lastMap)||catalog.maps[0];
    host.innerHTML=`<div class="atlas-intro"><div><div class="eyebrow">АТЛАС ПОВЕРХНОСТИ</div><p>Карты ARC Tracker · локальные подложки и точки · личные метки</p></div><button class="secondary" data-map-source>Источник ↗</button></div><div class="atlas-toolbar"><label>Карта<select id="atlasMap" aria-label="Карта">${catalog.maps.map(item=>`<option value="${e(item.id)}" ${item.id===next.id?'selected':''}>${e(item.name)}</option>`).join('')}</select></label><label>Этаж<select id="atlasFloor" aria-label="Этаж карты"></select></label><label class="atlas-search">Поиск точек<input id="atlasSearch" type="search" placeholder="Место, предмет или квест" value="${e(query)}"></label></div><div class="atlas-layout"><aside class="atlas-filters"><div class="atlas-filter-head"><strong>Слои карты</strong><button class="atlas-link" id="atlasReset">Сбросить</button></div><div id="atlasCategories"></div><p class="atlas-hint">Точки показывают возможные места появления. События и условия могут менять доступность.</p></aside><div class="atlas-main"><div class="atlas-map" id="atlasViewport" tabindex="0" aria-label="Интерактивная карта: перетащите или используйте стрелки"><div class="atlas-world" id="atlasWorld"><img id="atlasImage" alt="Подложка карты"><div id="atlasPins"></div></div><div class="atlas-controls"><button id="atlasMinus" aria-label="Уменьшить карту">−</button><button id="atlasFit">Целиком</button><button id="atlasPlus" aria-label="Увеличить карту">+</button></div><div class="atlas-compass" aria-hidden="true">N ↑</div></div><div class="atlas-status"><span id="atlasCount" role="status"></span><button class="secondary" id="atlasAdd">＋ Моя метка</button></div><div id="mapMessage" class="atlas-message" role="status"></div><div id="atlasDetail" class="atlas-detail"><p>Нажмите на точку, чтобы узнать подробности. Колёсико и жест двумя пальцами меняют масштаб.</p></div><div class="atlas-source" id="atlasSource"></div></div></div>`;
    bind();await selectMap(next.id,intent.floorId);if(intent.questId){query=questById(intent.questId)?.name||intent.questId;$('#atlasSearch').value=query;categories.add('quest');renderCategories();renderPins();}
  }
  async function selectMap(id, floorId){
    const request=++generation;map=catalog.maps.find(item=>item.id===id);state.lastMap=id;selected=null;
    addMode=false;drag=null;pinch=null;pointers.clear();$('#atlasAdd').classList.remove('active');$('#atlasDetail').innerHTML='<p>Нажмите на точку, чтобы узнать подробности.</p>';
    floor=map.floors.find(item=>item.id===(floorId||state[id]?.floorId))||map.floors[0];
    $('#atlasFloor').innerHTML=map.floors.map(item=>`<option value="${e(item.id)}" ${item.id===floor.id?'selected':''}>${e(item.name)}</option>`).join('');
    $('#atlasCount').textContent='Загрузка локальных точек…';pins=[];renderPins();loadImage();
    try {
      if(!cache.has(id))cache.set(id,fetch(map.pinsPath).then(response=>{if(!response.ok)throw Error('Файл карты недоступен');return response.json();}).catch(error=>{cache.delete(id);throw error;}));
      const data=await cache.get(id);if(request!==generation)return;
      pins=data.pins.filter(pin=>pin.gate!=='none');
      $('#atlasSource').textContent=`ARC Tracker · ${data.gameVersion||'версия не указана'} · снимок ${new Date(data.syncedAt).toLocaleDateString('ru-RU')} · ${map.pinCount.toLocaleString('ru-RU')} исходных точек`;
      $('#mapMessage').textContent='';renderCategories();renderPins();fit();save();
    } catch(error){if(request===generation){$('#mapMessage').textContent=`Не удалось загрузить точки: ${error.message}. Выберите карту снова для повтора.`;$('#atlasCount').textContent='Точки недоступны';}}
  }
  function loadImage(){
    $('#atlasTiles')?.remove();
    const img=$('#atlasImage');img.onload=()=>{$('#mapMessage').textContent='';};img.onerror=()=>{$('#mapMessage').textContent='Подложка не загрузилась. Координаты сохранены; повторите открытие карты.';};img.src=floor.image;
    img.hidden=!!floor.tiles;
    if(floor.tiles){const tiles=document.createElement('div');tiles.id='atlasTiles';tiles.innerHTML=floor.tiles.map(tile=>`<img src="${e(tile.image)}" alt="" style="position:absolute;left:${tile.x}px;top:${tile.y}px;width:${tile.size}px;height:${tile.size}px;pointer-events:none">`).join('');tiles.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none';$('#atlasWorld').prepend(tiles);for(const tile of tiles.querySelectorAll('img'))tile.onerror=()=>{$('#mapMessage').textContent='Часть подложки не загрузилась. Повторите открытие карты.';};}
    $('#atlasWorld').style.width=`${map.imageSize.w}px`;$('#atlasWorld').style.height=`${map.imageSize.h}px`;
  }
  function renderCategories(){
    const counts=new Map();for(const pin of [...pins,...personal.filter(item=>item.mapId===map.id)]){const layer=pin.floorId||pin.floor;if(!layer||layer===floor.id)counts.set(category(pin),(counts.get(category(pin))||0)+1);}
    $('#atlasCategories').innerHTML=[...Object.entries(kinds)].filter(([kind])=>counts.has(kind)||kind==='personal').map(([kind,name])=>`<label class="atlas-category" data-kind="${kind}"><input type="checkbox" value="${kind}" ${categories.has(kind)?'checked':''}><span class="atlas-key" data-kind="${kind}">${symbols[kind]}</span><span>${name}</span><small>${counts.get(kind)||0}</small></label>`).join('');
    if($('#atlasLayerSummary'))$('#atlasLayerSummary').textContent=`Слои карты · включено ${categories.size}`;
  }
  function visiblePins(){
    return [...pins,...personal.filter(pin=>pin.mapId===map.id)].filter(pin=>{const layer=pin.floorId||pin.floor;return (!layer||layer===floor.id)&&categories.has(category(pin))&&`${title(pin)} ${labels[pin.subtype]||''} ${pin.description||''} ${(pin.questLinks||[]).map(link=>questById(link.questId)?.name||'').join(' ')}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'));});
  }
  function renderPins(){
    const visible=visiblePins();
    $('#atlasPins').innerHTML=visible.map(pin=>{const point=model.pinPoint(pin,map,floor);if(!point)return '';return `<button class="atlas-pin ${selected===pin.id?'selected':''}" data-pin="${e(pin.id)}" data-kind="${category(pin)}" style="left:${point.x}px;top:${point.y}px" title="${e(title(pin))}" aria-label="${e(title(pin))}">${symbols[category(pin)]||'•'}</button>`;}).join('');
    $('#atlasCount').textContent=visible.length?`${visible.length.toLocaleString('ru-RU')} точек · ${Math.round(scale*100)}%`:'Нет точек для выбранных слоёв и поиска';
  }
  function transform(){const world=$('#atlasWorld');if(!world)return;world.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;world.style.setProperty('--atlas-inverse',1/scale);}
  function fit(){const viewport=$('#atlasViewport');if(!viewport||!map)return;fitScale=Math.min((viewport.clientWidth-16)/map.imageSize.w,(viewport.clientHeight-16)/map.imageSize.h);scale=fitScale;tx=(viewport.clientWidth-map.imageSize.w*scale)/2;ty=(viewport.clientHeight-map.imageSize.h*scale)/2;transform();}
  function zoom(factor,cx,cy){const view=$('#atlasViewport');cx??=view.clientWidth/2;cy??=view.clientHeight/2;const before=scale;scale=Math.max(fitScale*.5,Math.min(5,scale*factor));tx=cx-(cx-tx)*scale/before;ty=cy-(cy-ty)*scale/before;transform();$('#atlasCount').textContent=`${visiblePins().length.toLocaleString('ru-RU')} точек · ${Math.round(scale*100)}%`;}
  function itemLink(item){const id=item.itemId||item.id||item;const name=catalog.items.find(value=>value.id===id)?.name||id;return `<button class="atlas-link" data-map-item="${e(id)}">${e(name)}${item.quantity?` ×${e(item.quantity)}`:''}</button>`;}
  function detail(pin){
    selected=pin.id;renderPins();const links=[...new Set([pin.questId,...(pin.questLinks||[]).map(link=>link.questId)].filter(Boolean))];
    const conditions=[];if(pin.gate&&pin.gate!=='base')conditions.push(`Условие: ${eventName(pin.gate)}`);if(pin.absentIn?.length)conditions.push(`Отсутствует: ${pin.absentIn.map(eventName).join(', ')}`);if(pin.variants?.length)conditions.push('Варианты точки зависят от игровой ротации.');
    $('#atlasDetail').innerHTML=`<div class="atlas-detail-head"><div><small>${e(kinds[category(pin)])} · ${e(floor.name)}</small><h3>${e(title(pin))}</h3></div>${pin.kind==='personal'?`<button class="secondary" data-delete-pin="${e(pin.id)}">Удалить</button>`:''}</div>${pin.description?`<p>${e(pin.description)}</p>`:''}${conditions.map(text=>`<p class="atlas-condition">${e(text)}</p>`).join('')}${pin.confidence?`<small>Оценка источника: ${e(({high:'высокая уверенность',medium:'средняя уверенность',low:'требует проверки'})[pin.confidence]||pin.confidence)}</small>`:''}${pin.requiredItems?.length?`<div class="atlas-related"><strong>Нужные предметы</strong>${pin.requiredItems.map(itemLink).join('')}</div>`:''}${links.length?`<div class="atlas-related"><strong>Связанные задания</strong>${links.map(id=>`<button class="atlas-link" data-map-quest="${e(id)}">◇ ${e(questById(id)?.name||'Задание отсутствует в локальном каталоге')}</button>`).join('')}</div>`:''}<p class="atlas-coords">Координаты источника: ${Number(pin.lng).toFixed(1)}, ${Number(pin.lat).toFixed(1)}</p>`;
  }
  function eventName(id){return catalog.events.find(event=>event.id===id)?.name||id;}
  function showPinForm(point){
    const coords=model.storagePoint(point,map,floor);
    $('#atlasDetail').innerHTML=`<form id="atlasPinForm"><h3>Новая личная метка</h3><label>Название<input id="atlasPinName" maxlength="100" required placeholder="Например, место для следующего рейда"></label><div><button class="primary" type="submit">Сохранить</button><button class="secondary" id="atlasPinCancel" type="button">Отмена</button></div></form>`;
    $('#atlasPinName').focus();$('#atlasPinForm').onsubmit=event=>{event.preventDefault();const name=$('#atlasPinName').value.trim();if(!name)return;const pin={id:`personal-${crypto.randomUUID()}`,mapId:map.id,floor:floor.id,floorId:floor.id,kind:'personal',title:name,...coords};personal.push(pin);if(personal.length>500)personal.shift();categories.add('personal');save();renderCategories();detail(pin);};
    $('#atlasPinCancel').onclick=()=>{$('#atlasDetail').innerHTML='<p>Создание метки отменено.</p>';};
  }
  function bind(){
    const filters=host.querySelector('.atlas-filters'),fold=document.createElement('details');fold.className=filters.className;fold.open=window.innerWidth>800;const summary=document.createElement('summary');summary.id='atlasLayerSummary';summary.textContent=`Слои карты · включено ${categories.size}`;fold.append(summary);while(filters.firstChild)fold.append(filters.firstChild);filters.replaceWith(fold);
    host.onclick=event=>{
      if(event.target.closest('[data-map-source]'))openSource(map.sourceUrl);
      const node=event.target.closest('[data-pin]');if(node&&!moved){const pin=[...pins,...personal].find(pin=>pin.id===node.dataset.pin);if(pin)detail(pin);}
      const quest=event.target.closest('[data-map-quest]');if(quest)openQuest(quest.dataset.mapQuest);
      const item=event.target.closest('[data-map-item]');if(item)navigate('wiki',{kind:'item',id:item.dataset.mapItem});
      const remove=event.target.closest('[data-delete-pin]');if(remove){personal=personal.filter(pin=>pin.id!==remove.dataset.deletePin);save();renderCategories();renderPins();$('#atlasDetail').innerHTML='<p>Личная метка удалена.</p>';}
    };
    $('#atlasMap').onchange=event=>selectMap(event.target.value);
    $('#atlasFloor').onchange=event=>{floor=map.floors.find(value=>value.id===event.target.value);state[map.id]={floorId:floor.id};save();loadImage();selected=null;addMode=false;pointers.clear();pinch=null;drag=null;$('#atlasAdd').classList.remove('active');renderCategories();renderPins();$('#atlasDetail').innerHTML='<p>Нажмите на точку нового этажа.</p>';fit();};
    $('#atlasSearch').oninput=event=>{query=event.target.value.trim();renderPins();};
    $('#atlasCategories').onchange=event=>{const input=event.target.closest('input');if(!input)return;input.checked?categories.add(input.value):categories.delete(input.value);renderPins();};
    $('#atlasReset').onclick=()=>{query='';$('#atlasSearch').value='';categories=new Set(['quest','extraction','location','personal']);renderCategories();renderPins();};
    $('#atlasMinus').onclick=()=>zoom(1/1.35);$('#atlasPlus').onclick=()=>zoom(1.35);$('#atlasFit').onclick=fit;
    $('#atlasAdd').onclick=()=>{addMode=!addMode;$('#atlasAdd').classList.toggle('active',addMode);$('#mapMessage').textContent=addMode?'Нажмите на карту, где нужна метка. Перетаскивание перемещает карту.':'';};
    const viewport=$('#atlasViewport');
    viewport.onwheel=event=>{event.preventDefault();const rect=viewport.getBoundingClientRect();zoom(event.deltaY<0?1.12:1/1.12,event.clientX-rect.left,event.clientY-rect.top);};
    viewport.onkeydown=event=>{const moves={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};if(moves[event.key]){event.preventDefault();tx+=moves[event.key][0];ty+=moves[event.key][1];transform();}if(event.key==='+'||event.key==='=')zoom(1.35);if(event.key==='-')zoom(1/1.35);if(event.key==='Escape'){addMode=false;$('#atlasAdd').classList.remove('active');$('#mapMessage').textContent='';}};
    viewport.onpointerdown=event=>{
      if(event.target.closest('.atlas-controls')||event.button>0)return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});moved=false;
      drag={x:event.clientX,y:event.clientY,tx,ty,pin:event.target.closest('[data-pin]')?.dataset.pin};
      if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y)};moved=true;}
      viewport.setPointerCapture(event.pointerId);
    };
    viewport.onpointermove=event=>{
      if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pointers.size===2&&pinch){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),rect=viewport.getBoundingClientRect();zoom(distance/pinch.distance,(a.x+b.x)/2-rect.left,(a.y+b.y)/2-rect.top);pinch.distance=distance;moved=true;return;}
      if(drag&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5){moved=true;tx=drag.tx+event.clientX-drag.x;ty=drag.ty+event.clientY-drag.y;transform();}
    };
    const up=event=>{
      if(!pointers.has(event.pointerId))return;
      const wasPinch=!!pinch,pressedPin=drag?.pin;pointers.delete(event.pointerId);if(!pointers.size){pinch=null;
        if(pressedPin&&!moved&&!wasPinch){const pin=[...pins,...personal].find(pin=>pin.id===pressedPin);if(pin)detail(pin);}
        if(addMode&&!moved&&!wasPinch&&!pressedPin){const rect=viewport.getBoundingClientRect(),point={x:(event.clientX-rect.left-tx)/scale,y:(event.clientY-rect.top-ty)/scale};if(point.x>=0&&point.y>=0&&point.x<=map.imageSize.w&&point.y<=map.imageSize.h){addMode=false;$('#atlasAdd').classList.remove('active');$('#mapMessage').textContent='';showPinForm(point);}}
        drag=null;
      }else{const other=[...pointers.values()][0];drag={x:other.x,y:other.y,tx,ty};moved=true;}
    };
    viewport.onpointerup=up;viewport.onpointercancel=()=>{pointers.clear();drag=null;pinch=null;};
  }
  return {init,show,resize:()=>{if(host&&!host.hidden)fit();}};
})();
