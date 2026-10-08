const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, webContents, session, nativeImage, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { lesDelt, flettUkjente } = require('./delt');
const { hvaErNytt } = require('./nytt');
const { UTSKRIFT_SIGNAL, UTSKRIFT_SKRIPT } = require('./utskrift');
const ENDRINGER = require('./endringer.json');
const Lenke = require('./innboks-felles');
const Innboks = require('./innboks');

let mainWindow = null;

const storeFile = () => path.join(app.getPath('userData'), 'pages.json');

// Hva er nytt: versjonen brukeren sist fikk se loggen for (se nytt.js).
const sistSettFil = () => path.join(app.getPath('userData'), 'sist-sett.json');
// Settes før noe rekker å skrive pages.json, så en ny installasjon ikke blir
// forvekslet med en oppdatering.
let hadDataVedOppstart = false;

// Den felles sidelisten. Rediger sider.json i GitHub-repoet, så får alle
// installasjonene de nye sidene automatisk ved neste synk.
const SHARED_URL = 'https://raw.githubusercontent.com/thomashauge03/hauge-maskin-app/main/sider.json';

const DEFAULT_DATA = {
  // Ingen sider fra oss. Alt kommer fra den felles listen, og brukeren legger
  // eventuelt til sine egne.
  pages: [],
  shared: [],
  // Egne sider som er slettet, men kan hentes tilbake
  deleted: [],
  // Lokale endringer på felles sider: { "shared:id": { name, url, group, color, image, hidden } }
  overrides: {},
  settings: { activeId: null, sharedUrl: SHARED_URL, syncMinutes: 15, lastSync: null }
};

// En fil som ikke lar seg lese, må aldri føre til at oppsettet stille blir
// byttet ut med standardlisten – da kommer sider brukeren har fjernet tilbake,
// og sider brukeren har lagt til, forsvinner.
function readData() {
  const fil = storeFile();
  if (!fs.existsSync(fil)) return JSON.parse(JSON.stringify(DEFAULT_DATA));

  for (const kilde of [fil, fil + '.bak']) {
    const d = lesFil(kilde);
    if (d) return d;
  }

  // Begge er uleselige. Vi tar vare på filen i stedet for å skrive over den.
  const berget = `${fil}.ødelagt-${Date.now()}`;
  try { fs.copyFileSync(fil, berget); } catch { /* ingenting å berge */ }
  console.error('pages.json kunne ikke leses. Kopi lagret som', path.basename(berget));
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function lesFil(fil) {
  try {
    const raw = fs.readFileSync(fil, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.pages)) throw new Error('ugyldig format');
    data.shared = Array.isArray(data.shared) ? data.shared : [];
    data.overrides = (data.overrides && typeof data.overrides === 'object') ? data.overrides : {};
    data.deleted = Array.isArray(data.deleted) ? data.deleted : [];
    data.settings = Object.assign({}, DEFAULT_DATA.settings, data.settings || {});
    // Tomt felt = bruk den felles listen (gjelder også oppgraderinger fra eldre versjoner)
    if (!data.settings.sharedUrl) data.settings.sharedUrl = SHARED_URL;
    return data;
  } catch {
    return null; // den som kaller, prøver reservekopien
  }
}

// Henter den delte sidelisten. Alle som bruker appen, peker på samme adresse,
// så nye sider dukker opp hos alle uten at noen må gjøre noe.
async function fetchShared(url) {
  // raw.githubusercontent.com mellomlagres i noen minutter. Har vi et token,
  // leser vi heller direkte fra GitHub-API-et, som alltid gir den nyeste versjonen.
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

  if (!res.ok) throw new Error(`Fikk ${res.status} fra serveren`);
  const json = await res.json();
  const list = Array.isArray(json) ? json : json.pages;
  if (!Array.isArray(list)) throw new Error('Listen mangler feltet "pages"');
  // Se delt.js: felt vi ikke kjenner, blir tatt vare på, ikke kastet
  return lesDelt(list);
}

