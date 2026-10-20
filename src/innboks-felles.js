/* Innboks i appen: hvilken side en lenke hører til, hvem som får broen, og tallene på knappen og i menyen.

   Brukes både i hovedprosessen (require) og i grensesnittet (window.HM_INNBOKS), og testes med
   `npm test` (test/innboks-felles.test.js). Ren logikk: ingen Electron, ingen filer, ikke nett. */
(function (eksporter) {
  const INNBOKS_ID = 'shared:innboks';
  const INNBOKS_STANDARD = 'https://innboks-hauge-maskin.vercel.app';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Samme regel som normalizeUrl i renderer.js: en adresse uten skjema er https.
  function sideUrl(raa) {
    const s = String(raa || '').trim();
    if (!s) return null;
    const full = /^(https?|file):\/\//i.test(s) ? s : 'https://' + s.replace(/^\/+/, '');
    try { return new URL(full); } catch { return null; }
  }

  // En lenke som skal åpnes, må være en hel http- eller https-adresse uten innlogging i seg.
  // Alt annet (javascript:, file:, mailto:) åpnes aldri herfra.
  function lenkeUrl(lenke) {
    if (typeof lenke !== 'string' || lenke.length > 2048) return null;
    let u;
    try { u = new URL(lenke); } catch { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u;
  }

  function medOverstyring(p, data) {
    const o = ((data && data.overrides) || {})[p.id];
    return o ? { ...p, ...o, shared: true, edited: true } : p;
  }

  // Innboks-siden fra den felles listen, med lokale endringer. Mangler den, eller er den ikke
  // https, brukes standardadressen: broen skal aldri gis til en side uten https.
  function innboksSide(data) {
    const delt = ((data && data.shared) || []).find((p) => p && p.id === INNBOKS_ID);
    const side = delt ? medOverstyring(delt, data) : null;
    const u = side ? sideUrl(side.url) : null;
    if (side && u && u.protocol === 'https:') return side;
    return { id: INNBOKS_ID, name: 'Innboks', url: INNBOKS_STANDARD + '/', group: 'System', color: '#e2001a', image: '', help: '', shared: true };
  }

  function innboksOpphav(data) {
    return sideUrl(innboksSide(data).url).origin;
  }

  // Sidene i den vanlige menyen. Samme utvalg som renderer.js alltid har brukt, men uten
  // Innboks, som har sin egen knapp.
  function synligeSider(data) {
    const delte = ((data && data.shared) || [])
      .map((p) => medOverstyring(p, data))
      .filter((p) => !p.hidden && p.plattform !== 'mobil' && p.id !== INNBOKS_ID);
    return [...delte, ...((data && data.pages) || [])];
  }

  // Sidene en lenke fra Innboks kan åpnes i: Innboks selv og alt i menyen.
  function rutesider(data) {
    return [innboksSide(data), ...synligeSider(data)];
  }

  const segmenter = (sti) => sti.split('/').filter(Boolean);

  /* Siden i menyen som har samme opphav som lenken og lengst felles sti med den.

     Rørlager har både /admin og / i menyen. En lenke til /admin?fane=bestillinger skal til
     admin-siden, en lenke til /bestill til kundesiden. Felles sti telles i hele ledd, så /app
     ikke regnes som felles med /application. Ved likt antall vinner en side der hele stien er
     med i lenken, deretter den som står først i menyen. */
  function finnSide(lenke, sider) {
    const u = lenkeUrl(lenke);
    if (!u) return null;
    const lenkeLedd = segmenter(u.pathname);
    let beste = null;
    let besteFelles = -1;
    let besteHel = false;
    for (const side of sider || []) {
      const s = side ? sideUrl(side.url) : null;
      if (!s || s.origin !== u.origin) continue;
      const sideLedd = segmenter(s.pathname);
      let felles = 0;
      while (felles < sideLedd.length && felles < lenkeLedd.length && sideLedd[felles] === lenkeLedd[felles]) felles++;
      const hel = felles === sideLedd.length;
      if (felles > besteFelles || (felles === besteFelles && hel && !besteHel)) {
        beste = side;
        besteFelles = felles;
        besteHel = hel;
      }
    }
    return beste;
  }

  // Saken i Innboks. Adressen bygges av vår egen Innboks-adresse og sakens id, aldri av en lenke
  // fra nettet. En id som ikke er en uuid, gir forsiden.
  function saksLenke(data, sakId) {
    const rot = innboksOpphav(data) + '/';
    return typeof sakId === 'string' && UUID.test(sakId) ? rot + '#/sak/' + sakId.toLowerCase() : rot;
  }

  // «Åpne i …» fra Innboks: siden lenken hører til, eller null når ingen side i appen passer.
  function maalForLenke(lenke, data) {
    const side = finnSide(lenke, rutesider(data));
    return side ? { sideId: side.id, lenke: lenkeUrl(lenke).href } : null;
  }

  // Et klikk på et Windows-varsel: kildeappen når sakens lenke passer til en side i menyen,
  // ellers saken i Innboks.
  function maalForVarsel(varsel, data) {
    const v = varsel || {};
    const side = finnSide(v.kilde_lenke, synligeSider(data));
    if (side) return { sideId: side.id, lenke: lenkeUrl(v.kilde_lenke).href };
    return { sideId: INNBOKS_ID, lenke: saksLenke(data, v.sak_id) };
  }

  /* Broen gir tilgang til enhetsnøkkelen. Adressen til Innboks-siden kan endres i sider.json og
     lokalt uten en ny versjon av appen, så broen følger ikke den, men står fast i koden. Peker
     siden et annet sted, vises den, men uten bro. */
  const BRO_OPPHAV = INNBOKS_STANDARD;

  // Broen legges bare på en fane som starter på Innboksens eget opphav, over https.
  function broSkalMed(src) {
    const u = lenkeUrl(src);
    return !!u && u.protocol === 'https:' && u.origin === BRO_OPPHAV;
  }

  // Hvert kall over broen sjekkes på nytt, fordi fanen kan ha navigert bort etter at den fikk
  // broen. Bare toppramma teller, aldri en iframe inne i siden.
  function broTillatt(ramme) {
    return !!ramme && ramme.toppramme === true && ramme.opphav === BRO_OPPHAV;
  }

  // Tallet på knappen og ikonet. Over ni blir det «9+», ellers blir merket uleselig.
  function merkeTekst(n) {
    if (!Number.isInteger(n) || n <= 0) return '';
    return n > 9 ? '9+' : String(n);
  }

  // Tallet som faktisk vises på knappen. Uten kobling vet appen ikke hva som er ulest, og da vises ingenting.
  function vistAntall(koblet, uleste) {
    return koblet && merkeTekst(uleste) ? uleste : 0;
  }

  // Merket hopper når det dukker opp, og når tallet øker, så nye saker merkes selv om knappen alt var rød.
  // Et tall som går ned, er noe brukeren har gjort selv, og skal ikke rope.
  function skalHoppe(forrige, naa) {
    return naa > 0 && naa > forrige;
  }

  /* Siden i menyen som skal ha tallet for en kilde. Innboks er for de ansatte, og sakene lenker
     til adminsiden. Rørlager og Leveringseddel har likevel roten / i Innboks, og da ville finnSide
     gitt tallet til kundesiden på / (Rørlager Kunder, Leveringseddel). Derfor vinner den dypeste
     siden som ligger under roten, ved likt den som står først i menyen. Ligger ingen side under
     roten (Tilbudssystemet har /dashboard og roten /, Hjemmesiden roten /admin/ og siden /),
     gjelder samme regel som for lenkene. */
  function sideForKilde(rot, sider) {
    const u = lenkeUrl(rot);
    if (!u) return null;
    const rotLedd = segmenter(u.pathname);
    let beste = null;
    let besteDybde = -1;
    for (const side of sider || []) {
      const s = side ? sideUrl(side.url) : null;
      if (!s || s.origin !== u.origin) continue;
      const sideLedd = segmenter(s.pathname);
      if (!rotLedd.every((ledd, i) => sideLedd[i] === ledd)) continue;
      if (sideLedd.length > besteDybde) {
        beste = side;
        besteDybde = sideLedd.length;
      }
    }
    return beste || finnSide(rot, sider);
  }

  /* Hvor mange nye hvert system i menyen har, som { [sideId]: antall }. Hver kilde i Innboks
     legges på siden sideForKilde velger. Flere kilder på samme side legges sammen. En kilde uten
     side i menyen faller bort her, men er fortsatt med i tallet på Innboks-knappen. */
  function antallPerSide(sider, ulestePerKilde, kildeRot) {
    const ut = {};
    const tall = ulestePerKilde && typeof ulestePerKilde === 'object' ? ulestePerKilde : {};
    const rot = kildeRot && typeof kildeRot === 'object' ? kildeRot : {};
    for (const slug of Object.keys(tall)) {
      const n = tall[slug];
      if (!Number.isSafeInteger(n) || n <= 0) continue;
      if (!Object.prototype.hasOwnProperty.call(rot, slug)) continue;
      const side = sideForKilde(rot[slug], sider);
      if (!side) continue;
      ut[side.id] = (ut[side.id] || 0) + n;
    }
    return ut;
  }

  // Tallet i menyen har plass til to sifre. Over 99 blir det «99+».
  function sideTallTekst(n) {
    if (!Number.isInteger(n) || n <= 0) return '';
    return n > 99 ? '99+' : String(n);
  }

  // Det skjermlesere hører for et system med nye saker. Hele tallet, ikke 99+.
  function sideTallNavn(navn, n) {
    return `${navn}, ${n} ${n === 1 ? 'ny' : 'nye'} i Innboks`;
  }

  // Navnet på knappen, både som verktøytips og for skjermlesere. Uten kobling sier knappen hva som skal til
  // for å se tallet, i stedet for å se ut som om ingenting er ulest.
  function knappNavn(koblet, uleste) {
    if (!koblet) return 'Innboks: logg inn for å se uleste';
    const n = vistAntall(koblet, uleste);
    return n ? `Innboks: ${n} ${n === 1 ? 'ulest' : 'uleste'}` : 'Innboks';
  }

  eksporter({
    INNBOKS_ID, INNBOKS_STANDARD, BRO_OPPHAV, innboksSide, innboksOpphav, synligeSider, rutesider, finnSide,
    saksLenke, maalForLenke, maalForVarsel, broSkalMed, broTillatt, merkeTekst, vistAntall, skalHoppe, knappNavn,
    antallPerSide, sideTallTekst, sideTallNavn
  });
})(typeof module !== 'undefined' && module.exports
  ? (x) => { module.exports = x; }
  : (x) => { window.HM_INNBOKS = x; });
