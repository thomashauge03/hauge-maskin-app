/* Få hjelp – Windows Hurtighjelp, startet fra sidemenyen. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startmaate, BUTIKK } = require('../src/fjernhjelp.js');

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

test('grensesnittet når hovedprosessen gjennom én kanal', () => {
  assert.match(les('preload.js'), /startFjernhjelp: \(\) => ipcRenderer\.invoke\('fjernhjelp:start'\)/);
  assert.match(les('main.js'), /ipcMain\.handle\('fjernhjelp:start'/);
  assert.match(les('renderer.js'), /window\.hm\.startFjernhjelp\(\)/);
});
