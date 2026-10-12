/* Innboks i appen: sider, lenker, broen og tallet. Kjøres med `npm test`. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/innboks-felles.js');

const side = (id, url, over) => ({ id, name: id, url, group: 'System', shared: id.startsWith('shared:'), ...over });
const RORLAGER = side('shared:r-rlager', 'https://rorlager.vercel.app/admin');
const KUNDER = side('shared:roerlager-kunder', 'https://rorlager.vercel.app/');
const INNBOKS = side('shared:innboks', 'https://innboks-hauge-maskin.vercel.app/');
const data = (over) => ({ shared: [RORLAGER, KUNDER, INNBOKS], pages: [], overrides: {}, ...over });
const SAK = '33333333-3333-4333-8333-333333333333';
const OPPHAV = 'https://innboks-hauge-maskin.vercel.app';

test('finnSide velger siden med lengst felles sti', () => {
  assert.equal(F.finnSide('https://rorlager.vercel.app/admin?fane=bestillinger', [KUNDER, RORLAGER]).id, RORLAGER.id);
  assert.equal(F.finnSide('https://rorlager.vercel.app/admin/ordre/812', [KUNDER, RORLAGER]).id, RORLAGER.id);
  assert.equal(F.finnSide('https://rorlager.vercel.app/bestill', [RORLAGER, KUNDER]).id, KUNDER.id);
});

test('finnSide teller hele ledd, så /app er ikke felles med /application', () => {
  const app = side('a', 'https://x.no/app');
  const rot = side('r', 'https://x.no/');
  assert.equal(F.finnSide('https://x.no/application', [app, rot]).id, 'r');
  assert.equal(F.finnSide('https://x.no/app/1', [rot, app]).id, 'a');
});

test('finnSide krever samme opphav', () => {
  assert.equal(F.finnSide('https://rorlager.vercel.app.evil.no/admin', [RORLAGER]), null);
  assert.equal(F.finnSide('http://rorlager.vercel.app/admin', [RORLAGER]), null);
  assert.equal(F.finnSide('https://rorlager.vercel.app:8443/admin', [RORLAGER]), null);
});

test('finnSide åpner bare http og https, og aldri en adresse med innlogging i seg', () => {
  for (const l of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'mailto:ola@eksempel.no',
    'https://ola:hemmelig@rorlager.vercel.app/admin', '/admin', '', null, 42]) {
    assert.equal(F.finnSide(l, [RORLAGER, KUNDER]), null, String(l));
  }
  const kopimaskin = side('k', 'http://192.168.0.245/wcd/system_device.xml');
  assert.equal(F.finnSide('http://192.168.0.245/wcd/annet', [kopimaskin]).id, 'k');
});

test('finnSide forstår sideadresser uten skjema, slik menyen gjør', () => {
  assert.equal(F.finnSide('https://rorlager.vercel.app/admin', [side('p1', 'rorlager.vercel.app/admin')]).id, 'p1');
});

test('synligeSider er menyen uten Innboks, skjulte sider og sider bare for mobil', () => {
  const d = data({
    shared: [RORLAGER, KUNDER, INNBOKS, side('shared:skjult', 'https://s.no/', { hidden: true }),
      side('shared:mobil', 'https://m.no/', { plattform: 'mobil' })],
    pages: [side('p1', 'https://egen.no/')],
    overrides: { [KUNDER.id]: { hidden: true }, [RORLAGER.id]: { name: 'Rørlager admin' } },
  });
  const ut = F.synligeSider(d);
  assert.deepEqual(ut.map((p) => p.id), [RORLAGER.id, 'p1']);
  assert.equal(ut[0].name, 'Rørlager admin');
  assert.equal(ut[0].edited, true);
  assert.deepEqual(F.rutesider(d).map((p) => p.id), [INNBOKS.id, RORLAGER.id, 'p1']);
});

test('innboksSide tar adressen fra den felles listen, og standardadressen når den mangler eller ikke er https', () => {
  assert.equal(F.innboksSide(data()).url, INNBOKS.url);
  assert.equal(F.innboksSide(data({ shared: [RORLAGER] })).url, 'https://innboks-hauge-maskin.vercel.app/');
  assert.equal(F.innboksSide(data({ overrides: { [INNBOKS.id]: { url: 'http://innboks.example/' } } })).url,
    'https://innboks-hauge-maskin.vercel.app/');
  assert.equal(F.innboksSide({}).id, F.INNBOKS_ID);
  assert.equal(F.innboksOpphav(data()), OPPHAV);
});

test('et klikk på varselet går til kildeappen når lenken passer til en side i menyen', () => {
  assert.deepEqual(F.maalForVarsel({ sak_id: SAK, kilde_lenke: 'https://rorlager.vercel.app/admin?fane=bestillinger' }, data()),
    { sideId: RORLAGER.id, lenke: 'https://rorlager.vercel.app/admin?fane=bestillinger' });
});

test('uten lenke, eller med en lenke ingen side passer til, åpnes saken i Innboks', () => {
  const iInnboks = { sideId: F.INNBOKS_ID, lenke: OPPHAV + '/#/sak/' + SAK };
  assert.deepEqual(F.maalForVarsel({ sak_id: SAK }, data()), iInnboks);
  assert.deepEqual(F.maalForVarsel({ sak_id: SAK, kilde_lenke: 'https://ukjent.no/x' }, data()), iInnboks);
  assert.deepEqual(F.maalForVarsel({ sak_id: SAK, kilde_lenke: 'javascript:alert(1)' }, data()), iInnboks);
  assert.deepEqual(F.maalForVarsel({ sak_id: 'ikke-en-id' }, data()), { sideId: F.INNBOKS_ID, lenke: OPPHAV + '/' });
  assert.deepEqual(F.maalForVarsel(null, data()), { sideId: F.INNBOKS_ID, lenke: OPPHAV + '/' });
});

test('«Åpne i …» finner siden, eller sier fra at ingen passer', () => {
  assert.deepEqual(F.maalForLenke('https://rorlager.vercel.app/admin', data()), { sideId: RORLAGER.id, lenke: 'https://rorlager.vercel.app/admin' });
  assert.equal(F.maalForLenke('https://ukjent.no/', data()), null);
  assert.equal(F.maalForLenke('javascript:alert(1)', data()), null);
});

test('broen legges bare på en fane med nøyaktig Innboksens opphav over https', () => {
  assert.equal(F.broSkalMed(OPPHAV + '/#/sak/' + SAK), true);
  for (const src of ['http://innboks-hauge-maskin.vercel.app/', 'https://innboks-hauge-maskin.vercel.app.evil.no/',
    'https://innboks-hauge-maskin.vercel.app@evil.no/', 'https://evil.no/?https://innboks-hauge-maskin.vercel.app', '', undefined]) {
    assert.equal(F.broSkalMed(src), false, String(src));
  }
});

test('broen godtar bare kall fra toppramma på Innboksens opphav', () => {
  assert.equal(F.broTillatt({ opphav: OPPHAV, toppramme: true }), true);
  assert.equal(F.broTillatt({ opphav: OPPHAV, toppramme: false }), false);
  assert.equal(F.broTillatt({ opphav: 'https://evil.no', toppramme: true }), false);
  assert.equal(F.broTillatt(null), false);
  assert.equal(F.broTillatt({ opphav: 'http://innboks-hauge-maskin.vercel.app', toppramme: true }), false);
});

/* Adressen til Innboks-siden kan komme fra sider.json eller fra en lokal endring, og begge kan
   endres uten en ny versjon av appen. Broen gir tilgang til enhetsnøkkelen, så den er festet til
   standardadressen i koden og følger aldri adressen i listen. */