// Vi skriver til en midlertidig fil og bytter den inn til slutt. Da kan ikke en
// avbrutt skriving etterlate seg en halv fil. Den forrige gode versjonen blir
// liggende som reservekopi.
function writeData(data) {
  const fil = storeFile();
  const tmp = fil + '.tmp';
  const bak = fil + '.bak';
  const tekst = JSON.stringify(data, null, 2);

  fs.writeFileSync(tmp, tekst, 'utf8');
  try { if (fs.existsSync(fil)) fs.copyFileSync(fil, bak); } catch { /* ingen kopi ennå */ }
  fs.renameSync(tmp, fil);
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
  // Oppgavelinja blinker når noe haster (se vakta under Innboks), til vinduet får fokus.
  mainWindow.on('focus', () => mainWindow.flashFrame(false));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Lenker som åpner nytt vindu, blir værende inne i appen. Sender vi dem ut til
// systemnettleseren, havner PDF-er og andre filer utenfor appen, og
// innloggingsvinduer (Google, GitHub) slutter å virke.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // e-post og telefon hører hjemme i programmene som håndterer dem
    if (/^(mailto|tel|sms):/i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    // Mange systemer lager dokumentet i siden selv og åpner det som blob: eller
    // data:. Det er alltid en ferdig fil, så vi tar den rett inn i dra-menyen
    // i stedet for å åpne et vindu som bare viser den.
    if (/^(blob|data):/i.test(url)) {
      contents.downloadURL(url);
      return { action: 'deny' };
    }
    // window.open("") brukes av systemer som bygger dokumentet i et tomt
    // vindu og skriver det ut. Nekter vi det, skjer det ingenting i det hele tatt.
    const tomt = !url || url === 'about:blank';
    if (!tomt && !/^(https?|file):/i.test(url)) return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1100,
        height: 820,
        backgroundColor: '#0d0d0f',
        autoHideMenuBar: true,
        icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          plugins: true // så PDF-er vises i stedet for bare å lastes ned
        }
      }
    };
  });

  // Et vindu som bare ble åpnet for å laste ned en fil, har ingenting
  // å vise. Det lukker vi selv.
  contents.on('did-create-window', (vindu) => {
    fangUtskrift(vindu);
  });

  // Herding. Ingen fane får andre forhåndslastere enn Innboks-broen, og ingen får Node eller
  // slipper ut av sandkassen, uansett hva som står på webview-taggen. Broen legges bare på en
  // fane som starter på Innboksens opphav; hovedprosessen sjekker opphavet igjen ved hvert kall.
  contents.on('will-attach-webview', (_ev, webPreferences, params) => {
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    if (Lenke.broSkalMed(params.src, Lenke.innboksOpphav(readData()))) {
      webPreferences.preload = path.join(__dirname, 'innboks-bro.js');
    }
  });
});

// Windows knytter varslene til snarveien i Start-menyen gjennom denne id-en. Den må være lik
// build.appId i package.json, ellers forsvinner varslene fra den installerte appen uten en lyd.
app.setAppUserModelId('no.haugemaskin.app');

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
  hadDataVedOppstart = fs.existsSync(storeFile());
  await lastHemmeligheter();
  createWindow();
  if (innboksKobling) vakt.start();
  setupAutoUpdate();
  fangNedlastinger();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- Kryptert lagring av token og passord ---------- */
// Vi bruker Windows' egen DPAPI direkte, knyttet til brukerkontoen. Da
// overlever hemmelighetene oppdateringer, ominstallasjoner og nye versjoner
// av appen. (Electrons safeStorage bruker en nøkkel som ligger i
// «Local State» inne i appmappen, og den kan gå tapt.)
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
    // Reserveløsning hvis PowerShell ikke er tilgjengelig
    if (safeStorage.isEncryptionAvailable()) {
      return { mode: 'safe', data: safeStorage.encryptString(tekst).toString('base64') };
    }
    throw new Error('Fant ingen måte å kryptere på.');
  }
}

async function dekrypter(pakke) {
  if (pakke.mode === 'dpapi') return kjørPowerShell(PS_UNPROTECT, pakke.data);
  return safeStorage.decryptString(Buffer.from(pakke.data, 'base64'));
}

async function lagreHemmelig(fil, tekst) {
  try {
    fs.writeFileSync(fil, JSON.stringify(await krypter(tekst)), 'utf8');
  } catch (err) {
    console.error('Klarte ikke å lagre', path.basename(fil), err.message);
  }
}

