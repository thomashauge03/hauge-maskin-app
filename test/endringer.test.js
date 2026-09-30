/* Endringsloggen, src/endringer.json. Kjøres med `npm test` – og før
   `npm run dist`, så en versjon ikke kan bygges uten at loggen sier hva som
   er nytt i den. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const logg = require('../src/endringer.json');
const { version } = require('../package.json');
const { sammenlign } = require('../src/nytt.js');

test('loggen har en oppføring for versjonen som bygges', () => {
  assert.ok(
    logg.some((o) => o.versjon === version),
    `skriv hva som er nytt i ${version} øverst i src/endringer.json`
  );
});

test('loggen står med nyeste versjon først, hver versjon én gang', () => {
  for (let i = 1; i < logg.length; i++) {
    assert.ok(sammenlign(logg[i - 1].versjon, logg[i].versjon) > 0,
      `${logg[i - 1].versjon} skal stå før ${logg[i].versjon}`);
  }
});

test('hver oppføring har dato og minst ett punkt', () => {
  for (const o of logg) {
    assert.match(o.dato, /^\d{4}-\d{2}-\d{2}$/, o.versjon);
    assert.ok(o.punkt.length > 0 && o.punkt.every((p) => typeof p === 'string' && p.trim()), o.versjon);
  }
});
