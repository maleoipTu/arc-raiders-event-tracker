const { app, BrowserWindow, ipcMain, safeStorage, shell, Tray, Menu, Notification, net } = require('electron');
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const ARC_APP_ID = 1808500;
const DEFAULT_SETTINGS = { minimizeToTray: true, launchAtStartup: false, notifications: true, notifyLeadMinutes: 10, updateManifestUrl: '' };

let mainWindow;
let tray;
let isQuitting = false;
let runtimeSettings = { ...DEFAULT_SETTINGS };
let notificationTimers = [];
let pendingUpdate = null;
let downloadedUpdatePath = '';

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    show: !process.argv.includes('--hidden'),
    backgroundColor: '#090b0a',
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    title: 'ARC Event Tracker',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
  win.on('close', (event) => {
    if (!isQuitting && runtimeSettings.minimizeToTray) {
      event.preventDefault();
      win.hide();
    }
  });
  mainWindow = win;
  return win;
};

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  tray = new Tray(path.join(__dirname, 'assets', 'app-icon.ico'));
  tray.setToolTip('ARC Event Tracker');
  tray.on('double-click', showMainWindow);
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть ARC Event Tracker', click: showMainWindow },
    { label: 'Обновить данные', click: () => { showMainWindow(); mainWindow.webContents.send('app:refresh'); } },
    { type: 'separator' },
    { label: 'Запускать вместе с Windows', type: 'checkbox', checked: runtimeSettings.launchAtStartup, click: (item) => saveAppSettings({ launchAtStartup: item.checked }) },
    { label: 'Уведомления о событиях', type: 'checkbox', checked: runtimeSettings.notifications, click: (item) => saveAppSettings({ notifications: item.checked }) },
    { type: 'separator' },
    { label: 'Выход', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

app.whenReady().then(async () => {
  app.setAppUserModelId('local.arcraiders.eventtracker');
  runtimeSettings = await readAppSettings();
  applyStartupSetting();
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('steam:login', () => loginWithSteam());
  ipcMain.handle('credentials:status', () => credentialStatus());
  ipcMain.handle('credentials:save', (_event, values) => saveCredentials(values));
  ipcMain.handle('player:steam-stats', (_event, steamId) => fetchSteamStats(steamId));
  ipcMain.handle('player:arc-stats', () => fetchArcStats());
  ipcMain.handle('external:open', (_event, target) => openTrustedExternal(target));
  ipcMain.handle('settings:get', () => ({ ...runtimeSettings, packaged: app.isPackaged, notificationSupported: Notification.isSupported() }));
  ipcMain.handle('settings:save', (_event, values) => saveAppSettings(values));
  ipcMain.handle('notifications:schedule', (_event, events) => scheduleEventNotifications(events));
  ipcMain.handle('diagnostics:run', (_event, steamId) => runDiagnostics(steamId));
  ipcMain.handle('updates:check', () => checkForUpdates());
  ipcMain.handle('updates:download', () => downloadPendingUpdate());
  ipcMain.handle('updates:reveal', () => downloadedUpdatePath ? shell.showItemInFolder(downloadedUpdatePath) : false);
  ipcMain.handle('schedule:fetch', async (_event, region = 'europe') => {
    const response = await fetchOfficialSchedule();
    const html = await response.text();
    const entries = extractScheduleArray(html, 'liveEntries');
    if (!entries.length) throw new Error('Official schedule was empty');
    return {
      region,
      syncedAt: Date.now(),
      events: entries.map((entry) => {
        const regional = region === 'europe' ? null : entry.regionTimestamps?.[region];
        const start = regional?.[0] ?? entry.startTimestamp;
        const end = regional?.[1] ?? entry.endTimestamp;
        return { id: `${entry.conditionName}|${entry.mapDisplayName}|${start}`, originalName: entry.conditionName, originalMap: entry.mapDisplayName, start, end };
      })
    };
  });
  createWindow();
  createTray();
  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('before-quit', () => { isQuitting = true; });

async function loginWithSteam() {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      error ? reject(error) : resolve(value);
    };
    const server = http.createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url, `http://${request.headers.host}`);
        if (requestUrl.pathname !== '/auth/steam/callback') {
          response.writeHead(404).end('Not found');
          return;
        }
        const verification = new URLSearchParams(requestUrl.searchParams);
        verification.set('openid.mode', 'check_authentication');
        const verifyResponse = await fetch('https://steamcommunity.com/openid/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: verification,
          signal: AbortSignal.timeout(15000)
        });
        const verifyText = await verifyResponse.text();
        if (!verifyText.includes('is_valid:true')) throw new Error('Steam identity verification failed');
        const claimedId = requestUrl.searchParams.get('openid.claimed_id') || '';
        const steamId = claimedId.match(/\/id\/(\d+)$/)?.[1];
        if (!steamId) throw new Error('SteamID was not returned');
        const profile = await fetchPublicSteamProfile(steamId);
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><meta charset="utf-8"><title>ARC Event Tracker</title><body style="background:#0b0d0b;color:#edf0e8;font:16px Segoe UI;padding:40px"><h1>Steam подключён</h1><p>Можно закрыть эту вкладку и вернуться в ARC Event Tracker.</p></body>');
        finish(null, { steamId, profile });
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Steam sign-in could not be verified. Return to ARC Event Tracker and try again.');
        finish(error);
      }
    });
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      const returnTo = `http://127.0.0.1:${port}/auth/steam/callback`;
      const params = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': returnTo,
        'openid.realm': `http://127.0.0.1:${port}`,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
      });
      try { await shell.openExternal(`https://steamcommunity.com/openid/login?${params}`); }
      catch (error) { finish(error); }
    });
    server.on('error', (error) => finish(error));
    timeout = setTimeout(() => finish(new Error('Steam sign-in timed out')), 5 * 60 * 1000);
  });
}

