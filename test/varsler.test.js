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
