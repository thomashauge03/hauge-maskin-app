/* Appen i bakgrunnen: systemstatusfelt, lukk og autostart. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bakgrunnsvalg, startSkjult, statusfeltTekst } = require('../src/bakgrunn.js');

const PAKKET = { koblet: true, pakket: true, exe: 'C:\\Programmer\\Hauge Maskin\\Hauge Maskin.exe', portabelFil: null };

test('koblet til Innboks: systemstatusfelt, lukk til statusfeltet og autostart med --skjult', () => {
  assert.deepEqual(bakgrunnsvalg({}, PAKKET), {
    statusfelt: true,
    lukkTilStatusfelt: true,
    innlogging: { openAtLogin: true, path: PAKKET.exe, args: ['--skjult'] },
  });
});

test('begge kan slås av i innstillingene', () => {
  const v = bakgrunnsvalg({ lukkTilStatusfelt: false, startMedWindows: false }, PAKKET);
  assert.equal(v.lukkTilStatusfelt, false);
  assert.equal(v.innlogging.openAtLogin, false);
  assert.equal(v.statusfelt, true);
});

test('uten Innboks oppfører appen seg som før, og autostarten fjernes', () => {
  assert.deepEqual(bakgrunnsvalg({}, { ...PAKKET, koblet: false }), {
    statusfelt: false,
    lukkTilStatusfelt: false,
    innlogging: { openAtLogin: false, path: PAKKET.exe, args: ['--skjult'] },
  });
});

test('den frittstående versjonen starter sin egen exe, ikke den utpakkede kopien', () => {
  const v = bakgrunnsvalg({}, { ...PAKKET, exe: 'C:\\Temp\\2abc\\Hauge Maskin.exe', portabelFil: 'D:\\Hauge-Maskin-2.10.0.exe' });
  assert.equal(v.innlogging.path, 'D:\\Hauge-Maskin-2.10.0.exe');
});

test('i utvikling (npm start) røres ikke autostarten', () => {
  assert.equal(bakgrunnsvalg({}, { ...PAKKET, pakket: false }).innlogging, null);
});

test('starter skjult bare med --skjult, og bare når Innboks er koblet til', () => {
  assert.equal(startSkjult(['Hauge Maskin.exe', '--skjult'], true), true);
  assert.equal(startSkjult(['Hauge Maskin.exe', '--skjult'], false), false);
  assert.equal(startSkjult(['Hauge Maskin.exe'], true), false);
  assert.equal(startSkjult(undefined, true), false);
});

test('teksten i systemstatusfeltet', () => {
  assert.equal(statusfeltTekst({ koblet: true, uleste: 0 }), 'Hauge Maskin');
  assert.equal(statusfeltTekst({ koblet: true, uleste: 1 }), 'Hauge Maskin: 1 ulest i Innboks');
  assert.equal(statusfeltTekst({ koblet: true, uleste: 4 }), 'Hauge Maskin: 4 uleste i Innboks');
  assert.equal(statusfeltTekst({ koblet: false, uleste: 4 }), 'Hauge Maskin');
  assert.equal(statusfeltTekst(null), 'Hauge Maskin');
});

test('innstillingene finnes i dialogen og har standardverdier i main.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  for (const id of ['sLukkTilStatusfelt', 'sStartMedWindows', 'sPortabel']) assert.ok(html.includes(`id="${id}"`), id);
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /lukkTilStatusfelt: true, startMedWindows: true/);
  assert.match(main, /app\.on\('before-quit', \(\) => \{ avslutter = true; \}\);/);
});
