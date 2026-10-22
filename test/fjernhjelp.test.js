/* Få hjelp – Windows Hurtighjelp, startet fra sidemenyen. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startmaate, BUTIKK, broSkalMed, broTillatt } = require('../src/fjernhjelp.js');

const les = (fil) => fs.readFileSync(path.join(__dirname, '..', 'src', fil), 'utf8');
const HTML = les('index.html');

test('Hurtighjelp fra Microsoft Store startes gjennom Windows selv, ikke fra en sti', () => {
  assert.deepEqual(startmaate({ harPakke: true, gammel: 'C:\\Windows\\System32\\quickassist.exe' }), {
    slag: 'app',
    fil: 'explorer.exe',
    args: ['shell:AppsFolder\\MicrosoftCorporationII.QuickAssist_8wekyb3d8bbwe!App']
  });
});

test('uten Store-utgaven: den innebygde i Windows 10', () => {
  const gammel = 'C:\\Windows\\System32\\quickassist.exe';
  assert.deepEqual(startmaate({ harPakke: false, gammel }), { slag: 'gammel', fil: gammel, args: [] });
});

test('ingen Hurtighjelp på maskinen: Microsoft Store åpnes på Hurtighjelp', () => {
  assert.deepEqual(startmaate({ harPakke: false, gammel: null }), { slag: 'butikk', url: BUTIKK });
  assert.match(BUTIKK, /^ms-windows-store:\/\/pdp\/\?productid=9P7BP5VNWKX5$/);
});

test('«Få hjelp» står ved siden av Mobilappen nederst i sidemenyen', () => {
  const mobil = HTML.indexOf('id="btnMobil"');
  const hjelp = HTML.indexOf('id="btnFjernhjelp"');
  assert.ok(hjelp !== -1, 'mangler btnFjernhjelp');
  const rad = HTML.lastIndexOf('class="footer-row"', mobil);
  assert.equal(HTML.lastIndexOf('class="footer-row"', hjelp), rad, 'skal stå i samme rad som Mobilappen');
});

test('dialogen har en startknapp, en lukkeknapp og en statuslinje', () => {
  for (const id of ['fjernhjelpModal', 'fjernhjelpStart', 'fjernhjelpLukk', 'fjernhjelpStatus']) {
    assert.ok(HTML.includes(`id="${id}"`), `mangler #${id}`);
  }
});

test('dialogen sier hvem som skal ringes, øverst før stegene', () => {
  const kontakt = HTML.indexOf('id="fjernhjelpKontakt"');
  assert.ok(kontakt !== -1, 'mangler kontaktkortet');
  assert.ok(kontakt < HTML.indexOf('class="fjernhjelp-steg"'), 'kontakten skal stå før stegene');
  const kort = HTML.slice(kontakt, HTML.indexOf('</div>', kontakt));
  assert.match(kort, /Thomas Hauge/);
  assert.match(kort, /413 48 333/);
});

test('grensesnittet når hovedprosessen gjennom én kanal', () => {
  assert.match(les('preload.js'), /startFjernhjelp: \(\) => ipcRenderer\.invoke\('fjernhjelp:start'\)/);
  assert.match(les('main.js'), /ipcMain\.handle\('fjernhjelp:start'/);
  assert.match(les('renderer.js'), /window\.hm\.startFjernhjelp\(\)/);
});

/* Adminbordet kan starte Hurtighjelp over en egen bro (adminbord-bro.js). Broen kan bare én
   ting, men den starter et program på PC-en, så den skal bare gis til adminbordet. */
const ADMINBORD = 'https://hauge-maskin-adminbord.vercel.app';
const MAIN = les('main.js');

test('broen legges bare på en fane med nøyaktig adminbordets opphav over https', () => {
  assert.equal(broSkalMed(ADMINBORD + '/brukere'), true);
  assert.equal(broSkalMed(ADMINBORD), true);
  for (const src of ['http://hauge-maskin-adminbord.vercel.app/', 'https://hauge-maskin-adminbord.vercel.app.evil.no/',
    'https://hauge-maskin-adminbord.vercel.app@evil.no/', 'https://evil.no/?https://hauge-maskin-adminbord.vercel.app',
    'https://innboks-hauge-maskin.vercel.app/', '', undefined, null]) {
    assert.equal(broSkalMed(src), false, String(src));
  }
});

test('hvert kall sjekkes på nytt: bare adminbordets toppramme slipper gjennom', () => {
  assert.equal(broTillatt({ opphav: ADMINBORD, toppramme: true }), true);
  assert.equal(broTillatt({ opphav: ADMINBORD, toppramme: false }), false);
  assert.equal(broTillatt({ opphav: 'https://evil.no', toppramme: true }), false);
  assert.equal(broTillatt(null), false);
});

test('adminbordet får sin egen bro, og Innboks beholder sin', () => {
  assert.match(MAIN, /if \(Lenke\.broSkalMed\(params\.src\)\) \{\s+webPreferences\.preload = path\.join\(__dirname, 'innboks-bro\.js'\);\s+\} else if \(Fjernhjelp\.broSkalMed\(params\.src\)\) \{\s+webPreferences\.preload = path\.join\(__dirname, 'adminbord-bro\.js'\);/);
  assert.match(les('adminbord-bro.js'), /hurtighjelp: \{\s+start: \(\) => ipcRenderer\.invoke\('adminbord-bro:hurtighjelp'\),?\s+\}/);
});

test('kanalen avviser alt som ikke er adminbordet, før noe startes', () => {
  const m = MAIN.match(/ipcMain\.handle\('adminbord-bro:hurtighjelp', (?:async )?\(e\) => \{\s+if \(!fraAdminbord\(e\)\) return [^;]+;\s+return startHurtighjelp\(\);/);
  assert.ok(m, 'kanalen må begynne med fraAdminbord(e)');
  assert.match(MAIN, /Fjernhjelp\.broTillatt\(\{ opphav: ramme\.origin, toppramme: ramme\.parent === null \}\)/);
  assert.match(MAIN, /ipcMain\.handle\('fjernhjelp:start', \(\) => startHurtighjelp\(\)\);/);
});