async function fetchPublicSteamProfile(steamId) {
  try {
    const response = await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`, { signal: AbortSignal.timeout(15000) });
    const xml = await response.text();
    const value = (tag) => decodeXml(xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))?.[1] || '');
    return { name: value('steamID'), avatar: value('avatarFull'), state: value('onlineState'), privacy: value('privacyState'), profileUrl: `https://steamcommunity.com/profiles/${steamId}` };
  } catch {
    return { name: `Steam ${steamId}`, avatar: '', state: '', privacy: '', profileUrl: `https://steamcommunity.com/profiles/${steamId}` };
  }
}

function decodeXml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').trim();
}

function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
async function readAppSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(await fs.readFile(settingsFile(), 'utf8')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
async function saveAppSettings(values = {}) {
  const allowed = ['minimizeToTray', 'launchAtStartup', 'notifications', 'notifyLeadMinutes', 'updateManifestUrl'];
  const next = { ...runtimeSettings };
  for (const key of allowed) if (Object.hasOwn(values, key)) next[key] = values[key];
  next.minimizeToTray = Boolean(next.minimizeToTray);
  next.launchAtStartup = Boolean(next.launchAtStartup);
  next.notifications = Boolean(next.notifications);
  next.notifyLeadMinutes = Math.min(60, Math.max(0, Number(next.notifyLeadMinutes) || 0));
  next.updateManifestUrl = String(next.updateManifestUrl || '').trim();
  runtimeSettings = next;
  await fs.writeFile(settingsFile(), JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  applyStartupSetting();
  updateTrayMenu();
  return { ...runtimeSettings, packaged: app.isPackaged, notificationSupported: Notification.isSupported() };
}
function applyStartupSetting() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: runtimeSettings.launchAtStartup, path: process.execPath, args: ['--hidden'] });
}
function scheduleEventNotifications(input = []) {
  notificationTimers.forEach(clearTimeout);
  notificationTimers = [];
  if (!runtimeSettings.notifications || !Notification.isSupported()) return { scheduled: 0 };
  const now = Date.now();
  const lead = runtimeSettings.notifyLeadMinutes * 60 * 1000;
  const groups = new Map();
  for (const item of Array.isArray(input) ? input : []) {
    const start = Number(item.start);
    if (!Number.isFinite(start) || start <= now || start > now + 24 * 60 * 60 * 1000) continue;
    const safe = { title: String(item.title || 'Событие ARC'), location: String(item.location || '') };
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(safe);
  }
  for (const [start, items] of groups) {
    const delay = Math.max(1000, start - lead - now);
    const timer = setTimeout(() => {
      const first = items[0];
      const title = items.length === 1 ? first.title : `Скоро ${items.length} события`;
      const body = items.length === 1 ? `${first.location} · через ${runtimeSettings.notifyLeadMinutes} мин` : items.slice(0, 3).map((item) => item.title).join(' · ');
      const notification = new Notification({ title, body, icon: path.join(__dirname, 'assets', 'app-icon.png') });
      notification.on('click', showMainWindow);
      notification.show();
    }, delay);
    notificationTimers.push(timer);
  }
  return { scheduled: notificationTimers.length };
}

