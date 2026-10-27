import { CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { LocalNotifications } from '@capacitor/local-notifications';
import { scheduleFromHtml, notificationGroups } from './services.js';

const VERSION = __APP_VERSION__;
const settingsKey = 'arc-android-settings-v1';
const defaults = { notifications: false, notifyLeadMinutes: 10, autoUpdate: true, minimizeToTray: false, launchAtStartup: false };
function readSettings() { try { return { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey) || '{}') }; } catch { return { ...defaults }; } }
let settings = readSettings(), refreshCallback, updateCallback, latestApk;
let updateState = { phase: 'idle', currentVersion: VERSION };
let notificationQueue = Promise.resolve();

async function fetchSchedule(region) {
  const result = await CapacitorHttp.get({ url: 'https://arcraiders.com/map-conditions', responseType: 'text', connectTimeout: 20000, readTimeout: 20000 });
  if (result.status !== 200) throw new Error(`Embark: HTTP ${result.status}`);
  return scheduleFromHtml(String(result.data), region);
}
async function saveSettings(values) {
  let notifications = Boolean(values.notifications);
  if (notifications) {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') notifications = false;
  }
  settings = { ...defaults, notifications, autoUpdate: Boolean(values.autoUpdate), notifyLeadMinutes: [0, 5, 10, 15, 30].includes(Number(values.notifyLeadMinutes)) ? Number(values.notifyLeadMinutes) : 10 };
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  if (values.notifications && !notifications) document.querySelector('#updateStatus').textContent = 'Уведомления запрещены. Разрешите их в настройках Android.';
  return { ...settings, packaged: true, notificationSupported: true };
}
async function syncNotifications(events) {
  const pending = await LocalNotifications.getPending();
  const planKey = 'arc-android-notification-plan-v1';
  if (!settings.notifications || (await LocalNotifications.checkPermissions()).display !== 'granted') {
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications });
    localStorage.removeItem(planKey);
    return { scheduled: 0 };
  }
  await LocalNotifications.createChannel({ id: 'arc-events', name: 'События ARC Raiders', description: 'Напоминания о начале событий', importance: 4 });
  const notifications = notificationGroups(events, settings.notifyLeadMinutes);
  let oldPlan = {};
  try { oldPlan = JSON.parse(localStorage.getItem(planKey) || '{}'); } catch { /* Rebuild an invalid local plan. */ }
  const nextPlan = {}, toSchedule = [];
  for (const notification of notifications) {
    const key = String(notification.extra.startsAt);
    const fingerprint = `${settings.notifyLeadMinutes}|${notification.body}`;
    nextPlan[key] = fingerprint;
    // A previous reminder may already have been delivered or still be delayed by Android.
    // Keep it instead of producing another reminder every time the app resumes.
    if (oldPlan[key] !== fingerprint) toSchedule.push(notification);
  }
  const replacements = new Set(toSchedule.map(item => item.id));
  const cancelled = pending.notifications.filter(item => !nextPlan[String(item.extra?.startsAt)] || replacements.has(item.id));
  if (cancelled.length) await LocalNotifications.cancel({ notifications: cancelled });
  if (toSchedule.length) await LocalNotifications.schedule({ notifications: toSchedule });
  localStorage.setItem(planKey, JSON.stringify(nextPlan));
  return { scheduled: notifications.length };
}
async function checkUpdates() {
  updateCallback?.({ phase: 'checking' });
  try {
    const response = await CapacitorHttp.get({ url: 'https://api.github.com/repos/maleoipTu/arc-raiders-event-tracker/releases?per_page=30', responseType: 'json', connectTimeout: 15000, readTimeout: 15000 });
    if (response.status !== 200 || !Array.isArray(response.data)) throw new Error('GitHub временно недоступен.');
    const release = response.data.find(item => !item.draft && !item.prerelease && item.assets?.some(asset => asset.name.endsWith('.apk')));
    const version = release?.tag_name.replace(/^android-v|^v/, '');
    const newer = version && compareVersions(version, VERSION) > 0;
    latestApk = newer ? release.assets.find(asset => asset.name.endsWith('.apk')).browser_download_url : null;
    updateState = newer ? { phase: 'android-available', version } : { phase: 'current', currentVersion: VERSION, android: true };
  } catch (error) { updateState = { phase: 'error', error: error.message }; }
  updateCallback?.(updateState);
  return updateState;
}
function compareVersions(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  if (![...left, ...right].every(Number.isFinite)) return 0;
  for (let i = 0; i < Math.max(left.length, right.length); i++) { const delta = (left[i] || 0) - (right[i] || 0); if (delta) return delta; }
  return 0;
}
function mobileUpdateText(state) {
  if (state.phase === 'android-available') {
    document.querySelector('#updateStatus').textContent = `Доступна Android-версия ${state.version}. Скачайте APK и подтвердите установку в Android.`;
    const install = document.querySelector('#installUpdate'); install.hidden = false; install.textContent = 'Скачать APK';
  } else if (state.phase === 'current') document.querySelector('#updateStatus').textContent = `Android ${VERSION}. Более новых APK в канале не найдено.`;
}

