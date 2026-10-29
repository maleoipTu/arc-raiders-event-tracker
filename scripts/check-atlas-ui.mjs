import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = JSON.parse(await readFile(path.join(root, 'assets/data/game.ru.json'), 'utf8'));
assert.ok(catalog.maps.length >= 7, 'The complete map catalog is required');
const preview = path.join(root, 'dist/atlas-preview');
await mkdir(preview, { recursive: true });
const types = { '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.html':'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.jpeg':'image/jpeg' };
const files = new Set(['index.html','renderer.js','styles.css','quest-graph.js','game-model.js','map-ui.js','map-ui.css','book-ui.js','book-ui.css','mobile.js','mobile.css']);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const match = url.pathname.match(/^\/(desktop|mobile)\/(.*)$/);
    if (!match) { res.writeHead(404).end(); return; }
    const relative = decodeURIComponent(match[2] || 'index.html');
    if (!files.has(relative) && !/^assets\/(data|maps)\/[\w./-]+$/.test(relative)) { res.writeHead(403).end(); return; }
    const base = path.resolve(root, match[1] === 'mobile' ? 'mobile/www' : '.');
    const target = path.resolve(base, relative);
    if (!target.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    res.end(await readFile(target));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const errors = [];

async function navigate(page, view) {
  const direct = page.locator(`.nav [data-view="${view}"]`);
  if (await direct.isVisible()) await direct.click();
  else { await page.locator('#navMore').click(); await page.locator(`[data-more-view="${view}"]`).click(); }
  if (['maps','wiki','hideout'].includes(view)) await page.locator(view === 'maps' ? '#atlasMap' : view === 'wiki' ? '#bookSearch, .book-detail' : '.hideout-stations').first().waitFor();
}
async function noOverflow(page, width, label) {
  const size = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= width + 1, `${label}: ${JSON.stringify(size)}`);
}
async function mapLoaded(page, map, floor) {
  await page.locator('#atlasMap').selectOption(map.id);
  await page.waitForFunction(id => document.querySelector('#atlasSource')?.textContent.includes('ARC Tracker') && document.querySelector('#atlasMap')?.value === id, map.id);
  await page.locator('#atlasFloor').selectOption(floor.id);
  if (floor.tiles?.length) {
    assert.equal(await page.locator('#atlasTiles img').count(), floor.tiles.length, `Tile count ${map.id}/${floor.id}`);
    await page.waitForFunction(() => [...document.querySelectorAll('#atlasTiles img')].every(img => img.complete && img.naturalWidth > 0));
  } else await page.waitForFunction(() => { const img = document.querySelector('#atlasImage'); return img && !img.hidden && img.complete && img.naturalWidth > 0; });
  assert.equal(await page.locator('#mapMessage').innerText(), '', `${map.id}/${floor.id} image error`);
}

