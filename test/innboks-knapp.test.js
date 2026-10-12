/* Innboks-knappen, og kanalene mellom grensesnittet og hovedprosessen. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const les = (fil) => fs.readFileSync(path.join(__dirname, '..', 'src', fil), 'utf8');
const HTML = les('index.html');

test('Innboks-knappen står i toppen av sidemenyen, til høyre for navnet på siden som er åpen', () => {
  const rad = HTML.indexOf('class="brand-rad"');
  const standard = HTML.indexOf('id="brandDefault"');
  const aktiv = HTML.indexOf('id="brandActive"');
  const knapp = HTML.indexOf('id="btnInnboks"');
  const tall = HTML.indexOf('id="innboksTall"');
  const sok = HTML.indexOf('class="search-wrap"');
  assert.ok(rad !== -1 && knapp !== -1 && tall !== -1, 'mangler brand-rad, btnInnboks eller innboksTall');
  assert.ok(rad < standard && standard < aktiv && aktiv < knapp && knapp < tall && tall < sok, 'feil rekkefølge');
  assert.ok(HTML.indexOf('</button>', knapp) > tall, 'tallet skal stå inne i knappen');
});

/* Reglene for stil og omtegning: klassen som gjør knappen rød og levende, og et merke som hopper på nytt. */
const CSS = les('styles.css');
const RENDERER = les('renderer.js');
const regel = (velger) => {
  const i = CSS.indexOf(velger + ' {');
  assert.ok(i !== -1, 'mangler regelen ' + velger);
  return CSS.slice(i, CSS.indexOf('}', i));
};