async function lesHemmelig(fil) {
  if (!fs.existsSync(fil)) return null;
  try {
    return await dekrypter(JSON.parse(fs.readFileSync(fil, 'utf8')));
  } catch {
    // En fil vi ikke får åpnet, er verdiløs – vi fjerner den så brukeren får
    // beskjed om å legge inn på nytt i stedet for å møte en taus feil
    fs.rmSync(fil, { force: true });
    return null;
  }
}

async function lastHemmeligheter() {
  adminToken = await lesHemmelig(tokenFile());
  const tekst = await lesHemmelig(loginFile());
  try { loginStore = tekst ? JSON.parse(tekst) : {}; } catch { loginStore = {}; }

  // Rydd bort det gamle formatet, som var avhengig av Chromiums nøkkel
  for (const gammel of ['admin.bin', 'logins.bin']) {
    fs.rmSync(path.join(app.getPath('userData'), gammel), { force: true });
  }

  innboksKobling = await lastInnboksKobling();
  innboksTilstand = { ...innboksTilstand, koblet: !!innboksKobling };
}

/* ---------- Vedlegg: filer lastet ned fra sidene ---------- */
// Filer som lastes ned inne i appen, havner ikke i nedlastingsmappen, men i
// en egen mappe som hører til appen. Derfra kan de dras rett inn i en
// annen side, og blir slettet med det samme de er brukt.
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
  // Filer som er borte fra disken, skal ikke henge igjen i listen
  vedlegg = vedlegg.filter((v) => fs.existsSync(v.path));
}

function fangNedlastinger() {
  // Sideøkten, og standardøkten for vinduer som åpnes fra en side
  for (const ses of [session.fromPartition('persist:hm'), session.defaultSession]) {
    lyttPaaNedlasting(ses);
  }
}

function lyttPaaNedlasting(ses) {
  ses.on('will-download', (_e, item) => {
    const navn = item.getFilename();
    const mål = path.join(attachDir(), `${Date.now()}-${navn}`);
    item.setSavePath(mål);
    item.once('done', (_ev, state) => {
      if (state !== 'completed') return;
      leggTilVedlegg(mål, navn, item.getTotalBytes());
    });
  });
}

function leggTilVedlegg(filPath, navn, størrelse) {
  vedlegg.unshift({ path: filPath, name: navn, size: størrelse, time: Date.now() });
  // Vi beholder de ti siste; eldre blir slettet så mappen ikke vokser
  for (const gammel of vedlegg.slice(10)) {
    try { fs.rmSync(gammel.path, { force: true }); } catch { /* allerede slettet */ }
  }
  vedlegg = vedlegg.slice(0, 10);
  sendVedlegg();
}

// Flere systemer lager dokumentet ved å skrive HTML i et tomt vindu og
// kalle window.print(). Det er ikke en nedlasting, så filen ville aldri nå
// dra-menyen. Vi tar over utskriften og lager PDF-en selv i stedet (se
// utskrift.js).
function fangUtskrift(vindu) {
  const wc = vindu.webContents;
  let alt_gjort = false;

  const injiser = () => {
    wc.executeJavaScript(UTSKRIFT_SKRIPT, true).catch(() => { /* siden er ikke klar */ });
  };
  injiser();
  wc.on('dom-ready', injiser);
  wc.on('did-finish-load', injiser);

  const påUtskrift = async () => {
    if (alt_gjort || wc.isDestroyed()) return;
    alt_gjort = true;
    try {
      const pdf = await wc.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'none' }
      });
      const rent = (wc.getTitle() || 'dokument')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'dokument';
      const navn = rent.toLowerCase().endsWith('.pdf') ? rent : rent + '.pdf';
      const mål = path.join(attachDir(), `${Date.now()}-${navn}`);
      fs.writeFileSync(mål, pdf);
      leggTilVedlegg(mål, navn, pdf.length);
    } catch (err) {
      console.error('Klarte ikke å lage PDF av utskriften:', err.message);
    }
    if (!vindu.isDestroyed()) vindu.close();
  };

  // Signaturen på console-message er ulik mellom Electron-versjoner
  wc.on('console-message', (...args) => {
    const melding = typeof args[0] === 'object' && args[0] !== null && 'message' in args[0]
      ? args[0].message
      : args[1];
    if (String(melding).includes(UTSKRIFT_SIGNAL)) påUtskrift();
  });

  // Et tomt vindu som aldri fikk innhold, har ingenting å vise
  setTimeout(() => {
    if (alt_gjort || vindu.isDestroyed()) return;
    const url = wc.getURL();
    if (!url || url === 'about:blank') {
      wc.executeJavaScript('document.body && document.body.innerHTML.length', true)
        .then((n) => { if (!n && !vindu.isDestroyed()) vindu.close(); })
        .catch(() => { if (!vindu.isDestroyed()) vindu.close(); });
    }
  }, 4000);
}

