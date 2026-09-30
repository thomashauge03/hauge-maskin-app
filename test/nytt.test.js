/* Hva er nytt – det appen viser etter en oppdatering. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hvaErNytt, somMarkdown } = require('../src/nytt.js');

const logg = [
  { versjon: '2.8.0', dato: '2026-09-30', punkt: ['c'] },
  { versjon: '2.7.0', dato: '2026-09-30', punkt: ['b'] },
  { versjon: '2.6.0', dato: '2026-09-07', punkt: ['a'] }
];

test('etter en oppdatering blir alle versjonene siden sist merket som nye', () => {
  assert.deepEqual(
    hvaErNytt({ logg, gjeldende: '2.8.0', sistSett: '2.6.0', hadData: true }),
    { vis: true, nye: ['2.8.0', '2.7.0'] }
  );
});

test('samme versjon som sist: ingenting vises', () => {
  assert.deepEqual(
    hvaErNytt({ logg, gjeldende: '2.8.0', sistSett: '2.8.0', hadData: true }),
    { vis: false, nye: [] }
  );
});

test('ny installasjon: ingenting vises', () => {
  assert.deepEqual(
    hvaErNytt({ logg, gjeldende: '2.8.0', sistSett: null, hadData: false }),
    { vis: false, nye: [] }
  );
});

/* Versjoner fra før loggen kom, lagret ikke hva som sist var sett. */
test('første gang med loggen hos en som allerede hadde appen: bare denne versjonen er ny', () => {
  assert.deepEqual(
    hvaErNytt({ logg, gjeldende: '2.8.0', sistSett: null, hadData: true }),
    { vis: true, nye: ['2.8.0'] }
  );
});

test('2.10.0 kommer etter 2.9.0', () => {
  const l = [
    { versjon: '2.10.0', dato: '2027-01-01', punkt: ['x'] },
    { versjon: '2.9.0', dato: '2026-12-01', punkt: ['y'] }
  ];
  assert.deepEqual(
    hvaErNytt({ logg: l, gjeldende: '2.10.0', sistSett: '2.9.0', hadData: true }),
    { vis: true, nye: ['2.10.0'] }
  );
});

test('en eldre versjon enn den som sist var sett, viser ingenting', () => {
  assert.deepEqual(
    hvaErNytt({ logg, gjeldende: '2.7.0', sistSett: '2.8.0', hadData: true }),
    { vis: false, nye: [] }
  );
});

test('oppføringer nyere enn appen blir ikke merket som nye', () => {
  assert.deepEqual(
    hvaErNytt({ logg, gjeldende: '2.7.0', sistSett: '2.6.0', hadData: true }),
    { vis: true, nye: ['2.7.0'] }
  );
});

test('utgivelsesnotatet har alle punktene som kulepunkter, i samme rekkefølge', () => {
  const md = somMarkdown({ versjon: '2.8.0', dato: '2026-09-30', punkt: ['Første', 'Andre'] });
  assert.deepEqual(md.split('\n').filter((l) => l.startsWith('- ')), ['- Første', '- Andre']);
});