test('med uleste får knappen rød ramme og en ring som pulserer, og konvolutten rister', () => {
  const knapp = regel('.innboks-knapp.har-uleste');
  assert.match(knapp, /border-color: var\(--red\)/);
  assert.match(knapp, /animation: innboks-puls 1\.6s [a-z-]+ infinite/);
  assert.match(CSS, /@keyframes innboks-puls \{[^@]*box-shadow/);
  assert.match(regel('.innboks-knapp.har-uleste svg'), /animation: innboks-rist 4\.5s [a-z-]+ infinite/);
  assert.match(CSS, /@keyframes innboks-rist \{[^@]*rotate/);
  assert.match(regel('.innboks-tall'), /box-shadow: 0 0 0 [\d.]+px #fff/, 'merket har en hvit kant');
  assert.match(regel('.innboks-tall.hopp'), /animation: innboks-hopp/);
  assert.match(CSS, /@keyframes innboks-hopp \{[^@]*scale/);
});

test('uten bevegelse står knappen stille med fast rød glød', () => {
  const blokker = CSS.split('@media (prefers-reduced-motion: reduce)').slice(1).map((b) => b.slice(0, b.indexOf('\n}')));
  const innhold = blokker.find((b) => b.includes('.innboks-knapp.har-uleste'));
  assert.ok(innhold, 'mangler regel for redusert bevegelse');
  assert.match(innhold, /\.innboks-knapp\.har-uleste \{ animation: none; box-shadow: [^}]*#e2001a/);
  assert.match(innhold, /\.innboks-knapp\.har-uleste svg, \.innboks-tall\.hopp \{ animation: none; \}/);
});

test('grensesnittet setter klassen, lar merket hoppe på nytt og bruker navnet fra innboks-felles.js', () => {
  const i = RENDERER.indexOf('function visInnboks(');
  const kropp = RENDERER.slice(i, RENDERER.indexOf('\n}', i));
  assert.match(kropp, /classList\.toggle\('har-uleste', !!tekst\)/);
  assert.match(kropp, /if \(skalHoppe\(forrigeVist, vist\)\) \{\s+[^}]*classList\.remove\('hopp'\);\s+void tall\.offsetWidth;\s+tall\.classList\.add\('hopp'\);/,
    'klassen fjernes, en omtegning tvinges, og klassen legges på igjen');
  assert.match(kropp, /const navn = knappNavn\(innboks\.koblet, innboks\.uleste\);/);
  assert.match(kropp, /tegnOverlay\(tekst\);/, 'merket på ikonet i oppgavelinja er som før');
});

/* De røde tallene på systemene i menyen. */
const kroppTil = (navn) => {
  const i = RENDERER.indexOf('function ' + navn + '(');
  assert.ok(i !== -1, 'mangler ' + navn);
  return RENDERER.slice(i, RENDERER.indexOf('\n}', i));
};

test('tallet i menyen ser ut som merket på Innboks-knappen, og står til høyre i raden', () => {
  const tall = regel('.nav-tall');
  assert.match(tall, /background: var\(--red\)/);
  assert.match(tall, /color: #fff/);
  assert.match(tall, /font-weight: 800/);
  assert.match(tall, /box-shadow: 0 0 0 [\d.]+px #fff/, 'samme hvite kant som merket på knappen');
  assert.match(tall, /flex: 0 0 auto/);
  assert.match(regel('.nav-name'), /flex: 1/, 'navnet fyller raden, så tallet havner ytterst til høyre');
  assert.match(regel('.nav-tall.hopp'), /animation: innboks-hopp/);
});

test('uten bevegelse hopper ikke tallene i menyen', () => {
  const blokker = CSS.split('@media (prefers-reduced-motion: reduce)').slice(1).map((b) => b.slice(0, b.indexOf('\n}')));
  assert.ok(blokker.some((b) => /\.nav-tall\.hopp \{ animation: none; \}/.test(b)));
});

test('menyen tegner tallet med vistAntall, «99+» og navnet for skjermlesere', () => {
  const kropp = kroppTil('tegnSideTall');
  assert.match(kropp, /const n = vistAntall\(innboks\.koblet, antall\);/, 'uten kobling vises ingen tall');
  assert.match(kropp, /tall\.textContent = sideTallTekst\(n\);/);
  assert.match(kropp, /setAttribute\('aria-label', sideTallNavn\(btn\.dataset\.navn, n\)\)/);
  assert.match(kropp, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(kropp, /classList\.remove\('hopp'\);\s+void tall\.offsetWidth;\s+tall\.classList\.add\('hopp'\);/);
  assert.match(kropp, /removeAttribute\('aria-label'\)/, 'navnet blir vanlig igjen når tallet forsvinner');
});

test('menyen røres bare når et tall endrer seg, og tallet hopper bare når det øker', () => {
  const kropp = kroppTil('oppdaterSideTall');
  assert.match(kropp, /if \(nokkel === sideTallNokkel\) return;/);
  assert.match(kropp, /skalHoppe\(forrige\[id\] \|\| 0, nye\[id\] \|\| 0\)/);
  assert.doesNotMatch(kropp, /renderNav\(/, 'hele menyen tegnes ikke på nytt');
  assert.match(kroppTil('beregnSideTall'), /innboks\.koblet \? antallPerSide\(allPages\(\), innboks\.ulestePerKilde, innboks\.kildeRot\) : \{\}/);
  assert.match(kroppTil('visInnboks'), /oppdaterSideTall\(\);/);
  const nav = kroppTil('renderNav');
  assert.match(nav, /sideTall = beregnSideTall\(\);/);
  assert.match(nav, /btn\.dataset\.id = p\.id;\s+btn\.dataset\.navn = p\.name;\s+tegnSideTall\(btn, sideTall\[p\.id\] \|\| 0, false\);/);
});

/* Grensesnittet kjørt for seg, med en liten falsk DOM: tallene kommer og går med tilstanden fra
   vakta, og samme tilstand to ganger rører ikke menyen. */
test('tallene i menyen følger tilstanden fra vakta', () => {
  const F = require('../src/innboks-felles.js');
  const lagEl = (tag) => {
    const el = {
      tag, barn: [], attr: {}, dataset: {}, klasser: new Set(), textContent: '', offsetWidth: 0, forelder: null,
      classList: {
        add: (k) => el.klasser.add(k), remove: (k) => el.klasser.delete(k), contains: (k) => el.klasser.has(k),
      },
      setAttribute: (k, v) => { el.attr[k] = String(v); },
      removeAttribute: (k) => { delete el.attr[k]; },
      appendChild: (b) => { b.forelder = el; el.barn.push(b); endringer += 1; return b; },
      remove: () => { const f = el.forelder; f.barn = f.barn.filter((b) => b !== el); endringer += 1; },
      querySelector: (v) => el.barn.find((b) => '.' + b.className === v) || null,
    };
    return el;
  };
  let endringer = 0;
  const rader = ['shared:utleie', 'shared:utleie-kundeside', 'shared:r-rlager'].map((id) => {
    const r = lagEl('button');
    r.dataset.id = id;
    r.dataset.navn = id.slice(7);
    return r;
  });
  const nav = { querySelectorAll: () => rader };
  const sider = [
    { id: 'shared:utleie', name: 'Utleie', url: 'https://utleie-hauge-maskin.vercel.app/admin' },
    { id: 'shared:utleie-kundeside', name: 'Utleie Kundeside', url: 'https://utleie-hauge-maskin.vercel.app/' },
    { id: 'shared:r-rlager', name: 'Rørlager', url: 'https://rorlager.vercel.app/admin' },
  ];
  const start = RENDERER.indexOf('let sideTall = {};');
  const slutt = RENDERER.indexOf('function renderNav(');
  const kode = 'let innboks = { koblet: false };\n' + RENDERER.slice(start, slutt) +
    '\n;({ sett: (t) => { innboks = t; oppdaterSideTall(); } })';
  const ctx = {
    document: { createElement: lagEl }, nav, allPages: () => sider,
    vistAntall: F.vistAntall, skalHoppe: F.skalHoppe, antallPerSide: F.antallPerSide,
    sideTallTekst: F.sideTallTekst, sideTallNavn: F.sideTallNavn,
  };
  const { sett } = vm.runInNewContext(kode, ctx, { filename: 'renderer.js' });
  const rot = { utleie: 'https://utleie-hauge-maskin.vercel.app/admin/', rorlager: 'https://rorlager.vercel.app/admin' };
  const tall = (r) => (r.barn.find((b) => b.className === 'nav-tall') || {}).textContent;

  sett({ koblet: true, ulestePerKilde: { utleie: 3 }, kildeRot: rot });
  assert.equal(tall(rader[0]), '3');
  assert.equal(rader[0].attr['aria-label'], 'utleie, 3 nye i Innboks');
  assert.ok(rader[0].barn[0].klasser.has('hopp'), 'tallet hopper når det dukker opp');
  assert.equal(tall(rader[1]), undefined, 'kundesiden får ikke tallet til admin-siden');
  assert.equal(tall(rader[2]), undefined);

  const foer = endringer;
  sett({ koblet: true, ulestePerKilde: { utleie: 3 }, kildeRot: rot });
  assert.equal(endringer, foer,'samme tall hvert 15. sekund rører ikke menyen');

  rader[0].barn[0].klasser.delete('hopp');
  sett({ koblet: true, ulestePerKilde: { utleie: 150, rorlager: 1 }, kildeRot: rot });
  assert.equal(tall(rader[0]), '99+');
  assert.equal(rader[0].attr['aria-label'], 'utleie, 150 nye i Innboks');
  assert.ok(rader[0].barn[0].klasser.has('hopp'), 'tallet hopper når det øker');
  assert.equal(tall(rader[2]), '1');

  rader[0].barn[0].klasser.delete('hopp');
  sett({ koblet: true, ulestePerKilde: { utleie: 2, rorlager: 1 }, kildeRot: rot });
  assert.equal(tall(rader[0]), '2');
  assert.ok(!rader[0].barn[0].klasser.has('hopp'), 'et tall som går ned, hopper ikke');

  sett({ koblet: false, ulestePerKilde: { utleie: 2, rorlager: 1 }, kildeRot: rot });
  assert.deepEqual(rader.map(tall), [undefined, undefined, undefined], 'uten kobling ingen tall');
  assert.equal(rader[0].attr['aria-label'], undefined);
});

test('innboks-felles.js lastes før renderer.js, som bruker den', () => {
  const felles = HTML.indexOf('<script src="innboks-felles.js"></script>');
  assert.ok(felles !== -1 && felles < HTML.indexOf('<script src="renderer.js"></script>'));
});

test('preload gir grensesnittet tilstanden, lenkene og merket fra Innboks på egne kanaler', async () => {
  let hm = null;
  const invoke = [];
  const lyttere = {};
  const electron = {
    contextBridge: { exposeInMainWorld: (navn, api) => { if (navn === 'hm') hm = api; } },
    ipcRenderer: {
      invoke: (kanal, ...args) => { invoke.push([kanal, ...args]); return Promise.resolve(null); },
      on: (kanal, fn) => { lyttere[kanal] = fn; },
      send: () => {},
    },
  };
  vm.runInNewContext(les('preload.js'), { require: () => electron }, { filename: 'preload.js' });
  await hm.innboksTilstand();
  await hm.innboksMerke('data:image/png;base64,AAAA');
  await hm.innboksMerke(null);
  assert.deepEqual(invoke, [['innboks:hent-tilstand'], ['innboks:merke', 'data:image/png;base64,AAAA'], ['innboks:merke', null]]);
  const fikk = [];
  hm.onInnboksTilstand((t) => fikk.push(['tilstand', t]));
  hm.onInnboksAapne((m) => fikk.push(['aapne', m]));
  lyttere['innboks:tilstand']({}, { koblet: true, uleste: 3 });
  lyttere['innboks:aapne']({}, { sideId: 'shared:innboks', lenke: null });
  assert.deepEqual(fikk, [['tilstand', { koblet: true, uleste: 3 }], ['aapne', { sideId: 'shared:innboks', lenke: null }]]);
});

test('hovedprosessen godtar tilstand og merke bare fra hovedvinduet', () => {
  const main = les('main.js');
  for (const kanal of ['innboks:hent-tilstand', 'innboks:merke']) {
    assert.match(main, new RegExp("ipcMain\\.handle\\('" + kanal + "', \\(e(, [a-zA-Z]+)?\\) => \\{\\s+if \\(!fraHovedvinduet\\(e\\)\\)"), kanal);
  }
});
