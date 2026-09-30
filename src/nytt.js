/* Hva er nytt – endringsloggen i src/endringer.json.

   Første gang en ny versjon starter, viser appen hva som har kommet siden
   versjonen brukeren sist så. Hva som sist var sett, ligger i sist-sett.json i
   datamappen (se main.js). Versjoner fra før loggen kom, lagret ikke det – da
   er bare den gjeldende versjonen ny.

   Brukes i hovedprosessen, og testes med `npm test` (test/nytt.test.js). */

// Tall for tall, ikke som tekst: 2.10.0 kommer etter 2.9.0.
function sammenlign(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

/* logg      – oppføringene i endringer.json, nyeste først
   gjeldende – versjonen som kjører nå
   sistSett  – versjonen brukeren sist så, eller null
   hadData   – om appen hadde data før denne oppstarten, altså ikke er
               nyinstallert */
function hvaErNytt({ logg, gjeldende, sistSett, hadData }) {
  if (!sistSett) {
    const vis = Boolean(hadData) && logg.some((o) => o.versjon === gjeldende);
    return { vis, nye: vis ? [gjeldende] : [] };
  }
  const nye = logg
    .map((o) => o.versjon)
    .filter((v) => sammenlign(v, sistSett) > 0 && sammenlign(v, gjeldende) <= 0);
  return { vis: nye.length > 0, nye };
}

// Utgivelsesnotatet på GitHub, laget fra samme oppføring som appen viser.
function somMarkdown(oppforing) {
  return oppforing.punkt.map((p) => `- ${p}`).join('\n') +
    '\n\nInstallerte apper henter denne oppdateringen selv.\n';
}

module.exports = { sammenlign, hvaErNytt, somMarkdown };
