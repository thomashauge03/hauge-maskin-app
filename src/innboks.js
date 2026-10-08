'use strict';
/* Varselvakta for Innboks.

   Hovedprosessen spør navet hvert 15. sekund med enhetsnøkkelen (innboks.enhet_hent), viser et
   Windows-varsel for hvert nytt varsel og kvitterer (innboks.enhet_kvitter). Spørringen går rett
   til Supabase, ikke til Vercel, som teller hvert kall mot gratiskvoten.

   Leveringen er minst én gang: et varsel som ikke ble kvittert, kommer igjen i neste runde. Vakta
   husker hva den har vist, så det ikke vises to ganger.

   Ren logikk: nettet, varslene og tidtakerne kommer inn som avhengigheter, så alt testes med
   `npm test` (test/innboks.test.js). main.js gir den fetch, Notification og setTimeout. */

const INTERVALL_MS = 15000;
const MAKS_VENT_MS = 120000;
const FRIST_MS = 10000;
// Navet. Enhetsnøkkelen sendes hit og ingen andre steder, derfor står adressen fast i appen.
const NAV_URL = 'https://rxlkybaarxvyrrkkzjhj.supabase.co';
const SKJEMA = 'innboks';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hvert mislykket forsøk dobler ventetiden, opp til to minutter: 15, 30, 60, 120 sekunder.
function nesteVent(feilPaaRad) {
  if (!(feilPaaRad > 0)) return INTERVALL_MS;
  return Math.min(MAKS_VENT_MS, INTERVALL_MS * 2 ** Math.min(feilPaaRad, 8));
}

/* Nøkkelen lastes ned av alle som åpner Innboks og er ingen hemmelighet, men den må være en
   anon-nøkkel. En service-nøkkel omgår all radsikkerhet og skal aldri ligge på en PC. Den eldre
   formen er en JWT der rollen ligger base64url-kodet i midtdelen, så den må dekodes. */
function gyldigAnonNokkel(nokkel) {
  if (typeof nokkel !== 'string' || nokkel.length > 2000) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(nokkel)) return true;
  const deler = nokkel.split('.');
  if (deler.length !== 3) return false;
  try {
    const nyttelast = JSON.parse(Buffer.from(deler[1], 'base64url').toString('utf8'));
    return !!nyttelast && nyttelast.role === 'anon';
  } catch {
    return false;
  }
}

/* Svaret fra /api/enhet slik Innboks sender det over broen: { id, nokkel, url, anonNokkel }.
   Feilmeldingene nevner aldri verdiene. */
function validerKobling(svar) {
  if (!svar || typeof svar !== 'object') return { ok: false, feil: 'Mangler svar fra Innboks.' };
  if (typeof svar.id !== 'string' || !UUID.test(svar.id)) return { ok: false, feil: 'Ugyldig enhet fra Innboks.' };
  if (typeof svar.nokkel !== 'string' || !/^[A-Za-z0-9_-]{32,200}$/.test(svar.nokkel)) {
    return { ok: false, feil: 'Ugyldig nøkkel fra Innboks.' };
  }
  const url = String(svar.url || '').replace(/\/+$/, '');
  if (url !== NAV_URL) return { ok: false, feil: 'Innboks pekte på en ukjent database.' };
  if (!gyldigAnonNokkel(svar.anonNokkel)) return { ok: false, feil: 'Innboks sendte ingen gyldig offentlig nøkkel.' };
  return { ok: true, kobling: { enhetId: svar.id, nokkel: svar.nokkel, url, anonNokkel: svar.anonNokkel } };
}

function lagFeil(melding, status) {
  const e = new Error(melding);
  e.status = status;
  return e;
}

/* Et kall til en RPC-funksjon i skjemaet innboks, med anon-nøkkelen. Feilen sier bare hva som
   skjedde og HTTP-statusen, aldri adressen, nøklene eller kroppen. */
