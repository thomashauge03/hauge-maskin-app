const COLORS = ['#e2001a', '#ff8a00', '#ffd400', '#22c55e', '#00b9f1', '#4285f4', '#a855f7', '#8a8a97'];

let data = { pages: [], settings: {} };
let activeId = null;
let editingId = null;
let pickedColor = COLORS[0];

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

async function persist() {
  data.settings.activeId = activeId;
  await window.hm.saveData(data);
}

/* ---------- Sidemeny ---------- */
function renderNav() {
  const q = $('search').value.trim().toLowerCase();
  const pages = data.pages.filter(
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
    nav.appendChild(label);

    for (const p of items) {
      const btn = document.createElement('button');
      btn.className = 'nav-item' + (p.id === activeId ? ' active' : '');
      btn.title = p.url;
      btn.innerHTML =
        `<span class="nav-dot" style="background:${p.color || '#8a8a97'}"></span>` +
        `<span class="nav-name"></span>`;
      btn.querySelector('.nav-name').textContent = p.name;
      btn.addEventListener('click', () => openPage(p.id));
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); openModal(p.id); });
      nav.appendChild(btn);
    }
  }

  // gruppeforslag i dialogen
  const list = $('groupList');
  list.innerHTML = '';
  for (const g of new Set(data.pages.map((p) => p.group).filter(Boolean))) {
    const opt = document.createElement('option');
    opt.value = g;
    list.appendChild(opt);
  }
}

/* ---------- Webviews ---------- */
function webviewFor(page, create = false) {
  let wv = viewport.querySelector(`webview[data-id="${page.id}"]`);
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
  wv.addEventListener('page-title-updated', () => { if (page.id === activeId) syncToolbar(); });

  viewport.appendChild(wv);
  return wv;
}

function openPage(id) {
  const page = data.pages.find((p) => p.id === id);
  if (!page) return;
  activeId = id;

  $('empty').style.display = 'none';
  viewport.querySelectorAll('webview').forEach((w) => w.classList.remove('active'));
  webviewFor(page, true).classList.add('active');

  renderNav();
  syncToolbar();
  persist();
}

function activeWebview() {
  return viewport.querySelector('webview.active');
}

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

function syncToolbar() {
  const wv = activeWebview();
  const has = !!wv;
  $('btnBack').disabled = !has || !wv.canGoBack();
  $('btnForward').disabled = !has || !wv.canGoForward();
  ['btnReload', 'btnHome', 'btnCopy', 'btnExternal', 'btnEdit'].forEach((id) => { $(id).disabled = !has; });
  let url = '—';
  try { url = has ? wv.getURL() : '—'; } catch { /* ikkje klar enno */ }
  $('urlText').textContent = url;
  if (!has) $('urlDot').className = 'dot';
}

/* ---------- Dialog ---------- */
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

function openModal(id = null) {
  editingId = id;
  const page = id ? data.pages.find((p) => p.id === id) : null;
  $('modalTitle').textContent = page ? 'Rediger side' : 'Legg til side';
  $('fName').value = page ? page.name : '';
  $('fUrl').value = page ? page.url : '';
  $('fGroup').value = page ? page.group || '' : '';
  pickedColor = page ? page.color || COLORS[0] : COLORS[0];
  $('fDelete').style.display = page ? '' : 'none';
  renderColors();
  $('modal').hidden = false;
  setTimeout(() => $('fName').focus(), 30);
}

function closeModal() { $('modal').hidden = true; editingId = null; }

async function saveModal() {
  const name = $('fName').value.trim();
  const url = normalizeUrl($('fUrl').value);
  if (!name || !url) { $(name ? 'fUrl' : 'fName').focus(); return; }
  const group = $('fGroup').value.trim() || 'Anna';

  if (editingId) {
    const p = data.pages.find((x) => x.id === editingId);
    const urlChanged = normalizeUrl(p.url) !== url;
    Object.assign(p, { name, url, group, color: pickedColor });
    if (urlChanged) {
      const wv = viewport.querySelector(`webview[data-id="${p.id}"]`);
      if (wv) wv.remove();
      if (activeId === p.id) openPage(p.id);
    }
  } else {
    const p = { id: uid(), name, url, group, color: pickedColor };
    data.pages.push(p);
    await persist();
    closeModal();
    renderNav();
    openPage(p.id);
    return;
  }
  await persist();
  closeModal();
  renderNav();
}

async function deleteCurrent() {
  if (!editingId) return;
  const wv = viewport.querySelector(`webview[data-id="${editingId}"]`);
  if (wv) wv.remove();
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

/* ---------- Hendingar ---------- */
$('btnAdd').addEventListener('click', () => openModal());
$('btnAddEmpty').addEventListener('click', () => openModal());
$('fCancel').addEventListener('click', closeModal);
$('fSave').addEventListener('click', saveModal);
$('fDelete').addEventListener('click', deleteCurrent);
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
['fName', 'fUrl', 'fGroup'].forEach((id) =>
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') saveModal(); })
);
$('search').addEventListener('input', renderNav);

$('btnBack').addEventListener('click', () => activeWebview()?.goBack());
$('btnForward').addEventListener('click', () => activeWebview()?.goForward());
$('btnReload').addEventListener('click', () => activeWebview()?.reload());
$('btnHome').addEventListener('click', () => {
  const p = data.pages.find((x) => x.id === activeId);
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

$('btnMin').addEventListener('click', () => window.hm.minimize());
$('btnMax').addEventListener('click', () => window.hm.toggleMaximize());
$('btnClose').addEventListener('click', () => window.hm.close());

$('btnExport').addEventListener('click', () => window.hm.exportData());
$('btnImport').addEventListener('click', async () => {
  const imported = await window.hm.importData();
  if (!imported) return;
  viewport.querySelectorAll('webview').forEach((w) => w.remove());
  data = imported;
  activeId = null;
  $('empty').style.display = '';
  renderNav();
  syncToolbar();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('modal').hidden) closeModal();
  if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); activeWebview()?.reload(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('search').focus(); }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openModal(); }
  if (e.altKey && e.key === 'ArrowLeft') activeWebview()?.goBack();
  if (e.altKey && e.key === 'ArrowRight') activeWebview()?.goForward();
});

/* ---------- Oppstart ---------- */
(async function init() {
  data = await window.hm.loadData();
  renderNav();
  syncToolbar();
  const start = data.settings?.activeId;
  if (start && data.pages.some((p) => p.id === start)) openPage(start);
})();
