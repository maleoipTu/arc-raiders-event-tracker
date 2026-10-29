const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../game-model.js');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/data/game.ru.json'), 'utf8'));

const sharedStations = [
  { id:'first', maxLevel:3, levels:[
    { level:1, requirementItemIds:[{itemId:'fabric',quantity:10}] },
    { level:2, requirementItemIds:[{itemId:'fabric',quantity:3}] },
    { level:3, requirementItemIds:[{itemId:'metal',quantity:4}] }
  ] },
  { id:'second', maxLevel:2, levels:[
    { level:1, requirementItemIds:[{itemId:'fabric',quantity:10}] },
    { level:2, requirementItemIds:[{itemId:'fabric',quantity:7}] }
  ] }
];
const indexItems = result => Object.fromEntries(result.items.map(item => [item.id,item]));
const nearly = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);

test('shared inventory is subtracted once after aggregating all station requirements', () => {
  const inventory = {fabric:15}, levels = {first:0,second:0};
  const before = JSON.stringify({inventory,levels,sharedStations});
  const result = model.calculateRequirements(sharedStations,levels,inventory,'next');
  assert.deepEqual(indexItems(result).fabric,{id:'fabric',needed:20,owned:15,missing:5});
  assert.deepEqual(result.levels,[{stationId:'first',level:1},{stationId:'second',level:1}]);
  assert.equal(JSON.stringify({inventory,levels,sharedStations}),before,'calculation must not spend stock or mutate levels');
});

test('next selects one level per station and max includes all remaining levels', () => {
  const levels = {first:1,second:1};
  const next = model.calculateRequirements(sharedStations,levels,{fabric:5},'next');
  const max = model.calculateRequirements(sharedStations,levels,{fabric:5},'max');
  assert.deepEqual(indexItems(next),{fabric:{id:'fabric',needed:10,owned:5,missing:5}});
  assert.deepEqual(indexItems(max),{fabric:{id:'fabric',needed:10,owned:5,missing:5},metal:{id:'metal',needed:4,owned:0,missing:4}});
  assert.equal(max.levels.length,3);
  assert.deepEqual(model.calculateRequirements(sharedStations,{first:3,second:2},{fabric:99},'max').items,[]);
  assert.deepEqual(model.calculateRequirements(sharedStations,{first:3,second:2},{fabric:99},'next').levels,[]);
  assert.equal(indexItems(model.calculateRequirements(sharedStations,{first:0,second:0},{fabric:99},'next')).fabric.missing,0);
});

test('coins and structured requirements are retained separately from physical stock', () => {
  const stations = [{id:'stash',maxLevel:3,levels:[
    {level:1,requirementItemIds:[],otherRequirements:['5,000 Coins'],requires:[{outpostRooms:2}]},
    {level:2,requirementItemIds:[],otherRequirements:['10000 монет'],requires:[{station:'research_station',level:2}]},
    {level:3,requirementItemIds:[],otherRequirements:['Player level 20']}
  ]}];
  const result = model.calculateRequirements(stations,{}, {coins:6000},'max');
  assert.deepEqual(indexItems(result).coins,{id:'coins',needed:15000,owned:6000,missing:9000});
  assert.deepEqual(result.other,[
    {stationId:'stash',level:1,requirement:{outpostRooms:2}},
    {stationId:'stash',level:2,requirement:{station:'research_station',level:2}},
    {stationId:'stash',level:3,text:'Player level 20'}
  ]);
  const actualResearch = catalog.stations.find(station => station.id === 'research_station');
  assert.ok(actualResearch.levels.some(level => level.requires?.some(value => value.outpostRooms === 4)));
  const actual = model.calculateRequirements([actualResearch],{research_station:3},{},'next');
  assert.ok(actual.other.some(value => value.requirement?.outpostRooms === 4));
});

