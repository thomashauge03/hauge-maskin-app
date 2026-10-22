/* Få hjelp – Windows Hurtighjelp (Quick Assist).

   Gratis, og følger med Windows 10 og 11. Den som hjelper åpner Hurtighjelp,
   velger «Hjelp noen» og får en sekssifret kode. Den som trenger hjelp,
   trykker «Få hjelp» i appen, skriver inn koden og godtar. Appen gjør bare
   det siste: får Hurtighjelp opp på skjermen.

   Hurtighjelp kommer nå fra Microsoft Store. Eldre Windows 10 har i stedet
   quickassist.exe i System32. Har maskinen ingen av dem, åpner vi Store-siden.

   Brukes i hovedprosessen, og testes med `npm test` (test/fjernhjelp.test.js). */

const PAKKE = 'MicrosoftCorporationII.QuickAssist';
const APP_ID = 'MicrosoftCorporationII.QuickAssist_8wekyb3d8bbwe!App';
const BUTIKK = 'ms-windows-store://pdp/?productid=9P7BP5VNWKX5';

/* harPakke – Store-utgaven er installert
   gammel   – stien til quickassist.exe i System32, eller null */
function startmaate({ harPakke, gammel }) {
  if (harPakke) return { slag: 'app', fil: 'explorer.exe', args: [`shell:AppsFolder\\${APP_ID}`] };
  if (gammel) return { slag: 'gammel', fil: gammel, args: [] };
  return { slag: 'butikk', url: BUTIKK };
}

/* Adminbordet kan starte Hurtighjelp selv, over broen i adminbord-bro.js. Den starter et program
   på PC-en, så den står fast på adminbordets opphav – ikke adressen i sider.json, som kan endres
   uten en ny versjon av appen. */
const BRO_OPPHAV = 'https://hauge-maskin-adminbord.vercel.app';

function broSkalMed(src) {
  if (typeof src !== 'string') return false;
  let u;
  try { u = new URL(src); } catch { return false; }
  return u.protocol === 'https:' && !u.username && !u.password && u.origin === BRO_OPPHAV;
}

// Fanen kan ha navigert bort etter at den fikk broen, og en iframe inne i siden teller ikke.
function broTillatt(ramme) {
  return !!ramme && ramme.toppramme === true && ramme.opphav === BRO_OPPHAV;
}

module.exports = { PAKKE, BUTIKK, BRO_OPPHAV, startmaate, broSkalMed, broTillatt };
