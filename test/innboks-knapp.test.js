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
