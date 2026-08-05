const COLORS = ['#e2001a', '#ff8a00', '#ffd400', '#22c55e', '#00b9f1', '#4285f4', '#a855f7', '#8a8a97'];

let data = { pages: [], shared: [], settings: {} };
let activeId = null;
let editingId = null;
let pickedColor = COLORS[0];
let pickedImage = '';
let syncTimer = null;
let isAdmin = false;

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const nav = $('nav');

/* ---------- Hjelparar ---------- */
function normalizeUrl(raw) {
  const url = (raw || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^file:\/\//i.test(url)) return url;
  return 'https://' + url.replace(/^\/+/, '');
}

const uid = () => 'p' + Math.random().toString(36).slice(2, 9);

const isShared = (id) => String(id).startsWith('shared:');

// Felles sider kan endrast lokalt. Endringane blir lagra som ei overstyring
// på denne maskina, medan grunnlaget framleis kjem frå den delte lista.
function applyOverride(p) {
  const o = (data.overrides || {})[p.id];
  return o ? { ...p, ...o, shared: true, edited: true } : p;
}

// Delte sider først, deretter dine eigne
const allPages = () =>
  [...(data.shared || []).map(applyOverride).filter((p) => !p.hidden), ...data.pages];

const findPage = (id) => allPages().find((p) => p.id === id);
const hiddenShared = () =>
  (data.shared || []).filter((p) => (data.overrides || {})[p.id]?.hidden);

async function persist() {
  data.settings.activeId = activeId;
  await window.hm.saveData(data);
}

// Ikona blir viste i stort format øvst i menyen, så dei blir lagra i 192 px.
// Er kjelda mindre, blir ho ikkje blåst opp – då er det betre å la biletet
// vere lite og skarpt enn stort og uskarpt.
const ICON_SIZE = 192;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function shrinkImage(src, maxSize = ICON_SIZE) {
  return new Promise(async (resolve) => {
    const img = await loadImage(src);
    if (!img || !img.width) return resolve(src);
    try {
      // Aldri større enn originalen
      const side = Math.min(maxSize, Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const scale = Math.min(side / img.width, side / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
      resolve(canvas.toDataURL('image/png'));
    } catch {
      resolve(src); // t.d. bilde frå nettet som ikkje kan lesast av canvas
    }
  });
}

// Nettsider tilbyr ofte fleire ikon (16x16 favicon, 180x180 apple-touch osv.).
// Vi vil ha det største, ikkje det første.
async function bestFavicon(urls) {
  const bilde = await Promise.all(urls.slice(0, 6).map(loadImage));
  let best = null;
  for (let i = 0; i < bilde.length; i++) {
    const img = bilde[i];
    if (!img || !img.width) continue;
    if (!best || img.width > best.img.width) best = { img, url: urls[i] };
  }
  return best ? best.url : null;
}

/* ---------- Sidemeny ---------- */
function pageIconEl(p) {
  const src = p.image || (data.icons || {})[p.id];
  if (src) {
    const img = document.createElement('img');
    img.className = 'nav-img';
    img.src = src;
    img.alt = '';
    img.addEventListener('error', () => img.replaceWith(colorDot(p)));
    return img;
  }
  return colorDot(p);
}

function colorDot(p) {
  const dot = document.createElement('span');
  dot.className = 'nav-dot';
  dot.style.background = p.color || '#8a8a97';
  return dot;
}

// Toppen av sidemenyen viser sida som er open, med ikonet i stort format
function renderBrand() {
  const page = activeId ? findPage(activeId) : null;
  $('brandDefault').hidden = !!page;
  $('brandActive').hidden = !page;
  if (!page) return;

  $('activeName').textContent = page.name;
  $('activeGroup').textContent = page.group || '';

  const box = $('activeIcon');
  box.innerHTML = '';
  const src = page.image || (data.icons || {})[page.id];
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.addEventListener('error', () => { box.innerHTML = ''; box.appendChild(letterFor(page)); });
    box.appendChild(img);
  } else {
    box.appendChild(letterFor(page));
  }
  box.style.background = src ? '#ffffff0d' : (page.color || '#8a8a97');
}

function letterFor(page) {
  const span = document.createElement('span');
  span.className = 'letter';
  span.textContent = (page.name || '?').trim().charAt(0).toUpperCase();
  return span;
}

function renderNav() {
  renderBrand();
  const q = $('search').value.trim().toLowerCase();
  const pages = allPages().filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.url.toLowerCase().includes(q)
  );

  nav.innerHTML = '';
  const groups = new Map();
  for (const p of pages) {
    const g = (p.group || 'Anna').trim() || 'Anna';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }

  if (!pages.length) {
    const div = document.createElement('div');
    div.className = 'group-label';
    div.textContent = q ? 'Ingen treff' : 'Ingen sider enno';
    nav.appendChild(div);
    return;
  }

  for (const [group, items] of groups) {
    const label = document.createElement('div');
    label.className = 'group-label';
    label.textContent = group;
    if (items.every((p) => p.shared)) label.textContent += ' · felles';
    nav.appendChild(label);

    for (const p of items) {
      const btn = document.createElement('button');
      btn.className = 'nav-item' + (p.id === activeId ? ' active' : '');
      btn.title = p.shared
        ? `${p.url}\n(felles side${p.edited ? ' – endra på denne maskina' : ''})`
        : p.url;
      btn.appendChild(pageIconEl(p));
      const name = document.createElement('span');
      name.className = 'nav-name';
      name.textContent = p.name;
      btn.appendChild(name);
      if (p.edited) {
        const mark = document.createElement('span');
        mark.className = 'edited-mark';
        mark.textContent = '•';
        mark.title = 'Endra på denne maskina';
        btn.appendChild(mark);
      }
      btn.addEventListener('click', () => openPage(p.id));
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); openModal(p.id); });
      nav.appendChild(btn);
    }
  }

  const list = $('groupList');
  list.innerHTML = '';
  for (const g of new Set(allPages().map((p) => p.group).filter(Boolean))) {
    const opt = document.createElement('option');
    opt.value = g;
    list.appendChild(opt);
  }
}

