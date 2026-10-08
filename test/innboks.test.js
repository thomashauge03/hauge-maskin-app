/* Varselvakta for Innboks. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  nesteVent, gyldigAnonNokkel, validerKobling, kallRpc, lagHusk, lagVakt, NAV_URL,
} = require('../src/innboks.js');

const jwt = (nyttelast) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(nyttelast)).toString('base64url'), 'signatur'].join('.');
const ANON = jwt({ role: 'anon', iss: 'supabase' });
const GYLDIG = {
  id: '44444444-4444-4444-8444-444444444444', nokkel: 'n'.repeat(43), url: NAV_URL + '/', anonNokkel: ANON,
  innboksUrl: 'https://innboks-hauge-maskin.vercel.app',
};
const KOBLING = { enhetId: GYLDIG.id, nokkel: 'k'.repeat(43), url: NAV_URL, anonNokkel: ANON };

test('ventetiden dobles ved feil, opp til to minutter', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10, -1, undefined].map(nesteVent), [15000, 30000, 60000, 120000, 120000, 120000, 15000, 15000]);
});

test('gyldigAnonNokkel godtar publishable-nøkler og anon-JWT, aldri service_role', () => {
  assert.equal(gyldigAnonNokkel('sb_publishable_abc123'), true);
  assert.equal(gyldigAnonNokkel(ANON), true);
  assert.equal(gyldigAnonNokkel(jwt({ role: 'service_role' })), false);
  assert.equal(gyldigAnonNokkel('sb_secret_abc123'), false);
  assert.equal(gyldigAnonNokkel('a.b.c'), false);
  assert.equal(gyldigAnonNokkel(''), false);
  assert.equal(gyldigAnonNokkel(undefined), false);
});

test('validerKobling godtar svaret fra /api/enhet og fester adressen til navet', () => {
  const v = validerKobling(GYLDIG);
  assert.equal(v.ok, true);
  assert.deepEqual(v.kobling, { enhetId: GYLDIG.id, nokkel: GYLDIG.nokkel, url: NAV_URL, anonNokkel: ANON });
});

test('validerKobling avviser alt annet, uten å nevne verdiene', () => {
  const tilfeller = [
    null, 'tekst',
    { ...GYLDIG, id: 'ikke-uuid' },
    { ...GYLDIG, nokkel: 'kort' },
    { ...GYLDIG, nokkel: 'n'.repeat(42) + '!' },
    { ...GYLDIG, url: 'https://annet.supabase.co' },
    { ...GYLDIG, url: NAV_URL + '.evil.no' },
    { ...GYLDIG, anonNokkel: jwt({ role: 'service_role' }) },
    { ...GYLDIG, anonNokkel: undefined },
  ];
  for (const t of tilfeller) {
    const v = validerKobling(t);
    assert.equal(v.ok, false, JSON.stringify(t));
    assert.ok(typeof v.feil === 'string' && !v.feil.includes(GYLDIG.nokkel) && !v.feil.includes(ANON));
  }
});

test('kallRpc spør navet med anon-nøkkelen og skjemaet innboks', async () => {
  const kall = [];
  const fetchFn = async (url, init) => { kall.push({ url, init }); return { ok: true, status: 200, text: async () => '{"uleste":2,"varsler":[]}' }; };
  assert.deepEqual(await kallRpc(fetchFn, KOBLING, 'enhet_hent', { p_nokkel: KOBLING.nokkel }), { uleste: 2, varsler: [] });
  assert.equal(kall[0].url, NAV_URL + '/rest/v1/rpc/enhet_hent');
  assert.equal(kall[0].init.method, 'POST');
  assert.equal(kall[0].init.headers['Content-Profile'], 'innboks');
  assert.equal(kall[0].init.headers.apikey, ANON);
  assert.equal(kall[0].init.headers.Authorization, 'Bearer ' + ANON);
  assert.deepEqual(JSON.parse(kall[0].init.body), { p_nokkel: KOBLING.nokkel });
});

test('kallRpc gir null når navet svarer null, som for en ukjent nøkkel', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => 'null' });
  assert.equal(await kallRpc(fetchFn, KOBLING, 'enhet_hent', {}), null);
});

test('feil fra navet har status, men aldri nøklene i meldingen', async () => {
  const avvist = async () => ({ ok: false, status: 401, text: async () => KOBLING.nokkel });
  await assert.rejects(kallRpc(avvist, KOBLING, 'enhet_hent', {}),
    (e) => e.status === 401 && !e.message.includes(KOBLING.nokkel) && !e.message.includes(ANON));
  const nede = async () => { throw new Error('getaddrinfo ENOTFOUND ' + KOBLING.nokkel); };
  await assert.rejects(kallRpc(nede, KOBLING, 'enhet_hent', {}), (e) => e.status === 0 && !e.message.includes(KOBLING.nokkel));
  const tull = async () => ({ ok: true, status: 200, text: async () => '<html>' });
  await assert.rejects(kallRpc(tull, KOBLING, 'enhet_hent', {}), /Uventet svar fra Innboks/);
});

test('lagHusk glemmer det eldste når den er full', () => {
  const h = lagHusk(3);
  for (const id of ['a', 'b', 'c', 'd']) h.legg(id);
  assert.equal(h.har('a'), false);
  assert.equal(h.har('d'), true);
  assert.equal(h.storrelse(), 3);
});

/* En falsk verden for vakta: svarene fra navet står i kø, og alt vakta gjør, havner i logg. */
function lagFalsk(svar) {
  const logg = { vist: [], kvittert: [], tilstand: [], blink: 0, frakoblet: 0, planlagt: [], avbrutt: [] };
  const ko = [...svar];
  const avh = {
    hent: async () => { const s = ko.shift(); if (s instanceof Error) throw s; return s; },
    kvitter: async (ider) => { logg.kvittert.push(ider); },
    vis: (v) => { logg.vist.push(v.id); },
    tilstand: (t) => { logg.tilstand.push(t); },
    blink: () => { logg.blink += 1; },
    frakoblet: () => { logg.frakoblet += 1; },
    planlegg: (fn, ms) => { const h = { fn, ms }; logg.planlagt.push(h); return h; },
    avbryt: (h) => { logg.avbrutt.push(h); },
  };
  return { avh, logg };
}
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const varsel = (id, over) => ({ id, sak_id: '33333333-3333-4333-8333-333333333333', tittel: 'Rørlager: Hentebestilling', tekst: 'Ola', haster: false, stille: false, ...over });
const sist = (logg) => logg.planlagt[logg.planlagt.length - 1];