ipcMain.handle('attach:list', () => { ryddVedlegg(); return vedlegg; });

// Dradraget må startes fra hovedprosessen mens hendelsen pågår, derfor send/on
ipcMain.on('attach:drag', (e, filPath) => {
  if (!vedlegg.some((v) => v.path === filPath) || !fs.existsSync(filPath)) return;
  e.sender.startDrag({
    file: filPath,
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });
});

ipcMain.handle('attach:delete', (_e, filPath) => {
  try { fs.rmSync(filPath, { force: true }); } catch { /* allerede borte */ }
  vedlegg = vedlegg.filter((v) => v.path !== filPath);
  sendVedlegg();
  return true;
});

ipcMain.handle('attach:open', async (_e, filPath) => {
  if (!fs.existsSync(filPath)) return false;
  await shell.openPath(filPath);
  return true;
});

ipcMain.handle('attach:reveal', (_e, filPath) => {
  if (fs.existsSync(filPath)) shell.showItemInFolder(filPath);
  return true;
});

/* ---------- Lagret innlogging ---------- */
// Brukernavn og passord krypteres med Windows' eget nøkkelhvelv og
// ligger bare på maskinen til den enkelte. De sendes aldri til GitHub, blir
// ikke med i eksport, og sendes aldri til grensesnittet – bare
// hovedprosessen leser dem, og bare for å fylle inn i riktig innloggingsside.
const loginFile = () => path.join(app.getPath('userData'), 'logins.dat');

let loginStore = {};
const readLogins = () => loginStore;

async function writeLogins(alle) {
  loginStore = alle;
  await lagreHemmelig(loginFile(), JSON.stringify(alle));
}

const originOf = (url) => { try { return new URL(url).origin; } catch { return null; } };

// En felles innlogging gjelder alle sidene i appen. Den er ikke bundet til ett
// nettsted, men brukes bare på sider som faktisk står i sidelisten –
// aldri på en tilfeldig side brukeren har navigert seg frem til.
const FELLES = '__felles__';

function tillatteOrigin() {
  const data = readData();
  const alle = [...(data.shared || []), ...(data.pages || [])];
  const sett = new Set();
  for (const p of alle) {
    const o = originOf(p.url);
    if (o) sett.add(o);
  }
  // Lokale overstyringer kan peke et annet sted
  for (const o of Object.values(data.overrides || {})) {
    const org = o && o.url ? originOf(o.url) : null;
    if (org) sett.add(org);
  }
  return sett;
}

ipcMain.handle('login:list', () => {
  const alle = readLogins();
  // Bare hvilke sider som har innlogging, og brukernavnet – aldri passordet
  const ut = {};
  for (const [id, v] of Object.entries(alle)) ut[id] = { user: v.user || '', origin: v.origin || '' };
  return ut;
});

ipcMain.handle('login:setShared', async (_e, { user, pass }) => {
  const alle = readLogins();
  if (!user && !pass) { delete alle[FELLES]; await writeLogins(alle); return { ok: true, removed: true }; }
  const gammel = alle[FELLES] || {};
  alle[FELLES] = { user: user || gammel.user || '', pass: pass || gammel.pass || '' };
  await writeLogins(alle);
  return { ok: true };
});

ipcMain.handle('login:set', async (_e, { id, url, user, pass }) => {
  const origin = originOf(url);
  if (!id || !origin) return { ok: false, error: 'Mangler side eller adresse.' };
  const alle = readLogins();
  if (!user && !pass) { delete alle[id]; await writeLogins(alle); return { ok: true, removed: true }; }
  // Passord som ikke endres, skal ikke overskrives med tomt
  const gammel = alle[id] || {};
  alle[id] = { origin, user: user || gammel.user || '', pass: pass || gammel.pass || '' };
  await writeLogins(alle);
  return { ok: true };
});

