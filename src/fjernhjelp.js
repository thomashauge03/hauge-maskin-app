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

module.exports = { PAKKE, BUTIKK, startmaate };
