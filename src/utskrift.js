/* Utskrift fra sidene – skriptet appen legger inn i vinduer som åpnes fra en side.

   Flere systemer lager dokumentet ved å skrive HTML i et tomt vindu og kalle
   window.print(). Hovedprosessen (fangUtskrift i main.js) bytter ut print()
   med dette skriptet, venter på signalet og lager PDF-en selv.

   Brukes i hovedprosessen, og testes med `npm test` (test/utskrift.test.js). */

const UTSKRIFT_SIGNAL = '__hm_skriv_ut__';

// Den ekte print() venter til utskriftsdialogen er lukket, så mange sider
// kaller close() rett etterpå (QR-siden gjør det). Vår print() kommer tilbake
// med en gang, og da ble vinduet revet ned midt i PDF-en. Etter print() holder
// vi derfor close() tilbake – vinduet lukker hovedprosessen selv når PDF-en er
// laget. Vinduer som aldri skriver ut, for eksempel innlogging, lukker seg som før.
//
// Skriptet legges inn flere ganger i samme vindu (se main.js), derfor sperren øverst.
const UTSKRIFT_SKRIPT = `(function () {
  if (window.__hmUtskrift) return;
  window.__hmUtskrift = true;
  var lukk = window.close;
  var skrevetUt = false;
  window.print = function () {
    skrevetUt = true;
    console.log(${JSON.stringify(UTSKRIFT_SIGNAL)});
  };
  window.close = function () {
    if (!skrevetUt) lukk.call(window);
  };
})();`;

module.exports = { UTSKRIFT_SIGNAL, UTSKRIFT_SKRIPT };