ipcMain.handle('login:clear', async (_e, id) => {
  const alle = readLogins();
  delete alle[id];
  await writeLogins(alle);
  return { ok: true };
});

// Fyller inn brukernavn og passord i siden. Vi sender aldri passordet til
// grensesnittet – det går rett fra hovedprosessen inn i innloggingsskjemaet.
// Vi trykker heller ikke «logg inn» automatisk; det gjør brukeren selv.
const FYLL_SKRIPT = `(function (bruker, passord) {
  function settVerdi(el, verdi) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, verdi);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function synlig(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.disabled && !el.readOnly;
  }
  // Sørg for at vi aldri skriver i et søkefelt
  const SØK = /(search|søk|sok|query|filter|finn)/i;
  function erSøkefelt(el) {
    if (el.type === 'search') return true;
    const tekst = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
                   el.getAttribute('autocomplete')].filter(Boolean).join(' ');
    return SØK.test(tekst);
  }

  // Uten et passordfelt er dette ikke en innloggingsside, og vi rører ingenting
  const passordFelt = [...document.querySelectorAll('input[type="password"]')].filter(synlig);
  if (!passordFelt.length) return 0;
  const pf = passordFelt[0];

  // Brukerfeltet er det tekstfeltet som står rett før passordfeltet i skjemaet
  const område = pf.form || document;
  const kandidater = [...område.querySelectorAll(
    'input[type="email"], input[type="text"], input[type="tel"], input:not([type])'
  )].filter((el) => synlig(el) && !erSøkefelt(el));

  const alle = [...document.querySelectorAll('input')];
  const posPassord = alle.indexOf(pf);
  const før = kandidater.filter((el) => alle.indexOf(el) < posPassord);
  const bf = før.length ? før[før.length - 1] : null;

  let n = 0;
  if (bruker && bf) { settVerdi(bf, bruker); n++; }
  if (passord) { settVerdi(pf, passord); pf.focus(); n++; }
  return n;
})`;

ipcMain.handle('login:fill', async (_e, { id, webContentsId }) => {
  const alle = readLogins();
  // Innlogging lagret for selve siden går foran den felles
  const lagret = alle[id] || alle[FELLES];
  if (!lagret) return { ok: false, error: 'Ingen lagret innlogging.' };

  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) return { ok: false, error: 'Fant ikke siden.' };

  const naa = originOf(wc.getURL());
  if (alle[id]) {
    // Fyll bare inn på det nettstedet innloggingen ble lagret for
    if (naa !== lagret.origin) {
      return { ok: false, error: 'Adressen stemmer ikke med den lagrede innloggingen.' };
    }
  } else if (!naa || !tillatteOrigin().has(naa)) {
    // Den felles innloggingen gjelder bare sidene som står i listen
    return { ok: false, error: 'Denne adressen er ikke en av sidene i appen.' };
  }

  try {
    const kall = `${FYLL_SKRIPT}(${JSON.stringify(lagret.user || '')}, ${JSON.stringify(lagret.pass || '')})`;
    const felt = await wc.executeJavaScript(kall, true);
    return { ok: true, felt };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

/* ---------- Admin: skrive til den felles listen ---------- */
// Tokenet krypteres med Windows' eget nøkkelhvelv (DPAPI) og ligger bare
// på denne maskinen. Det følger aldri med i eksport eller synkronisering.
const tokenFile = () => path.join(app.getPath('userData'), 'admin.dat');

let adminToken = null;
const readToken = () => adminToken;

async function writeToken(token) {
  adminToken = token || null;
  if (!token) { fs.rmSync(tokenFile(), { force: true }); return true; }
  await lagreHemmelig(tokenFile(), token);
  return true;
}

// Plukker eier, repo, gren og filnavn ut av raw-adressen til den delte listen
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
    // Bare et avvist token betyr at vi ikke lenger er admin. Er serveren nede
    // eller nettet borte, beholder vi admin-statusen i stedet for å «glemme» den.
    if (res.status === 401) return { admin: false, error: 'Tokenet er ikke lenger gyldig. Lag et nytt.' };
    if (!res.ok) return { admin: true, offline: true, error: `Fikk ikke kontakt med GitHub (${res.status}).` };
    const user = await res.json();
    return { admin: true, login: user.login };
  } catch {
    return { admin: true, offline: true, error: 'Får ikke kontakt med GitHub akkurat nå.' };
  }
});

