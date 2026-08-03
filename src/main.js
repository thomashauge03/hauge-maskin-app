const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

const storeFile = () => path.join(app.getPath('userData'), 'pages.json');

// Den felles sidelista. Rediger sider.json i GitHub-repoet, så får alle
// installasjonane dei nye sidene automatisk ved neste synk.
const SHARED_URL = 'https://raw.githubusercontent.com/thomashauge03/hauge-maskin-app/main/sider.json';

const DEFAULT_DATA = {
  pages: [
    { id: 'gmail', name: 'E-post', url: 'https://mail.google.com', color: '#ea4335', group: 'Mine sider' },
    { id: 'kalender', name: 'Kalender', url: 'https://calendar.google.com', color: '#4285f4', group: 'Mine sider' }
  ],
  shared: [],
  // Lokale endringar på felles sider: { "shared:id": { name, url, group, color, image, hidden } }
  overrides: {},
  settings: { activeId: null, sharedUrl: SHARED_URL, syncMinutes: 15, lastSync: null }
};

function readData() {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.pages)) throw new Error('ugyldig format');
    data.shared = Array.isArray(data.shared) ? data.shared : [];
    data.overrides = (data.overrides && typeof data.overrides === 'object') ? data.overrides : {};
    data.settings = Object.assign({}, DEFAULT_DATA.settings, data.settings || {});
    // Tomt felt = bruk den felles lista (gjeld òg oppgraderingar frå eldre versjonar)
    if (!data.settings.sharedUrl) data.settings.sharedUrl = SHARED_URL;
    return data;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

// Hentar den delte sidelista. Alle som brukar appen peikar på same adressa,
// så nye sider dukkar opp hjå alle utan at nokon må gjere noko.
async function fetchShared(url) {
  const res = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`Fekk ${res.status} frå tenaren`);
  const json = await res.json();
  const list = Array.isArray(json) ? json : json.pages;
  if (!Array.isArray(list)) throw new Error('Lista manglar feltet "pages"');
  return list
    .filter((p) => p && p.name && p.url)
    .map((p, i) => ({
      id: 'shared:' + (p.id || String(i)),
      name: String(p.name),
      url: String(p.url),
      group: p.group ? String(p.group) : 'Felles',
      color: p.color ? String(p.color) : '#e2001a',
      image: p.image ? String(p.image) : '',
      shared: true
    }));
}

function writeData(data) {
  fs.writeFileSync(storeFile(), JSON.stringify(data, null, 2), 'utf8');
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0d0d0f',
    frame: false,
    show: false,
    title: 'Hauge Maskin',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const sendState = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:state', { maximized: mainWindow.isMaximized() });
    }
  };
  mainWindow.on('maximize', sendState);
  mainWindow.on('unmaximize', sendState);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Lenker som prøver å opne nytt vindu frå ein webview -> opne i standardnettlesar
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- Automatisk oppdatering ---------- */
// Appen ser etter nye versjonar på GitHub, lastar dei ned i bakgrunnen og
// installerer dei når brukaren startar appen på nytt.
function setupAutoUpdate() {
  if (!app.isPackaged) return; // gir berre meining i ein installert app

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };

  autoUpdater.on('update-available', (info) => send('update:available', { version: info.version }));
  autoUpdater.on('download-progress', (p) => send('update:progress', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send('update:ready', { version: info.version }));
  autoUpdater.on('error', (err) => send('update:error', { message: String(err && err.message || err) }));

  const check = () => autoUpdater.checkForUpdates().catch(() => { /* offline er ikkje ein feil */ });
  check();
  setInterval(check, 6 * 60 * 60 * 1000); // og kvar sjette time
}

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { ok: false, error: 'Oppdatering verkar berre i den installerte appen.' };
  try {
    const res = await autoUpdater.checkForUpdates();
    return { ok: true, version: res?.updateInfo?.version || null };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('data:load', () => readData());
ipcMain.handle('data:save', (_e, data) => writeData(data));
ipcMain.handle('shell:open', (_e, url) => shell.openExternal(url));

ipcMain.handle('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow && mainWindow.close());

ipcMain.handle('shared:sync', async () => {
  const data = readData();
  const url = (data.settings.sharedUrl || '').trim();
  if (!url) return { ok: false, error: 'Inga delt sideliste er satt opp.' };
  try {
    const shared = await fetchShared(url);
    data.shared = shared;
    data.settings.lastSync = new Date().toISOString();
    writeData(data);
    return { ok: true, shared, lastSync: data.settings.lastSync, count: shared.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('image:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Vel bilde',
    properties: ['openFile'],
    filters: [{ name: 'Bilde', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'] }]
  });
  if (canceled || !filePaths.length) return null;
  const file = filePaths[0];
  const stat = fs.statSync(file);
  if (stat.size > 8 * 1024 * 1024) return { error: 'Bildet er for stort (maks 8 MB).' };
  const mime = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp'
  }[path.extname(file).toLowerCase()] || 'image/png';
  return { dataUrl: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` };
});

ipcMain.handle('data:export', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Eksporter sider',
    defaultPath: 'hauge-maskin-sider.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, JSON.stringify(readData(), null, 2), 'utf8');
  return true;
});

ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer sider',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (!Array.isArray(data.pages)) return null;
    writeData(data);
    return data;
  } catch {
    return null;
  }
});