test('persisted hideout shapes, numbers, modes and levels are normalized without touching other progress', () => {
  const fixture = {stations:[{id:'station',maxLevel:3}],items:[{id:'fabric'}]};
  for (const corrupted of [null,undefined,[],42,'broken JSON']) {
    assert.deepEqual(model.sanitizeHideout(fixture,corrupted),{levels:{station:0},inventory:{},mode:'next'});
  }
  const raw = {levels:{station:99,unknown:2},inventory:{fabric:1.9,coins:55,unknown:9},mode:'max',quests:{completed:true}};
  const before = JSON.stringify(raw);
  assert.deepEqual(model.sanitizeHideout(fixture,raw),{levels:{station:3},inventory:{fabric:1,coins:55},mode:'max'});
  assert.equal(JSON.stringify(raw),before);
  assert.deepEqual(model.sanitizeHideout(fixture,{levels:{station:-2},inventory:{fabric:Infinity,coins:-8},mode:'unexpected'}),{levels:{station:0},inventory:{fabric:0,coins:0},mode:'next'});
  assert.deepEqual(model.sanitizeHideout(fixture,{levels:[],inventory:[]}),{levels:{station:0},inventory:{},mode:'next'});
});

test('real station costs stay nonnegative for both plans and completed stations have no further requirements', () => {
  const levels = Object.fromEntries(catalog.stations.map(station => [station.id,station.maxLevel]));
  assert.deepEqual(model.calculateRequirements(catalog.stations,levels,{},'max'),{items:[],other:[],levels:[]});
  for (const mode of ['next','max']) {
    const result = model.calculateRequirements(catalog.stations,{}, {fabric:1000000,coins:1},mode);
    assert.ok(result.items.length > 0);
    assert.ok(result.items.every(item => Number.isInteger(item.needed) && item.needed >= 0 && item.missing >= 0));
  }
  const stash = catalog.stations.find(station => station.id === 'stash');
  assert.ok(model.calculateRequirements([stash],{stash:1},{},'next').items.some(item => item.id === 'coins' && item.needed > 0));
});

test('map coordinates preserve 1000-unit bounds and affine/inverse roundtrip for every local layer', () => {
  for (const map of catalog.maps) {
    assert.deepEqual(map.imageSize,{w:1000,h:1000});
    for (const floor of map.floors) {
      for (const point of [{x:0,y:0},{x:1000,y:0},{x:0,y:1000},{x:1000,y:1000},{x:333.25,y:777.5}]) {
        const saved = model.storagePoint(point,map,floor);
        const rendered = model.pinPoint(saved,map,floor);
        nearly(rendered.x,point.x,`${map.id}/${floor.id} x`);
        nearly(rendered.y,point.y,`${map.id}/${floor.id} y`);
      }
    }
  }
  const map = catalog.maps.find(value => value.coordinateTransform?.affine);
  assert.ok(map,'at least one source map must exercise affine coordinates');
  const floor = {tiled:true};
  const pin = {lng:400,lat:500};
  const a = map.coordinateTransform.affine;
  const point = model.pinPoint(pin,map,floor);
  nearly(point.x,a.a*400+a.b*500+a.c,'affine x');
  nearly(point.y,1000-(a.d*400+a.e*500+a.f),'affine y');
  const oldImagePoint = model.pinPoint(pin,map,{tiled:false});
  assert.deepEqual(oldImagePoint,{x:400,y:500},'legacy image overlay must not receive tile transform');
  assert.equal(model.pinPoint({lng:NaN,lat:10},map,floor),null);
});

test('personal pins accept only known maps and their actual floors, valid identifiers and finite coordinates', () => {
  const maps = [{id:'stella-montis',floors:[{id:'top'},{id:'bottom'}]},{id:'dam-battleground',floors:[{id:'surface'}]}];
  const base = {id:'one',mapId:'stella-montis',floorId:'top',title:'Личная точка',lng:250.5,lat:700};
  const result = model.cleanPins([
    base,
    {...base,id:'two',floorId:'bottom'},
    {...base,id:'bad-floor',floorId:'surface'},
    {...base,id:'bad-map',mapId:'missing-map'},
    {...base,id:'bad-position',lng:Infinity},
    {...base,id:'bad-lat',lat:'100'},
    {...base,id:'',title:'Пустой ID'},
    null,
    {...base,id:'not-a-number',lat:NaN}
  ],maps);
  assert.deepEqual(result.map(pin => pin.id),['one','two']);
  assert.deepEqual(result.map(pin => pin.floorId),['top','bottom']);
  assert.equal(model.cleanPins([{...base,title:'я'.repeat(150)}],maps)[0].title.length,100);
  assert.deepEqual(model.cleanPins('corrupt',maps),[]);
  const many = Array.from({length:520},(_,i) => ({...base,id:`p-${i}`}));
  assert.equal(model.cleanPins(many,maps).length,500);
});