test('broen er festet til standardadressen, selv når sider.json eller en lokal endring peker et annet sted', () => {
  const ANNEN = 'https://annen-innboks.example';
  const fraListe = data({ shared: [RORLAGER, side('shared:innboks', ANNEN + '/')] });
  const fraOverstyring = data({ overrides: { [INNBOKS.id]: { url: ANNEN + '/' } } });
  for (const d of [fraListe, fraOverstyring]) {
    assert.equal(F.innboksSide(d).url, ANNEN + '/', 'sideadressen kan fortsatt komme fra listen');
    assert.equal(F.broSkalMed(ANNEN + '/'), false);
    assert.equal(F.broTillatt({ opphav: ANNEN, toppramme: true }), false);
    assert.equal(F.broSkalMed(OPPHAV + '/'), true);
    assert.equal(F.broTillatt({ opphav: OPPHAV, toppramme: true }), true);
  }
  // Et opphav som sendes med som før, overstyrer ikke festet.
  assert.equal(F.broSkalMed(ANNEN + '/', ANNEN), false);
  assert.equal(F.broTillatt({ opphav: ANNEN, toppramme: true }, ANNEN), false);
  assert.equal(F.BRO_OPPHAV, F.INNBOKS_STANDARD);
});

test('merketallet', () => {
  assert.deepEqual([0, 1, 9, 10, 250, -1, 1.5, NaN, undefined].map((n) => F.merkeTekst(n)), ['', '1', '9', '9+', '9+', '', '', '', '']);
});

