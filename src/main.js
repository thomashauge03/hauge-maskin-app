const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, webContents, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  await lastHemmelegheiter();
  createWindow();
  setupAutoUpdate();
  fangNedlastingar();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- Kryptert lagring av token og passord ---------- */
// Vi brukar Windows sin eigen DPAPI direkte, knytt til brukarkontoen. Då
// overlever hemmelegheitene oppdateringar, ominstallasjonar og nye versjonar
// av appen. (Electron sin safeStorage brukar ein nøkkel som ligg i
// «Local State» inne i appmappa, og den kan gå tapt.)
const PS_PROTECT = `Add-Type -AssemblyName System.Security
$inn = [Console]::In.ReadToEnd()
$b = [Text.Encoding]::UTF8.GetBytes($inn)
[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b, $null, 'CurrentUser'))`;

const PS_UNPROTECT = `Add-Type -AssemblyName System.Security
$inn = [Console]::In.ReadToEnd().Trim()
$b = [Convert]::FromBase64String($inn)
[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b, $null, 'CurrentUser'))`;

function kjørPowerShell(skript, inndata) {
  return new Promise((ok, feil) => {
    const p = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', skript],
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, ut, errUt) => (err ? feil(new Error(errUt || err.message)) : ok(ut.trim()))
    );
    p.stdin.end(inndata, 'utf8');
  });
}

async function krypter(tekst) {
  try {
    return { mode: 'dpapi', data: await kjørPowerShell(PS_PROTECT, tekst) };
  } catch {
    // Reserveløysing dersom PowerShell ikkje er tilgjengeleg
    if (safeStorage.isEncryptionAvailable()) {
      return { mode: 'safe', data: safeStorage.encryptString(tekst).toString('base64') };
    }
    throw new Error('Fann ingen måte å kryptere på.');
  }
}

async function dekrypter(pakke) {
  if (pakke.mode === 'dpapi') return kjørPowerShell(PS_UNPROTECT, pakke.data);
  return safeStorage.decryptString(Buffer.from(pakke.data, 'base64'));
}

async function lagreHemmeleg(fil, tekst) {
  try {
    fs.writeFileSync(fil, JSON.stringify(await krypter(tekst)), 'utf8');
  } catch (err) {
    console.error('Klarte ikkje lagre', path.basename(fil), err.message);
  }
}

async function lesHemmeleg(fil) {
  if (!fs.existsSync(fil)) return null;
  try {
    return await dekrypter(JSON.parse(fs.readFileSync(fil, 'utf8')));
  } catch {
    // Ei fil vi ikkje får opna er verdilaus – vi fjernar ho så brukaren får
    // beskjed om å legge inn på nytt i staden for å møte ein taus feil
    fs.rmSync(fil, { force: true });
    return null;
  }
}

async function lastHemmelegheiter() {
  adminToken = await lesHemmeleg(tokenFile());
  const tekst = await lesHemmeleg(loginFile());
  try { loginStore = tekst ? JSON.parse(tekst) : {}; } catch { loginStore = {}; }

  // Rydd vekk det gamle formatet, som var avhengig av Chromium sin nøkkel
  for (const gammal of ['admin.bin', 'logins.bin']) {
    fs.rmSync(path.join(app.getPath('userData'), gammal), { force: true });
  }
}

/* ---------- Vedlegg: filer lasta ned frå sidene ---------- */
// Filer som blir lasta ned inne i appen hamnar ikkje i nedlastingsmappa, men i
// ei eiga mappe som høyrer til appen. Derifrå kan dei dragast rett inn i ei
// anna side, og blir sletta med det same dei er brukte.
const attachDir = () => {
  const dir = path.join(app.getPath('userData'), 'vedlegg');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

let vedlegg = []; // { path, name, size, time }

function sendVedlegg() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('attach:changed', vedlegg);
  }
}

function ryddVedlegg() {
  // Filer som er borte frå disken skal ikkje henge att i lista
  vedlegg = vedlegg.filter((v) => fs.existsSync(v.path));
}

