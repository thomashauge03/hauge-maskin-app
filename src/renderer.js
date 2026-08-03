const COLORS = ['#e2001a', '#ff8a00', '#ffd400', '#22c55e', '#00b9f1', '#4285f4', '#a855f7', '#8a8a97'];

let data = { pages: [], shared: [], settings: {} };
let activeId = null;
let editingId = null;
let pickedColor = COLORS[0];
let pickedImage = '';
let syncTimer = null;

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

// Delte sider først, deretter dine eigne
const allPages = () => [...(data.shared || []), ...data.pages];
const findPage = (id) => allPages().find((p) => p.id === id);
const isShared = (id) => String(id).startsWith('shared:');

async function persist() {
  data.settings.activeId = activeId;
  await window.hm.saveData(data);
}

// Krympar eit bilde til 64x64 så pages.json held seg liten
function shrinkImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(src); // t.d. bilde frå nettet som ikkje kan lesast av canvas
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/* ---------- Sidemeny ---------- */
function pageIconEl(p) {
  if (p.image) {
    const img = document.createElement('img');
    img.className = 'nav-img';
    img.src = p.image;
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

function renderNav() {
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
      btn.title = p.shared ? `${p.url}\n(felles side – styrt av den delte lista)` : p.url;
      btn.appendChild(pageIconEl(p));
      const name = document.createElement('span');
      name.className = 'nav-name';
      name.textContent = p.name;
      btn.appendChild(name);
      btn.addEventListener('click', () => openPage(p.id));
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!p.shared) openModal(p.id);
      });
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
  wv.addEventListener('did-stop-loading', () => { if (page.id === activeId) { setLoading(false); syncToolbar(); } });
  wv.addEventListener('did-navigate', () => { if (page.id === activeId) syncToolbar(); });
  wv.addEventListener('did-navigate-in-page', () => { if (page.id === activeId) syncToolbar(); });

  // Hentar ikonet frå nettsida automatisk når sida ikkje har eit eige bilde
  wv.addEventListener('page-favicon-updated', async (e) => {
    const target = data.pages.find((p) => p.id === page.id);
    if (!target || target.image || !e.favicons || !e.favicons.length) return;
    target.image = await shrinkImage(e.favicons[0]);
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
  ['btnReload', 'btnHome', 'btnCopy', 'btnExternal'].forEach((id) => { $(id).disabled = !has; });
  $('btnEdit').disabled = !has || isShared(activeId);
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
  if (pickedImage) {
    const img = document.createElement('img');
    img.src = pickedImage;
    img.alt = '';
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
  const page = id ? data.pages.find((p) => p.id === id) : null;
  $('modalTitle').textContent = page ? 'Rediger side' : 'Legg til side';
  $('fName').value = page ? page.name : '';
  $('fUrl').value = page ? page.url : '';
  $('fGroup').value = page ? page.group || '' : '';
  $('fImageUrl').value = '';
  pickedColor = page ? page.color || COLORS[0] : COLORS[0];
  pickedImage = page ? page.image || '' : '';
  $('fDelete').style.display = page ? '' : 'none';
  renderColors();
  renderIconPreview();
  $('modal').hidden = false;
  setTimeout(() => $('fName').focus(), 30);
}

function closeModal() { $('modal').hidden = true; editingId = null; }

async function saveModal() {
  const name = $('fName').value.trim();
  const url = normalizeUrl($('fUrl').value);
  if (!name || !url) { $(name ? 'fUrl' : 'fName').focus(); return; }
  const group = $('fGroup').value.trim() || 'Anna';

  const typedImage = $('fImageUrl').value.trim();
  if (typedImage) pickedImage = await shrinkImage(normalizeUrl(typedImage));

  if (editingId) {
    const p = data.pages.find((x) => x.id === editingId);
    const urlChanged = normalizeUrl(p.url) !== url;
    Object.assign(p, { name, url, group, color: pickedColor, image: pickedImage });
    if (urlChanged) {
      viewport.querySelector(`webview[data-id="${CSS.escape(p.id)}"]`)?.remove();
      if (activeId === p.id) openPage(p.id);
    }
    await persist();
    closeModal();
    renderNav();
  } else {
    const p = { id: uid(), name, url, group, color: pickedColor, image: pickedImage };
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
  data.pages = data.pages.filter((p) => p.id !== editingId);
  if (activeId === editingId) {
    activeId = null;
    $('empty').style.display = '';
    syncToolbar();
  }
  await persist();
  closeModal();
  renderNav();
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
  $('sInfo').textContent = `${(data.shared || []).length} felles sider · ${lastSyncText()}`;
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
  const url = normalizeUrl($('fUrl').value);
  if (!url) { $('fUrl').focus(); return; }
  try {
    const origin = new URL(url).origin;
    pickedImage = await shrinkImage(origin + '/favicon.ico');
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
$('btnEdit').addEventListener('click', () => { if (activeId && !isShared(activeId)) openModal(activeId); });

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
  activeId = null;
  $('empty').style.display = '';
  $('settingsModal').hidden = true;
  renderNav();
  syncToolbar();
  restartSyncTimer();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('modal').hidden) closeModal();
    else if (!$('settingsModal').hidden) $('settingsModal').hidden = true;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); activeWebview()?.reload(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('search').focus(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openModal(); }
  if (e.altKey && e.key === 'ArrowLeft') navHist(activeWebview())?.goBack();
  if (e.altKey && e.key === 'ArrowRight') navHist(activeWebview())?.goForward();
});

/* ---------- Oppstart ---------- */
(async function init() {
  data = await window.hm.loadData();
  data.shared = data.shared || [];
  renderNav();
  syncToolbar();
  if ((data.shared || []).length) showSyncStatus(`${data.shared.length} felles sider · ${lastSyncText()}`);

  const start = data.settings?.activeId;
  if (start && findPage(start)) openPage(start);

  restartSyncTimer();
  if ((data.settings.sharedUrl || '').trim()) doSync(true);
})();