test('tallet som vises, er null uten kobling og når merket er tomt', () => {
  assert.equal(F.vistAntall(true, 3), 3);
  assert.equal(F.vistAntall(true, 25), 25, 'merket sier 9+, men økningen fra 25 til 26 skal merkes');
  assert.equal(F.vistAntall(false, 3), 0);
  for (const n of [0, -1, 1.5, NaN, undefined]) assert.equal(F.vistAntall(true, n), 0, String(n));
});

test('merket hopper når det dukker opp og når tallet øker, ikke når det står stille eller går ned', () => {
  assert.equal(F.skalHoppe(0, 1), true, 'dukker opp');
  assert.equal(F.skalHoppe(2, 3), true, 'øker');
  assert.equal(F.skalHoppe(12, 13), true, 'øker over ni, selv om merket fortsatt sier 9+');
  assert.equal(F.skalHoppe(3, 3), false, 'samme tall hvert 15. sekund');
  assert.equal(F.skalHoppe(3, 2), false, 'går ned');
  assert.equal(F.skalHoppe(3, 0), false, 'forsvinner');
  assert.equal(F.skalHoppe(0, 0), false);
});

test('navnet på knappen sier hvor mange som er uleste, og hva som skal til uten kobling', () => {
  assert.equal(F.knappNavn(false, 0), 'Innboks: logg inn for å se uleste');
  assert.equal(F.knappNavn(false, 5), 'Innboks: logg inn for å se uleste', 'uten kobling er tallet ikke til å stole på');
  assert.equal(F.knappNavn(true, 0), 'Innboks');
  assert.equal(F.knappNavn(true, 1), 'Innboks: 1 ulest');
  assert.equal(F.knappNavn(true, 9), 'Innboks: 9 uleste');
  assert.equal(F.knappNavn(true, 14), 'Innboks: 14 uleste', 'navnet har det hele tallet, ikke 9+');
});

/* Tallene i menyen, prøvd mot den ekte sidelisten slik appen leser den (sider.json gjennom
   lesDelt og synligeSider), så testen merker det hvis en adresse i listen endres. */
const MENY = F.synligeSider({ shared: require('../src/delt.js').lesDelt(require('../sider.json').pages), pages: [], overrides: {} });
const menyId = (id) => {
  assert.ok(MENY.some((p) => p.id === id), 'menyen mangler ' + id);
  return id;
};

test('antallPerSide: Utleie sin rotadresse /admin/ gir tallet til Utleie, ikke kundesiden', () => {
  assert.deepEqual(F.antallPerSide(MENY, { utleie: 3 }, { utleie: 'https://utleie-hauge-maskin.vercel.app/admin/' }),
    { [menyId('shared:utleie')]: 3 });
  assert.deepEqual(F.antallPerSide(MENY, { kunde: 2 }, { kunde: 'https://utleie-hauge-maskin.vercel.app/' }),
    { [menyId('shared:utleie-kundeside')]: 2 });
});

test('antallPerSide: to kilder på samme opphav, men ulik sti, havner på hver sin side', () => {
  const ut = F.antallPerSide(MENY,
    { rorlager: 4, rorlager_kunder: 1, grus: 2, grus_kunder: 5 },
    {
      rorlager: 'https://rorlager.vercel.app/admin', rorlager_kunder: 'https://rorlager.vercel.app/',
      grus: 'https://haugemaskin-grus.vercel.app/admin/', grus_kunder: 'https://haugemaskin-grus.vercel.app',
    });
  assert.deepEqual(ut, {
    [menyId('shared:r-rlager')]: 4, [menyId('shared:roerlager-kunder')]: 1,
    [menyId('shared:leveringseddel')]: 2, [menyId('shared:leveringseddel-2')]: 5,
  });
});

test('antallPerSide legger sammen kilder som hører til samme side', () => {
  assert.deepEqual(F.antallPerSide(MENY,
    { utleie: 3, utleie_service: 4, varsling: 1 },
    { utleie: 'https://utleie-hauge-maskin.vercel.app/admin', utleie_service: 'https://utleie-hauge-maskin.vercel.app/admin/service',
      varsling: 'https://varslingskontroll.vercel.app/' }),
  { 'shared:utleie': 7, [menyId('shared:varslingskontroll')]: 1 });
});