window.arcApp = {
  platform: 'android', version: async () => (await App.getInfo()).version,
  fetchSchedule, getSettings: async () => ({ ...settings, packaged: true, notificationSupported: true }), saveSettings,
  scheduleNotifications: events => { notificationQueue = notificationQueue.catch(() => {}).then(() => syncNotifications(events)); return notificationQueue.catch(() => ({ scheduled: 0 })); },
  credentialStatus: async () => ({}),
  openExternal: async target => { if (target !== 'questSource') throw new Error('Недоступная ссылка'); await Browser.open({ url: 'https://github.com/RaidTheory/arcraiders-data' }); },
  onAppRefresh: callback => { refreshCallback = callback; },
  onUpdateStatus: callback => { updateCallback = state => { callback(state); mobileUpdateText(state); }; },
  updateStatus: async () => updateState, checkUpdates,
  installUpdate: async () => { if (latestApk) await Browser.open({ url: latestApk }); document.querySelector('#installUpdate').disabled = false; document.querySelector('#installUpdate').textContent = 'Скачать APK'; },
  runDiagnostics: async () => {
    const checks = [];
    try { const schedule = await fetchSchedule(localStorage.getItem('arc-region-v1') || 'europe'); checks.push({ status: 'ok', label: 'Расписание Embark', detail: `Получено событий: ${schedule.events.length}` }); }
    catch (error) { checks.push({ status: 'error', label: 'Расписание Embark', detail: error.message }); }
    const permission = await LocalNotifications.checkPermissions();
    checks.push({ status: permission.display === 'granted' && settings.notifications ? 'ok' : 'warning', label: 'Уведомления Android', detail: permission.display === 'granted' ? (settings.notifications ? 'Включены. Android может задерживать их в режиме энергосбережжения.' : 'Выключены в приложении.') : 'Разрешите уведомления в настройках Android.' });
    checks.push({ status: 'ok', label: 'Квесты и избранное', detail: 'Хранятся на этом устройстве. Доступны без подключения.' });
    return { checks, version: VERSION };
  }
};

// Keep the shared renderer's element bindings, but remove desktop-only flows from navigation.
const help = document.querySelector('#helpView');
document.querySelector('.nav').addEventListener('click', () => window.scrollTo(0, 0));
document.querySelector('.quests-hero p').textContent = 'Полный каталог заданий с русскими целями, цепочками, наградами и подсказками. Прогресс хранится на этом телефоне.';
document.addEventListener('error', event => { if (event.target instanceof HTMLImageElement) event.target.hidden = true; }, true);
for (const selector of ['.help-intro', '.help-steps', '.help-panel', '.help-troubleshooting', '.help-security']) help.querySelectorAll(selector).forEach(item => { item.hidden = true; });
for (const id of ['minimizeToTray', 'launchAtStartup']) document.querySelector(`#${id}`).closest('label').hidden = true;
document.querySelector('.system-center h2').textContent = 'Уведомления и обновления';
document.querySelector('#eventNotifications').closest('label').querySelector('small').textContent = 'Напоминания на ближайшие 24 часа. Обновите расписание, чтобы продлить их. Android может задерживать уведомления для экономии батареи.';
document.querySelector('#autoUpdate').closest('label').querySelector('small').textContent = 'Проверять наличие новых APK при запуске. Установку подтверждает Android.';
document.querySelector('.update-source').textContent = 'Канал: Android APK в GitHub Releases. Windows-обновления сюда не попадают.';
document.querySelector('.diagnostics-copy').textContent = 'Проверяет расписание Embark и разрешение на уведомления.';
const testNotification = document.createElement('button');
testNotification.className = 'secondary'; testNotification.textContent = 'Проверить уведомление';
testNotification.addEventListener('click', async () => {
  testNotification.disabled = true;
  try {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') throw new Error('Разрешите уведомления в Android');
    await LocalNotifications.createChannel({ id: 'arc-events', name: 'События ARC Raiders', importance: 4 });
    await LocalNotifications.schedule({ notifications: [{ id: 999, title: 'ARC Event Tracker', body: 'Уведомления работают. Вы готовы к следующему событию!', channelId: 'arc-events', foreground: true, isExactNotification: false, schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true }, extra: { test: true } }] });
    testNotification.textContent = 'Тест отправлен';
  } catch (error) { testNotification.textContent = error.message; }
  finally { testNotification.disabled = false; setTimeout(() => { testNotification.textContent = 'Проверить уведомление'; }, 5000); }
});
document.querySelector('#saveSystemSettings').after(testNotification);
const intro = document.createElement('section'); intro.className = 'mobile-help';
intro.innerHTML = '<div class="eyebrow">ТРЕКЕР В КАРМАНЕ</div><h2>Как пользоваться</h2><p>Расписание загружается от Embark при запуске и обновляется каждые 15 минут, пока приложение открыто. Таймеры показывают время до начала и завершения событий.</p><p>Выберите свой регион и добавьте интересующие события в избранное звёздочкой. Последняя загруженная сводка сохраняется для просмотра без сети.</p><p>Во вкладке «Квесты» доступны 123 задания с целями и подсказками. Отмечайте выполненные пункты — прогресс хранится на телефоне.</p><p>Для напоминаний включите уведомления ниже и разрешите их в Android. Открывайте приложение ежедневно для загрузки нового расписания. После принудительной остановки приложения уведомления могут не приходить до следующего запуска.</p><p>Вход в аккаунт и ключи не нужны. Данные с Windows автоматически не переносятся.</p>';
help.prepend(intro);
App.addListener('appStateChange', state => { if (state.isActive) refreshCallback?.(); });
App.addListener('backButton', async () => {
  const current = document.querySelector('.nav-item.active');
  if (current?.dataset.view !== 'all') document.querySelector('[data-view="all"]').click();
  else await App.minimizeApp();
});
LocalNotifications.addListener('localNotificationActionPerformed', () => { document.querySelector('[data-view="all"]').click(); refreshCallback?.(); });
if (settings.autoUpdate) setTimeout(() => checkUpdates(), 2500);