function compareVersions(left, right) {
  const a = String(left).split('.').map((part) => Number(part) || 0);
  const b = String(right).split('.').map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
}
async function checkForUpdates() {
  const currentVersion = app.getVersion();
  if (!runtimeSettings.updateManifestUrl) return { configured: false, currentVersion, status: 'not-configured' };
  const manifestUrl = new URL(runtimeSettings.updateManifestUrl);
  if (manifestUrl.protocol !== 'https:') throw new Error('Канал обновлений должен использовать HTTPS');
  const response = await net.fetch(manifestUrl.toString(), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Канал обновлений вернул ${response.status}`);
  const manifest = await response.json();
  const version = String(manifest.version || '');
  const installerUrl = new URL(String(manifest.url || ''), manifestUrl);
  const sha256 = String(manifest.sha256 || '').toLowerCase();
  if (!/^\d+\.\d+\.\d+/.test(version) || installerUrl.protocol !== 'https:' || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Манифест обновления повреждён');
  const available = compareVersions(version, currentVersion) > 0;
  pendingUpdate = available ? { version, url: installerUrl.toString(), sha256, notes: String(manifest.notes || '') } : null;
  return { configured: true, currentVersion, available, version, notes: String(manifest.notes || '') };
}
async function downloadPendingUpdate() {
  if (!pendingUpdate) throw new Error('Сначала проверьте обновления');
  const response = await net.fetch(pendingUpdate.url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Загрузка вернула ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== pendingUpdate.sha256) throw new Error('SHA-256 установщика не совпадает');
  const directory = path.join(app.getPath('userData'), 'updates');
  await fs.mkdir(directory, { recursive: true });
  downloadedUpdatePath = path.join(directory, `ARC-Event-Tracker-Setup-${pendingUpdate.version}.exe`);
  await fs.writeFile(downloadedUpdatePath, bytes, { mode: 0o600 });
  return { version: pendingUpdate.version, verified: true, path: downloadedUpdatePath };
}

async function runDiagnostics(steamId) {
  const started = Date.now();
  const checks = [];
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });
  add('encryption', 'Шифрование Windows', safeStorage.isEncryptionAvailable() ? 'ok' : 'error', safeStorage.isEncryptionAvailable() ? 'DPAPI доступен' : 'DPAPI недоступен');
  add('tray', 'Системный трей', tray ? 'ok' : 'error', tray ? 'Трей активен' : 'Трей не создан');
  add('notifications', 'Уведомления Windows', Notification.isSupported() ? 'ok' : 'warning', Notification.isSupported() ? `${runtimeSettings.notifications ? 'Включены' : 'Выключены'} в настройках` : 'Не поддерживаются системой');
  try { const response = await fetchOfficialSchedule(); add('schedule', 'Расписание Embark', response.ok ? 'ok' : 'error', response.ok ? 'Источник доступен' : `HTTP ${response.status}`); }
  catch (error) { add('schedule', 'Расписание Embark', 'error', error.message); }
  const credentials = await credentialStatus();
  add('steam-key', 'Steam Web API', credentials.steamApiKey ? 'ok' : 'warning', credentials.steamApiKey ? 'Ключ сохранён' : 'Ключ не сохранён');
  if (credentials.steamApiKey && steamId) {
    try { const steam = await fetchSteamStats(String(steamId)); add('steam-data', 'Данные Steam', steam.player || steam.total ? 'ok' : 'warning', steam.player || steam.total ? 'Профиль и статистика доступны' : 'Профиль может быть закрыт'); }
    catch (error) { add('steam-data', 'Данные Steam', 'error', error.message); }
  }
  add('arc-keys', 'Ключи ARC Tracker', credentials.arcAppKey && credentials.arcUserKey ? 'ok' : 'warning', credentials.arcAppKey && credentials.arcUserKey ? 'App key и User key сохранены' : 'Нужны оба ключа');
  if (credentials.arcAppKey && credentials.arcUserKey) {
    try { const arc = await fetchArcStats(); const count = arc.summary?.total || 0; add('arc-data', 'Данные ARC Tracker', count ? 'ok' : 'warning', count ? `Загружено рейдов: ${count}` : 'Ключи работают, но история рейдов пуста'); }
    catch (error) { add('arc-data', 'Данные ARC Tracker', 'error', error.message); }
  }
  add('updates', 'Канал обновлений', runtimeSettings.updateManifestUrl ? 'ok' : 'warning', runtimeSettings.updateManifestUrl ? 'HTTPS-манифест настроен' : 'Адрес манифеста не задан');
  return { checks, durationMs: Date.now() - started, version: app.getVersion() };
}

function credentialFile() { return path.join(app.getPath('userData'), 'credentials.json'); }
async function readCredentials() {
  try {
    const stored = JSON.parse(await fs.readFile(credentialFile(), 'utf8'));
    const result = {};
    for (const [key, encrypted] of Object.entries(stored)) result[key] = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    return result;
  } catch { return {}; }
}
async function saveCredentials(values = {}) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable');
  const allowed = ['steamApiKey', 'arcAppKey', 'arcUserKey'];
  const current = await readCredentials();
  const stored = {};
  for (const key of allowed) {
    const value = String(values[key] || '').trim() || current[key] || '';
    if (value) stored[key] = safeStorage.encryptString(value).toString('base64');
  }
  await fs.writeFile(credentialFile(), JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 });
  return credentialStatus();
}
async function credentialStatus() {
  const values = await readCredentials();
  return { steamApiKey: Boolean(values.steamApiKey), arcAppKey: Boolean(values.arcAppKey), arcUserKey: Boolean(values.arcUserKey), encryption: safeStorage.isEncryptionAvailable() };
}

async function fetchSteamStats(steamId) {
  const { steamApiKey } = await readCredentials();
  if (!steamApiKey) return { needsKey: true };
  const summaryUrl = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
  summaryUrl.search = new URLSearchParams({ key: steamApiKey, steamids: steamId });
  const gamesUrl = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
  gamesUrl.search = new URLSearchParams({ key: steamApiKey, steamid: steamId, include_appinfo: 'true', include_played_free_games: 'true', 'appids_filter[0]': String(ARC_APP_ID) });
  const achievementsUrl = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/');
  achievementsUrl.search = new URLSearchParams({ key: steamApiKey, steamid: steamId, appid: String(ARC_APP_ID), l: 'russian' });
  const [summaryResult, gamesResult, achievementsResult] = await Promise.allSettled([fetchJson(summaryUrl), fetchJson(gamesUrl), fetchJson(achievementsUrl)]);
  const player = summaryResult.status === 'fulfilled' ? summaryResult.value?.response?.players?.[0] : null;
  const game = gamesResult.status === 'fulfilled' ? gamesResult.value?.response?.games?.[0] : null;
  const achievementData = achievementsResult.status === 'fulfilled' ? achievementsResult.value?.playerstats : null;
  const achievements = achievementData?.achievements || [];
  return { needsKey: false, player, playtimeMinutes: game?.playtime_forever ?? null, achievements, unlocked: achievements.filter((item) => item.achieved === 1).length, total: achievements.length, privateProfile: !game && !achievementData };
}

async function fetchArcStats() {
  const { arcAppKey, arcUserKey } = await readCredentials();
  if (!arcAppKey || !arcUserKey) return { needsKeys: true };
  const headers = { 'X-App-Key': arcAppKey, Authorization: `Bearer ${arcUserKey}` };
  const [profileResult, roundsResult] = await Promise.allSettled([
    fetchJson('https://arctracker.io/api/v2/user/profile', headers),
    fetchJson('https://arctracker.io/api/v2/user/rounds?locale=ru&limit=50&sort=newest', headers)
  ]);
  if (profileResult.status === 'rejected' && roundsResult.status === 'rejected') throw profileResult.reason;
  const profile = profileResult.status === 'fulfilled' ? profileResult.value?.data : null;
  const roundPayload = roundsResult.status === 'fulfilled' ? roundsResult.value?.data : null;
  const rawRounds = Array.isArray(roundPayload) ? roundPayload : roundPayload?.rounds || roundPayload?.items || [];
  const rounds = rawRounds.map(normalizeRound);
  const extracted = rounds.filter((round) => round.extracted).length;
  const sum = (key) => rounds.reduce((total, round) => total + Number(round[key] || 0), 0);
  return { needsKeys: false, profile, rounds, summary: { total: rounds.length, extracted, died: rounds.length - extracted, extractionRate: rounds.length ? Math.round(extracted / rounds.length * 100) : 0, kills: sum('kills'), arcKills: sum('arcKills'), damage: sum('damage'), lootValue: sum('lootValue') } };
}

function normalizeRound(round = {}) {
  const first = (keys, fallback = null) => keys.map((key) => round[key]).find((value) => value != null) ?? fallback;
  const number = (keys) => Number(first(keys, 0)) || 0;
  const outcome = String(first(['outcome', 'result', 'status'], '')).toLowerCase();
  return {
    id: String(first(['id', 'roundId', 'raidId'], crypto.randomUUID())),
    startedAt: first(['startedAt', 'startTime', 'createdAt', 'endedAt', 'timestamp'], null),
    map: String(first(['mapDisplayName', 'mapName', 'map', 'location'], 'Неизвестная карта')),
    outcome,
    extracted: outcome.includes('extract') || outcome.includes('success') || outcome.includes('surviv'),
    kills: number(['kills', 'raiderKills', 'player_kills']),
    arcKills: number(['arcKills', 'arc_kills']),
    damage: number(['damage', 'damageDealt', 'damage_dealt']),
    lootValue: number(['lootValue', 'loot_value', 'value']),
    score: number(['score', 'totalScore', 'total_score'])
  };
}

async function fetchJson(target, headers = {}) {
  const response = await fetch(target, { headers, signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status})`);
  return data;
}

async function openTrustedExternal(target) {
  const allowed = {
    steamApiKey: 'https://steamcommunity.com/dev/apikey',
    arcSettings: 'https://arctracker.io/settings',
    arcDevelopers: 'https://arctracker.io/developers/apps',
    arcLink: 'https://arctracker.io/app#download'
  };
  if (!allowed[target]) throw new Error('Untrusted external link');
  await shell.openExternal(allowed[target]);
  return true;
}

async function fetchOfficialSchedule() {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('https://arcraiders.com/map-conditions', {
        headers: { 'User-Agent': 'ARC Event Tracker/0.1' },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`Official tracker returned ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function extractScheduleArray(html, key) {
  const token = `\\"${key}\\":`;
  const tokenIndex = html.indexOf(token);
  if (tokenIndex < 0) return [];
  const start = html.indexOf('[', tokenIndex + token.length);
  let depth = 0;
  for (let index = start; index < html.length; index += 1) {
    if (html[index] === '[') depth += 1;
    if (html[index] === ']') depth -= 1;
    if (depth === 0) return JSON.parse(html.slice(start, index + 1).replaceAll('\\"', '"'));
  }
  return [];
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !runtimeSettings.minimizeToTray) app.quit();
});