function fangNedlastingar() {
  const ses = session.fromPartition('persist:hm');
  ses.on('will-download', (_e, item) => {
    const namn = item.getFilename();
    const mål = path.join(attachDir(), `${Date.now()}-${namn}`);
    item.setSavePath(mål);
    item.once('done', (_ev, state) => {
      if (state !== 'completed') return;
      vedlegg.unshift({ path: mål, name: namn, size: item.getTotalBytes(), time: Date.now() });
      // Vi held på dei ti siste; eldre blir sletta så mappa ikkje veks
      for (const gammal of vedlegg.slice(10)) {
        try { fs.rmSync(gammal.path, { force: true }); } catch { /* alt sletta */ }
      }
      vedlegg = vedlegg.slice(0, 10);
      sendVedlegg();
    });
  });
}

ipcMain.handle('attach:list', () => { ryddVedlegg(); return vedlegg; });

// Dradraget må startast frå hovudprosessen medan hendinga går, difor send/on
ipcMain.on('attach:drag', (e, filPath) => {
  if (!vedlegg.some((v) => v.path === filPath) || !fs.existsSync(filPath)) return;
  e.sender.startDrag({
    file: filPath,
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });
});

ipcMain.handle('attach:delete', (_e, filPath) => {
  try { fs.rmSync(filPath, { force: true }); } catch { /* alt borte */ }
  vedlegg = vedlegg.filter((v) => v.path !== filPath);
  sendVedlegg();
  return true;
});

ipcMain.handle('attach:reveal', (_e, filPath) => {
  if (fs.existsSync(filPath)) shell.showItemInFolder(filPath);
  return true;
});

/* ---------- Lagra innlogging ---------- */
// Brukarnamn og passord blir krypterte med Windows sin eigen nøkkelkvelv og
// ligg berre på maskina til den enkelte. Dei blir aldri sende til GitHub, blir
// ikkje med i eksport, og blir aldri sende til grensesnittet – berre
// hovudprosessen les dei, og berre for å fylle inn i rett innloggingsside.
const loginFile = () => path.join(app.getPath('userData'), 'logins.dat');

let loginStore = {};
const readLogins = () => loginStore;

async function writeLogins(alle) {
  loginStore = alle;
  await lagreHemmeleg(loginFile(), JSON.stringify(alle));
}

const originOf = (url) => { try { return new URL(url).origin; } catch { return null; } };

// Ei felles innlogging gjeld alle sidene i appen. Ho er ikkje bunden til éin
// nettstad, men blir berre brukt på sider som faktisk står i sidelista –
// aldri på ei tilfeldig side brukaren har navigert seg fram til.
const FELLES = '__felles__';

function tillatteOrigin() {
  const data = readData();
  const alle = [...(data.shared || []), ...(data.pages || [])];
  const sett = new Set();
  for (const p of alle) {
    const o = originOf(p.url);
    if (o) sett.add(o);
  }
  // Lokale overstyringar kan peike ein annan stad
  for (const o of Object.values(data.overrides || {})) {
    const org = o && o.url ? originOf(o.url) : null;
    if (org) sett.add(org);
  }
  return sett;
}

ipcMain.handle('login:list', () => {
  const alle = readLogins();
  // Berre kva sider som har innlogging, og brukarnamnet – aldri passordet
  const ut = {};
  for (const [id, v] of Object.entries(alle)) ut[id] = { user: v.user || '', origin: v.origin || '' };
  return ut;
});

ipcMain.handle('login:setShared', async (_e, { user, pass }) => {
  const alle = readLogins();
  if (!user && !pass) { delete alle[FELLES]; await writeLogins(alle); return { ok: true, removed: true }; }
  const gammal = alle[FELLES] || {};
  alle[FELLES] = { user: user || gammal.user || '', pass: pass || gammal.pass || '' };
  await writeLogins(alle);
  return { ok: true };
});

ipcMain.handle('login:set', async (_e, { id, url, user, pass }) => {
  const origin = originOf(url);
  if (!id || !origin) return { ok: false, error: 'Manglar side eller adresse.' };
  const alle = readLogins();
  if (!user && !pass) { delete alle[id]; await writeLogins(alle); return { ok: true, removed: true }; }
  // Passord som ikkje blir endra, skal ikkje overskrivast med tomt
  const gammal = alle[id] || {};
  alle[id] = { origin, user: user || gammal.user || '', pass: pass || gammal.pass || '' };
  await writeLogins(alle);
  return { ok: true };
});

