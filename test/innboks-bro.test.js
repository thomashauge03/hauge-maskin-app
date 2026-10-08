/* Broen til Innboks-fanen og hvordan hovedprosessen tar imot den. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BRO = fs.readFileSync(path.join(__dirname, '..', 'src', 'innboks-bro.js'), 'utf8');
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const KANALER = ['innboks-bro:status', 'innboks-bro:koble', 'innboks-bro:frakoble', 'innboks-bro:aapne'];

/* Broen kjører i en sandkasse der bare electron kan hentes. Testen gir den en falsk electron. */
function lastBro() {
  const eksponert = [];
  const kall = [];
  const electron = {
    contextBridge: { exposeInMainWorld: (navn, api) => { eksponert.push({ navn, api }); } },
    ipcRenderer: { invoke: (kanal, ...args) => { kall.push({ kanal, args }); return Promise.resolve({ ok: true }); } },
  };
  const hent = (modul) => {
    if (modul !== 'electron') throw new Error('broen skal bare bruke electron, ikke ' + modul);
    return electron;
  };
  vm.runInNewContext(BRO, { require: hent }, { filename: 'innboks-bro.js' });
  return { eksponert, kall };
}

test('broen gir Innboks nøyaktig status, koble, frakoble og aapne, og ingenting annet', () => {
  const { eksponert } = lastBro();
  assert.equal(eksponert.length, 1);
  assert.equal(eksponert[0].navn, 'hmApp');
  assert.deepEqual(Object.keys(eksponert[0].api), ['innboks']);
  assert.deepEqual(Object.keys(eksponert[0].api.innboks).sort(), ['aapne', 'frakoble', 'koble', 'status']);
});

test('hver funksjon går til sin egen kanal i hovedprosessen, med argumentet uendret', async () => {
  const { eksponert, kall } = lastBro();
  const bro = eksponert[0].api.innboks;
  const svar = { id: 'x', nokkel: 'y' };
  await bro.status();
  await bro.koble(svar);
  await bro.frakoble();
  await bro.aapne('https://rorlager.vercel.app/admin');
  assert.deepEqual(kall.map((k) => k.kanal), KANALER);
  assert.equal(kall[0].args.length, 0);
  assert.equal(kall[1].args[0], svar);
  assert.equal(kall[2].args.length, 0);
  assert.equal(kall[3].args[0], 'https://rorlager.vercel.app/admin');
});

test('hovedprosessen sjekker opphavet først i hver kanal broen bruker', () => {
  for (const kanal of KANALER) {
    const m = new RegExp("ipcMain\\.handle\\('" + kanal + "', (async )?\\(e(, [a-zA-Z]+)?\\) => \\{\\s+if \\(!fraInnboks\\(e\\)\\)").exec(MAIN);
    assert.ok(m, kanal + ' må begynne med fraInnboks(e)');
  }
});

test('alle faner får herdede innstillinger, og bare Innboks får broen', () => {
  assert.match(MAIN, /contents\.on\('will-attach-webview', \(_ev, webPreferences, params\) => \{/);
  assert.match(MAIN, /delete webPreferences\.preload;/);
  assert.match(MAIN, /webPreferences\.nodeIntegration = false;/);
  assert.match(MAIN, /webPreferences\.contextIsolation = true;/);
  assert.match(MAIN, /webPreferences\.sandbox = true;/);
  assert.match(MAIN, /if \(Lenke\.broSkalMed\(params\.src, Lenke\.innboksOpphav\(readData\(\)\)\)\) \{\s+webPreferences\.preload = path\.join\(__dirname, 'innboks-bro\.js'\);/);
});