async function kallRpc(fetchFn, kobling, navn, args) {
  let svar;
  try {
    svar = await fetchFn(kobling.url + '/rest/v1/rpc/' + navn, {
      method: 'POST',
      headers: {
        apikey: kobling.anonNokkel,
        Authorization: 'Bearer ' + kobling.anonNokkel,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Profile': SKJEMA,
      },
      body: JSON.stringify(args || {}),
      signal: AbortSignal.timeout(FRIST_MS),
    });
  } catch {
    throw lagFeil('Ingen kontakt med Innboks.', 0);
  }
  if (!svar.ok) throw lagFeil('Innboks svarte ' + svar.status + '.', svar.status);
  let tekst;
  try {
    tekst = await svar.text();
  } catch {
    throw lagFeil('Ingen kontakt med Innboks.', 0);
  }
  if (!tekst) return null;
  try {
    return JSON.parse(tekst);
  } catch {
    throw lagFeil('Uventet svar fra Innboks.', svar.status);
  }
}

// Id-ene til varslene som er vist. Bare de siste, så minnet ikke vokser i en app som står på i uker.
function lagHusk(maks = 500) {
  const sett = new Set();
  return {
    har: (id) => sett.has(id),
    legg(id) {
      sett.add(id);
      while (sett.size > maks) sett.delete(sett.values().next().value);
    },
    storrelse: () => sett.size,
  };
}

const heltall = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);

/* avh: { hent, kvitter, vis, tilstand, blink, frakoblet, planlegg, avbryt }.

   Én runde om gangen. Kommer naa() midt i en runde, tas en ny runde rett etter. stopp() øker
   generasjonen, så et svar som kommer etter stopp, aldri brukes: det kan høre til en enhet som
   nettopp ble koblet fra. */
function lagVakt(avh) {
  const husk = lagHusk();
  let aktiv = false;
  let generasjon = 0;
  let timer = null;
  let feil = 0;
  let kjorer = false;
  let igjen = false;

  function planleggNeste() {
    if (!aktiv || timer) return;
    timer = avh.planlegg(() => { timer = null; return runde(); }, nesteVent(feil));
  }

  async function runde() {
    if (!aktiv) return;
    if (kjorer) { igjen = true; return; }
    kjorer = true;
    const min = generasjon;
    try {
      const svar = await avh.hent();
      if (min !== generasjon) return;
      if (svar === null) {
        aktiv = false;
        avh.frakoblet();
        return;
      }
      if (!svar || typeof svar !== 'object' || !Array.isArray(svar.varsler)) throw new Error('Uventet svar fra Innboks.');
      avh.tilstand({ koblet: true, uleste: heltall(svar.uleste !== undefined ? svar.uleste : svar.apne), haster: heltall(svar.haster) });
      let haster = false;
      const ider = [];
      for (const v of svar.varsler) {
        if (!v || typeof v.id !== 'string' || !UUID.test(v.id)) continue;
        ider.push(v.id);
        if (husk.har(v.id)) continue;
        husk.legg(v.id);
        avh.vis(v);
        if (v.haster) haster = true;
      }
      if (haster) avh.blink();
      if (ider.length) await avh.kvitter(ider);
      if (min === generasjon) feil = 0;
    } catch {
      if (min === generasjon) feil += 1;
    } finally {
      kjorer = false;
      if (igjen && aktiv) {
        igjen = false;
        // Ikke await: da ville denne runden, og den som venter på den, ventet på den neste også.
        runde();
      } else {
        igjen = false;
        planleggNeste();
      }
    }
  }

  return {
    start() {
      if (aktiv) return Promise.resolve();
      aktiv = true;
      feil = 0;
      return runde();
    },
    stopp() {
      aktiv = false;
      generasjon += 1;
      igjen = false;
      if (timer) { avh.avbryt(timer); timer = null; }
    },
    naa() {
      if (!aktiv) return Promise.resolve();
      if (timer) { avh.avbryt(timer); timer = null; }
      return runde();
    },
    feilPaaRad: () => feil,
    erAktiv: () => aktiv,
  };
}

module.exports = { INTERVALL_MS, MAKS_VENT_MS, NAV_URL, nesteVent, gyldigAnonNokkel, validerKobling, kallRpc, lagHusk, lagVakt };