/* ---------- Webviews ---------- */
function webviewFor(page, create = false) {
  let wv = viewport.querySelector(`webview[data-id="${CSS.escape(page.id)}"]`);
  if (wv || !create) return wv;

  wv = document.createElement('webview');
  wv.dataset.id = page.id;
  wv.setAttribute('src', normalizeUrl(page.url));
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('partition', 'persist:hm');

  wv.addEventListener('did-start-loading', () => { if (page.id === activeId) setLoading(true); });
  wv.addEventListener('did-stop-loading', () => {
    if (page.id !== activeId) return;
    setLoading(false);
    syncToolbar();
  });
  wv.addEventListener('did-navigate', () => { if (page.id === activeId) syncToolbar(); });
  wv.addEventListener('did-navigate-in-page', () => { if (page.id === activeId) syncToolbar(); });

  // Hentar ikonet frå nettsida automatisk når sida ikkje har eit eige bilde.
  // Gjeld òg felles sider, og tel ikkje som ei lokal endring.
  wv.addEventListener('page-favicon-updated', async (e) => {
    const current = findPage(page.id);
    if (!current || current.image || !e.favicons?.length) return;
    data.icons = data.icons || {};
    if (data.icons[page.id]) return;
    const beste = await bestFavicon(e.favicons);
    if (!beste) return;
    data.icons[page.id] = await shrinkImage(beste);
    await persist();
    renderNav();
  });

  viewport.appendChild(wv);
  return wv;
}

function openPage(id) {
  const page = findPage(id);
  if (!page) return;
  activeId = id;

  $('empty').style.display = 'none';
  viewport.querySelectorAll('webview').forEach((w) => w.classList.remove('active'));
  webviewFor(page, true).classList.add('active');

  renderNav();
  syncToolbar();
  oppdaterFyllKnapp();
  persist();
}

const activeWebview = () => viewport.querySelector('webview.active');

function setLoading(on) {
  const bar = $('loadbar');
  const dot = $('urlDot');
  if (on) {
    bar.classList.add('on');
    bar.style.width = '70%';
    dot.className = 'dot loading';
  } else {
    bar.style.width = '100%';
    dot.className = 'dot ok';
    setTimeout(() => { bar.classList.remove('on'); bar.style.width = '0'; }, 300);
  }
}

// Electron 32 flytta canGoBack/goBack til webview.navigationHistory
const navHist = (wv) => (wv && wv.navigationHistory) ? wv.navigationHistory : wv;
const canGo = (wv, dir) => {
  try {
    const h = navHist(wv);
    return dir === 'back' ? h.canGoBack() : h.canGoForward();
  } catch { return false; }
};

function syncToolbar() {
  const wv = activeWebview();
  const has = !!wv;
  $('btnBack').disabled = !has || !canGo(wv, 'back');
  $('btnForward').disabled = !has || !canGo(wv, 'forward');
  ['btnReload', 'btnHome', 'btnCopy', 'btnExternal', 'btnEdit'].forEach((id) => { $(id).disabled = !has; });
  let url = '—';
  try { url = has ? wv.getURL() : '—'; } catch { /* ikkje klar enno */ }
  $('urlText').textContent = url;
  if (!has) $('urlDot').className = 'dot';
}

/* ---------- Dialog: side ---------- */
function renderColors() {
  const wrap = $('colors');
  wrap.innerHTML = '';
  for (const c of COLORS) {
    const s = document.createElement('div');
    s.className = 'swatch' + (c === pickedColor ? ' sel' : '');
    s.style.background = c;
    s.addEventListener('click', () => { pickedColor = c; renderColors(); });
    wrap.appendChild(s);
  }
}

function renderIconPreview() {
  const box = $('iconPreview');
  box.innerHTML = '';
  const auto = editingId ? (data.icons || {})[editingId] : '';
  if (pickedImage || auto) {
    const img = document.createElement('img');
    img.src = pickedImage || auto;
    img.alt = '';
    if (!pickedImage) img.title = 'Ikon henta automatisk frå nettsida';
    box.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.className = 'ph';
    ph.style.background = pickedColor;
    box.appendChild(ph);
  }
}

