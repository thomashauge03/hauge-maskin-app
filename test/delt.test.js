/* Den felles sidelista inn og ut av appen. Køyrast med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lesDelt, tilDelt } = require('../src/delt.js');

const raa = {
  id: 'rorlager',
  name: 'Rørlager',
  url: 'https://rorlager.vercel.app/',
  nokkel: false,
  nytt: { a: 1 }
};

test('felt appen ikkje kjenner, overlever ein runde', () => {
  const ut = tilDelt(lesDelt([raa]))[0];
  assert.equal(ut.nokkel, false);
  assert.deepEqual(ut.nytt, { a: 1 });
});

test('lokale felt blir ikkje sende ut', () => {
  const ut = tilDelt(lesDelt([raa]))[0];
  assert.equal('shared' in ut, false);
  assert.equal('ekstra' in ut, false);
  assert.equal(ut.id, 'rorlager');
});

test('kjende felt går føre gamle verdiar i ekstra', () => {
  const [side] = lesDelt([raa]);
  side.name = 'Nytt namn';
  assert.equal(tilDelt([side])[0].name, 'Nytt namn');
});

test('begge blir ikkje skrive ut, pc og mobil blir det', () => {
  const [a, b] = lesDelt([{ ...raa, plattform: 'pc' }, { ...raa, id: 'x' }]);
  assert.equal(tilDelt([a])[0].plattform, 'pc');
  assert.equal('plattform' in tilDelt([b])[0], false);
});

test('lesinga er som før for kjende felt', () => {
  const [s] = lesDelt([{ id: 'a', name: 'A', url: 'https://a.no' }]);
  assert.equal(s.id, 'shared:a');
  assert.equal(s.group, 'Felles');
  assert.equal(s.color, '#e2001a');
  assert.equal(s.plattform, 'begge');
  assert.equal(s.hidden, false);
  assert.equal(s.shared, true);
});

test('sider utan namn eller adresse blir hoppa over', () => {
  assert.equal(lesDelt([{ id: 'a', name: 'A' }, { id: 'b', url: 'https://b.no' }]).length, 0);
});
