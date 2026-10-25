const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arcApp', {
  version: () => ipcRenderer.invoke('app:version'),
  fetchSchedule: (region) => ipcRenderer.invoke('schedule:fetch', region),
  loginWithSteam: () => ipcRenderer.invoke('steam:login'),
  credentialStatus: () => ipcRenderer.invoke('credentials:status'),
  saveCredentials: (values) => ipcRenderer.invoke('credentials:save', values),
  fetchSteamStats: (steamId) => ipcRenderer.invoke('player:steam-stats', steamId),
  fetchArcStats: () => ipcRenderer.invoke('player:arc-stats'),
  openExternal: (target) => ipcRenderer.invoke('external:open', target),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (values) => ipcRenderer.invoke('settings:save', values),
  scheduleNotifications: (events) => ipcRenderer.invoke('notifications:schedule', events),
  runDiagnostics: (steamId) => ipcRenderer.invoke('diagnostics:run', steamId),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  revealUpdate: () => ipcRenderer.invoke('updates:reveal'),
  onAppRefresh: (callback) => ipcRenderer.on('app:refresh', () => callback())
});