function openModal(id = null) {
  editingId = id;
  const page = id ? findPage(id) : null;
  const shared = page && isShared(id);

  $('modalTitle').textContent = page ? 'Rediger side' : 'Legg til side';
  $('fName').value = page ? page.name : '';
  $('fUrl').value = page ? page.url : '';
  $('fGroup').value = page ? page.group || '' : '';
  $('fImageUrl').value = '';
  $('fHelp').value = page ? (page.help || '') : '';
  $('fUser').value = (id && logins[id]) ? logins[id].user : '';
  $('fPass').value = '';
  pickedColor = page ? page.color || COLORS[0] : COLORS[0];
  // Berre eit bilde du sjølv har valt. Ikon appen har henta automatisk blir
  // vist i førehandsvisninga, men skal ikkje lagrast som ei endring.
  pickedImage = page ? (page.image || '') : '';

  $('sharedNote').hidden = !shared;
  $('sharedNote').innerHTML = isAdmin
    ? 'Dette er ei <strong>felles side</strong>. <strong>Lagre</strong> endrar berre denne maskina – <strong>Lagre for alle</strong> sender endringa ut til alle.'
    : 'Dette er ei <strong>felles side</strong>. Endringane du gjer her gjeld berre denne maskina – den delte lista blir ikkje rørt.';
  $('fReset').hidden = !(shared && data.overrides[id]);
  $('fDelete').style.display = page ? '' : 'none';
  $('fDelete').textContent = shared ? 'Skjul' : 'Slett';
  $('fDelete').title = shared
    ? 'Skjuler sida på denne maskina. Du kan hente ho fram igjen i Innstillingar.'
    : '';

  // Som admin kan endringa sendast ut til alle
  $('fPublish').hidden = !isAdmin;
  $('fPublish').textContent = page ? 'Lagre for alle' : 'Legg til for alle';
  $('fSave').textContent = isAdmin && !page ? 'Berre meg' : 'Lagre';
  $('fDeleteAll').hidden = !(isAdmin && shared);
  $('publishStatus').hidden = true;

  renderColors();
  renderIconPreview();
  visLoginStatus();
  $('modal').hidden = false;
  setTimeout(() => $('fName').focus(), 30);
}

function closeModal() { $('modal').hidden = true; editingId = null; }

async function saveModal() {
  const name = $('fName').value.trim();
  const url = normalizeUrl($('fUrl').value);
  if (!name || !url) { $(name ? 'fUrl' : 'fName').focus(); return; }
  const group = $('fGroup').value.trim() || 'Anna';
  const help = $('fHelp').value.trim();

  const typedImage = $('fImageUrl').value.trim();
  if (typedImage) pickedImage = await shrinkImage(normalizeUrl(typedImage));

  if (editingId && isShared(editingId)) {
    // Felles side: lagre som lokal overstyring, grunnlaget står urørt
    const base = (data.shared || []).find((x) => x.id === editingId) || {};
    const urlChanged = normalizeUrl(base.url) !== url;
    const unchanged =
      base.name === name && normalizeUrl(base.url) === url &&
      (base.group || '') === group && (base.color || '') === pickedColor &&
      (base.image || '') === pickedImage && (base.help || '') === help;

    if (unchanged) delete data.overrides[editingId];
    else data.overrides[editingId] = { name, url, group, color: pickedColor, image: pickedImage, help };
    if (urlChanged) {
      viewport.querySelector(`webview[data-id="${CSS.escape(editingId)}"]`)?.remove();
      if (activeId === editingId) openPage(editingId);
    }
    await persist();
    closeModal();
    renderNav();
  } else if (editingId) {
    const p = data.pages.find((x) => x.id === editingId);
    const urlChanged = normalizeUrl(p.url) !== url;
    Object.assign(p, { name, url, group, color: pickedColor, image: pickedImage, help });
    if (urlChanged) {
      viewport.querySelector(`webview[data-id="${CSS.escape(p.id)}"]`)?.remove();
      if (activeId === p.id) openPage(p.id);
    }
    await persist();
    closeModal();
    renderNav();
  } else {
    const p = { id: uid(), name, url, group, color: pickedColor, image: pickedImage, help };
    data.pages.push(p);
    await persist();
    closeModal();
    renderNav();
    openPage(p.id);
  }
}

async function deleteCurrent() {
  if (!editingId) return;
  viewport.querySelector(`webview[data-id="${CSS.escape(editingId)}"]`)?.remove();

  if (isShared(editingId)) {
    // Felles sider blir skjulte, ikkje sletta – dei kjem tilbake ved neste synk elles
    data.overrides[editingId] = { ...(data.overrides[editingId] || {}), hidden: true };
  } else {
    data.pages = data.pages.filter((p) => p.id !== editingId);
  }

  if (activeId === editingId) {
    activeId = null;
    $('empty').style.display = '';
    syncToolbar();
  }
  await persist();
  closeModal();
  renderNav();
}

// Fjernar den lokale overstyringa så sida følgjer den delte lista igjen
async function resetCurrent() {
  if (!editingId || !isShared(editingId)) return;
  delete data.overrides[editingId];
  viewport.querySelector(`webview[data-id="${CSS.escape(editingId)}"]`)?.remove();
  await persist();
  closeModal();
  renderNav();
  if (activeId === editingId) openPage(editingId);
}