try {
  for (const config of [{width:1440,mobile:false},{width:360,mobile:true},{width:412,mobile:true},{width:800,mobile:true}]) {
    const {width,mobile} = config;
    const context = await browser.newContext({ viewport:{width,height:1000}, hasTouch:mobile });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(`${width}: ${error.message}`));
    await page.route('https://**', route => route.abort());
    await page.addInitScript(({ mobile }) => {
      window.arcApp = {
        platform:mobile ? 'android' : 'windows', version:async()=> '0.5.1', fetchSchedule:async()=>({events:[],syncedAt:Date.now()}),
        scheduleNotifications:async()=>({}), getSettings:async()=>({notifications:false,notifyLeadMinutes:10}), credentialStatus:async()=>({}),
        onAppRefresh(){},onUpdateStatus(){},updateStatus:async()=>({phase:'idle'}),openExternal:async()=>({}),
      };
      if (!localStorage.getItem('atlas-ui-seeded')) {
        localStorage.setItem('atlas-ui-seeded','yes');
        localStorage.setItem('arc-quest-progress-v1',JSON.stringify({'qa-preserved-quest':{completed:false,objectives:[true]}}));
        localStorage.setItem('arc-favorites-v1',JSON.stringify(['QA favorite']));
      }
      if (mobile) {
        window.androidBridge = {};
        const methods={App:['getInfo','minimizeApp','addListener','removeListener'],Browser:['open'],LocalNotifications:['getPending','cancel','checkPermissions','requestPermissions','createChannel','schedule','addListener','removeListener'],CapacitorHttp:['request','get']};
        window.Capacitor={PluginHeaders:Object.entries(methods).map(([name,names])=>({name,methods:names.map(name=>({name,rtype:'promise'}))})),nativePromise:async(plugin,method,options)=>{
          if(method==='getInfo')return {version:'0.5.1'};
          if(method==='getPending')return {notifications:[]};
          if(method==='checkPermissions'||method==='requestPermissions')return {display:'granted'};
          if(method==='request'||method==='get')return {status:200,data:options.url.includes('github')?[]:JSON.stringify({liveEntries:[]}).replaceAll('"','\\"')};
          return {};
        }};
      }
    }, {mobile});
    await page.goto(`${origin}/${mobile ? 'mobile' : 'desktop'}/index.html`);
    await page.locator('[data-view="maps"]').waitFor();
    const oldProgress = await page.evaluate(() => localStorage.getItem('arc-quest-progress-v1'));
    const oldFavorites = await page.evaluate(() => localStorage.getItem('arc-favorites-v1'));
    if (mobile) {
      assert.equal(await page.locator('#playerView, #steamApiKey, #arcAppKey, #arcUserKey, [data-view="player"]').count(),0);
      assert.equal(await page.locator('.nav-item:visible').count(),4);
      assert.ok(await page.locator('#navMore').isVisible());
    }
    await navigate(page,'maps');
    assert.equal(await page.locator('#atlasMap option').count(),catalog.maps.length);
    let layerCount = 0;
    for (const map of catalog.maps) for (const floor of map.floors) {
      await mapLoaded(page,map,floor); layerCount++;
      await noOverflow(page,width,`Map ${map.id}/${floor.id} ${width}px`);
    }
    const layered = catalog.maps.find(map => map.id === 'stella-montis') || catalog.maps.find(map => map.floors.length > 1);
    assert.ok(layered,'A multi-floor map is required to verify pin isolation');
    await mapLoaded(page,layered,layered.floors[0]);
    const layerSummary=page.locator('#atlasLayerSummary');
    if(await layerSummary.count() && !(await layerSummary.evaluate(el=>el.parentElement.open))) await layerSummary.click();
    const checkedKinds = await page.locator('#atlasCategories input:checked').evaluateAll(inputs=>inputs.map(input=>input.value));
    for (const kind of checkedKinds) await page.locator(`#atlasCategories input[value="${kind}"]`).uncheck();
    await page.locator('#atlasCategories input[value="personal"]').check();
    await page.locator('#atlasAdd').click();
    await page.locator('#atlasPlus').click();
    assert.equal(await page.locator('#atlasPinForm').count(),0,'Zoom controls must not create a pin');
    assert.ok(await page.locator('#atlasAdd').evaluate(el=>el.classList.contains('active')),'Zoom must preserve add-pin mode');
    await page.locator('#atlasFit').click();
    await page.locator('#atlasViewport').scrollIntoViewIfNeeded();
    const bounds = await page.locator('#atlasViewport').boundingBox();
    await page.mouse.click(bounds.x+bounds.width*.46,bounds.y+bounds.height*.46);
    await page.locator('#atlasPinName').fill(`QA ${width} личная метка`);
    await page.locator('#atlasPinForm button[type="submit"]').click();
    const pins = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-map-pins-v1')));
    const own = pins.find(pin => pin.title === `QA ${width} личная метка`);
    assert.ok(own && Number.isFinite(own.lng) && Number.isFinite(own.lat),'Pin must persist raw coordinates');
    assert.equal(own.mapId,layered.id);assert.equal(own.floorId,layered.floors[0].id);
    if (mobile) {
      await page.locator('#atlasViewport').scrollIntoViewIfNeeded();
      const touchBounds=await page.locator('#atlasViewport').boundingBox();
      const x=touchBounds.x+touchBounds.width/2,y=touchBounds.y+touchBounds.height/2;
      const beforePinch=await page.locator('#atlasWorld').evaluate(el=>el.style.transform);
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-55,y,id:1},{x:x+55,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.notEqual(await page.locator('#atlasWorld').evaluate(el=>el.style.transform),beforePinch,'Two-finger pinch must change the map scale');
      assert.equal(await page.locator('#atlasPinForm').count(),0,'Pinch must not create a personal pin');
      await cdp.detach();
      await page.locator('#atlasFit').click();
    }
    await page.locator('#atlasPlus').click();
    await page.locator('#atlasViewport').scrollIntoViewIfNeeded();
    const beforeTransform = await page.locator('#atlasWorld').evaluate(el=>el.style.transform);
    const panBounds = await page.locator('#atlasViewport').boundingBox();
    await page.mouse.move(panBounds.x+30,panBounds.y+70);await page.mouse.down();await page.mouse.move(panBounds.x+52,panBounds.y+85,{steps:4});await page.mouse.up();
    assert.notEqual(await page.locator('#atlasWorld').evaluate(el=>el.style.transform),beforeTransform,'Dragging must move the map');
    await page.locator(`[data-pin="${own.id}"]`).click();
    assert.ok((await page.locator('#atlasDetail').innerText()).includes(own.title),'Pin should remain clickable after zoom and pan');
    await page.locator('#atlasFloor').selectOption(layered.floors[1].id);
    assert.equal(await page.locator(`[data-pin="${own.id}"]`).count(),0,'Personal pin must not appear on another floor');
    await page.locator('#atlasFloor').selectOption(layered.floors[0].id);
    assert.equal(await page.locator(`[data-pin="${own.id}"]`).count(),1);
    assert.deepEqual(await page.evaluate(id=>JSON.parse(localStorage.getItem('arc-map-pins-v1')).find(pin=>pin.id===id),own.id),own,'Pan/zoom/floor changes must not change raw coordinates');
    if(mobile && await layerSummary.count() && await layerSummary.evaluate(el=>el.parentElement.open)) await layerSummary.click();
    await page.screenshot({path:path.join(preview,`maps-${width}.png`),fullPage:true});
    await page.reload(); await navigate(page,'maps');
    await page.waitForSelector(`[data-pin="${own.id}"]`);
    assert.equal(await page.locator('#atlasMap').inputValue(),layered.id);
    assert.equal(await page.locator('#atlasFloor').inputValue(),layered.floors[0].id);

    await navigate(page,'wiki');
    assert.ok(await page.locator('.book-card').count()>0);
    await page.locator('#bookSearch').fill('zzzz-нет-такого-123');
    assert.ok(await page.locator('.book-empty').isVisible());
    await page.locator('[data-book-reset]').click();
    const item = catalog.items.find(value => value.id === 'anvil_i') || catalog.items[0];
    await page.locator('#bookSearch').fill(item.nameEn || item.name);
    await page.locator(`[data-book-kind="item"][data-book-id="${item.id}"]`).first().click();
    assert.ok((await page.locator('.book-detail h2').innerText()).includes(item.name));
    const related = page.locator('.book-detail-body [data-book-kind="item"]');
    if(await related.count()) {
      const id=await related.first().getAttribute('data-book-id');
      await related.first().click();
      assert.equal(await page.locator('.book-detail h2').innerText(),catalog.items.find(value=>value.id===id).name);
      await page.locator('[data-book-back]').click();
      assert.equal(await page.locator('.book-detail h2').innerText(),item.name);
    }
    await page.locator('[data-book-back]').click();
    assert.equal(await page.locator('#bookSearch').inputValue(),item.nameEn || item.name,'Back must restore the search');
    await page.locator('[data-book-category="arcs"]').click();
    await page.locator('#bookSearch').fill('');
    await noOverflow(page,width,`Wiki ${width}px`);
    await page.screenshot({path:path.join(preview,`wiki-${width}.png`),fullPage:true});
    assert.equal(Number(await page.locator('[data-book-category="skills"] small').innerText()),catalog.skills.length,'Mobile and desktop must package the same skill catalog');
    const numericSkill=catalog.skills.find(skill=>skill.id==='cond_2r' && skill.effect?.perLevel?.length);
    if(numericSkill){
      await page.locator('[data-book-category="skills"]').click();
      await page.locator(`[data-book-kind="skill"][data-book-id="${numericSkill.id}"]`).click();
      const finalValue=numericSkill.effect.perLevel.at(-1);
      const expected=(/Multiplier$/.test(numericSkill.effect.valueTag||'')?'×':'')+Number(finalValue).toLocaleString('ru-RU');
      assert.equal(await page.locator('.book-effect-table tbody tr').last().locator('td').innerText(),expected,'The final skill-level effect must match the source');
      await page.locator('[data-book-back]').click();
    }

    await navigate(page,'hideout');
    const station = catalog.stations.find(value=>value.id==='weapon_bench') || catalog.stations.find(value=>value.maxLevel>1);
    await page.locator(`[data-hideout-station="${station.id}"]`).selectOption('1');
    const stock = page.locator('[data-hideout-stock]').first();
    const stockId = await stock.getAttribute('data-hideout-stock');
    await stock.fill('7'); await stock.press('Tab');
    await page.locator('[data-hideout-mode="max"]').click();
    let saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('arc-hideout-v1')));
    assert.equal(saved.levels[station.id],1);assert.equal(saved.inventory[stockId],7);assert.equal(saved.mode,'max');
    const before = saved.inventory[stockId];
    await page.locator(`[data-hideout-station="${station.id}"]`).selectOption(String(station.maxLevel));
    saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('arc-hideout-v1')));
    assert.equal(saved.inventory[stockId],before,'Changing level must not consume stock');
    await page.locator('[data-hideout-mode="next"]').click();
    await page.reload(); await navigate(page,'hideout');
    assert.equal(await page.locator(`[data-hideout-station="${station.id}"]`).inputValue(),String(station.maxLevel));
    assert.equal(await page.locator('[data-hideout-mode="next"]').getAttribute('aria-pressed'),'true');
    saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('arc-hideout-v1')));
    assert.equal(saved.inventory[stockId],7);
    assert.equal(await page.evaluate(()=>localStorage.getItem('arc-quest-progress-v1')),oldProgress,'Existing quest progress must remain unchanged');
    assert.equal(await page.evaluate(()=>localStorage.getItem('arc-favorites-v1')),oldFavorites,'Existing favorites must remain unchanged');
    await noOverflow(page,width,`Hideout ${width}px`);
    await page.screenshot({path:path.join(preview,`hideout-${width}.png`),fullPage:true});
    console.log(`${mobile?'Android UI':'Desktop'} ${width}px: ${catalog.maps.length} maps/${layerCount} layers, local images, pins/floors/persistence, zoom/pan, wiki/back/search, hideout modes/stock OK`);
    await context.close();
  }
  assert.deepEqual(errors,[],'No JavaScript errors are allowed');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