test('antallPerSide: en rot på samme opphav, men utenfor sidens sti, går likevel til den siden', () => {
  // Tilbudssystemet står i menyen med /dashboard, mens kilden kan ha roten /.
  assert.deepEqual(F.antallPerSide(MENY, { tilbud: 2 }, { tilbud: 'https://tilbudssystem-mal.vercel.app/' }),
    { [menyId('shared:tilbudssystem')]: 2 });
});

test('antallPerSide hopper over kilder uten side i menyen, uten rot, med null som rot og med ugyldige tall', () => {
  const ut = F.antallPerSide(MENY,
    { ukjent: 3, uten_rot: 2, null_rot: 1, null_tall: 0, minus: -2, desimal: 1.5, tekst: '4', skjult: 6, innboks: 9, ondsinnet: 1 },
    {
      ukjent: 'https://ukjent.no/', null_rot: null, null_tall: 'https://rorlager.vercel.app/',
      minus: 'https://rorlager.vercel.app/', desimal: 'https://rorlager.vercel.app/', tekst: 'https://rorlager.vercel.app/',
      skjema: 'https://rorlager.vercel.app/',
      skjult: 'https://hauge-maskin-adminbord.vercel.app/', innboks: 'https://innboks-hauge-maskin.vercel.app/',
      ondsinnet: 'https://rorlager.vercel.app.evil.no/',
    });
  assert.deepEqual(ut, {}, 'adminbordet er bare for mobil, og Innboks har sin egen knapp');
});

test('antallPerSide tåler manglende og rare argumenter', () => {
  for (const [sider, tall, rot] of [[MENY, undefined, undefined], [MENY, null, {}], [[], { utleie: 1 }, { utleie: 'https://utleie-hauge-maskin.vercel.app/admin' }],
    [undefined, { utleie: 1 }, { utleie: 'https://utleie-hauge-maskin.vercel.app/admin' }], [MENY, 'tull', 'tull']]) {
    assert.deepEqual(F.antallPerSide(sider, tall, rot), {});
  }
  // En nøkkel som bare finnes i prototypen, regnes ikke som en rot.
  assert.deepEqual(F.antallPerSide(MENY, { toString: 1 }, {}), {});
});

test('antallPerSide følger lokale endringer av en felles side', () => {
  const meny = F.synligeSider({
    shared: require('../src/delt.js').lesDelt(require('../sider.json').pages),
    pages: [side('p1', 'https://egen.no/')],
    overrides: { 'shared:utleie': { url: 'https://utleie-hauge-maskin.vercel.app/admin/maskiner' } },
  });
  assert.deepEqual(F.antallPerSide(meny, { utleie: 3, egen: 1 },
    { utleie: 'https://utleie-hauge-maskin.vercel.app/admin/', egen: 'https://egen.no/' }),
  { 'shared:utleie': 3, p1: 1 });
});

test('tallet i menyen: to sifre, så «99+»', () => {
  assert.deepEqual([0, 1, 9, 10, 99, 100, 250, -1, 1.5, NaN, undefined].map((n) => F.sideTallTekst(n)),
    ['', '1', '9', '10', '99', '99+', '99+', '', '', '', '']);
  assert.equal(F.sideTallTekst(F.vistAntall(false, 5)), '', 'uten kobling vises ingen tall');
  assert.equal(F.sideTallTekst(F.vistAntall(true, 120)), '99+');
});

test('navnet skjermlesere hører for et system med nye saker', () => {
  assert.equal(F.sideTallNavn('Utleie', 3), 'Utleie, 3 nye i Innboks');
  assert.equal(F.sideTallNavn('Utleie', 1), 'Utleie, 1 ny i Innboks');
  assert.equal(F.sideTallNavn('Rørlager', 140), 'Rørlager, 140 nye i Innboks', 'hele tallet, ikke 99+');
});

test('sider.json har Innboks-siden for både PC og mobil, på standardadressen', () => {
  const delt = require('../sider.json');
  const p = delt.pages.find((x) => x.id === 'innboks');
  assert.ok(p, 'sider.json mangler id innboks');
  assert.equal(new URL(p.url).origin, F.INNBOKS_STANDARD);
  assert.ok(!p.hidden && (p.plattform || 'begge') === 'begge', 'mobilappen skal få Innboks også');
});
