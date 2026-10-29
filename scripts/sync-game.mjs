import { mkdir, readFile, writeFile, access, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFlight, readObject } from './arc-source.mjs';
import { syncSkills } from './sync-skills.mjs';
import { readArcFacts } from './arc-facts.mjs';
const root = new URL('../', import.meta.url);
const cache = new URL(process.argv.includes('--refresh') ? `.cache-research/refresh-${Date.now()}/` : '.cache-research/', root);
const data = new URL('assets/data/', root);
const site = 'https://arctracker.io';
const local = value => typeof value === 'object' && value ? value.ru || value.en || '' : value || '';
await mkdir(cache, { recursive: true }); await mkdir(data, { recursive: true });
async function download(url, filename, binary = false) {
  const path = new URL(filename, cache);
  await mkdir(new URL('./',path),{recursive:true});
  try { await access(path); } catch {
    let response;
    for(let attempt=0;attempt<4;attempt++){
      try {response=await fetch(url, { signal: AbortSignal.timeout(90000), headers: { 'user-agent': 'ARC Event Tracker community catalog sync' } });break;}
      catch(error){if(attempt===3)throw error;}
    }
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  }
  return binary ? path : readFile(path, 'utf8');
}
const json = async (url, file) => JSON.parse(await download(url, file));
const manifest = await json(`${site}/generated/client/items/manifest.json`, 'item-manifest.json');
const dataset = async (kind, file, locale='ru') => json(`${site}/generated/client/items/${manifest.files[kind][locale]}?v=${manifest.version}`, file);
const [index, detail, detailEn, tracker, secondary] = await Promise.all([
  dataset('index','items-index.json'), dataset('detail','items-detail.json'), dataset('detail','items-detail.en.json','en'),
  dataset('tracker','tracker-data.json'), json(`${site}/generated/client/tracking/secondary.json`, 'secondary.json')
]);
if(index.items.length < 900 || Object.keys(detail.items).length !== index.items.length) throw new Error('Incomplete item dataset');
if (detail.version !== index.version || detailEn.version !== index.version) throw new Error('Item snapshot versions differ; clear the sync cache and retry');
const items = Object.values(detail.items).map(item => ({
  ...item, nameEn: detailEn.items[item.id]?.name || item.name,
  effects: Object.fromEntries(Object.entries(item.effects || {}).map(([key,value]) => [key, { label: value.ru || value.en || key, value: value.value }])),
  sourceUrl: `${site}/ru/items/${item.id}`,
}));
const languages = new Set(['en','ru','de','fr','es','it','ja','ko-KR','ko','zh-CN','zh-TW','da','no','pl','pt','pt-BR','he','hr','sr','tr','uk']);
function compact(value) {
  if(Array.isArray(value)) return value.map(compact);
  if(!value || typeof value !== 'object') return value;
  const keys=Object.keys(value);
  if(keys.length && keys.every(key=>languages.has(key)))return value.ru || value.en || '';
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,compact(item)]));
}
let relationCursor=0;
await Promise.all(Array.from({length:6},async()=>{
  while(relationCursor < items.length){
    const item=items[relationCursor++];
    const relation=await json(`${site}/generated/client/items/relations/${item.id}.json?v=${manifest.version}`,`relations/${item.id}.json`);
    if(relation.itemId !== item.id)throw new Error(`Wrong item relation ${item.id}`);
    item.relations=compact(relation);
  }
}));
if(index.items.some(item=>!detail.items[item.id])) throw new Error('Index/detail IDs differ');
const mapPage = await download(`${site}/ru/maps`, 'maps.html');
const slugs = [...new Set([...mapPage.matchAll(/href="\/ru\/maps\/([\w-]+)"/g)].map(match => match[1]))];
if(slugs.length < 7) throw new Error(`Incomplete map list: ${slugs.length}`);
const maps = [];
for (const slug of slugs) {
  const html = await download(`${site}/ru/maps/${slug}`, `map-${slug}.html`);
  const config = readObject(readFlight(html),'"config":');
  if(!config?.imageUrl && !config?.tileSource) throw new Error(`Missing map config: ${slug}`);
  const pins = await json(`${site}/api/v1/maps/${slug}/pins?locale=ru&rv=12`, `pins-${slug}.json`);
  if(!Array.isArray(pins.data?.pins)||pins.data.mapId!==slug) throw new Error(`Missing map pins: ${slug}`);
  if(pins.data.pins.some(pin=>!Number.isFinite(pin.lat)||!Number.isFinite(pin.lng)))throw new Error(`Invalid coordinates: ${slug}`);
  const floors = config.floors || [{ id: 'surface', name: 'Поверхность', imageUrl: config.imageUrl, tileSource:config.tileSource }];
  await mkdir(new URL('assets/maps/',root),{recursive:true});
  for(const floor of floors){
    if(floor.imageUrl && !floor.imageUrl.startsWith('$')){
      const ext = new URL(floor.imageUrl).pathname.split('.').pop();
      const file = `${slug}-${floor.id}.${ext}`;
      const source = await download(floor.imageUrl, file, true);
      await copyFile(source,new URL(`assets/maps/${file}`,root));
      floor.image = `assets/maps/${file}`;
    } else {
      const tileSource=typeof floor.tileSource==='object'?floor.tileSource:config.tileSource;
      if(!tileSource?.lowUrlTemplate)throw new Error(`No map layer source: ${slug}/${floor.id}`);
      const z=1, tile=tileSource.tileSize/(2**z), count=Math.ceil(config.imageSize.h/tile), offset=count*tile-config.imageSize.h;
      const pieces=[];floor.tiles=[];
      for(let x=0;x<count;x++)for(let y=0;y<count;y++){
        const url=tileSource.lowUrlTemplate.replace('{z}',z).replace('{x}',x).replace('{y}',y);
        const file=`${slug}-${floor.id}-${z}-${x}-${y}.webp`;
        const source=await download(url,file,true);await copyFile(source,new URL(`assets/maps/${file}`,root));
        pieces.push(`<image href="${file}" x="${x*tile}" y="${y*tile-offset}" width="${tile}" height="${tile}"/>`);
        floor.tiles.push({image:`assets/maps/${file}`,x:x*tile,y:y*tile-offset,size:tile});
      }
      const file=`${slug}-${floor.id}.svg`;
      await writeFile(new URL(`assets/maps/${file}`,root),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${config.imageSize.w} ${config.imageSize.h}">${pieces.join('')}</svg>`);
      floor.image=`assets/maps/${file}`;floor.tiled=true;
    }
  }
  const compactPins = pins.data.pins.map(pin => ({
    id:pin.ref, lat:pin.lat, lng:pin.lng, floor:pin.floor, kind:pin.kind, subtype:pin.subtype,
    title:pin.title, description:pin.description, category:pin.category, subcategory:pin.subcategory,
    questId:pin.questId, questLinks:pin.questLinks, requiredItems:pin.requiredItems,
    gate:pin.gate, confidence:pin.confidence, polygon:pin.polygon, enemies:pin.enemies,
    absentIn:pin.absentIn, tags:pin.tags, variants:pin.variants
  }));
  await writeFile(new URL(`map-${slug}.json`,data),JSON.stringify({ mapId:slug,gameVersion:pins.data.gameVersion,syncedAt:new Date().toISOString(),pins:compactPins }));
  maps.push({ ...config, floors, pinCount:compactPins.length, pinsPath:`assets/data/map-${slug}.json`, sourceUrl:`${site}/ru/maps/${slug}` });
  console.log(`Map ${slug}: ${compactPins.length} pins, ${floors.length} layers`);
}
const getPage = async (path,file) => readFlight(await download(`${site}/ru/${path}`, file));
const [arcFlight,eventFlight,skillFlight] = await Promise.all([getPage('arc','arc.html'),getPage('map-events','events.html'),getPage('skill-tree','skills.html')]);
const arcs = readObject(arcFlight,'"arcs":') || [];
// The ARC page ships structured game facts in the flight props, not user comments.
for(const arc of arcs) {
  const f = await getPage(`arc/${arc.id}`,`arc-${arc.id}.html`);
  arc.sourceUrl=`${site}/ru/arc/${arc.id}`;
  arc.imageFilename=`https://cdn.arctracker.io/arcs/${arc.id}.webp`;
  Object.assign(arc,readArcFacts(f,new Set(items.map(item=>item.id))));
}
let skillSnapshot;
if(!process.argv.includes('--refresh')){try{skillSnapshot=JSON.parse(await readFile(new URL('.cache-research/current-skills.json',root),'utf8'));}catch{}}
skillSnapshot ||= await syncSkills();
const skillsRaw = skillSnapshot.skills;
const skills = skillsRaw.map(skill => ({...skill, name:local(skill.name), nameEn:skill.name.en, description:local(skill.description), impactedSkill:local(skill.impactedSkill), sourceUrl:`${site}/ru/skill-tree`}));
const stations = Object.values(tracker.hideoutModules).map(station => ({ ...station, name:local(station.name), nameEn:station.name.en, sourceUrl:`${site}/ru/hideout/${station.id}` }));
const projects = Object.values(tracker.projects).map(project => ({...project,name:local(project.name),nameEn:project.name.en,description:local(project.description),sourceUrl:`${site}/ru/projects`}));
const translations=await json('https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/arctracker-ui/ru.json','arctracker-ui.ru.json');
const conditions=await json(`${site}/generated/client/map-conditions/ru.json`,'map-conditions.ru.json');
const events = Object.entries(conditions.conditions).map(([id,event])=>({id,...event,sourceUrl:`${site}/ru/map-events/${id}`}));
const traderHtml=await download(`${site}/ru/traders`,'traders.html');
const traderSlugs=[...new Set([...traderHtml.matchAll(/href="\/ru\/traders\/([\w-]+)"/g)].map(match=>match[1]))];
if(traderSlugs.length<6)throw new Error('Incomplete trader list');
const traderNames={apollo:'Аполлон',celeste:'Селеста',lance:'Лэнс',shani:'Шани','tian-wen':'Тянь Вэнь',ermal:'Эрмаль'};
const trades=[];
for(const slug of traderSlugs){
  const f=await getPage(`traders/${slug}`,`trader-${slug}.html`),offers=readObject(f,'"offers":');
  if(!Array.isArray(offers))throw new Error(`No trader offers ${slug}`);
  for(const offer of offers){
    const costs=(offer.price||[]).map(price=>[price.key||price.item?.id,price.quantity]).filter(([id,qty])=>id&&Number.isFinite(qty));
    trades.push({...offer,itemId:offer.itemId||offer.item?.id||null,trader:traderNames[slug]||slug,traderId:slug,sourceUrl:`${site}/ru/traders/${slug}`,dailyLimit:offer.limit,cost:Object.fromEntries(costs),rotating:slug==='ermal'});
  }
}
const payload = {schema:1,source:'ARC Tracker / RaidTheory ARC Data Project',sourceUrl:site,generatedAt:index.generatedAt,syncedAt:new Date().toISOString(),version:index.version,
  coverage:{items:items.length,maps:maps.length,stations:stations.length,arcs:arcs.length,skills:skills.length,projects:projects.length,events:events.length},
  items,maps,stations,arcs,skills,skillMetadata:skillSnapshot.meta,projects,secondary,trades,events,outpost:tracker.outpost,translations:{itemTypes:translations.ItemTypes||{},rarities:translations.Rarity||{}}};
await writeFile(new URL('game.ru.json',data),JSON.stringify(payload));
const digest=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
console.log(`Saved game catalog: ${JSON.stringify(payload.coverage)}; SHA256 ${digest}`);
