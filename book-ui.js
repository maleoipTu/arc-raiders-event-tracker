(function (global) {
  'use strict';
  const PAGE_SIZE = 60;
  const STORAGE_KEY = 'arc-hideout-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const local = value => typeof value === 'object' && value ? value.ru || value.en || '' : String(value ?? '');
  const list = value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
  const format = value => typeof value === 'number' ? value.toLocaleString('ru-RU') : local(value);
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : local(value);
  const number = value => Math.max(0, Math.floor(Number(value) || 0));
  const rarityNames = { Common: 'Обычный', Uncommon: 'Необычный', Rare: 'Редкий', Epic: 'Эпический', Legendary: 'Легендарный' };
  const typeNames = { 'Quick Use': 'Быстрое использование', Nature: 'Природные ресурсы', Research: 'Исследования', 'Outpost Furniture': 'Мебель для аванпоста', 'Outpost Room': 'Комнаты аванпоста', Design: 'Проекты', Blueprint: 'Чертежи', Recyclable: 'Вторсырьё', 'Basic Material': 'Базовые материалы', 'Refined Material': 'Обработанные материалы', 'Topside Material': 'Материалы поверхности', Key: 'Ключи', Trinket: 'Безделушки', Valuable: 'Ценности', Modification: 'Модификации', 'Hand Cannon': 'Ручницы', 'Assault Rifle': 'Штурмовые винтовки', 'Battle Rifle': 'Боевые винтовки', Pistol: 'Пистолеты', Shotgun: 'Дробовики', SMG: 'Пистолеты-пулемёты', LMG: 'Пулемёты', 'Sniper Rifle': 'Снайперские винтовки', Special: 'Специальное оружие', Ammunition: 'Боеприпасы', Shield: 'Щиты', Augment: 'Аугментации', Misc: 'Разное', Cosmetic: 'Косметика', Outfit: 'Костюмы', Stencil: 'Трафареты', 'Backpack Charm': 'Брелоки рюкзака', 'Backpack Attachment': 'Модули рюкзака', Weapon: 'Оружие', Material: 'Материалы', 'Key Material': 'Материалы ключей' };
  const weapons = new Set(['Hand Cannon', 'Assault Rifle', 'Battle Rifle', 'Pistol', 'Shotgun', 'SMG', 'LMG', 'Sniper Rifle', 'Special', 'Weapon']);
  const statNames = { 'Heavy Ammo': 'Тяжёлые патроны', 'Medium Ammo': 'Средние патроны', 'Light Ammo': 'Лёгкие патроны', 'Shotgun Ammo': 'Патроны для дробовика', 'Energy Clip': 'Энергетическая обойма', Strong: 'Сильное', Weak: 'Слабое', Moderate: 'Среднее', 'Very Strong': 'Очень сильное', 'Very Weak': 'Очень слабое', 'Single-Action': 'Одинарного действия', 'Fully-Automatic': 'Автоматический', 'Semi-Automatic': 'Полуавтоматический', CONDITIONING: 'Выносливость', MOBILITY: 'Подвижность', SURVIVAL: 'Выживание', ground: 'Наземный', flying: 'Летающий', heavy: 'Тяжёлый', sturdy: 'Прочный', light: 'Лёгкий', minor: 'Малое событие', major: 'Условие карты' };
  const categories = [ ['all', 'Всё', '◈'], ['items', 'Предметы', '▣'], ['weapons', 'Оружие', '⌁'], ['arcs', 'Машины ARC', '◎'], ['quests', 'Квесты', '◇'], ['maps', 'Карты', '⌖'], ['stations', 'Мастерская', '⚒'], ['skills', 'Навыки', '↗'], ['projects', 'Проекты', '▤'], ['events', 'События', '◷'], ['traders', 'Торговцы', '⇄'], ['research', 'Исследования', '⌬'], ['outposts', 'Аванпост', '⌂'] ];
  let options, catalog, model, itemById, stationById, entries = [], entryByKey;
  let wiki = { category: 'all', query: '', page: 0, selected: null, stack: [], scroll: 0 };
  let hideout, hideoutNotice = '', wikiNotice = '', storageAvailable = true, inventoryQuery = '';
  let initialized = false;

  function imageUrl(value) {
    if (typeof value !== 'string') return '';
    if (/^assets\/[\w/.-]+\.(png|webp|jpe?g|svg)$/i.test(value) && !value.split('/').includes('..')) return value;
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'cdn.arctracker.io' ? url.href : ''; } catch { return ''; }
  }
  const image = (value, className = '') => {
    const url = imageUrl(value); return url ? `<img src="${esc(url)}" class="${className}" alt="" loading="lazy" decoding="async">` : `<span class="book-no-image ${className}" aria-hidden="true">◇</span>`;
  };
  const itemName = id => itemById.get(id)?.name || (id === 'coins' ? 'Монеты' : `Нет в каталоге: ${id}`);
  const sourceButton = url => typeof url === 'string' && /^https:\/\/(arctracker\.io|github\.com)(\/|$)/.test(url) ? `<button class="book-source book-link" data-book-source="${esc(url)}">Источник ↗</button>` : '';
  const link = (kind, id, label) => `<button class="book-link" data-book-kind="${esc(kind)}" data-book-id="${esc(id)}">${esc(label)}</button>`;
  const itemLink = id => itemById.has(id) ? link('item', id, itemName(id)) : `<span class="book-missing">${esc(itemName(id))}</span>`;
  const section = (title, body) => body ? `<section class="book-section"><h3>${esc(title)}</h3>${body}</section>` : '';
  const p = value => value ? `<p class="book-description">${esc(local(value))}</p>` : '';
  const paragraphs = value => typeof value === 'string' ? p(value) : list(value).map(p).join('');
  const wikiNoticeHtml = () => wikiNotice ? `<div class="book-notice" role="status">${esc(wikiNotice)}</div>` : '';
  const badge = value => `<span class="book-badge">${esc(value)}</span>`;
  const definition = rows => `<dl class="book-stats">${rows.filter(row => row[1] !== undefined && row[1] !== null && row[1] !== '').map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(format(value))}</dd></div>`).join('')}</dl>`;
  const itemRows = values => list(values).length ? `<div class="book-item-rows">${list(values).filter(value => typeof value === 'string' || value && (value.itemId || value.id)).map(value => {
    const id = typeof value === 'string' ? value : value.itemId || value.id;
    return `<div class="book-item-row">${itemLink(id)}<strong>${esc(value.quantity ?? value.amount ?? 1)}×</strong></div>`;
  }).join('')}</div>` : '';
  const materialObject = value => itemRows(Object.entries(value || {}).map(([id, quantity]) => ({ id, quantity })));
  const requirements = values => list(values).map(value => {
    if (typeof value === 'string') return `<li>${esc(value.replace(/Coins/g, 'монет').replace(/slots/g, 'ячеек').replace(/total/g, 'всего'))}</li>`;
    if (value.itemId) return `<li>${itemLink(value.itemId)}${value.quantity ? ` × ${esc(value.quantity)}` : ''}</li>`;
    if (value.station) return `<li>${link('station', value.station, stationById.get(value.station)?.name || value.station)} · уровень ${esc(value.level)}</li>`;
    if (value.outpostRooms) return `<li>Комнат аванпоста: ${esc(value.outpostRooms)}</li>`;
    if (value.type || value.kind) return `<li>${esc(value.label || value.name || 'Дополнительное условие')} ${esc(value.amount || value.value || '')}</li>`;
    return '';
  }).filter(Boolean).join('');
  const statusLine = () => `<div class="book-status"><span class="book-offline-dot"></span>База доступна без сети <span>ARC Tracker · ${esc(new Date(catalog.generatedAt || catalog.syncedAt).toLocaleDateString('ru-RU'))}</span></div>`;

  function buildEntries() {
    entries = [];
    const add = (kind, category, obj, fallback) => {
      if (!obj) return;
      const id = obj.id || obj.itemId || fallback;
      if (!id) return;
      const name = local(obj.name) || local(obj.title) || (obj.itemId ? itemName(obj.itemId) : String(id));
      entries.push({ key: `${kind}:${id}`, kind, category, id, name, nameEn: local(obj.nameEn), obj, search: [name, obj.nameEn, obj.id, obj.type, local(obj.description), obj.quote].filter(Boolean).join(' ').toLocaleLowerCase('ru-RU') });
    };
    list(catalog.items).forEach(obj => add('item', weapons.has(obj.type) ? 'weapons' : 'items', obj));
    list(catalog.arcs).forEach(obj => add('arc', 'arcs', obj));
    list(global.ARC_QUEST_CATALOG?.quests).forEach(obj => add('quest', 'quests', obj));
    list(catalog.maps).forEach(obj => add('map', 'maps', obj));
    list(catalog.stations).forEach(obj => add('station', 'stations', obj));
    list(catalog.skills).forEach(obj => add('skill', 'skills', obj));
    list(catalog.projects).forEach(obj => add('project', 'projects', obj));
    list(catalog.events).forEach((obj, index) => add('event', 'events', obj, `event-${index}`));
    const traders = new Map();
    list(catalog.trades).forEach(trade => { const name = trade.trader || 'Торговец'; if (!traders.has(name)) traders.set(name, []); traders.get(name).push(trade); });
    traders.forEach((trades, name) => add('trader', 'traders', { id: name, name, trades, sourceUrl: trades[0]?.sourceUrl || 'https://arctracker.io/ru/traders' }));
    list(catalog.secondary?.researches).forEach((obj, index) => add('research', 'research', { ...obj, id: obj.itemId || `research-${index}`, name: itemName(obj.itemId) }));
    list(catalog.outpost?.installs).forEach((obj, index) => add('outpost', 'outposts', { ...obj, id: `rooms-${obj.rooms || index}`, name: `Аванпост · ${obj.rooms} комнаты`, sourceUrl: 'https://arctracker.io/ru/outposts' }));
    list(catalog.secondary?.outposts?.furniture || catalog.secondary?.outposts).forEach((obj, index) => add('outpost', 'outposts', { ...obj, id: obj.itemId || obj.id || `outpost-${index}`, name: itemName(obj.itemId || obj.id) }));
    entryByKey = new Map(entries.map(entry => [entry.key, entry]));
  }

  function wikiCount(category) { return entries.filter(entry => category === 'all' || entry.category === category || category === 'items' && entry.kind === 'item').length; }
  function filteredEntries() {
    return entries.filter(entry => (wiki.category === 'all' || entry.category === wiki.category || wiki.category === 'items' && entry.kind === 'item') && entry.search.includes(wiki.query.toLocaleLowerCase('ru-RU').trim()));
  }
  function cardMeta(entry) {
    const obj = entry.obj;
    if (entry.kind === 'item') return `${typeNames[obj.type] || catalog.translations?.itemTypes?.[obj.type] || obj.type || 'Предмет'} · ${rarityNames[obj.rarity] || obj.rarity || ''}`;
    if (entry.kind === 'quest') return `${obj.trader || ''} · ${obj.objectives?.length || 0} целей`;
    if (entry.kind === 'map') return `${obj.pinCount || 0} точек · ${obj.floors?.length || 1} слоёв`;
    if (entry.kind === 'station') return obj.maxLevel === 0 ? 'Базовая станция · без улучшений' : `Уровней: ${obj.maxLevel}`;
    if (entry.kind === 'skill') return statNames[obj.category] || obj.category || 'Навык';
    if (entry.kind === 'research') return `Уровень ${obj.level} · ${number(obj.points).toLocaleString('ru-RU')} очков`;
    if (entry.kind === 'project') return `${obj.phases?.length || 0} этапов${obj.disabled ? ' · Архив' : ''}`;
    if (entry.kind === 'trader') return `${obj.trades.length} обменов`;
    return statNames[obj.group] || statNames[obj.category] || categories.find(value => value[0] === entry.category)?.[1] || '';
  }
  function renderWiki() {
    const root = document.getElementById('wikiView'); if (!root) return;
    const current = wiki.selected && entryByKey.get(wiki.selected);
    if (current) { renderDetail(current); return; }
    const values = filteredEntries(), pages = Math.max(1, Math.ceil(values.length / PAGE_SIZE));
    wiki.page = Math.max(0, Math.min(wiki.page, pages - 1));
    root.innerHTML = `${wikiNoticeHtml()}<div class="book-intro"><div><div class="eyebrow">ПОЛЕВОЙ СПРАВОЧНИК</div><h2>Знания для следующего рейда</h2><p>Предметы, машины ARC, мастерская и всё, что связано с вашим прогрессом.</p></div><div class="book-total"><strong>${entries.length.toLocaleString('ru-RU')}</strong><span>карточек в базе</span></div></div>${statusLine()}<div class="book-search-row"><label class="book-search"><span aria-hidden="true">⌕</span><input id="bookSearch" type="search" placeholder="Поиск на русском или английском" aria-label="Поиск по энциклопедии" value="${esc(wiki.query)}"></label><span id="bookResultCount">Найдено: ${values.length.toLocaleString('ru-RU')}</span></div><div class="book-tabs" aria-label="Категории энциклопедии">${categories.map(([id,name,icon]) => `<button data-book-category="${id}" class="${wiki.category === id ? 'active' : ''}" aria-pressed="${wiki.category === id}"><span>${icon}</span>${name}<small>${wikiCount(id)}</small></button>`).join('')}</div><div class="book-grid">${values.slice(wiki.page * PAGE_SIZE, (wiki.page + 1) * PAGE_SIZE).map(entry => `<button class="book-card" data-book-kind="${entry.kind}" data-book-id="${esc(entry.id)}">${image(entry.obj.imageFilename || entry.obj.imageUrl || entry.obj.image || entry.obj.floors?.[0]?.image,'book-card-image')}<span class="book-card-copy"><strong>${esc(entry.name)}</strong><small>${esc(cardMeta(entry))}</small></span><span class="book-card-arrow">↗</span></button>`).join('') || '<div class="book-empty"><strong>Ничего не найдено</strong><p>Измените запрос или выберите другую категорию.</p><button class="secondary" data-book-reset>Сбросить поиск</button></div>'}</div><div class="book-pagination"><button class="secondary" data-book-page="${wiki.page - 1}" ${wiki.page === 0 ? 'disabled' : ''}>← Назад</button><span>Страница ${wiki.page + 1} из ${pages}</span><button class="secondary" data-book-page="${wiki.page + 1}" ${wiki.page >= pages - 1 ? 'disabled' : ''}>Далее →</button></div><p class="book-footnote">Каталог отражает доступные данные ARC Tracker на указанную дату. Отсутствующие описания и характеристики не дополняются предположениями. Иллюстрации предметов требуют сети; текст и локальные карты доступны без неё.</p>`;
  }
  function renderRecipe(title, recipe) {
    if (!recipe) return '';
    return section(title, `${recipe.requiredBlueprint ? `<p>Нужен чертёж: ${itemLink(recipe.requiredBlueprint.id || recipe.requiredBlueprint.itemId)}</p>` : ''}${recipe.benches?.length ? `<div class="book-inline-links">${recipe.benches.map(value => link('station',value.id || value.stationId,stationById.get(value.id || value.stationId)?.name || local(value.name))).join('')}</div>` : ''}${recipe.hasInRaidCrafting ? p('Доступно изготовление в рейде.') : ''}${itemRows(recipe.materials || recipe.requirementItemIds)}${itemRows(recipe.outputs)}${recipe.quantity ? p(`Выход: ${recipe.quantity}`) : ''}`);
  }
  function renderItem(obj) {
    const r = obj.relations || {};
    const used = list(r.usedInCrafting), mods = list(r.compatibleMods).flatMap(value => value.itemIds || [value]), fits = list(r.compatibleWith);
    const quests = list(global.ARC_QUEST_CATALOG?.quests).filter(quest => [...(quest.requiredItems || []), ...(quest.rewardItems || []), ...(quest.grantedItems || [])].some(value => value.id === obj.id));
    const stations = list(catalog.stations).filter(station => station.levels?.some(level => level.requirementItemIds?.some(value => value.itemId === obj.id)));
    return `${p(obj.description) || '<p class="book-muted">В источнике пока нет описания этого предмета.</p>'}${obj.nameEn && obj.nameEn === obj.name && !/[А-Яа-яЁё]/.test(obj.name) ? p('Название доступно в исходном языке.') : ''}${definition([['Тип',typeNames[obj.type] || catalog.translations?.itemTypes?.[obj.type] || obj.type],['Редкость',rarityNames[obj.rarity] || obj.rarity],['Стоимость продажи',obj.value === undefined ? undefined : `${format(obj.value)} монет`],['Масса',obj.weightKg === undefined ? undefined : `${obj.weightKg} кг`],['В стопке',obj.stackSize],['Данные обновлены',obj.updatedAt]])}${section('Характеристики',Object.entries(obj.effects || {}).length ? definition(Object.entries(obj.effects).map(([key,value]) => [value.label || value.ru || value.en || key,statNames[String(value.value)] || text(value.value)])) : '')}${renderRecipe('Изготовление',r.craftingRecipe)}${renderRecipe('Изготовление чертежа',r.blueprintCraftingRecipe)}${section('Переработка',itemRows(r.recyclesInto?.outputs))}${section('Разбор в рейде',itemRows(r.salvagesInto?.outputs))}${section('Используется для изготовления',itemRows(used))}${section('Совместимые модификации',itemRows(mods))}${section('Подходит к',itemRows(fits))}${renderUpgrades(r)}${section('Требуется в мастерской',stations.length ? `<div class="book-inline-links">${stations.map(station => link('station',station.id,station.name)).join('')}</div>` : '')}${section('Связанные квесты',quests.length ? `<div class="book-inline-links">${quests.map(quest => link('quest',quest.id,quest.name)).join('')}</div>` : '')}${renderResearchLinks(obj.id)}${section('Получение',itemRows(r.canBeObtainedFrom))}${section('Покупка и обмен',renderTrades(list(catalog.trades).filter(trade => (trade.itemId || trade.item?.id) === obj.id),true))}`;
  }
  function renderUpgrades(r) {
    const tree = r.weaponTree;
    const edges = list(tree?.edges).length ? tree.edges : list(tree?.nodes).flatMap(node => list(node.to));
    const repair = list(tree?.nodes).find(node => node.itemId === r.itemId);
    return section('Улучшения оружия',edges.length ? edges.map(edge => `<div class="book-step"><div>${itemLink(edge.from)} <span aria-hidden="true">→</span> ${itemLink(edge.to)}</div>${itemRows(edge.materials)}${requirements(edge.requires) ? `<ul class="book-requirements">${requirements(edge.requires)}</ul>` : ''}${edge.perkItemId ? p('Требуется исследование перка:') + itemLink(edge.perkItemId) : ''}</div>`).join('') : '') + section('Ремонт',repair?.repairCost?.length ? `${itemRows(repair.repairCost)}${repair.repairDurability ? p(`Восстановление прочности: ${Math.round(repair.repairDurability * 100)}%`) : ''}` : '');
  }
  function renderResearchLinks(id) {
    const values = list(catalog.secondary?.researches).filter(value => value.itemId === id);
    return section('Исследование',values.map(value => `${definition([['Уровень станции',value.level],['Очки исследований',value.points]])}${materialObject(value.cost)}`).join(''));
  }
  function renderStation(obj) {
    if (obj.maxLevel === 0) return `${p(obj.description)}<p class="book-description">Базовая станция · без улучшений. Доступна изначально.</p><button class="secondary" data-book-hideout="${esc(obj.id)}">Показать в убежище →</button>`;
    return `${p(obj.description)}${definition([['Максимальный уровень',obj.maxLevel]])}<button class="primary" data-book-hideout="${esc(obj.id)}">Отслеживать в убежище →</button>${list(obj.levels).map(level => section(`Уровень ${level.level}`,`${p(level.description)}${itemRows(level.requirementItemIds)}${requirements([...(level.otherRequirements || []),...(level.requires || [])]) ? `<ul class="book-requirements">${requirements([...(level.otherRequirements || []),...(level.requires || [])])}</ul>` : '<p class="book-muted">Дополнительные условия в источнике не указаны.</p>'}`)).join('')}`;
  }
  function tradeInterval(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value % 86400 === 0) return `${format(value / 86400)} сут.`;
    if (value % 3600 === 0) return `${format(value / 3600)} ч.`;
    if (value % 60 === 0) return `${format(value / 60)} мин.`;
    return `${format(value)} сек.`;
  }
  function renderTradePrice(trade) {
    const directCost = trade.cost && Object.keys(trade.cost).length ? trade.cost : null;
    if (directCost?.itemId) return `<p class="book-muted">За ${itemLink(directCost.itemId)} × ${esc(format(directCost.quantity))}</p>`;
    if (directCost) return `<p class="book-muted">${Object.entries(directCost).map(([id,quantity]) => `${id === 'coins' ? 'Монеты' : itemLink(id)} × ${esc(format(quantity))}`).join(' + ')}</p>`;
    const prices = list(trade.price);
    if (!prices.length) return '<p class="book-muted">Стоимость не указана в источнике.</p>';
    return prices.map(price => {
      if (price.kind === 'value') return `<div class="book-trade-price"><p class="book-muted">Подходящие предметы общей стоимостью ${esc(format(price.value))} монет.</p>${list(price.categories).length ? `<p class="book-muted">Категории: ${esc(price.categories.map(local).join(', '))}</p>` : ''}${list(price.eligible).length ? `<details><summary>Подходящие предметы (${price.eligible.length})</summary><div class="book-inline-links">${price.eligible.map(value => itemLink(value.id)).join('')}</div></details>` : ''}</div>`;
      const id = price.item?.id || price.itemId || price.key;
      if (id) return `<p class="book-muted">${id === 'coins' ? 'Монеты' : itemLink(id)} × ${esc(format(price.quantity))}</p>`;
      return '<p class="book-muted">Подробности стоимости пока отсутствуют в локальной карточке.</p>';
    }).join('');
  }
  function renderTrades(trades, showSources=false) {
    if (!trades.length) return '';
    return `<div class="book-trades">${trades.map(trade => {
      const id = trade.itemId || trade.item?.id;
      const title = id ? itemLink(id) : `<strong>${esc(trade.name || local(trade.cosmetic?.name) || 'Предложение торговца')}</strong>`;
      const interval = tradeInterval(trade.refreshSeconds);
      const limit = trade.dailyLimit ?? trade.limit;
      return `<div class="book-step ${trade.retired ? 'book-trade-retired' : ''}"><div class="book-trade-line">${title}${trade.quantity != null ? `<strong>× ${esc(format(trade.quantity))}</strong>` : ''}</div>${trade.retired ? '<span class="book-badge book-retired-badge">Снято с продажи</span>' : ''}${trade.rotating ? '<span class="book-badge book-rotating-badge">Ротационный ассортимент</span><p class="book-muted">Ассортимент меняется; наличие проверяйте у торговца.</p>' : ''}${renderTradePrice(trade)}<div class="book-muted">${trade.trader ? `${esc(trade.trader)}${trade.requiredLevel || limit != null || interval ? ' · ' : ''}` : ''}${trade.requiredLevel ? `Уровень игрока: ${esc(trade.requiredLevel)}` : ''}${limit != null ? `${trade.requiredLevel ? ' · ' : ''}Лимит: ${esc(limit)}${interval ? ' за обновление' : ''}` : ''}${interval ? `<br>Интервал обновления: ${esc(interval)}` : ''}</div>${showSources ? sourceButton(trade.sourceUrl) : ''}</div>`;
    }).join('')}</div><p class="book-footnote">Цены и условия сохранены из каталога ARC Tracker. Наличие зависит от текущего ассортимента торговца и условий в игре.</p>`;
  }
  function renderArc(obj) {
    const facts = obj.facts || {};
    const descriptions = facts.description || obj.description || obj.quote;
    let body = p(descriptions);
    if (obj.sections) body += list(obj.sections).map(value => section(value.title || value.heading, paragraphs(value.paragraphs || value.text))).join('');
    body += definition([['Тип',statNames[obj.group] || obj.group],['Класс',statNames[obj.tier] || obj.tier],['Здоровье',facts.health || obj.health],['Опыт уничтожения',facts.destroyXp || obj.destroyXp],['Опыт добычи',facts.lootXp || obj.lootXp]]);
    body += section('Места появления',list(obj.maps).length ? `<div class="book-inline-links">${obj.maps.map(id => link('map',id,list(catalog.maps).find(value => value.id === id)?.name || id)).join('')}</div>` : '');
    body += section('Выпадающие предметы',itemRows(obj.drops || facts.drops));
    body += section('Уязвимости',p(facts.weakness || obj.weakness));
    if (facts.sections) body += list(facts.sections).map(value => section(value.title || value.heading,paragraphs(value.paragraphs || value.text))).join('');
    if (!obj.drops?.length && !facts.drops?.length) body += p('Список добычи пока не представлен в локальной карточке. Проверьте актуальную карточку источника.');
    return body;
  }
  function renderMap(obj) {
    return `${p(obj.description)}${definition([['Точек на карте',obj.pinCount],['Слоёв',obj.floors?.length || 1]])}<div class="book-inline-links">${list(obj.floors).map(floor => badge(floor.name)).join('')}</div><button class="primary" data-book-map="${esc(obj.id)}">Открыть интерактивную карту →</button>`;
  }
  function renderQuest(obj) {
    return `${p(obj.description)}${definition([['Торговец',obj.trader],['Опыт',obj.xp],['За один рейд',obj.oneRaid ? 'Да' : 'Не требуется по данным источника']])}${section('Цели',`<ol class="book-requirements">${list(obj.objectives).map(value => `<li>${esc(value.text || value)}</li>`).join('')}</ol>`)}${section('Необходимые предметы',itemRows(obj.requiredItems))}${section('Награды',itemRows(obj.rewardItems))}<button class="primary" data-book-quest="${esc(obj.id)}">Открыть в дереве квестов →</button>`;
  }
  function renderProject(obj) {
    return `${p(obj.description)}${obj.disabled ? badge('Архивный проект') : ''}${obj.startDate || obj.endDate ? definition([['Начало',obj.startDate ? new Date(obj.startDate * 1000).toLocaleDateString('ru-RU') : undefined],['Окончание',obj.endDate ? new Date(obj.endDate * 1000).toLocaleDateString('ru-RU') : undefined]]) : ''}${list(obj.phases).map(phase => section(`Этап ${phase.phase || phase.level || ''} · ${local(phase.name)}`,`${p(phase.description)}${itemRows(phase.requirementItemIds)}${requirements(phase.otherRequirements) ? `<ul class="book-requirements">${requirements(phase.otherRequirements)}</ul>` : ''}${section('Награды',itemRows(phase.rewardItemIds))}`)).join('')}`;
  }
  function renderSkill(obj) {
    const perLevel = list(obj.effect?.perLevel);
    const multiplier = typeof obj.effect?.valueTag === 'string' && /Multiplier$/.test(obj.effect.valueTag);
    const numericLabel = obj.effect?.unit || (multiplier ? 'Множитель эффекта' : 'Значение эффекта');
    const characterId = Number.isFinite(obj.characterSkillId) ? ` data-character-skill-id="${obj.characterSkillId}"` : '';
    const effects = perLevel.length ? `<div${characterId}><table class="book-effect-table"><thead><tr><th scope="col">Очков в навыке</th><th scope="col">${esc(numericLabel)}</th></tr></thead><tbody>${perLevel.map((value,index) => `<tr><th scope="row">${index + 1}</th><td>${value === null || value === undefined ? 'Нет данных' : `${multiplier ? '×' : ''}${esc(format(value))}`}</td></tr>`).join('')}</tbody></table><p class="book-muted">Значения приведены по данным ARC Tracker для каждого уровня навыка.</p></div>` : obj.effect ? `<p class="book-muted"${characterId}>Для этого навыка источник не указывает числовые значения эффекта.</p>` : '';
    return `${p(obj.description)}${definition([['Ветка',statNames[obj.category] || obj.category],['Максимум очков',obj.maxPoints],['Влияет на',local(obj.impactedSkill)],['Ключевой навык',obj.isMajor ? 'Да' : 'Нет'],['Нужно очков в ветке',obj.minPointsSpent || undefined],['Версия данных игры',catalog.skillMetadata?.version]])}${section('Предыдущие навыки',list(obj.prerequisiteNodeIds).length ? `<div class="book-inline-links">${obj.prerequisiteNodeIds.map(id => link('skill',id,entryByKey.get(`skill:${id}`)?.name || id)).join('')}</div>` : '')}${section('Эффект по уровням',effects)}${!perLevel.length && list(obj.knownValue).length ? section('Известные значения',`<ul class="book-requirements">${obj.knownValue.map(value => `<li>${esc(text(value))}</li>`).join('')}</ul>`) : ''}`;
  }
  function renderEvent(obj) {
    return `${p(obj.description)}${definition([['Категория',statNames[obj.category] || obj.category]])}${section('Эффекты',list(obj.effects).length ? `<ul class="book-requirements">${obj.effects.map(value => `<li>${esc(local(value))}</li>`).join('')}</ul>` : '')}${section('Связанные карты',obj.maps?.length ? `<div class="book-inline-links">${list(obj.maps).map(id => link('map',typeof id === 'string' ? id : id.id,list(catalog.maps).find(value => value.id === id)?.name || local(id.name) || id)).join('')}</div>` : '')}`;
  }
  function renderResearch(obj) {
    return `${p(itemById.get(obj.itemId)?.description)}${itemLink(obj.itemId)}${definition([['Уровень станции исследований',obj.level],['Очки исследований',obj.points],['Тип',obj.kind === 'blueprint' ? 'Чертёж' : obj.kind === 'perk' ? 'Перк' : obj.kind]])}${section('Материалы',materialObject(obj.cost))}`;
  }
  function renderOutpost(obj) {
    return `${p(obj.description || itemById.get(obj.itemId || obj.id)?.description)}${obj.itemId ? itemLink(obj.itemId) : ''}${definition([['Комнат',obj.rooms],['Уровень станции',obj.level]])}${section('Необходимые предметы',itemRows(obj.requirementItemIds))}${section('Материалы',materialObject(obj.cost || obj.craft?.cost))}${section('Как открыть',list(obj.unlockedBy).map(value => `<p class="book-muted">${value.itemId ? itemLink(value.itemId) : value.kind === 'project' ? 'Награда проекта' : esc(value.kind || 'Условие источника')}</p>`).join(''))}${requirements(obj.requires) ? `<ul class="book-requirements">${requirements(obj.requires)}</ul>` : ''}${obj.rooms ? section('Требования станций к комнатам',list(catalog.outpost?.roomsByStation).filter(value => value.rooms === obj.rooms).map(value => `<div class="book-item-row">${link('station',value.station,stationById.get(value.station)?.name || value.station)}<span>Ур. ${esc(value.level)} · ${esc(value.rooms)} комнаты</span></div>`).join('')) : ''}`;
  }
  function renderDetail(entry) {
    const root = document.getElementById('wikiView');
    const renderers = { item:renderItem, arc:renderArc, map:renderMap, station:renderStation, quest:renderQuest, project:renderProject, skill:renderSkill, event:renderEvent, trader:obj => renderTrades(obj.trades), research:renderResearch, outpost:renderOutpost };
    root.innerHTML = `${wikiNoticeHtml()}<div class="book-detail-toolbar"><button class="secondary" data-book-back>← ${wiki.stack.length ? 'Назад' : 'К результатам'}</button>${sourceButton(entry.obj.sourceUrl || catalog.sourceUrl)}</div><article class="book-detail"><header class="book-detail-head">${image(entry.obj.imageFilename || entry.obj.imageUrl || entry.obj.image,'book-detail-image')}<div><div class="eyebrow">${esc(cardMeta(entry))}</div><h2>${esc(entry.name)}</h2>${entry.nameEn && entry.nameEn !== entry.name ? `<p>${esc(entry.nameEn)}</p>` : ''}</div></header><div class="book-detail-body">${(renderers[entry.kind] || (() => '<p>Подробные данные пока отсутствуют.</p>'))(entry.obj)}</div></article>${statusLine()}`;
  }
  function openDetail(kind,id,remember=true) {
    const key = `${kind}:${id}`;
    if (!entryByKey.has(key)) { wikiNotice = 'Эта карточка пока отсутствует в локальном каталоге. Доступные записи показаны ниже.'; renderWiki(); return; }
    wikiNotice = '';
    if (wiki.selected === key) { renderWiki(); return; }
    if (remember && wiki.selected) wiki.stack.push({ key:wiki.selected, scroll:global.scrollY || 0 });
    else if (!wiki.selected) wiki.scroll = global.scrollY || 0;
    wiki.selected = key; renderWiki(); global.scrollTo?.({top:0,behavior:'instant'});
  }
  function saveHideout() {
    try { global.localStorage.setItem(STORAGE_KEY,JSON.stringify(hideout)); storageAvailable = true; }
    catch { storageAvailable = false; hideoutNotice = 'Не удалось сохранить прогресс на устройстве. Проверьте свободное место.'; }
  }
  function renderExtraRequirements(values) {
    return `<ul class="book-requirements">${values.map(value => `<li><strong>${esc(stationById.get(value.stationId)?.name || value.stationId)} · ур. ${esc(value.level)}</strong>${value.requirement ? `<ul>${requirements([value.requirement])}</ul>` : `: ${esc(local(value.text).replace(/Coins/g,'монет'))}`}</li>`).join('')}</ul>`;
  }
  function readHideout() {
    let raw = {};
    try { raw = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || '{}'); } catch { hideoutNotice = 'Сохранение убежища повреждено. Показаны начальные уровни; другие данные приложения сохранены.'; }
    hideout = model.sanitizeHideout(catalog,raw);
  }
  function renderHideout(focusStation) {
    const root = document.getElementById('hideoutView'); if (!root) return;
    const result = model.calculateRequirements(catalog.stations,hideout.levels,hideout.inventory,hideout.mode);
    const upgradeableCount = catalog.stations.filter(station => station.maxLevel > 0).length;
    const stationCount = catalog.stations.filter(station => station.maxLevel > 0 && number(hideout.levels[station.id]) >= station.maxLevel).length;
    const covered = result.items.filter(value => value.missing === 0).length;
    const pct = result.items.length ? Math.round(covered / result.items.length * 100) : 100;
    const inventoryRows = result.items.filter(value => !inventoryQuery || `${itemName(value.id)} ${itemById.get(value.id)?.nameEn || ''}`.toLowerCase().includes(inventoryQuery.toLowerCase()));
    root.innerHTML = `<div class="book-intro"><div><div class="eyebrow">ВАША МАСТЕРСКАЯ</div><h2>От первой станции до полного убежища</h2><p>Укажите текущие уровни и запас материалов. Прогресс хранится на этом устройстве.</p></div><div class="book-total"><strong>${stationCount}<small>/${upgradeableCount}</small></strong><span>станций улучшено до конца</span></div></div>${statusLine()}${hideoutNotice ? `<div class="book-notice" role="status">${esc(hideoutNotice)}</div>` : ''}<div class="hideout-mode"><div><strong>План сбора</strong><p>Один общий склад для всех станций. Отметка уровня не списывает предметы.</p></div><div class="book-segment"><button data-hideout-mode="next" class="${hideout.mode === 'next' ? 'active' : ''}" aria-pressed="${hideout.mode === 'next'}">Следующий уровень</button><button data-hideout-mode="max" class="${hideout.mode === 'max' ? 'active' : ''}" aria-pressed="${hideout.mode === 'max'}">До максимума</button></div></div><div class="hideout-stations">${catalog.stations.map(station => {
      const base = station.maxLevel === 0, level = number(hideout.levels[station.id]), next = list(station.levels).find(value => value.level === level + 1);
      return `<article class="hideout-station ${level >= station.maxLevel ? 'maxed' : ''}" id="hideout-station-${esc(station.id)}"><div class="hideout-station-top"><span class="hideout-station-icon">${level >= station.maxLevel ? '✓' : '⌂'}</span><span class="book-badge">${base ? 'Без улучшений' : level >= station.maxLevel ? 'Максимум' : `Ур. ${level} / ${station.maxLevel}`}</span></div><h3>${esc(station.name)}</h3><label>${base ? 'Доступность' : 'Текущий уровень'}<select ${base ? 'disabled' : ''} data-hideout-station="${esc(station.id)}" aria-label="Текущий уровень: ${esc(station.name)}">${Array.from({length:station.maxLevel + 1},(_,i) => `<option value="${i}" ${level === i ? 'selected' : ''}>${base ? 'Доступно изначально' : i === 0 ? 'Не построено' : `Уровень ${i}`}</option>`).join('')}</select></label><div class="hideout-level-dots" aria-hidden="true">${Array.from({length:station.maxLevel},(_,i) => `<i class="${i < level ? 'done' : ''}"></i>`).join('')}</div>${next ? `<p class="book-muted">Далее: уровень ${next.level}${next.requirementItemIds?.length ? ` · ${next.requirementItemIds.length} вида материалов` : ''}</p>` : `<p class="book-muted">${base ? 'Базовая станция · без улучшений.' : 'Все уровни завершены.'}</p>`}${link('station',station.id,base ? 'Сведения о станции →' : 'Условия улучшений →')}</article>`;
    }).join('')}</div><section class="hideout-inventory"><div class="hideout-inventory-head"><div><div class="eyebrow">ОБЩИЙ СПИСОК МАТЕРИАЛОВ</div><h3>${hideout.mode === 'next' ? 'Для следующего уровня каждой станции' : 'Для всех оставшихся улучшений'}</h3></div><span class="hideout-percent">${pct}%<small>позиций закрыто</small></span></div><div class="hideout-total-progress" role="progressbar" aria-label="Доля полностью собранных видов материалов" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><label class="book-search"><span aria-hidden="true">⌕</span><input id="hideoutSearch" type="search" value="${esc(inventoryQuery)}" placeholder="Найти материал в плане" aria-label="Поиск материалов убежища"></label><div class="hideout-table"><div class="hideout-table-head"><span>Материал</span><span>Нужно</span><span>В наличии</span><span>Осталось</span></div>${inventoryRows.map(value => `<div class="hideout-material ${value.missing === 0 ? 'complete' : ''}"><div class="hideout-material-name">${image(itemById.get(value.id)?.imageFilename,'hideout-material-image')}${itemLink(value.id)}</div><span class="hideout-needed" data-label="Нужно">${format(value.needed)}</span><label class="hideout-owned"><span class="book-sr-only">В наличии: ${esc(itemName(value.id))}</span><input type="number" inputmode="numeric" min="0" max="9999999" step="1" data-hideout-stock="${esc(value.id)}" value="${number(hideout.inventory[value.id])}"></label><strong class="hideout-missing" data-label="Осталось">${value.missing ? format(value.missing) : '✓'}</strong></div>`).join('') || `<div class="book-empty"><strong>${inventoryQuery ? 'Материал не найден' : 'Материалы для этого плана не требуются'}</strong><p>${inventoryQuery ? 'Попробуйте другое название.' : 'Проверьте дополнительные условия ниже или выберите другой план.'}</p></div>`}</div>${section('Дополнительные условия и монеты',result.other?.length ? renderExtraRequirements(result.other) : '<p class="book-muted">Для выбранного плана дополнительных условий нет.</p>')}</section><p class="book-footnote">Изменение уровня станции и количества материалов — ручные отметки. Запас учитывается один раз после суммирования всех потребностей. Другие виды прогресса приложения не меняются.</p>`;
    if (focusStation) document.getElementById(`hideout-station-${focusStation}`)?.scrollIntoView?.({block:'center',behavior:'smooth'});
  }
  function handleClick(event) {
    const element = event.target.closest('button'); if (!element) return;
    if (element.dataset.bookKind) {
      if (element.closest('#hideoutView')) options.navigate('wiki',{kind:element.dataset.bookKind,id:element.dataset.bookId});
      else openDetail(element.dataset.bookKind,element.dataset.bookId);
    } else if (element.hasAttribute('data-book-back')) {
      const previous = wiki.stack.pop();
      wiki.selected = previous?.key || null; renderWiki(); global.scrollTo?.({top:previous?.scroll ?? wiki.scroll,behavior:'instant'});
    } else if (element.dataset.bookCategory) {
      wiki.category = element.dataset.bookCategory; wiki.page = 0; wiki.selected = null; wiki.stack = []; renderWiki();
    } else if (element.hasAttribute('data-book-reset')) {
      wiki.category = 'all'; wiki.query = ''; wiki.page = 0; renderWiki();
    } else if (element.hasAttribute('data-book-page')) {
      wiki.page = number(element.dataset.bookPage); renderWiki(); document.getElementById('bookSearch')?.scrollIntoView?.({block:'start'});
    } else if (element.dataset.bookSource) {
      options.openSource?.(element.dataset.bookSource);
    } else if (element.dataset.bookQuest) {
      options.openQuest?.(element.dataset.bookQuest);
    } else if (element.dataset.bookMap) {
      options.openMap?.(element.dataset.bookMap);
    } else if (element.dataset.bookHideout) {
      options.navigate('hideout',{id:element.dataset.bookHideout});
    } else if (element.dataset.hideoutMode) {
      hideout.mode = element.dataset.hideoutMode === 'max' ? 'max' : 'next'; saveHideout(); renderHideout();
    }
  }
  function preserveInput(render, inputId, value) {
    render(); const input = document.getElementById(inputId); input?.focus(); if (input?.type !== 'number') input?.setSelectionRange?.(value.length,value.length);
  }
  function init(config) {
    options = config; catalog = config.catalog; model = config.model;
    itemById = new Map(list(catalog.items).map(value => [value.id,value]));
    stationById = new Map(list(catalog.stations).map(value => [value.id,value]));
    buildEntries(); readHideout();
    if (initialized) return; initialized = true;
    for (const id of ['wikiView','hideoutView']) {
      const root = document.getElementById(id); if (!root) continue;
      root.addEventListener('click',handleClick);
      root.addEventListener('error',event => {
        if (event.target.tagName !== 'IMG') return;
        const fallback = document.createElement('span');
        fallback.className = `book-no-image ${event.target.className}`;
        fallback.setAttribute('aria-hidden','true'); fallback.textContent = '◇';
        event.target.replaceWith(fallback);
      },true);
      root.addEventListener('input',event => {
        if (event.target.id === 'bookSearch') { wiki.query = event.target.value; wiki.page = 0; preserveInput(renderWiki,'bookSearch',wiki.query); }
        if (event.target.id === 'hideoutSearch') { inventoryQuery = event.target.value; preserveInput(renderHideout,'hideoutSearch',inventoryQuery); }
      });
      root.addEventListener('change',event => {
        if (event.target.dataset.hideoutStation) { hideout.levels[event.target.dataset.hideoutStation] = number(event.target.value); hideout = model.sanitizeHideout(catalog,hideout); saveHideout(); renderHideout(); }
        if (event.target.dataset.hideoutStock) { const id = event.target.dataset.hideoutStock; hideout.inventory[id] = Math.min(9999999,number(event.target.value)); saveHideout(); const scroll = global.scrollY; renderHideout(); global.scrollTo?.({top:scroll,behavior:'instant'}); }
      });
    }
  }
  function show(view,intent) {
    if (!catalog) return;
    if (view === 'wiki') {
      if (intent?.kind && intent.id) openDetail(intent.kind,intent.id);
      else renderWiki();
    } else if (view === 'hideout') renderHideout(intent?.id);
  }
  global.ARCBook = { init, show, itemName, getState:() => ({wiki:{category:wiki.category,query:wiki.query,page:wiki.page,selected:wiki.selected},hideout:JSON.parse(JSON.stringify(hideout)),storageAvailable}), refresh:() => { buildEntries(); } };
})(window);
