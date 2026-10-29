import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const allowed = new Set(['/index.html', '/renderer.js', '/quest-graph.js', '/styles.css', '/game-model.js', '/map-ui.js', '/map-ui.css', '/book-ui.js', '/book-ui.css', '/assets/data/game.ru.json', '/assets/data/quests.ru.js']);
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url;
  if (!allowed.has(path)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(new URL(`.${path}`, root)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.arcApp = {
      version: async () => '0.5.1', fetchSchedule: async () => ({ events: [], syncedAt: Date.now() }), scheduleNotifications: async () => ({}),
      getSettings: async () => ({ notifications: false, notifyLeadMinutes: 10 }), credentialStatus: async () => ({}),
      onAppRefresh: () => {}, onUpdateStatus: () => {}, updateStatus: async () => ({ phase: 'idle' })
    };
  });
  await page.route('https://cdn.arctracker.io/**', route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-view="quests"]').click();
  await page.waitForSelector('.quest-node');
  assert.equal(await page.locator('.quest-node').count(), 123);
  const route = await page.evaluate(() => {
    const g = window.ARCQuestGraph.createGraph(window.ARC_QUEST_CATALOG.quests);
    const id = g.order.find(value => window.ARCQuestGraph.closure(g, value).size >= 12 && g.parents.get(value).length > 1 && g.children.get(value).length);
    return { id, required: [...window.ARCQuestGraph.closure(g, id), id], after: [...window.ARCQuestGraph.closure(g, id, 'children')] };
  });
  await page.locator(`[data-tree-quest="${route.id}"]`).click();
  await page.locator('#questFocusSelected').click();
  await page.locator('.quest-map-panel').scrollIntoViewIfNeeded();
  await mkdir(new URL('../dist/quest-preview/', import.meta.url), { recursive: true });
  await page.locator('.quest-map-panel').screenshot({ path: fileURLToPath(new URL('../dist/quest-preview/tree-desktop.png', import.meta.url)) });
  await page.locator(`[data-quest-check="${route.id}"]`).check();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-quest-progress-v1')));
  assert.deepEqual(Object.keys(progress).sort(), [...route.required].sort());
  assert.ok(route.after.every(id => !progress[id]));
  await page.locator('.quest-map-panel').screenshot({ path: fileURLToPath(new URL('../dist/quest-preview/tree-completed.png', import.meta.url)) });
  await page.reload(); await page.locator('[data-view="quests"]').click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-quest-progress-v1'))), progress);
  await page.locator(`[data-quest-check="${route.id}"]`).uncheck();
  const unmarked = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-quest-progress-v1')));
  assert.equal(unmarked[route.id].completed, false);
  assert.ok(route.required.filter(id => id !== route.id).every(id => unmarked[id].completed));
  await page.locator('#questUndo').click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-quest-progress-v1'))), progress);
  await page.locator('#questTraderFilter').selectOption('Celeste');
  assert.ok(await page.locator('.quest-node.context-node').count() > 0);
  await page.locator('#questSearch').fill('несуществующий квест 000');
  assert.equal(await page.locator('.quest-map-empty').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(`Desktop: 123 nodes, merged route (${route.required.length} quests), no successors, persistence, uncheck, undo and filters OK.`);
} finally { await browser.close(); server.close(); }