async function unhideShared(id) {
  if (!data.overrides[id]) return;
  delete data.overrides[id].hidden;
  if (!Object.keys(data.overrides[id]).length) delete data.overrides[id];
  await persist();
  renderNav();
  renderHidden();
}

function renderHidden() {
  const wrap = $('hiddenList');
  const hidden = hiddenShared();
  wrap.innerHTML = '';
  if (!hidden.length) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const label = document.createElement('div');
  label.className = 'hidden-label';
  label.textContent = 'Skjulte felles sider';
  wrap.appendChild(label);

  for (const p of hidden) {
    const row = document.createElement('div');
    row.className = 'hidden-row';
    const name = document.createElement('span');
    name.textContent = p.name;
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.type = 'button';
    btn.textContent = 'Vis igjen';
    btn.addEventListener('click', () => unhideShared(p.id));
    row.append(name, btn);
    wrap.appendChild(row);
  }
}

/* ---------- Vedlegg ---------- */
// Filer som blir lasta ned frå ei side hamnar her, klare til å dragast rett
// inn i ei anna side. Etter at fila er dradd over, blir ho sletta.
let vedlegg = [];
let slettTimer = null;

const visStorleik = (b) =>
  b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB';

function renderTray() {
  const boks = $('tray');
  if (!vedlegg.length) { boks.hidden = true; return; }

  const siste = vedlegg[0];
  boks.hidden = false;
  $('trayName').textContent = siste.name;
  $('traySize').textContent = visStorleik(siste.size);
  $('trayFile').classList.remove('brukt');
  $('trayLabel').textContent = 'Klar til å dra over';
  // Namnet blir ofte for langt for kortet, så heile står i hjelpeteksten
  $('trayFile').title = `${siste.name}\nDra fila inn i ei anna side`;

  const meir = $('trayMore');
  meir.innerHTML = '';
  if (vedlegg.length > 1) {
    meir.append(`${vedlegg.length - 1} eldre fil${vedlegg.length > 2 ? 'er' : ''} · `);
  }
  const knapp = document.createElement('button');
  knapp.textContent = 'opne mappa';
  knapp.title = siste.path;
  knapp.addEventListener('click', () => window.hm.revealAttachment(siste.path));
  meir.appendChild(knapp);
}

async function refreshTray() {
  vedlegg = await window.hm.listAttachments();
  renderTray();
}

$('trayFile').addEventListener('dragstart', (e) => {
  if (!vedlegg.length) return;
  // Elektron tek over dradraget, så nettlesaren sitt eige må stoppast
  e.preventDefault();
  window.hm.dragAttachment(vedlegg[0].path);
});

// Vi får ikkje vite om slippet faktisk gjekk gjennom, så fila blir liggande
// nokre sekund med moglegheit for å angre før ho blir sletta.
$('trayFile').addEventListener('dragend', () => startSletting());

function startSletting() {
  if (!vedlegg.length || slettTimer) return;
  const fil = vedlegg[0];
  $('trayFile').classList.add('brukt');

  let att = 6;
  const tikk = () => {
    $('trayLabel').textContent = `Slettar om ${att} s`;
    const meir = $('trayMore');
    meir.innerHTML = '';
    const angre = document.createElement('button');
    angre.textContent = 'Angre';
    angre.addEventListener('click', stoppSletting);
    meir.appendChild(angre);
  };
  tikk();

  slettTimer = setInterval(async () => {
    att -= 1;
    if (att > 0) return tikk();
    clearInterval(slettTimer);
    slettTimer = null;
    await window.hm.deleteAttachment(fil.path);
  }, 1000);
}

function stoppSletting() {
  if (slettTimer) { clearInterval(slettTimer); slettTimer = null; }
  renderTray();
}

$('trayClear').addEventListener('click', async () => {
  if (!vedlegg.length) return;
  stoppSletting();
  await window.hm.deleteAttachment(vedlegg[0].path);
});

window.hm.onAttachments((liste) => {
  stoppSletting();
  vedlegg = liste;
  renderTray();
});

/* ---------- Lagra innlogging ---------- */
// Renderer kjenner berre til KVA sider som har innlogging, og brukarnamnet.
// Passorda ligg kryptert i hovudprosessen og kjem aldri hit.
let logins = {};

async function refreshLogins() {
  logins = await window.hm.listLogins();
  oppdaterFyllKnapp();
}

const FELLES = '__felles__';
const harInnlogging = (id) => !!(logins[id] || logins[FELLES]);

function oppdaterFyllKnapp() {
  $('btnFill').hidden = !(activeId && harInnlogging(activeId));
}

function visLoginStatus() {
  const l = editingId ? logins[editingId] : null;
  const felles = logins[FELLES];
  $('loginState').textContent = l
    ? `Lagra for ${l.user || '(utan brukarnamn)'} på ${l.origin}`
    : felles
      ? `Brukar den felles innlogginga (${felles.user || 'utan brukarnamn'}). Legg inn her for å bruke noko anna på denne sida.`
      : 'Inga innlogging lagra for denne sida.';
}

