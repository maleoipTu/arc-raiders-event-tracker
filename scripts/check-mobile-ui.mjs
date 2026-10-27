import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(playwrightPath);
const root = new URL('../mobile/www/', import.meta.url);
const server = createServer(async (req, res) => {
  try {
    const target = new URL(`.${req.url === '/' ? '/index.html' : req.url}`, root);
    if (!target.href.startsWith(root.href)) { res.writeHead(403).end(); return; }
    const type = target.pathname.endsWith('.js') ? 'text/javascript' : target.pathname.endsWith('.css') ? 'text/css' : 'text/html';
    res.writeHead(200, { 'Content-Type': type }); res.end(await readFile(target));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const errors = [];
try {
  for (const width of [360, 412, 800]) {
    const context = await browser.newContext({ viewport: { width, height: 915 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const now = Date.now();
      const entries = [{ conditionName: 'Night Raid', mapDisplayName: 'Spaceport', startTimestamp: now + 3600000, endTimestamp: now + 7200000 }, { conditionName: 'Harvester', mapDisplayName: 'Blue Gate', startTimestamp: now - 60000, endTimestamp: now + 3600000 }];
      window.androidBridge = {};
      window.testNotifications = [];
      window.testNotificationSchedules = 0;
      const methods = {
        App: ['getInfo', 'minimizeApp', 'addListener', 'removeListener'], Browser: ['open'],
        LocalNotifications: ['getPending', 'cancel', 'checkPermissions', 'requestPermissions', 'createChannel', 'schedule', 'addListener', 'removeListener'],
        CapacitorHttp: ['request', 'get']
      };
      window.Capacitor = {
        PluginHeaders: Object.entries(methods).map(([name, names]) => ({ name, methods: names.map(name => ({ name, rtype: 'promise' })) })),
        nativePromise: async (plugin, method, options) => {
          if (method === 'getInfo') return { version: '0.5.0' };
          if (method === 'getPending') return { notifications: [] };
          if (method === 'checkPermissions' || method === 'requestPermissions') return { display: 'granted' };
          if (method === 'schedule') { window.testNotifications = options.notifications; window.testNotificationSchedules++; }
          if (method === 'request' || method === 'get') {
            if (options.url.includes('github')) return { status: 200, data: window.testAndroidUpdate ? [{ tag_name: 'v9.0.0', assets: [{ name: 'Windows.exe' }] }, { tag_name: 'android-v0.6.0', assets: [{ name: 'ARC-Android-0.6.0.apk', browser_download_url: 'https://github.com/maleoipTu/arc-raiders-event-tracker/releases/download/android-v0.6.0/ARC-Android-0.6.0.apk' }] }] : [] };
            return { status: 200, data: JSON.stringify({ liveEntries: entries }).replaceAll('"', '\\"') };
          }
          return {};
        }
      };
    });
    await page.route('https://cdn.arctracker.io/**', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => document.querySelector('#syncTitle')?.textContent.includes('EMBARK'));
    assert.equal(await page.locator('.nav-item').count(), 5);
    assert.equal(await page.locator('[data-view="player"]').count(), 0);
    assert.equal(await page.locator('#steamApiKey, #arcAppKey, #arcUserKey, #playerView').count(), 0);
    const overflow = async () => page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 2 && el.getBoundingClientRect().width > 0).map(el => el.className).slice(0, 10) }));
    let size = await overflow(); assert.ok(size.scroll <= width + 1, JSON.stringify(size));
    await mkdir(new URL('../dist/android-preview/', import.meta.url), { recursive: true });
    if (width === 412) await page.screenshot({ path: fileURLToPath(new URL('../dist/android-preview/events.png', import.meta.url)), fullPage: true });
    await page.locator('[data-view="quests"]').click();
    await page.waitForSelector('.quest-node');
    const branch = await page.evaluate(() => {
      const graph = window.ARCQuestGraph.createGraph(window.ARC_QUEST_CATALOG.quests);
      const id = graph.order.find(value => window.ARCQuestGraph.closure(graph, value).size >= 4 && graph.children.get(value).length);
      return { id, required: [...window.ARCQuestGraph.closure(graph, id), id], after: [...window.ARCQuestGraph.closure(graph, id, 'children')] };
    });
    await page.locator(`[data-tree-quest="${branch.id}"]`).click();
    await page.locator(`[data-quest-check="${branch.id}"]`).check();
    let branchProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-quest-progress-v1')));
    assert.deepEqual(Object.keys(branchProgress).sort(), branch.required.sort());
    assert.ok(branch.required.every(id => branchProgress[id].completed));
    assert.ok(branch.after.every(id => !branchProgress[id]?.completed));
    await page.locator('#questUndo').click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-quest-progress-v1'))), {});
    if (width === 412) await page.screenshot({ path: fileURLToPath(new URL('../dist/android-preview/quest-tree.png', import.meta.url)), fullPage: true });
    await page.locator('[data-quest-display="list"]').click();
    await page.waitForSelector('.quest-card');
    size = await overflow(); assert.ok(size.scroll <= width + 1, JSON.stringify(size));
    await page.locator('.quest-card').first().click();
    await page.locator('[data-objective-index]').first().check();
    const saved = await page.evaluate(() => localStorage.getItem('arc-quest-progress-v1'));
    assert.ok(saved?.includes('true'));
    if (width === 412) await page.screenshot({ path: fileURLToPath(new URL('../dist/android-preview/quests.png', import.meta.url)), fullPage: true });
    await page.reload();
    assert.equal(await page.evaluate(() => localStorage.getItem('arc-quest-progress-v1')), saved);
    await page.locator('[data-view="help"]').click();
    await page.locator('#eventNotifications').check();
    await page.locator('#saveSystemSettings').click();
    await page.waitForFunction(() => window.testNotifications.length > 0);
    const reminderCalls = await page.evaluate(() => window.testNotificationSchedules);
    await page.evaluate(() => window.arcApp.scheduleNotifications([{ title: 'Ночной рейд', location: 'Космопорт', start: window.testNotifications[0].extra.startsAt }]));
    assert.equal(await page.evaluate(() => window.testNotificationSchedules), reminderCalls);
    await page.evaluate(() => { window.testAndroidUpdate = true; });
    await page.locator('#checkUpdates').click();
    await page.waitForFunction(() => document.querySelector('#updateStatus').textContent.includes('0.6.0'));
    assert.equal(await page.locator('#installUpdate').isVisible(), true);
    size = await overflow(); assert.ok(size.scroll <= width + 1, JSON.stringify(size));
    assert.equal(await page.locator('#steamLogin:visible').count(), 0);
    if (width === 412) await page.screenshot({ path: fileURLToPath(new URL('../dist/android-preview/help.png', import.meta.url)), fullPage: true });
    await context.close();
    console.log(`Mobile UI ${width}px: navigation, layout, quest persistence, notifications OK`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); server.close(); }
