'use strict';
/* Appen i bakgrunnen. Uten dette kommer ingen Innboks-varsler når vinduet er lukket, og det er
   nettopp da de trengs. Alt gjelder bare mens Innboks er koblet til: for den som ikke bruker
   Innboks, oppfører appen seg som før.

   Ren logikk, testet med `npm test` (test/bakgrunn.test.js). main.js gjør selve endringene. */

const SKJULT_FLAGG = '--skjult';

/* settings: data.settings fra pages.json. Begge valgene er på til de slås av.
   miljo: { koblet, pakket, exe, portabelFil }.

   innlogging er null i utvikling, så npm start aldri legger electron.exe inn i autostarten. Sti
   og flagg er de samme både når den slås på og av, ellers finner ikke Windows den gamle
   oppføringen å fjerne. Den frittstående versjonen kjører fra en midlertidig mappe, så der er det
   exe-fila brukeren startet, som skal stå i autostarten. */
function bakgrunnsvalg(settings, miljo) {
  const s = settings || {};
  const m = miljo || {};
  const koblet = !!m.koblet;
  return {
    statusfelt: koblet,
    lukkTilStatusfelt: koblet && s.lukkTilStatusfelt !== false,
    innlogging: m.pakket
      ? { openAtLogin: koblet && s.startMedWindows !== false, path: m.portabelFil || m.exe, args: [SKJULT_FLAGG] }
      : null,
  };
}

// Uten Innboks er det ingen grunn til å gjemme vinduet, og ikke noe statusfelt å finne det i.
function startSkjult(argv, koblet) {
  return !!koblet && Array.isArray(argv) && argv.includes(SKJULT_FLAGG);
}

function statusfeltTekst(tilstand) {
  const n = tilstand && tilstand.koblet && Number.isInteger(tilstand.uleste) ? tilstand.uleste : 0;
  if (n <= 0) return 'Hauge Maskin';
  return 'Hauge Maskin: ' + n + (n === 1 ? ' ulest' : ' uleste') + ' i Innboks';
}

module.exports = { SKJULT_FLAGG, bakgrunnsvalg, startSkjult, statusfeltTekst };