function visFellesStatus() {
  const f = logins[FELLES];
  $('sLoginState').textContent = f
    ? `Lagra som ${f.user || '(utan brukarnamn)'} – blir brukt på alle sidene.`
    : 'Inga felles innlogging lagra.';
  $('sUser').value = f ? f.user : '';
  $('sPass').value = '';
}

async function lagreFelles() {
  const res = await window.hm.setSharedLogin({
    user: $('sUser').value.trim(),
    pass: $('sPass').value
  });
  $('sPass').value = '';
  if (!res.ok) { $('sLoginState').textContent = res.error; return; }
  await refreshLogins();
  visFellesStatus();
}

async function fjernFelles() {
  await window.hm.setSharedLogin({ user: '', pass: '' });
  await refreshLogins();
  visFellesStatus();
}

async function lagreLogin() {
  if (!editingId) return;
  const res = await window.hm.setLogin({
    id: editingId,
    url: normalizeUrl($('fUrl').value),
    user: $('fUser').value.trim(),
    pass: $('fPass').value
  });
  $('fPass').value = '';
  if (!res.ok) { $('loginState').textContent = res.error; return; }
  await refreshLogins();
  visLoginStatus();
}

async function fjernLogin() {
  if (!editingId) return;
  await window.hm.clearLogin(editingId);
  $('fUser').value = '';
  $('fPass').value = '';
  await refreshLogins();
  visLoginStatus();
}

// Blir berre køyrt når brukaren trykkjer nøkkelknappen – aldri av seg sjølv
async function fyllInnlogging() {
  const wv = activeWebview();
  if (!wv || !activeId || !harInnlogging(activeId)) return;
  const knapp = $('btnFill');
  try {
    const res = await window.hm.fillLogin({ id: activeId, webContentsId: wv.getWebContentsId() });
    if (!res.ok) { alert(res.error); return; }
    if (!res.felt) {
      alert('Fann ikkje noko innloggingsskjema på denne sida.');
      return;
    }
    // Kort kvittering på at det gjekk
    knapp.classList.add('fylt');
    setTimeout(() => knapp.classList.remove('fylt'), 1200);
  } catch {
    alert('Sida er ikkje klar enno. Prøv igjen om eit augeblikk.');
  }
}

/* ---------- Hjelp ---------- */
function helpIconEl(p) {
  const box = document.createElement('div');
  box.className = 'help-icon';
  const src = p.image || (data.icons || {})[p.id];
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    box.appendChild(img);
  } else {
    const dot = document.createElement('span');
    dot.className = 'help-dot';
    dot.style.background = p.color || '#8a8a97';
    box.appendChild(dot);
  }
  return box;
}

function openHelp() {
  const alle = allPages();
  const aktiv = activeId ? findPage(activeId) : null;

  const current = $('helpCurrent');
  current.innerHTML = '';
  current.hidden = !aktiv;
  if (aktiv) {
    current.appendChild(helpIconEl(aktiv));
    const tekst = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = aktiv.name;
    const p = document.createElement('p');
    p.textContent = aktiv.help || 'Ingen forklaring er lagt inn for denne sida enno.';
    tekst.append(h, p);
    current.appendChild(tekst);
  }

  const liste = $('helpList');
  liste.innerHTML = '';
  for (const p of alle) {
    if (aktiv && p.id === aktiv.id) continue;
    const rad = document.createElement('div');
    rad.className = 'help-row';
    rad.appendChild(helpIconEl(p));
    const tekst = document.createElement('div');
    const n = document.createElement('strong');
    n.textContent = p.name;
    const b = document.createElement('p');
    if (p.help) b.textContent = p.help;
    else { b.textContent = 'Ingen forklaring lagt inn enno.'; b.className = 'tom'; }
    tekst.append(n, b);
    rad.appendChild(tekst);
    liste.appendChild(rad);
  }

  $('helpAdminHint').hidden = !isAdmin;
  $('helpModal').hidden = false;
}

/* ---------- Admin: endre den felles lista for alle ---------- */
const bareId = (id) => String(id).replace(/^shared:/, '');

// Gjer den interne lista om til formatet som ligg i sider.json
function toSharedJson(list) {
  return list.map((p) => {
    const out = { id: bareId(p.id), name: p.name, url: p.url };
    if (p.group) out.group = p.group;
    if (p.color) out.color = p.color;
    if (p.help) out.help = p.help;
    if (p.image) out.image = p.image;
    return out;
  });
}

function setPublishStatus(text, kind = '') {
  const el = $('publishStatus');
  el.hidden = !text;
  el.textContent = text;
  el.className = 'publish-status' + (kind ? ' ' + kind : '');
}

async function publish(list, message) {
  setPublishStatus('Sender til alle…');
  const res = await window.hm.publishShared({ pages: toSharedJson(list), message });
  if (!res.ok) { setPublishStatus(res.error, 'error'); return false; }
  setPublishStatus('Sendt. Alle får endringa ved neste synk.', 'ok');
  return true;
}

