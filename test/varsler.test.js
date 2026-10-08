/* Varslene fra Innboks i hovedprosessen. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../package.json');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

test('AppUserModelId er lik appId, ellers viser ikke Windows varslene fra den installerte appen', () => {
  const m = /app\.setAppUserModelId\('([^']+)'\)/.exec(MAIN);
  assert.ok(m, 'main.js må kalle app.setAppUserModelId');
  assert.equal(m[1], build.appId);
  assert.ok(MAIN.indexOf('app.setAppUserModelId(') < MAIN.indexOf('app.whenReady()'), 'id-en må settes før appen er klar');
});

test('vakta henter, kvitterer og merker lest med RPC-ene i navet', () => {
  for (const rpc of ['enhet_hent', 'enhet_kvitter', 'enhet_les']) {
    assert.match(MAIN, new RegExp("Innboks\\.kallRpc\\(fetch, [a-zA-Z]+, '" + rpc + "'"), rpc);
  }
});

test('et klikk på varselet viser vinduet og går til målet fra maalForVarsel', () => {
  assert.match(MAIN, /varsel\.on\('click', \(\) => \{\s+glem\(\);\s+aapneFraVarsel\(v\);/);
  assert.match(MAIN, /visVindu\(\(\) => sendTilVindu\('innboks:aapne', Lenke\.maalForVarsel\(v, readData\(\)\)\)\)/);
});

test('vakta startes ved oppstart og ved kobling, og stoppes ved frakobling', () => {
  assert.match(MAIN, /createWindow\(\);\s+if \(innboksKobling\) vakt\.start\(\);/);
  assert.match(MAIN, /settInnboksTilstand\(\{ koblet: true \}\);\s+vakt\.stopp\(\);\s+vakt\.start\(\);/);
  assert.match(MAIN, /async function kobleFraInnboks\(\) \{\s+vakt\.stopp\(\);/);
});

/* Windows sender 'close' også når varselet glir ut av skjermen og blir liggende i
   varslingssenteret. Slippes referansen da, ryddes objektet bort, og et klikk senere gjør ingenting. */
test('varslene holdes til klikk eller feil, ikke til close, og bare de 50 nyeste', () => {
  assert.doesNotMatch(MAIN, /varsel\.on\('close'/);
  assert.match(MAIN, /varsel\.on\('failed', glem\);/);
  assert.match(MAIN, /const innboksVarsler = Innboks\.lagHusk\(50\);/);
  assert.match(MAIN, /innboksVarsler\.legg\(varsel\);/);
});

test('frakobling sletter filen før nøkkelen glemmes, og en feil gir svar uten hemmeligheter', () => {
  const m = /async function kobleFraInnboks\(\) \{([\s\S]*?)\n\}/.exec(MAIN);
  assert.ok(m, 'fant ikke kobleFraInnboks');
  const kropp = m[1];
  assert.ok(kropp.indexOf('fs.rmSync(innboksFil()') < kropp.indexOf('innboksKobling = null'), 'filen må slettes først');
  assert.match(kropp, /catch \{\s+return \{ ok: false, feil: '[^']+' \};/);
  assert.doesNotMatch(kropp, /feil: [^']*(nokkel|innboksFil|\.message)/);
});

test('når ikonet i systemstatusfeltet fjernes og vinduet er skjult, vises vinduet', () => {
  assert.match(MAIN, /statusfelt\.destroy\(\);\s+statusfelt = null;\s+(\/\/.*\s+)*if \(!avslutter && \(!mainWindow \|\| mainWindow\.isDestroyed\(\) \|\| !mainWindow\.isVisible\(\)\)\) visVindu\(\);/);
});

test('visVindu venter til grensesnittet er lastet før meldingen sendes', () => {
  assert.match(MAIN, /if \(mainWindow\.webContents\.isLoading\(\)\) mainWindow\.webContents\.once\('did-finish-load', etterpaa\);\s+else etterpaa\(\);/);
});

test('en avslutning som stoppes av beforeunload, gjør at lukk igjen betyr skjul', () => {
  assert.match(MAIN, /contents\.on\('will-prevent-unload', \(\) => \{ avslutter = false; \}\);/);
});
