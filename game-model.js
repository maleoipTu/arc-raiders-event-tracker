(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ARCGameModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const number = (value, max=999999999) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(max, Math.floor(Number(value)))) : 0;
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  function sanitizeHideout(catalog, raw) {
    raw = object(raw);
    const levels = {}, inventory = {};
    for(const station of catalog.stations || []) levels[station.id] = number(object(raw.levels)[station.id], station.maxLevel);
    const ids = new Set((catalog.items || []).map(item => item.id)); ids.add('coins');
    for(const [id,value] of Object.entries(object(raw.inventory))) if(ids.has(id)) inventory[id] = number(value);
    return { levels, inventory, mode: raw.mode === 'max' ? 'max' : 'next' };
  }
  function calculateRequirements(stations, levels={}, inventory={}, mode='next') {
    const totals = new Map(), other = [], selectedLevels = [];
    for(const station of stations) {
      const current = number(levels[station.id], station.maxLevel);
      for(const level of station.levels || []) {
        if(level.level <= current || (mode !== 'max' && level.level !== current + 1)) continue;
        selectedLevels.push({ stationId:station.id, level:level.level });
        for(const item of level.requirementItemIds || []) {
          const id = item.itemId || item.id;
          if(id) totals.set(id, (totals.get(id) || 0) + number(item.quantity));
        }
        for(const text of level.otherRequirements || []) {
          const coins = typeof text === 'string' && text.match(/^([\d,\s]+)\s*(Coins?|монет\S*)$/iu);
          if(coins) totals.set('coins', (totals.get('coins') || 0) + Number(coins[1].replace(/[,\s]/g,'')));
          else other.push({ stationId:station.id, level:level.level, text });
        }
        for(const requirement of level.requires || []) other.push({ stationId:station.id, level:level.level, requirement });
      }
    }
    const items = [...totals].map(([id,needed]) => ({ id, needed, owned:number(inventory[id]), missing:Math.max(0, needed-number(inventory[id])) }));
    return { items, other, levels:selectedLevels };
  }
  function pinPoint(pin, config, floor) {
    let x=Number(pin.lng), lat=Number(pin.lat);
    if(!Number.isFinite(x) || !Number.isFinite(lat)) return null;
    if(floor?.tiled && config.coordinateTransform?.affine) {
      const {a,b,c,d,e,f}=config.coordinateTransform.affine;
      [x,lat]=[a*x+b*lat+c, d*x+e*lat+f];
    }
    return { x, y:(config.imageSize?.h || 1000)-lat };
  }
  function cleanPins(value, maps) {
    const floors=new Map(maps.map(map=>[map.id,new Set(map.floors.map(floor=>floor.id))]));
    return (Array.isArray(value)?value:[]).filter(pin => pin && typeof pin.id==='string' && pin.id.trim() && floors.has(pin.mapId)
      && floors.get(pin.mapId).has(pin.floorId) && typeof pin.title==='string' && pin.title.trim() && Number.isFinite(pin.lng) && Number.isFinite(pin.lat))
      .map(pin=>({...pin,title:pin.title.slice(0,100)})).slice(0,500);
  }
  function storagePoint(point,config,floor){
    let lng=point.x,lat=(config.imageSize?.h||1000)-point.y;
    if(floor?.tiled && config.coordinateTransform?.inverse3x3){
      const m=config.coordinateTransform.inverse3x3;
      [lng,lat]=[m[0][0]*lng+m[0][1]*lat+m[0][2],m[1][0]*lng+m[1][1]*lat+m[1][2]];
    }
    return {lng,lat};
  }
  return { number, sanitizeHideout, calculateRequirements, pinPoint, storagePoint, cleanPins };
});
