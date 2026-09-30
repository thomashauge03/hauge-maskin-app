/* Den felles sidelisten inn og ut av appen. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lesDelt, tilDelt, flettUkjente } = require('../src/delt.js');

const raa = {
  id: 'rorlager',
  name: 'Rørlager',
  url: 'https://rorlager.vercel.app/',
  nokkel: false,
  nytt: { a: 1 }
};

test('felt appen ikke kjenner, overlever en runde', () => {
  const ut = tilDelt(lesDelt([raa]))[0];
  assert.equal(ut.nokkel, false);
  assert.deepEqual(ut.nytt, { a: 1 });
});

test('lokale felt blir ikke sendt ut', () => {
  const ut = tilDelt(lesDelt([raa]))[0];
  assert.equal('shared' in ut, false);
  assert.equal('ekstra' in ut, false);
  assert.equal(ut.id, 'rorlager');
});

test('kjente felt går foran gamle verdier i ekstra', () => {
  const [side] = lesDelt([raa]);
  side.name = 'Nytt navn';
  assert.equal(tilDelt([side])[0].name, 'Nytt navn');
});

test('begge skrives ikke ut, pc og mobil gjør det', () => {
  const [a, b] = lesDelt([{ ...raa, plattform: 'pc' }, { ...raa, id: 'x' }]);
  assert.equal(tilDelt([a])[0].plattform, 'pc');
  assert.equal('plattform' in tilDelt([b])[0], false);
});

test('lesingen er som før for kjente felt', () => {
  const [s] = lesDelt([{ id: 'a', name: 'A', url: 'https://a.no' }]);
  assert.equal(s.id, 'shared:a');
  assert.equal(s.group, 'Felles');
  assert.equal(s.color, '#e2001a');
  assert.equal(s.plattform, 'begge');
  assert.equal(s.hidden, false);
  assert.equal(s.shared, true);
});

/* Appen publiserer fra sin egen, mellomlagrede kopi. Har adminbordet endret et
   felt siden sist synk, skal den ferske verdien vinne – ikke den gamle. */
test('et felt adminbordet har slått av siden sist synk, blir stående av', () => {
  const ut = [{ id: 'rorlager', name: 'Rørlager', url: 'https://r.no' }];
  const fersk = [{ id: 'rorlager', name: 'Rørlager', url: 'https://r.no', nokkel: false }];
  assert.equal(flettUkjente(ut, fersk)[0].nokkel, false);
});

test('et felt adminbordet har fjernet siden sist synk, blir fjernet', () => {
  const ut = [{ id: 'rorlager', name: 'Rørlager', url: 'https://r.no', nokkel: false }];
  const fersk = [{ id: 'rorlager', name: 'Rørlager', url: 'https://r.no' }];
  assert.equal('nokkel' in flettUkjente(ut, fersk)[0], false);
});

test('kjente felt fra appen vinner over den ferske kopien', () => {
  const ut = [{ id: 'rorlager', name: 'Nytt navn', url: 'https://r.no' }];
  const fersk = [{ id: 'rorlager', name: 'Gammelt navn', url: 'https://r.no' }];
  assert.equal(flettUkjente(ut, fersk)[0].name, 'Nytt navn');
});

test('en ny side som ikke finnes i den ferske kopien, blir som den er', () => {
  const ut = [{ id: 'ny', name: 'Ny', url: 'https://n.no', nokkel: false }];
  assert.deepEqual(flettUkjente(ut, []), ut);
});

test('uten fersk kopi blir listen som den er', () => {
  const ut = [{ id: 'a', name: 'A', url: 'https://a.no' }];
  assert.deepEqual(flettUkjente(ut, null), ut);
});

test('sider uten navn eller adresse blir hoppet over', () => {
  assert.equal(lesDelt([{ id: 'a', name: 'A' }, { id: 'b', url: 'https://b.no' }]).length, 0);
});