test('første runde viser hvert nye varsel, kvitterer alle og sender tallet for uleste', async () => {
  const { avh, logg } = lagFalsk([{ uleste: 3, haster: 0, varsler: [varsel(ID1), varsel(ID2)] }]);
  await lagVakt(avh).start();
  assert.deepEqual(logg.vist, [ID1, ID2]);
  assert.deepEqual(logg.kvittert, [[ID1, ID2]]);
  assert.deepEqual(logg.tilstand, [{ koblet: true, uleste: 3, haster: 0 }]);
  assert.equal(sist(logg).ms, 15000);
});

test('et varsel som kommer igjen fordi kvitteringen feilet, vises ikke på nytt, men kvitteres igjen', async () => {
  const { avh, logg } = lagFalsk([{ uleste: 1, haster: 0, varsler: [varsel(ID1)] }, { uleste: 1, haster: 0, varsler: [varsel(ID1)] }]);
  let forste = true;
  avh.kvitter = async (ider) => { logg.kvittert.push(ider); if (forste) { forste = false; throw new Error('nettet forsvant'); } };
  await lagVakt(avh).start();
  assert.equal(sist(logg).ms, 30000);
  await sist(logg).fn();
  assert.deepEqual(logg.vist, [ID1]);
  assert.deepEqual(logg.kvittert, [[ID1], [ID1]]);
  assert.equal(sist(logg).ms, 15000);
});