async function publishModal() {
  const name = $('fName').value.trim();
  const url = normalizeUrl($('fUrl').value);
  if (!name || !url) { $(name ? 'fUrl' : 'fName').focus(); return; }
  const group = $('fGroup').value.trim() || 'Anna';
  const help = $('fHelp').value.trim();

  const typed = $('fImageUrl').value.trim();
  if (typed) pickedImage = await shrinkImage(normalizeUrl(typed));

  const felt = { name, url, group, color: pickedColor, image: pickedImage, help };
  let list;
  let message;

  if (editingId && isShared(editingId)) {
    list = (data.shared || []).map((p) => (p.id === editingId ? { ...p, ...felt } : p));
    message = `Endre felles side: ${name}`;
  } else {
    const id = 'shared:' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid());
    list = [...(data.shared || []), { id, ...felt }];
    message = `Legg til felles side: ${name}`;
  }

  if (!(await publish(list, message))) return;

  // Lokale overstyringar og lokale kopiar ville berre skygge for det nye
  if (editingId && isShared(editingId)) delete data.overrides[editingId];
  else if (editingId) data.pages = data.pages.filter((p) => p.id !== editingId);

  // Vi veit kva vi nettopp lagra, så vi brukar det med ein gong i staden for
  // å vente på at GitHub skal servere den nye fila
  data.shared = list.map((p) => ({ ...p, shared: true }));
  data.settings.lastSync = new Date().toISOString();

  await persist();
  closeModal();
  renderNav();
  showSyncStatus(`${data.shared.length} felles sider · ${lastSyncText()}`);
}

async function deleteForAll() {
  if (!editingId || !isShared(editingId)) return;
  const page = findPage(editingId);
  const list = (data.shared || []).filter((p) => p.id !== editingId);
  if (!(await publish(list, `Fjern felles side: ${page ? page.name : editingId}`))) return;

  viewport.querySelector(`webview[data-id="${CSS.escape(editingId)}"]`)?.remove();
  delete data.overrides[editingId];
  if (activeId === editingId) {
    activeId = null;
    $('empty').style.display = '';
    syncToolbar();
  }
  data.shared = list.map((p) => ({ ...p, shared: true }));
  data.settings.lastSync = new Date().toISOString();

  await persist();
  closeModal();
  renderNav();
  showSyncStatus(`${data.shared.length} felles sider · ${lastSyncText()}`);
}