ipcMain.handle('login:clear', async (_e, id) => {
  const alle = readLogins();
  delete alle[id];
  await writeLogins(alle);
  return { ok: true };
});

// Fyller inn brukarnamn og passord i sida. Vi sender aldri passordet til
// grensesnittet – det går rett frå hovudprosessen inn i innloggingsskjemaet.
// Vi trykkjer heller ikkje «logg inn» automatisk; det gjer brukaren sjølv.
const FYLL_SKRIPT = `(function (bruker, passord) {
  function settVerdi(el, verdi) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, verdi);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function synleg(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.disabled && !el.readOnly;
  }
  // Sørgje for at vi aldri skriv i eit søkefelt
  const SØK = /(search|søk|sok|query|filter|finn)/i;
  function erSøkefelt(el) {
    if (el.type === 'search') return true;
    const tekst = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
                   el.getAttribute('autocomplete')].filter(Boolean).join(' ');
    return SØK.test(tekst);
  }

  // Utan eit passordfelt er dette ikkje ei innloggingsside, og vi rører ingenting
  const passordFelt = [...document.querySelectorAll('input[type="password"]')].filter(synleg);
  if (!passordFelt.length) return 0;
  const pf = passordFelt[0];

  // Brukarfeltet er det tekstfeltet som står rett før passordfeltet i skjemaet
  const område = pf.form || document;
  const kandidatar = [...område.querySelectorAll(
    'input[type="email"], input[type="text"], input[type="tel"], input:not([type])'
  )].filter((el) => synleg(el) && !erSøkefelt(el));

  const alle = [...document.querySelectorAll('input')];
  const posPassord = alle.indexOf(pf);
  const før = kandidatar.filter((el) => alle.indexOf(el) < posPassord);
  const bf = før.length ? før[før.length - 1] : null;

  let n = 0;
  if (bruker && bf) { settVerdi(bf, bruker); n++; }
  if (passord) { settVerdi(pf, passord); pf.focus(); n++; }
  return n;
})`;

ipcMain.handle('login:fill', async (_e, { id, webContentsId }) => {
  const alle = readLogins();
  // Innlogging lagra for sjølve sida går føre den felles
  const lagra = alle[id] || alle[FELLES];
  if (!lagra) return { ok: false, error: 'Inga lagra innlogging.' };

  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) return { ok: false, error: 'Fann ikkje sida.' };

  const naa = originOf(wc.getURL());
  if (alle[id]) {
    // Fyll berre inn på den nettstaden innlogginga vart lagra for
    if (naa !== lagra.origin) {
      return { ok: false, error: 'Adressa stemmer ikkje med den lagra innlogginga.' };
    }
  } else if (!naa || !tillatteOrigin().has(naa)) {
    // Den felles innlogginga gjeld berre sidene som står i lista
    return { ok: false, error: 'Denne adressa er ikkje ei av sidene i appen.' };
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
const tokenFile = () => path.join(app.getPath('userData'), 'admin.dat');

let adminToken = null;
const readToken = () => adminToken;

async function writeToken(token) {
  adminToken = token || null;
  if (!token) { fs.rmSync(tokenFile(), { force: true }); return true; }
  await lagreHemmeleg(tokenFile(), token);
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
    // Berre eit avvist token betyr at vi ikkje lenger er admin. Er tenaren nede
    // eller nettet borte, held vi på admin-statusen i staden for å «gløyme» han.
    if (res.status === 401) return { admin: false, error: 'Tokenet er ikkje lenger gyldig. Lag eit nytt.' };
    if (!res.ok) return { admin: true, offline: true, error: `Fekk ikkje kontakt med GitHub (${res.status}).` };
    const user = await res.json();
    return { admin: true, login: user.login };
  } catch {
    return { admin: true, offline: true, error: 'Får ikkje kontakt med GitHub akkurat no.' };
  }
});

ipcMain.handle('admin:setToken', async (_e, token) => {
  const clean = (token || '').trim();
  if (!clean) { await writeToken(null); return { ok: true, admin: false }; }
  try {
    const res = await gh(clean, 'https://api.github.com/user');
    if (!res.ok) return { ok: false, error: `Tokenet blir ikkje godteke (${res.status}).` };
    const user = await res.json();
    await writeToken(clean);
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