test('oppgavelinja blinker én gang når noe nytt haster, og ikke ellers', async () => {
  const med = lagFalsk([{ uleste: 2, haster: 2, varsler: [varsel(ID1, { haster: true }), varsel(ID2, { haster: true })] }]);
  await lagVakt(med.avh).start();
  assert.equal(med.logg.blink, 1);
  const uten = lagFalsk([{ uleste: 1, haster: 0, varsler: [varsel(ID1)] }]);
  await lagVakt(uten.avh).start();
  assert.equal(uten.logg.blink, 0);
});

test('feil gir 30, 60 og 120 sekunder, og et svar setter ventetiden tilbake til 15', async () => {
  const nede = new Error('nede');
  const { avh, logg } = lagFalsk([nede, nede, nede, nede, { uleste: 0, haster: 0, varsler: [] }]);
  await lagVakt(avh).start();
  const vent = [sist(logg).ms];
  for (let i = 0; i < 4; i++) { await sist(logg).fn(); vent.push(sist(logg).ms); }
  assert.deepEqual(vent, [30000, 60000, 120000, 120000, 15000]);
});

test('null fra navet betyr frakoblet: ingen nye runder', async () => {
  const { avh, logg } = lagFalsk([null]);
  const vakt = lagVakt(avh);
  await vakt.start();
  assert.equal(logg.frakoblet, 1);
  assert.equal(logg.planlagt.length, 0);
  assert.equal(vakt.erAktiv(), false);
});

test('et svar som kommer etter stopp, brukes ikke', async () => {
  const { avh, logg } = lagFalsk([]);
  let slipp;
  avh.hent = () => new Promise((ok) => { slipp = ok; });
  const vakt = lagVakt(avh);
  const runde = vakt.start();
  vakt.stopp();
  slipp({ uleste: 5, haster: 0, varsler: [varsel(ID1)] });
  await runde;
  assert.deepEqual(logg.vist, []);
  assert.deepEqual(logg.tilstand, []);
  assert.equal(logg.planlagt.length, 0);
});

test('naa avbryter ventetiden og henter med en gang', async () => {
  const { avh, logg } = lagFalsk([{ uleste: 1, haster: 0, varsler: [] }, { uleste: 0, haster: 0, varsler: [] }]);
  const vakt = lagVakt(avh);
  await vakt.start();
  const ventende = logg.planlagt[0];
  await vakt.naa();
  assert.deepEqual(logg.avbrutt, [ventende]);
  assert.deepEqual(logg.tilstand.map((t) => t.uleste), [1, 0]);
});

test('naa midt i en runde gir en ny runde rett etter', async () => {
  const { avh, logg } = lagFalsk([]);
  const svar = [];
  avh.hent = () => new Promise((ok) => { svar.push(ok); });
  const vakt = lagVakt(avh);
  const forste = vakt.start();
  vakt.naa();
  svar[0]({ uleste: 2, haster: 0, varsler: [] });
  await forste;
  assert.equal(svar.length, 2, 'den andre runden er i gang');
  svar[1]({ uleste: 1, haster: 0, varsler: [] });
  await new Promise((ok) => setImmediate(ok));
  assert.deepEqual(logg.tilstand.map((t) => t.uleste), [2, 1]);
});

test('et eldre svar uten uleste bruker apne, og ugyldige id-er hoppes over', async () => {
  const { avh, logg } = lagFalsk([{ apne: 4, haster: 1, varsler: [{ id: 'x' }, null, varsel(ID1)] }]);
  await lagVakt(avh).start();
  assert.deepEqual(logg.tilstand, [{ koblet: true, uleste: 4, haster: 1 }]);
  assert.deepEqual(logg.vist, [ID1]);
  assert.deepEqual(logg.kvittert, [[ID1]]);
});
