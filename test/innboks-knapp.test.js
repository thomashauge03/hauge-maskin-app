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
