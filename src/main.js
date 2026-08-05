const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, webContents } = require('electron');
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
  // raw.githubusercontent.com blir mellomlagra i nokre minutt. Har vi eit token,
  // les vi heller direkte frå GitHub-API-et, som alltid gir den nyaste versjonen.
  const token = readToken();
  const loc = token ? parseSharedUrl(url) : null;

  let res;
  if (loc) {
    res = await gh(
      token,
      `https://api.github.com/repos/${loc.owner}/${loc.repo}/contents/${loc.filePath}?ref=${loc.branch}`,
      { headers: { Accept: 'application/vnd.github.raw' } }
    );
  } else {
    const fresh = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    res = await fetch(fresh, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  }

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
      help: p.help ? String(p.help) : '',
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

/* ---------- Lagra innlogging ---------- */
// Brukarnamn og passord blir krypterte med Windows sin eigen nøkkelkvelv og
// ligg berre på maskina til den enkelte. Dei blir aldri sende til GitHub, blir
// ikkje med i eksport, og blir aldri sende til grensesnittet – berre
// hovudprosessen les dei, og berre for å fylle inn i rett innloggingsside.
const loginFile = () => path.join(app.getPath('userData'), 'logins.bin');

function readLogins() {
  try {
    const buf = fs.readFileSync(loginFile());
    const tekst = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8');
    return JSON.parse(tekst);
  } catch {
    return {};
  }
}

function writeLogins(alle) {
  const tekst = JSON.stringify(alle);
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(tekst)
    : Buffer.from(tekst, 'utf8');
  fs.writeFileSync(loginFile(), data);
}

const originOf = (url) => { try { return new URL(url).origin; } catch { return null; } };

ipcMain.handle('login:list', () => {
  const alle = readLogins();
  // Berre kva sider som har innlogging, og brukarnamnet – aldri passordet
  const ut = {};
  for (const [id, v] of Object.entries(alle)) ut[id] = { user: v.user || '', origin: v.origin || '' };
  return ut;
});

ipcMain.handle('login:set', (_e, { id, url, user, pass }) => {
  const origin = originOf(url);
  if (!id || !origin) return { ok: false, error: 'Manglar side eller adresse.' };
  const alle = readLogins();
  if (!user && !pass) { delete alle[id]; writeLogins(alle); return { ok: true, removed: true }; }
  // Passord som ikkje blir endra, skal ikkje overskrivast med tomt
  const gammal = alle[id] || {};
  alle[id] = { origin, user: user || gammal.user || '', pass: pass || gammal.pass || '' };
  writeLogins(alle);
  return { ok: true };
});

ipcMain.handle('login:clear', (_e, id) => {
  const alle = readLogins();
  delete alle[id];
  writeLogins(alle);
  return { ok: true };
});

// Fyller inn brukarnamn og passord i sida. Vi sender aldri passordet til
// grensesnittet – det går rett frå hovudprosessen inn i innloggingsskjemaet.
// Vi trykkjer heller ikkje «logg inn» automatisk; det gjer brukaren sjølv.
const FYLL_SKRIPT = `(function (bruker, passord) {
  function settVerdi(el, verdi) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, verdi);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function synleg(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.disabled && !el.readOnly;
  }
  const passordFelt = [...document.querySelectorAll('input[type="password"]')].filter(synleg);
  const brukarFelt = [...document.querySelectorAll(
    'input[type="email"], input[type="text"], input:not([type])'
  )].filter(synleg);

  let n = 0;
  if (bruker && brukarFelt.length) { settVerdi(brukarFelt[0], bruker); n++; }
  if (passord && passordFelt.length) { settVerdi(passordFelt[0], passord); n++; }
  return n;
})`;

ipcMain.handle('login:fill', async (_e, { id, webContentsId }) => {
  const alle = readLogins();
  const lagra = alle[id];
  if (!lagra) return { ok: false, error: 'Inga lagra innlogging.' };

  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) return { ok: false, error: 'Fann ikkje sida.' };

  // Fyll berre inn på den nettstaden innlogginga vart lagra for
  if (originOf(wc.getURL()) !== lagra.origin) {
    return { ok: false, error: 'Adressa stemmer ikkje med den lagra innlogginga.' };
  }

  try {
    const kall = `${FYLL_SKRIPT}(${JSON.stringify(lagra.user || '')}, ${JSON.stringify(lagra.pass || '')})`;
    const felt = await wc.executeJavaScript(kall, true);
    return { ok: true, felt };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

/* ---------- Admin: skrive til den felles lista ---------- */
// Tokenet blir kryptert med Windows sin eigen nøkkelkvelv (DPAPI) og ligg berre
// på denne maskina. Det følgjer aldri med i eksport eller synkronisering.
const tokenFile = () => path.join(app.getPath('userData'), 'admin.bin');

function readToken() {
  try {
    const buf = fs.readFileSync(tokenFile());
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8');
  } catch {
    return null;
  }
}

function writeToken(token) {
  if (!token) { fs.rmSync(tokenFile(), { force: true }); return true; }
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token)
    : Buffer.from(token, 'utf8');
  fs.writeFileSync(tokenFile(), data);
  return true;
}

// Plukkar eigar, repo, gren og filnamn ut av raw-adressa til den delte lista
function parseSharedUrl(url) {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(url || '');
  if (!m) return null;
  return { owner: m[1], repo: m[2], branch: m[3], filePath: m[4] };
}

const gh = (token, url, options = {}) =>
  fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

ipcMain.handle('admin:status', async () => {
  const token = readToken();
  if (!token) return { admin: false };
  try {
    const res = await gh(token, 'https://api.github.com/user');
    if (!res.ok) return { admin: false, error: `Tokenet blir ikkje godteke (${res.status}).` };
    const user = await res.json();
    return { admin: true, login: user.login };
  } catch (err) {
    return { admin: true, offline: true, error: String(err.message || err) };
  }
});

ipcMain.handle('admin:setToken', async (_e, token) => {
  const clean = (token || '').trim();
  if (!clean) { writeToken(null); return { ok: true, admin: false }; }
  try {
    const res = await gh(clean, 'https://api.github.com/user');
    if (!res.ok) return { ok: false, error: `Tokenet blir ikkje godteke (${res.status}).` };
    const user = await res.json();
    writeToken(clean);
    return { ok: true, admin: true, login: user.login };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// Skriv heile den felles lista tilbake til GitHub
ipcMain.handle('shared:publish', async (_e, { pages, message }) => {
  const token = readToken();
  if (!token) return { ok: false, error: 'Du er ikkje admin på denne maskina.' };

  const data = readData();
  const loc = parseSharedUrl(data.settings.sharedUrl);
  if (!loc) return { ok: false, error: 'Den delte lista ligg ikkje på GitHub, så ho kan ikkje endrast herifrå.' };

  const api = `https://api.github.com/repos/${loc.owner}/${loc.repo}/contents/${loc.filePath}`;
  try {
    // Hentar sha-en til den versjonen som ligg der no
    const cur = await gh(token, `${api}?ref=${loc.branch}`);
    if (!cur.ok) return { ok: false, error: `Fann ikkje fila på GitHub (${cur.status}).` };
    const sha = (await cur.json()).sha;

    const body = {
      _om: 'Felles sideliste for Hauge Maskin-appen. Endringar herifrå går ut til alle appane.',
      pages
    };
    const res = await gh(token, api, {
      method: 'PUT',
      body: JSON.stringify({
        message: message || 'Oppdater felles sideliste frå appen',
        content: Buffer.from(JSON.stringify(body, null, 2) + '\n', 'utf8').toString('base64'),
        sha,
        branch: loc.branch
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.message || `GitHub svarte ${res.status}.` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
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