ipcMain.handle('admin:setToken', async (_e, token) => {
  const clean = (token || '').trim();
  if (!clean) { await writeToken(null); return { ok: true, admin: false }; }
  try {
    const res = await gh(clean, 'https://api.github.com/user');
    if (!res.ok) return { ok: false, error: `Tokenet blir ikke godtatt (${res.status}).` };
    const user = await res.json();
    await writeToken(clean);
    return { ok: true, admin: true, login: user.login };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// Skriver hele den felles listen tilbake til GitHub
ipcMain.handle('shared:publish', async (_e, { pages, message }) => {
  const token = readToken();
  if (!token) return { ok: false, error: 'Du er ikke admin på denne maskinen.' };

  const data = readData();
  const loc = parseSharedUrl(data.settings.sharedUrl);
  if (!loc) return { ok: false, error: 'Den delte listen ligger ikke på GitHub, så den kan ikke endres herfra.' };

  const api = `https://api.github.com/repos/${loc.owner}/${loc.repo}/contents/${loc.filePath}`;
  try {
    // Henter sha-en til den versjonen som ligger der nå
    const cur = await gh(token, `${api}?ref=${loc.branch}`);
    if (!cur.ok) return { ok: false, error: `Fant ikke filen på GitHub (${cur.status}).` };
    const fil = await cur.json();
    const sha = fil.sha;

    // Felt appen ikke kjenner (f.eks. nokkel fra adminbordet), blir tatt fra
    // filen slik den ligger nå, ikke fra den mellomlagrede listen. Se delt.js.
    // GitHub sender innholdet med når filen er under 1 MB; ellers går vi videre
    // med listen slik den er.
    let ut = pages;
    if (fil.encoding === 'base64' && fil.content) {
      try {
        const nåværende = JSON.parse(Buffer.from(fil.content, 'base64').toString('utf8'));
        ut = flettUkjente(pages, Array.isArray(nåværende) ? nåværende : nåværende.pages);
      } catch { /* uleselig fil – publiser listen slik den er */ }
    }

    const body = {
      _om: 'Felles sideliste for Hauge Maskin-appen. Endringer herfra går ut til alle appene.',
      pages: ut
    };
    const res = await gh(token, api, {
      method: 'PUT',
      body: JSON.stringify({
        message: message || 'Oppdater felles sideliste fra appen',
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
// Appen ser etter nye versjoner på GitHub, laster dem ned i bakgrunnen og
// installerer dem når brukeren starter appen på nytt.
function setupAutoUpdate() {
  if (!app.isPackaged) return; // gir bare mening i en installert app

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };

  autoUpdater.on('update-available', (info) => send('update:available', { version: info.version }));
  autoUpdater.on('download-progress', (p) => send('update:progress', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send('update:ready', { version: info.version }));
  autoUpdater.on('error', (err) => send('update:error', { message: String(err && err.message || err) }));

  const check = () => autoUpdater.checkForUpdates().catch(() => { /* offline er ikke en feil */ });
  check();
  setInterval(check, 6 * 60 * 60 * 1000); // og hver sjette time
}

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { ok: false, error: 'Oppdatering virker bare i den installerte appen.' };
  try {
    const res = await autoUpdater.checkForUpdates();
    return { ok: true, version: res?.updateInfo?.version || null };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('app:version', () => app.getVersion());

// Grensesnittet spør ved oppstart, viser loggen hvis det er noe nytt, og sier
// så fra at denne versjonen er sett.
ipcMain.handle('nytt:status', () => {
  let sistSett = null;
  try { sistSett = JSON.parse(fs.readFileSync(sistSettFil(), 'utf8')).versjon || null; } catch { /* aldri sett */ }
  const gjeldende = app.getVersion();
  return {
    logg: ENDRINGER,
    ...hvaErNytt({ logg: ENDRINGER, gjeldende, sistSett, hadData: hadDataVedOppstart })
  };
});

ipcMain.handle('nytt:sett', () => {
  try {
    fs.writeFileSync(sistSettFil(), JSON.stringify({ versjon: app.getVersion() }), 'utf8');
  } catch { /* da kommer loggen bare opp igjen neste gang */ }
});

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
  if (!url) return { ok: false, error: 'Ingen delt sideliste er satt opp.' };
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
    title: 'Velg bilde',
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

/* ---------- Innboks ---------- */
// Innboks-fanen kobler appen til Innboks over broen (innboks-bro.js). Nøkkelen den får, er det
// eneste appen trenger for å hente varsler, og den krypteres med DPAPI, som innloggingene.
const innboksFil = () => path.join(app.getPath('userData'), 'innboks.dat');
// Den frittstående versjonen har ingen snarvei i Start-menyen, og da kan Windows la være å vise
// varslene. Innstillingene sier fra om det.
const PORTABEL = !!process.env.PORTABLE_EXECUTABLE_FILE;
const AVVIST = { ok: false, feil: 'Bare Innboks kan bruke dette.' };

let innboksKobling = null; // { enhetId, nokkel, url, anonNokkel }, bare i hovedprosessen
let innboksTilstand = { koblet: false, uleste: 0, haster: 0 };

function sendTilVindu(kanal, nyttelast) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(kanal, nyttelast);
}

function settInnboksTilstand(ny) {
  innboksTilstand = { ...innboksTilstand, ...ny };
  sendTilVindu('innboks:tilstand', { ...innboksTilstand, portabel: PORTABEL });
}

async function lastInnboksKobling() {
  const tekst = await lesHemmelig(innboksFil());
  if (!tekst) return null;
  try {
    const k = JSON.parse(tekst);
    const v = Innboks.validerKobling({ id: k.enhetId, nokkel: k.nokkel, url: k.url, anonNokkel: k.anonNokkel });
    return v.ok ? v.kobling : null;
  } catch {
    return null;
  }
}

// Ikke lagreHemmelig: den svelger feilen, og da ville Innboks fått beskjed om at appen er
// koblet, mens nøkkelen var borte ved neste start.
async function lagreInnboksKobling(kobling) {
  const pakke = await krypter(JSON.stringify(kobling));
  const tmp = innboksFil() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pakke), 'utf8');
  fs.renameSync(tmp, innboksFil());
}

async function kobleFraInnboks() {
  vakt.stopp();
  innboksKobling = null;
  fs.rmSync(innboksFil(), { force: true });
  settInnboksTilstand({ koblet: false, uleste: 0, haster: 0 });
}

// Bare toppramma i en webview med Innboksens opphav slipper gjennom. Fanen kan ha navigert bort
// etter at den fikk broen, så opphavet sjekkes ved hvert kall og ikke bare når fanen lages.
function fraInnboks(e) {
  const ramme = e.senderFrame;
  if (!ramme || typeof e.sender.getType !== 'function' || e.sender.getType() !== 'webview') return false;
  return Lenke.broTillatt({ opphav: ramme.origin, toppramme: ramme.parent === null }, Lenke.innboksOpphav(readData()));
}

ipcMain.handle('innboks-bro:status', (e) => {
  if (!fraInnboks(e)) return { koblet: false };
  return { koblet: !!innboksKobling, enhetId: innboksKobling ? innboksKobling.enhetId : null };
});

ipcMain.handle('innboks-bro:koble', async (e, svar) => {
  if (!fraInnboks(e)) return AVVIST;
  const v = Innboks.validerKobling(svar);
  if (!v.ok) return { ok: false, feil: v.feil };
  try {
    await lagreInnboksKobling(v.kobling);
  } catch {
    return { ok: false, feil: 'Kunne ikke lagre nøkkelen kryptert på denne PC-en.' };
  }
  innboksKobling = v.kobling;
  settInnboksTilstand({ koblet: true });
  vakt.stopp();
  vakt.start();
  return { ok: true, enhetId: v.kobling.enhetId };
});

ipcMain.handle('innboks-bro:frakoble', async (e) => {
  if (!fraInnboks(e)) return AVVIST;
  const enhetId = innboksKobling ? innboksKobling.enhetId : null;
  await kobleFraInnboks();
  return { ok: true, enhetId };
});

// «Åpne i …» inne i Innboks. Lenken åpnes bare i en side som står i menyen; ellers svarer vi
// nei, og Innboks åpner den som før.
ipcMain.handle('innboks-bro:aapne', (e, lenke) => {
  if (!fraInnboks(e)) return AVVIST;
  const maal = Lenke.maalForLenke(lenke, readData());
  if (!maal) return { ok: false, feil: 'Ingen side i appen passer til lenken.' };
  sendTilVindu('innboks:aapne', maal);
  return { ok: true };
});

// Kanalene under er for hovedvinduet alene. En fane med broen skal ikke kunne sette merket.
const fraHovedvinduet = (e) => !!mainWindow && !mainWindow.isDestroyed() && e.sender === mainWindow.webContents;

ipcMain.handle('innboks:hent-tilstand', (e) => {
  if (!fraHovedvinduet(e)) return null;
  return { ...innboksTilstand, portabel: PORTABEL };
});

// Windows har ikke tall på ikonet i oppgavelinja, bare et lite overleggsbilde. Grensesnittet
// tegner det (det har canvas og skrift), hovedprosessen setter det.
ipcMain.handle('innboks:merke', (e, dataUrl) => {
  if (!fraHovedvinduet(e)) return false;
  if (dataUrl === null) {
    mainWindow.setOverlayIcon(null, '');
    return true;
  }
  if (typeof dataUrl !== 'string' || dataUrl.length > 100000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(dataUrl)) return false;
  const n = innboksTilstand.uleste;
  mainWindow.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), n + (n === 1 ? ' ulest' : ' uleste') + ' i Innboks');
  return true;
});

// Holder varslene i live til de er lukket. Uten en referanse kan Notification-objektet ryddes
// bort, og da skjer det ingenting når noen trykker på det.
const innboksVarsler = new Set();

const vakt = Innboks.lagVakt({
  hent: () => Innboks.kallRpc(fetch, innboksKobling, 'enhet_hent', { p_nokkel: innboksKobling.nokkel }),
  kvitter: (ider) => Innboks.kallRpc(fetch, innboksKobling, 'enhet_kvitter', { p_nokkel: innboksKobling.nokkel, p_ider: ider }),
  vis: visInnboksVarsel,
  tilstand: settInnboksTilstand,
  blink: () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) mainWindow.flashFrame(true);
  },
  // Navet kjenner ikke nøkkelen lenger: enheten er fjernet i Innboks, eller personen er tatt ut.
  frakoblet: () => { kobleFraInnboks().catch(() => { /* filen er alt borte */ }); },
  planlegg: (fn, ms) => setTimeout(fn, ms),
  avbryt: (t) => clearTimeout(t),
});

// Viser vinduet, også når det er skjult i systemstatusfeltet eller lukket helt. etterpaa kjøres
// når grensesnittet kan ta imot meldinger.
function visVindu(etterpaa) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.show();
      if (etterpaa) etterpaa();
    });
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (etterpaa) etterpaa();
}

function visInnboksVarsel(v) {
  if (!Notification.isSupported()) return;
  const varsel = new Notification({
    title: String(v.tittel || 'Innboks').slice(0, 120),
    body: String(v.tekst || '').slice(0, 240),
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    silent: v.stille === true,
    // Det som haster, blir liggende til noen har sett det.
    timeoutType: v.haster ? 'never' : 'default',
  });
  innboksVarsler.add(varsel);
  const glem = () => innboksVarsler.delete(varsel);
  varsel.on('close', glem);
  varsel.on('failed', glem);
  varsel.on('click', () => {
    glem();
    aapneFraVarsel(v);
  });
  varsel.show();
}

// Klikket tar deg dit saken er, og merker den som lest for eieren av enheten. Tallet på knappen
// hentes på nytt med en gang, ikke først om 15 sekunder.
function aapneFraVarsel(v) {
  visVindu(() => sendTilVindu('innboks:aapne', Lenke.maalForVarsel(v, readData())));
  const k = innboksKobling;
  if (!k || typeof v.sak_id !== 'string') return;
  Innboks.kallRpc(fetch, k, 'enhet_les', { p_nokkel: k.nokkel, p_sak: v.sak_id })
    .then(() => vakt.naa())
    .catch(() => { /* saken står som ulest til den åpnes i Innboks */ });
}
