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

/* ---------- Hjelpere ---------- */
function normalizeUrl(raw) {
  const url = (raw || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^file:\/\//i.test(url)) return url;
  return 'https://' + url.replace(/^\/+/, '');
}

const uid = () => 'p' + Math.random().toString(36).slice(2, 9);

const isShared = (id) => String(id).startsWith('shared:');

// Felles sider kan endres lokalt. Endringene lagres som en overstyring
// på denne maskinen, mens grunnlaget fortsatt kommer fra den delte listen.
function applyOverride(p) {
  const o = (data.overrides || {})[p.id];
  return o ? { ...p, ...o, shared: true, edited: true } : p;
}

// Delte sider først, deretter dine egne
const barePaaMobil = (p) => p.plattform === 'mobil';

const allPages = () =>
  [
    ...(data.shared || []).map(applyOverride).filter((p) => !p.hidden && !barePaaMobil(p)),
    ...data.pages
  ];

const findPage = (id) =>
  allPages().find((p) => p.id === id) ||
  (data.shared || []).map(applyOverride).find((p) => p.id === id);
const hiddenShared = () =>
  (data.shared || []).filter((p) => !p.hidden && (data.overrides || {})[p.id]?.hidden);

async function persist() {
  data.settings.activeId = activeId;
  await window.hm.saveData(data);
}

// Ikonene vises i stort format øverst i menyen, så de lagres i 192 px.
// Er kilden mindre, blir den ikke blåst opp – da er det bedre å la bildet
// være lite og skarpt enn stort og uskarpt.
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
      resolve(src); // f.eks. bilde fra nettet som ikke kan leses av canvas
    }
  });
}

// Nettsider tilbyr ofte flere ikoner (16x16 favicon, 180x180 apple-touch osv.).
// Vi vil ha det største, ikke det første.
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

// Toppen av sidemenyen viser siden som er åpen, med ikonet i stort format
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
    const g = (p.group || 'Annet').trim() || 'Annet';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }

  if (!pages.length) {
    const div = document.createElement('div');
    div.className = 'group-label';
    div.textContent = q ? 'Ingen treff' : 'Ingen sider ennå';
    nav.appendChild(div);
    renderSkjulte(); // også når alt er skjult – ellers er det ingen vei tilbake
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
        ? `${p.url}\n(felles side${p.edited ? ' – endret på denne maskinen' : ''})`
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
        mark.title = 'Endret på denne maskinen';
        btn.appendChild(mark);
      }
      btn.addEventListener('click', () => openPage(p.id));
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); openModal(p.id); });
      nav.appendChild(btn);
    }
  }

  renderSkjulte();

  const list = $('groupList');
  list.innerHTML = '';
  for (const g of new Set(allPages().map((p) => p.group).filter(Boolean))) {
    const opt = document.createElement('option');
    opt.value = g;
    list.appendChild(opt);
  }
}

// Skjulte sider skal være til å finne igjen i menyen, ikke bare gjemt
// inne i Innstillinger.
let visSkjulte = false;

function renderSkjulte() {
  const alle = [
    ...hiddenShared().map((p) => ({ p, slag: 'meg' })),
    ...(isAdmin ? (data.shared || []).filter(barePaaMobil).map((p) => ({ p, slag: 'mobil' })) : []),
    ...(isAdmin ? (data.shared || []).filter((x) => x.hidden).map((p) => ({ p, slag: 'alle' })) : []),
    ...(data.deleted || []).map((p) => ({ p, slag: 'slettet' }))
  ];
  if (!alle.length) return;

  const bryt = document.createElement('button');
  bryt.className = 'skjulte-bryt';
  bryt.textContent = `${visSkjulte ? '▾' : '▸'} ${alle.length} skjulte sider`;
  bryt.addEventListener('click', () => { visSkjulte = !visSkjulte; renderNav(); });
  nav.appendChild(bryt);
  if (!visSkjulte) return;

  const forklaring = {
    meg: 'skjult hos deg. Trykk for å vise igjen.',
    alle: 'skjult for alle. Trykk for å vise for alle igjen.',
    mobil: 'vises bare på mobil. Trykk for å endre.',
    slettet: 'slettet hos deg. Trykk for å hente den tilbake.'
  };

  for (const { p, slag } of alle) {
    const rad = document.createElement('button');
    rad.className = 'nav-item skjult';
    rad.title = `${p.name} – ${forklaring[slag]}`;
    rad.appendChild(pageIconEl(p));
    const navn = document.createElement('span');
    navn.className = 'nav-name';
    navn.textContent = p.name;
    rad.appendChild(navn);
    const merke = document.createElement('span');
    merke.className = 'skjult-merke' + (slag === 'slettet' ? ' slettet' : '');
    merke.textContent = slag;
    rad.appendChild(merke);
    rad.addEventListener('click', () => {
      if (slag === 'alle') showForAll(p.id);
      else if (slag === 'mobil') openModal(p.id);
      else if (slag === 'slettet') gjenopprettSide(p.id);
      else unhideShared(p.id);
    });
    nav.appendChild(rad);
  }
}

