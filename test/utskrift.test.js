/* Utskriftsskriptet – det appen legger inn i vinduer som åpnes fra en side.
   Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { UTSKRIFT_SIGNAL, UTSKRIFT_SKRIPT } = require('../src/utskrift.js');

// Et vindu slik skriptet ser det. Testen selv spiller siden som åpnet det
// (printWindow.close()). Den ekte close() må kalles på vinduet, ellers kaster
// nettleseren «Illegal invocation».
function lagVindu() {
  const vindu = { lukket: false, logg: [] };
  vindu.window = vindu;
  vindu.console = { log: (m) => vindu.logg.push(m) };
  vm.createContext(vindu);
  // vm gir vinduet sin egen proxy for seg selv, ikke objektet her ute
  const innenfra = vm.runInContext('window', vindu);
  vindu.close = function () {
    if (this !== vindu && this !== innenfra) throw new TypeError('Illegal invocation');
    vindu.lukket = true;
  };
  vindu.print = () => { throw new Error('den ekte utskriftsdialogen åpnet seg'); };
  return vindu;
}

const leggInn = (vindu) => vm.runInContext(UTSKRIFT_SKRIPT, vindu);

test('print() gir hovedprosessen signalet i stedet for å åpne utskriftsdialogen', () => {
  const vindu = lagVindu();
  leggInn(vindu);
  vindu.print();
  assert.deepEqual(vindu.logg, [UTSKRIFT_SIGNAL]);
});

/* QR-siden: win.print(); win.close(). Ble vinduet lukket her, rakk ikke
   appen å lage PDF-en, og ingenting havnet i dra-menyen. */
test('close() rett etter print() lukker ikke vinduet – det gjør appen når PDF-en er laget', () => {
  const vindu = lagVindu();
  leggInn(vindu);
  vindu.print();
  vindu.close();
  assert.equal(vindu.lukket, false);
});

test('vinduer som ikke skriver ut, lukker seg som før', () => {
  const vindu = lagVindu();
  leggInn(vindu);
  vindu.close();
  assert.equal(vindu.lukket, true);
});

/* main.js legger inn skriptet når vinduet lages, på dom-ready og på did-finish-load */
test('skriptet kan legges inn flere ganger i samme vindu', () => {
  const skriver = lagVindu();
  leggInn(skriver); leggInn(skriver); leggInn(skriver);
  skriver.print();
  skriver.close();
  assert.deepEqual(skriver.logg, [UTSKRIFT_SIGNAL]);
  assert.equal(skriver.lukket, false);

  const lukker = lagVindu();
  leggInn(lukker); leggInn(lukker); leggInn(lukker);
  lukker.close();
  assert.equal(lukker.lukket, true);
});