// Sender heile den lista du ser lokalt ut til alle: namn, adresser, grupper,
// fargar og ikon – òg dei ikona appen har henta automatisk.
async function publishEverything() {
  const btn = $('sPublishAll');
  const list = (data.shared || []).map((p) => {
    const o = data.overrides[p.id] || {};
    if (o.hidden) return { ...p }; // skjult hjå deg, men blir verande for dei andre
    return { ...p, ...o, image: o.image || p.image || (data.icons || {})[p.id] || '' };
  });

  const storleik = JSON.stringify(toSharedJson(list)).length;
  if (storleik > 400000) {
    $('sInfo').textContent = 'Lista blir for stor (over 400 kB). Fjern nokre bilde først.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sender…';
  const res = await window.hm.publishShared({
    pages: toSharedJson(list),
    message: 'Oppdater felles sideliste med ikon og endringar'
  });
  btn.disabled = false;
  btn.textContent = 'Send alt ut til alle';

  if (!res.ok) { $('sInfo').textContent = res.error; return; }

  // Endringane er no offisielle, så dei lokale overstyringane har ingen funksjon
  for (const id of Object.keys(data.overrides)) {
    if (!data.overrides[id].hidden) delete data.overrides[id];
  }
  data.shared = list.map((p) => ({ ...p, shared: true }));
  data.settings.lastSync = new Date().toISOString();
  await persist();
  renderNav();
  $('sInfo').textContent =
    `Sendt. ${list.length} sider (${Math.round(storleik / 1024)} kB) gjeld no for alle.`;
}

async function refreshAdmin() {
  const res = await window.hm.adminStatus();
  isAdmin = !!res.admin;
  const state = $('adminState');
  if (isAdmin) {
    state.innerHTML = '';
    state.append(
      res.login ? `Innlogga som ${res.login}.` : 'Admin (får ikkje kontakt med GitHub no).'
    );
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.textContent = 'admin';
    state.appendChild(badge);
    $('sClearToken').hidden = false;
    $('adminTokenRow').hidden = true;
    $('sPublishAll').hidden = false;
  } else {
    state.textContent = res.error || 'Ikkje admin på denne maskina.';
    $('sClearToken').hidden = true;
    $('adminTokenRow').hidden = false;
    $('sPublishAll').hidden = true;
  }
}

/* ---------- Delt sideliste ---------- */
function showSyncStatus(text, isError = false) {
  const el = $('syncStatus');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function lastSyncText() {
  const t = data.settings.lastSync;
  if (!t) return 'Ikkje henta enno';
  const d = new Date(t);
  return 'Sist henta ' + d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Ei overstyring som er blitt lik den felles lista har ingen funksjon lenger,
// og ville berre stå att med ein raud «endra»-prikk
function pruneOverrides() {
  for (const p of data.shared || []) {
    const o = (data.overrides || {})[p.id];
    if (!o || o.hidden) continue;
    const likt =
      o.name === p.name &&
      normalizeUrl(o.url || '') === normalizeUrl(p.url || '') &&
      (o.group || '') === (p.group || '') &&
      (o.color || '') === (p.color || '') &&
      (o.image || '') === (p.image || '') &&
      (o.help || '') === (p.help || '');
    if (likt) delete data.overrides[p.id];
  }
}

async function doSync(quiet = false) {
  if (!(data.settings.sharedUrl || '').trim()) {
    if (!quiet) showSyncStatus('Inga delt liste er satt opp', true);
    return;
  }
  if (!quiet) showSyncStatus('Hentar…');
  const res = await window.hm.syncShared();
  if (res.ok) {
    data.shared = res.shared;
    data.settings.lastSync = res.lastSync;
    pruneOverrides();
    await persist();
    renderNav();
    showSyncStatus(`${res.count} felles sider · ${lastSyncText()}`);
  } else {
    showSyncStatus(res.error, true);
  }
}

function restartSyncTimer() {
  if (syncTimer) clearInterval(syncTimer);
  const minutes = Number(data.settings.syncMinutes || 0);
  if (minutes > 0 && (data.settings.sharedUrl || '').trim()) {
    syncTimer = setInterval(() => doSync(true), minutes * 60 * 1000);
  }
}

function openSettings() {
  $('sSharedUrl').value = data.settings.sharedUrl || '';
  $('sInterval').value = String(data.settings.syncMinutes ?? 15);
  const endra = Object.values(data.overrides || {}).filter((o) => !o.hidden).length;
  $('sInfo').textContent =
    `${(data.shared || []).length} felles sider · ${lastSyncText()}` +
    (endra ? ` · ${endra} endra lokalt` : '');
  renderHidden();
  visFellesStatus();
  refreshAdmin();
  $('settingsModal').hidden = false;
  setTimeout(() => $('sSharedUrl').focus(), 30);
}

async function saveSettings() {
  const url = $('sSharedUrl').value.trim();
  data.settings.sharedUrl = url ? normalizeUrl(url) : '';
  data.settings.syncMinutes = Number($('sInterval').value);
  if (!data.settings.sharedUrl) data.shared = [];
  await persist();
  $('settingsModal').hidden = true;
  renderNav();
  restartSyncTimer();
  if (data.settings.sharedUrl) doSync();
  else showSyncStatus('');
}

/* ---------- Hendingar ---------- */
$('btnAdd').addEventListener('click', () => openModal());
$('btnAddEmpty').addEventListener('click', () => openModal());
$('fCancel').addEventListener('click', closeModal);
$('fSave').addEventListener('click', saveModal);
$('fDelete').addEventListener('click', deleteCurrent);
$('fReset').addEventListener('click', resetCurrent);
$('fLoginSave').addEventListener('click', lagreLogin);
$('fLoginClear').addEventListener('click', fjernLogin);
$('btnFill').addEventListener('click', () => fyllInnlogging());
$('fPublish').addEventListener('click', publishModal);
$('fDeleteAll').addEventListener('click', deleteForAll);

$('sSaveToken').addEventListener('click', async () => {
  const btn = $('sSaveToken');
  btn.disabled = true;
  const res = await window.hm.setAdminToken($('sToken').value);
  btn.disabled = false;
  $('sToken').value = '';
  if (!res.ok) { $('adminState').textContent = res.error; return; }
  await refreshAdmin();
});

$('sPublishAll').addEventListener('click', publishEverything);
$('sLoginSave').addEventListener('click', lagreFelles);
$('sLoginClear').addEventListener('click', fjernFelles);

$('sClearToken').addEventListener('click', async () => {
  await window.hm.setAdminToken('');
  await refreshAdmin();
});
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
['fName', 'fUrl', 'fGroup', 'fImageUrl'].forEach((id) =>
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') saveModal(); })
);
$('search').addEventListener('input', renderNav);

$('fPickImage').addEventListener('click', async () => {
  const res = await window.hm.pickImage();
  if (!res) return;
  if (res.error) { alert(res.error); return; }
  pickedImage = await shrinkImage(res.dataUrl);
  $('fImageUrl').value = '';
  renderIconPreview();
});
$('fClearImage').addEventListener('click', () => {
  pickedImage = '';
  $('fImageUrl').value = '';
  renderIconPreview();
});
$('fAutoIcon').addEventListener('click', async () => {
  // Har appen alt fanga opp ikonet då sida vart lasta, er det det beste vi har
  const fanga = editingId ? (data.icons || {})[editingId] : '';
  if (fanga) { pickedImage = fanga; renderIconPreview(); return; }

  const url = normalizeUrl($('fUrl').value);
  if (!url) { $('fUrl').focus(); return; }
  try {
    const origin = new URL(url).origin;
    const beste = await bestFavicon([
      origin + '/apple-touch-icon.png',
      origin + '/icon.png',
      origin + '/logo.png',
      origin + '/favicon.png',
      origin + '/favicon.ico'
    ]);
    if (!beste) return;
    pickedImage = await shrinkImage(beste);
    renderIconPreview();
  } catch { /* ugyldig adresse */ }
});
$('fImageUrl').addEventListener('change', async () => {
  const v = $('fImageUrl').value.trim();
  if (!v) return;
  pickedImage = await shrinkImage(normalizeUrl(v));
  renderIconPreview();
});

$('btnBack').addEventListener('click', () => navHist(activeWebview())?.goBack());
$('btnForward').addEventListener('click', () => navHist(activeWebview())?.goForward());
$('btnReload').addEventListener('click', () => activeWebview()?.reload());
$('btnHome').addEventListener('click', () => {
  const p = findPage(activeId);
  if (p) activeWebview()?.loadURL(normalizeUrl(p.url));
});
$('btnCopy').addEventListener('click', () => {
  const wv = activeWebview();
  if (wv) navigator.clipboard.writeText(wv.getURL());
});
$('btnExternal').addEventListener('click', () => {
  const wv = activeWebview();
  if (wv) window.hm.openExternal(wv.getURL());
});
$('btnEdit').addEventListener('click', () => { if (activeId) openModal(activeId); });
$('btnHelp').addEventListener('click', openHelp);
$('helpClose').addEventListener('click', () => { $('helpModal').hidden = true; });
$('helpModal').addEventListener('click', (e) => {
  if (e.target === $('helpModal')) $('helpModal').hidden = true;
});

$('btnMin').addEventListener('click', () => window.hm.minimize());
$('btnMax').addEventListener('click', () => window.hm.toggleMaximize());
$('btnClose').addEventListener('click', () => window.hm.close());

$('btnSettings').addEventListener('click', openSettings);
$('btnSync').addEventListener('click', () => doSync());
$('sCancel').addEventListener('click', () => { $('settingsModal').hidden = true; });
$('sSave').addEventListener('click', saveSettings);
$('settingsModal').addEventListener('click', (e) => {
  if (e.target === $('settingsModal')) $('settingsModal').hidden = true;
});
$('sSharedUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSettings(); });

$('sExport').addEventListener('click', () => window.hm.exportData());
$('sImport').addEventListener('click', async () => {
  const imported = await window.hm.importData();
  if (!imported) return;
  viewport.querySelectorAll('webview').forEach((w) => w.remove());
  data = imported;
  data.shared = data.shared || [];
  data.overrides = data.overrides || {};
  data.icons = data.icons || {};
  activeId = null;
  $('empty').style.display = '';
  $('settingsModal').hidden = true;
  renderNav();
  syncToolbar();
  restartSyncTimer();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'F1') { e.preventDefault(); openHelp(); }
  if (e.key === 'Escape') {
    if (!$('modal').hidden) closeModal();
    else if (!$('settingsModal').hidden) $('settingsModal').hidden = true;
    else if (!$('helpModal').hidden) $('helpModal').hidden = true;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); activeWebview()?.reload(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('search').focus(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openModal(); }
  if (e.altKey && e.key === 'ArrowLeft') navHist(activeWebview())?.goBack();
  if (e.altKey && e.key === 'ArrowRight') navHist(activeWebview())?.goForward();
});

/* ---------- Automatisk oppdatering ---------- */
function showUpdate(text, showButton = false) {
  $('updateBox').hidden = false;
  $('updateText').textContent = text;
  $('updateBtn').hidden = !showButton;
}

window.hm.onUpdate((event, d) => {
  if (event === 'available') showUpdate(`Lastar ned versjon ${d.version}…`);
  if (event === 'progress') showUpdate(`Lastar ned oppdatering… ${d.percent} %`);
  if (event === 'ready') showUpdate(`Versjon ${d.version} er klar.`, true);
  if (event === 'error') $('updateBox').hidden = true; // t.d. ingen nettilgang
});

$('updateBtn').addEventListener('click', () => window.hm.installUpdate());

$('sCheckUpdate').addEventListener('click', async () => {
  const btn = $('sCheckUpdate');
  btn.disabled = true;
  btn.textContent = 'Ser etter…';
  const res = await window.hm.checkUpdate();
  const naa = await window.hm.appVersion();
  if (!res.ok) {
    btn.textContent = 'Sjå etter oppdatering';
    $('sInfo').textContent = res.error;
  } else if (res.version && res.version !== naa) {
    btn.textContent = 'Lastar ned…';
    $('sInfo').textContent = `Versjon ${res.version} blir lasta ned i bakgrunnen.`;
  } else {
    btn.textContent = 'Sjå etter oppdatering';
    $('sInfo').textContent = `Du har nyaste versjon (${naa}).`;
  }
  btn.disabled = false;
});

/* ---------- Oppstart ---------- */
(async function init() {
  data = await window.hm.loadData();
  data.shared = data.shared || [];
  data.overrides = data.overrides || {};
  data.icons = data.icons || {};
  // Ikon lagra av eldre versjonar er berre 64 px og blir uskarpe i det store
  // formatet. Vi kastar dei, så blir dei henta på nytt i full oppløysing.
  if (data.iconVersion !== 2) {
    data.icons = {};
    data.iconVersion = 2;
    await persist();
  }
  renderNav();
  syncToolbar();
  if ((data.shared || []).length) showSyncStatus(`${data.shared.length} felles sider · ${lastSyncText()}`);

  const start = data.settings?.activeId;
  if (start && findPage(start)) openPage(start);

  restartSyncTimer();
  if ((data.settings.sharedUrl || '').trim()) doSync(true);

  $('version').textContent = 'Versjon ' + (await window.hm.appVersion());
  await refreshAdmin();
  await refreshLogins();
  await refreshTray();
})();