// Henter en slettet egen side tilbake i menyen
async function gjenopprettSide(id) {
  const side = (data.deleted || []).find((p) => p.id === id);
  if (!side) return;
  data.deleted = data.deleted.filter((p) => p.id !== id);
  const { slettaTid, ...ren } = side;
  data.pages.push(ren);
  await persist();
  renderNav();
  openPage(ren.id);
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
  wv.setAttribute('plugins', ''); // innebygd PDF-visning

  wv.addEventListener('did-start-loading', () => { if (page.id === activeId) setLoading(true); });
  wv.addEventListener('did-stop-loading', () => {
    if (page.id !== activeId) return;
    setLoading(false);
    syncToolbar();
  });
  wv.addEventListener('did-navigate', () => { if (page.id === activeId) syncToolbar(); });
  wv.addEventListener('did-navigate-in-page', () => { if (page.id === activeId) syncToolbar(); });

  // Henter ikonet fra nettsiden automatisk når siden ikke har et eget bilde.
  // Gjelder også felles sider, og teller ikke som en lokal endring.
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

// Electron 32 flyttet canGoBack/goBack til webview.navigationHistory
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
  try { url = has ? wv.getURL() : '—'; } catch { /* ikke klar ennå */ }
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
    if (!pickedImage) img.title = 'Ikon hentet automatisk fra nettsiden';
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
  // Bare et bilde du selv har valgt. Ikoner appen har hentet automatisk blir
  // vist i forhåndsvisningen, men skal ikke lagres som en endring.
  pickedImage = page ? (page.image || '') : '';

  $('sharedNote').hidden = !shared;
  $('sharedNote').innerHTML = isAdmin
    ? 'Dette er en <strong>felles side</strong>. <strong>Lagre</strong> endrer bare denne maskinen – <strong>Lagre for alle</strong> sender endringen ut til alle.'
    : 'Dette er en <strong>felles side</strong>. Endringene du gjør her gjelder bare denne maskinen – den delte listen blir ikke rørt.';
  $('fReset').hidden = !(shared && data.overrides[id]);
  $('fDelete').style.display = page ? '' : 'none';
  $('fDelete').textContent = 'Skjul';
  $('fDelete').title = 'Tar siden ut av menyen på denne maskinen. Du finner den igjen nederst i menyen under «skjulte sider».';

  // Som admin kan endringen sendes ut til alle
  $('fPlattformRad').hidden = !(isAdmin && shared);
  $('fPlattform').value = (page && page.plattform) || 'begge';
  $('fPublish').hidden = !isAdmin;
  $('fPublish').textContent = page ? 'Lagre for alle' : 'Legg til for alle';
  $('fSave').textContent = isAdmin && !page ? 'Bare meg' : 'Lagre';
  $('fDeleteAll').hidden = !(isAdmin && shared);
  $('fHideAll').hidden = !(isAdmin && shared);
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
  const group = $('fGroup').value.trim() || 'Annet';
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
    // Felles sider blir skjult, ikke slettet – de kommer tilbake ved neste synk ellers
    data.overrides[editingId] = { ...(data.overrides[editingId] || {}), hidden: true };
  } else {
    // Egne sider blir lagt i papirkurven, ikke kastet. Da kan de hentes
    // frem igjen fra menyen i stedet for å være borte for godt.
    const side = data.pages.find((p) => p.id === editingId);
    if (side) {
      // slettaTid heter slik i pages.json fra før – nøkkelen beholder navnet.
      data.deleted = [{ ...side, slettaTid: Date.now() }, ...(data.deleted || [])].slice(0, 25);
    }
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

// Fjerner den lokale overstyringen så siden følger den delte listen igjen
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

// En fast plass å lete etter alt som er tatt ut av menyen. Denne står
// alltid, også når den er tom – ellers vet man ikke hvor man skal se.
function renderHidden() {
  $('hiddenAllList').hidden = true;

  const wrap = $('hiddenList');
  wrap.innerHTML = '';
  wrap.hidden = false;

  const label = document.createElement('div');
  label.className = 'hidden-label';
  label.textContent = 'Skjulte og slettede sider';
  wrap.appendChild(label);

  const rader = [
    ...hiddenShared().map((p) => ({ p, tekst: 'Vis igjen', gjør: () => unhideShared(p.id) })),
    ...(isAdmin
      ? (data.shared || [])
          .filter((p) => p.hidden)
          .map((p) => ({ p, tekst: 'Vis for alle', merke: 'skjult for alle', gjør: () => showForAll(p.id) }))
      : []),
    ...(isAdmin
      ? (data.shared || []).filter(barePaaMobil).map((p) => ({
          p, tekst: 'Endre', merke: 'bare mobil',
          gjør: async () => { $('settingsModal').hidden = true; openModal(p.id); }
        }))
      : []),
    ...(data.deleted || []).map((p) => ({
      p, tekst: 'Hent tilbake', merke: 'slettet', gjør: () => gjenopprettSide(p.id)
    }))
  ];

  if (!rader.length) {
    const tom = document.createElement('div');
    tom.className = 'settings-info';
    tom.textContent = 'Ingenting er skjult eller slettet. Sider du tar bort, havner her.';
    wrap.appendChild(tom);
    return;
  }

  for (const { p, tekst, merke, gjør } of rader) {
    const row = document.createElement('div');
    row.className = 'hidden-row';
    const name = document.createElement('span');
    name.textContent = merke ? `${p.name} (${merke})` : p.name;
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.type = 'button';
    btn.textContent = tekst;
    btn.addEventListener('click', async () => { await gjør(); renderHidden(); });
    row.append(name, btn);
    wrap.appendChild(row);
  }
}

/* ---------- Vedlegg ---------- */
// Filer som lastes ned fra en side, havner her, klare til å dras rett
// inn i en annen side. Etter at filen er dratt over, blir den slettet.
let vedlegg = [];
let slettTimer = null;

const visStørrelse = (b) =>
  b >= 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB';

function renderTray() {
  const boks = $('tray');
  if (!vedlegg.length) { boks.hidden = true; return; }

  const siste = vedlegg[0];
  boks.hidden = false;
  $('trayName').textContent = siste.name;
  $('traySize').textContent = visStørrelse(siste.size);
  $('trayFile').classList.remove('brukt');
  $('trayLabel').textContent = 'Klar til å dra over';
  // Navnet blir ofte for langt for kortet, så hele står i hjelpeteksten
  $('trayFile').title = `${siste.name}\nDra filen inn i en annen side`;

  const mer = $('trayMore');
  mer.innerHTML = '';
  if (vedlegg.length > 1) {
    mer.append(`${vedlegg.length - 1} eldre fil${vedlegg.length > 2 ? 'er' : ''} · `);
  }
  const åpne = document.createElement('button');
  åpne.textContent = 'åpne';
  åpne.title = `Åpne ${siste.name}`;
  åpne.addEventListener('click', () => window.hm.openAttachment(siste.path));
  mer.appendChild(åpne);

  mer.append(' · ');

  const mappe = document.createElement('button');
  mappe.textContent = 'åpne mappen';
  mappe.title = siste.path;
  mappe.addEventListener('click', () => window.hm.revealAttachment(siste.path));
  mer.appendChild(mappe);
}

async function refreshTray() {
  vedlegg = await window.hm.listAttachments();
  renderTray();
}

$('trayFile').addEventListener('dragstart', (e) => {
  if (!vedlegg.length) return;
  // Electron tar over dradraget, så nettleserens eget må stoppes
  e.preventDefault();
  window.hm.dragAttachment(vedlegg[0].path);
});

// Vi får ikke vite om slippet faktisk gikk gjennom, så filen blir liggende
// noen sekunder med mulighet for å angre før den blir slettet.
$('trayFile').addEventListener('dragend', () => startSletting());

function startSletting() {
  if (!vedlegg.length || slettTimer) return;
  const fil = vedlegg[0];
  $('trayFile').classList.add('brukt');

  let igjen = 6;
  const tikk = () => {
    $('trayLabel').textContent = `Sletter om ${igjen} s`;
    const mer = $('trayMore');
    mer.innerHTML = '';
    const angre = document.createElement('button');
    angre.textContent = 'Angre';
    angre.addEventListener('click', stoppSletting);
    mer.appendChild(angre);
  };
  tikk();

  slettTimer = setInterval(async () => {
    igjen -= 1;
    if (igjen > 0) return tikk();
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

/* ---------- Lagret innlogging ---------- */
// Renderer kjenner bare til HVILKE sider som har innlogging, og brukernavnet.
// Passordene ligger kryptert i hovedprosessen og kommer aldri hit.
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
    ? `Lagret for ${l.user || '(uten brukernavn)'} på ${l.origin}`
    : felles
      ? `Bruker den felles innloggingen (${felles.user || 'uten brukernavn'}). Legg inn her for å bruke noe annet på denne siden.`
      : 'Ingen innlogging lagret for denne siden.';
}

function visFellesStatus() {
  const f = logins[FELLES];
  $('sLoginState').textContent = f
    ? `Lagret som ${f.user || '(uten brukernavn)'} – brukes på alle sidene.`
    : 'Ingen felles innlogging lagret.';
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

// Kjøres bare når brukeren trykker på nøkkelknappen – aldri av seg selv
async function fyllInnlogging() {
  const wv = activeWebview();
  if (!wv || !activeId || !harInnlogging(activeId)) return;
  const knapp = $('btnFill');
  try {
    const res = await window.hm.fillLogin({ id: activeId, webContentsId: wv.getWebContentsId() });
    if (!res.ok) { alert(res.error); return; }
    if (!res.felt) {
      alert('Fant ikke noe innloggingsskjema på denne siden.');
      return;
    }
    // Kort kvittering på at det gikk
    knapp.classList.add('fylt');
    setTimeout(() => knapp.classList.remove('fylt'), 1200);
  } catch {
    alert('Siden er ikke klar ennå. Prøv igjen om et øyeblikk.');
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
    p.textContent = aktiv.help || 'Ingen forklaring er lagt inn for denne siden ennå.';
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
    else { b.textContent = 'Ingen forklaring lagt inn ennå.'; b.className = 'tom'; }
    tekst.append(n, b);
    rad.appendChild(tekst);
    liste.appendChild(rad);
  }

  $('helpAdminHint').hidden = !isAdmin;
  $('helpModal').hidden = false;
}

/* ---------- Admin: endre den felles listen for alle ---------- */
// Gjør den interne listen om til formatet som ligger i sider.json. Står i
// delt.js, der det er testet – og der felt appen ikke kjenner blir tatt vare
// på i stedet for å bli slettet ved publisering.
const { tilDelt: toSharedJson } = window.HM_DELT;

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
  setPublishStatus('Sendt. Alle får endringen ved neste synk.', 'ok');
  return true;
}

async function publishModal() {
  const name = $('fName').value.trim();
  const url = normalizeUrl($('fUrl').value);
  if (!name || !url) { $(name ? 'fUrl' : 'fName').focus(); return; }
  const group = $('fGroup').value.trim() || 'Annet';
  const help = $('fHelp').value.trim();

  const typed = $('fImageUrl').value.trim();
  if (typed) pickedImage = await shrinkImage(normalizeUrl(typed));

  const plattform = $('fPlattform').value || 'begge';
  const felt = { name, url, group, color: pickedColor, image: pickedImage, help, plattform };
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

  // Lokale overstyringer og lokale kopier ville bare skygge for det nye
  if (editingId && isShared(editingId)) delete data.overrides[editingId];
  else if (editingId) data.pages = data.pages.filter((p) => p.id !== editingId);

  // Vi vet hva vi nettopp lagret, så vi bruker det med en gang i stedet for
  // å vente på at GitHub skal servere den nye filen
  data.shared = list.map((p) => ({ ...p, shared: true }));
  data.settings.lastSync = new Date().toISOString();

  await persist();
  closeModal();
  renderNav();
  showSyncStatus(`${data.shared.length} felles sider · ${lastSyncText()}`);
}

// Skjuler siden for alle, men lar oppsettet stå igjen i listen
async function hideForAll(skjul = true) {
  if (!editingId || !isShared(editingId)) return;
  const page = findPage(editingId) || (data.shared || []).find((p) => p.id === editingId);
  const list = (data.shared || []).map((p) =>
    p.id === editingId ? { ...p, hidden: skjul } : p
  );
  const navn = page ? page.name : editingId;
  if (!(await publish(list, `${skjul ? 'Skjul' : 'Vis'} felles side: ${navn}`))) return;

  if (skjul) {
    viewport.querySelector(`webview[data-id="${CSS.escape(editingId)}"]`)?.remove();
    if (activeId === editingId) {
      activeId = null;
      $('empty').style.display = '';
      syncToolbar();
    }
  }
  data.shared = list.map((p) => ({ ...p, shared: true }));
  data.settings.lastSync = new Date().toISOString();
  await persist();
  closeModal();
  renderNav();
}

async function showForAll(id) {
  const list = (data.shared || []).map((p) => (p.id === id ? { ...p, hidden: false } : p));
  const page = (data.shared || []).find((p) => p.id === id);
  if (!(await publish(list, `Vis felles side: ${page ? page.name : id}`))) return;
  data.shared = list.map((p) => ({ ...p, shared: true }));
  await persist();
  renderNav();
  renderHidden();
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

// Sender hele listen du ser lokalt ut til alle: navn, adresser, grupper,
// farger og ikoner – også ikonene appen har hentet automatisk.
async function publishEverything() {
  const btn = $('sPublishAll');
  const list = (data.shared || []).map((p) => {
    const o = data.overrides[p.id] || {};
    if (o.hidden) return { ...p }; // skjult hos deg, men blir værende for de andre
    return { ...p, ...o, image: o.image || p.image || (data.icons || {})[p.id] || '' };
  });

  const størrelse = JSON.stringify(toSharedJson(list)).length;
  if (størrelse > 400000) {
    $('sInfo').textContent = 'Listen blir for stor (over 400 kB). Fjern noen bilder først.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sender…';
  const res = await window.hm.publishShared({
    pages: toSharedJson(list),
    message: 'Oppdater felles sideliste med ikoner og endringer'
  });
  btn.disabled = false;
  btn.textContent = 'Send alt ut til alle';

  if (!res.ok) { $('sInfo').textContent = res.error; return; }

  // Endringene er nå offisielle, så de lokale overstyringene har ingen funksjon
  for (const id of Object.keys(data.overrides)) {
    if (!data.overrides[id].hidden) delete data.overrides[id];
  }
  data.shared = list.map((p) => ({ ...p, shared: true }));
  data.settings.lastSync = new Date().toISOString();
  await persist();
  renderNav();
  $('sInfo').textContent =
    `Sendt. ${list.length} sider (${Math.round(størrelse / 1024)} kB) gjelder nå for alle.`;
}

async function refreshAdmin() {
  const res = await window.hm.adminStatus();
  isAdmin = !!res.admin;
  const state = $('adminState');
  if (isAdmin) {
    state.innerHTML = '';
    state.append(
      res.login ? `Innlogget som ${res.login}.` : 'Admin (får ikke kontakt med GitHub nå).'
    );
    const badge = document.createElement('span');
    badge.className = 'admin-badge';
    badge.textContent = 'admin';
    state.appendChild(badge);
    $('sClearToken').hidden = false;
    $('adminTokenRow').hidden = true;
    $('sPublishAll').hidden = false;
  } else {
    state.textContent = res.error || 'Ikke admin på denne maskinen.';
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
  if (!t) return 'Ikke hentet ennå';
  const d = new Date(t);
  return 'Sist hentet ' + d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// En overstyring som er blitt lik den felles listen har ingen funksjon lenger,
// og ville bare bli stående igjen med en rød «endret»-prikk
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
    if (!quiet) showSyncStatus('Ingen delt liste er satt opp', true);
    return;
  }
  if (!quiet) showSyncStatus('Henter…');
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
  const endret = Object.values(data.overrides || {}).filter((o) => !o.hidden).length;
  $('sInfo').textContent =
    `${(data.shared || []).length} felles sider · ${lastSyncText()}` +
    (endret ? ` · ${endret} endret lokalt` : '');
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

/* ---------- Hendelser ---------- */
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
$('fHideAll').addEventListener('click', () => hideForAll(true));

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
  // Har appen allerede fanget opp ikonet da siden ble lastet, er det det beste vi har
  const fanget = editingId ? (data.icons || {})[editingId] : '';
  if (fanget) { pickedImage = fanget; renderIconPreview(); return; }

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

// QR-koden til mobilappen. Lenken kopieres fra dialogen, så det er alltid
// samme adresse som står der – og som testen sjekker at QR-koden leder til.
$('btnMobil').addEventListener('click', () => { $('mobilModal').hidden = false; });
$('mobilLukk').addEventListener('click', () => { $('mobilModal').hidden = true; });
$('mobilModal').addEventListener('click', (e) => {
  if (e.target === $('mobilModal')) $('mobilModal').hidden = true;
});
$('mobilKopier').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('mobilAdresse').textContent.trim());
  $('mobilKopier').textContent = 'Kopiert';
  setTimeout(() => { $('mobilKopier').textContent = 'Kopier lenke'; }, 1500);
});

/* ---------- Hva er nytt ---------- */
// Hele loggen, nyeste først. Versjoner brukeren ikke har sett før, er merket NY.
async function åpneNytt(status) {
  const s = status || await window.hm.nyttStatus();
  const liste = $('nyttListe');
  liste.innerHTML = '';
  for (const o of s.logg) {
    const blokk = document.createElement('section');
    blokk.className = 'nytt-versjon';
    const h = document.createElement('h3');
    h.textContent = o.versjon;
    const dato = document.createElement('span');
    dato.className = 'nytt-dato';
    dato.textContent = new Date(o.dato).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
    h.appendChild(dato);
    if (s.nye.includes(o.versjon)) {
      const ny = document.createElement('span');
      ny.className = 'nytt-merke';
      ny.textContent = 'NY';
      h.appendChild(ny);
    }
    const ul = document.createElement('ul');
    for (const p of o.punkt) {
      const li = document.createElement('li');
      li.textContent = p;
      ul.appendChild(li);
    }
    blokk.append(h, ul);
    liste.appendChild(blokk);
  }
  $('nyttModal').hidden = false;
}

$('version').addEventListener('click', () => åpneNytt());
$('nyttLukk').addEventListener('click', () => { $('nyttModal').hidden = true; });
$('nyttModal').addEventListener('click', (e) => {
  if (e.target === $('nyttModal')) $('nyttModal').hidden = true;
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
  data.deleted = data.deleted || [];
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
    else if (!$('mobilModal').hidden) $('mobilModal').hidden = true;
    else if (!$('nyttModal').hidden) $('nyttModal').hidden = true;
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
  if (event === 'available') showUpdate(`Laster ned versjon ${d.version}…`);
  if (event === 'progress') showUpdate(`Laster ned oppdatering… ${d.percent} %`);
  if (event === 'ready') showUpdate(`Versjon ${d.version} er klar.`, true);
  if (event === 'error') $('updateBox').hidden = true; // f.eks. ingen nettilgang
});

$('updateBtn').addEventListener('click', () => window.hm.installUpdate());

$('sCheckUpdate').addEventListener('click', async () => {
  const btn = $('sCheckUpdate');
  btn.disabled = true;
  btn.textContent = 'Ser etter…';
  const res = await window.hm.checkUpdate();
  const naa = await window.hm.appVersion();
  if (!res.ok) {
    btn.textContent = 'Se etter oppdatering';
    $('sInfo').textContent = res.error;
  } else if (res.version && res.version !== naa) {
    btn.textContent = 'Laster ned…';
    $('sInfo').textContent = `Versjon ${res.version} lastes ned i bakgrunnen.`;
  } else {
    btn.textContent = 'Se etter oppdatering';
    $('sInfo').textContent = `Du har nyeste versjon (${naa}).`;
  }
  btn.disabled = false;
});

/* ---------- Oppstart ---------- */
(async function init() {
  data = await window.hm.loadData();
  data.shared = data.shared || [];
  data.overrides = data.overrides || {};
  data.icons = data.icons || {};
  data.deleted = data.deleted || [];
  // Ikoner lagret av eldre versjoner er bare 64 px og blir uskarpe i det store
  // formatet. Vi kaster dem, så blir de hentet på nytt i full oppløsning.
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

  $('version').textContent = 'Versjon ' + (await window.hm.appVersion()) + ' · Hva er nytt';
  // Første oppstart etter en oppdatering: vis hva som er nytt, én gang.
  const nytt = await window.hm.nyttStatus();
  if (nytt.vis) åpneNytt(nytt);
  await window.hm.nyttSett();
  await refreshAdmin();
  await refreshLogins();
  await refreshTray();
})();