test('the complete catalog has no missing item references in requirements, recipes, recycling or upgrades', () => {
  const ids = new Set(catalog.items.map(item => item.id));
  assert.equal(ids.size,catalog.items.length,'item identifiers must be unique');
  assert.ok(ids.size >= 900,'the full ARC Tracker item catalog must be present');
  const missing = [];
  const check = (id,where) => { if (id && !ids.has(id) && id !== 'coins') missing.push(`${where}: ${id}`); };
  const itemRows = (rows,where) => { for (const [i,value] of (rows || []).entries()) check(typeof value === 'string' ? value : value.itemId || value.id,`${where}[${i}]`); };
  const walkItemIds = (value,where) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach((child,i) => walkItemIds(child,`${where}[${i}]`)); return; }
    if (value.itemId) check(value.itemId,`${where}.itemId`);
    for (const [key,child] of Object.entries(value)) walkItemIds(child,`${where}.${key}`);
  };
  for (const station of catalog.stations) walkItemIds(station,`station:${station.id}`);
  for (const project of catalog.projects) walkItemIds(project,`project:${project.id}`);
  walkItemIds(catalog.outpost,'outpost');
  walkItemIds(catalog.secondary,'secondary');
  walkItemIds(catalog.trades,'trades');
  for (const [index,trade] of catalog.trades.entries()) {
    check(trade.itemId || trade.item?.id,`trades[${index}].item`);
    if (trade.cost && !trade.cost.itemId) for (const id of Object.keys(trade.cost)) check(id,`trades[${index}].cost`);
    for (const [priceIndex,price] of (trade.price || []).entries()) {
      check(price.item?.id || price.itemId || price.key,`trades[${index}].price[${priceIndex}]`);
      itemRows(price.eligible,`trades[${index}].price[${priceIndex}].eligible`);
    }
  }
  for (const research of catalog.secondary.researches) for (const id of Object.keys(research.cost || {})) check(id,`research:${research.itemId}.cost`);
  for (const furniture of catalog.secondary.outposts.furniture) {
    check(furniture.id,'furniture');
    for (const id of Object.keys(furniture.craft?.cost || {})) check(id,`furniture:${furniture.id}.cost`);
  }
  for (const item of catalog.items) {
    const r = item.relations || {};
    check(item.relatedBlueprintId,`${item.id}.relatedBlueprintId`); check(item.targetItemId,`${item.id}.targetItemId`);
    walkItemIds(r,`${item.id}.relations`);
    for (const key of ['craftingRecipe','blueprintCraftingRecipe']) {
      itemRows(r[key]?.materials,`${item.id}.${key}.materials`);
      itemRows(r[key]?.outputs,`${item.id}.${key}.outputs`);
      check(r[key]?.requiredBlueprint?.id,`${item.id}.${key}.requiredBlueprint`);
    }
    for (const key of ['recyclesInto','salvagesInto']) itemRows(r[key]?.outputs,`${item.id}.${key}.outputs`);
    for (const key of ['usedInCrafting','canBeObtainedFrom','compatibleWith']) itemRows(r[key],`${item.id}.${key}`);
    for (const slot of r.compatibleMods || []) itemRows(slot.itemIds,`${item.id}.compatibleMods.${slot.slot}`);
    itemRows(r.upgradePath?.tiers,`${item.id}.upgradePath.tiers`);
    for (const branch of r.upgradeBranches || []) {
      check(branch.toItem?.id,`${item.id}.upgradeBranch.toItem`); itemRows(branch.materials,`${item.id}.upgradeBranch.materials`);
    }
    for (const edge of r.weaponTree?.edges || []) {
      check(edge.from,`${item.id}.weaponTree.from`); check(edge.to,`${item.id}.weaponTree.to`); check(edge.perkItemId,`${item.id}.weaponTree.perk`);
    }
  }
  assert.deepEqual([...new Set(missing)],[],`Missing source references:\n${[...new Set(missing)].join('\n')}`);
});
