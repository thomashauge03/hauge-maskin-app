/* Den felles sidelisten inn og ut av appen.

   Listen i sider.json skrives også av adminbordet, og den kan ha felt
   denne appen ikke kjenner – for eksempel `nokkel`, som slår av nøkkelknappen
   i mobilappen. Før ble slike felt kastet ved lesing, og en publisering herfra
   slettet dem stille for alle. Nå legges de i `ekstra` og sendes uendret
   tilbake.

   Brukes både i hovedprosessen (require) og i grensesnittet (window.HM_DELT),
   og testes med `npm test` (test/delt.test.js). */
(function (eksporter) {
  const KJENTE = ['id', 'name', 'url', 'group', 'color', 'image', 'help', 'hidden', 'plattform'];

  function lesDelt(liste) {
    return liste
      .filter((p) => p && p.name && p.url)
      .map((p, i) => {
        const ekstra = {};
        for (const [k, v] of Object.entries(p)) if (!KJENTE.includes(k)) ekstra[k] = v;
        return {
          id: 'shared:' + (p.id || String(i)),
          name: String(p.name),
          url: String(p.url),
          group: p.group ? String(p.group) : 'Felles',
          color: p.color ? String(p.color) : '#e2001a',
          image: p.image ? String(p.image) : '',
          help: p.help ? String(p.help) : '',
          hidden: p.hidden === true, // skjult for alle, satt av admin
          // 'begge' | 'pc' | 'mobil' - hvor siden skal vises
          plattform: ['pc', 'mobil'].includes(p.plattform) ? p.plattform : 'begge',
          shared: true,
          ekstra
        };
      });
  }

  const bareId = (id) => String(id).replace(/^shared:/, '');

  function tilDelt(liste) {
    return liste.map((p) => {
      // Ukjente felt først, så de kjente går foran hvis begge finnes
      const out = { ...(p.ekstra || {}), id: bareId(p.id), name: p.name, url: p.url };
      if (p.group) out.group = p.group;
      if (p.color) out.color = p.color;
      if (p.help) out.help = p.help;
      if (p.hidden) out.hidden = true;
      if (p.plattform && p.plattform !== 'begge') out.plattform = p.plattform;
      if (p.image) out.image = p.image;
      return out;
    });
  }

  /* Rett før publisering: felt appen ikke kjenner, blir tatt fra den
     ferske kopien på GitHub, ikke fra appens mellomlagrede liste.

     Appen synker hvert 15. minutt. Slår noen av nøkkelknappen i
     adminbordet, og noen publiserer fra PC før neste synk, ville den gamle
     verdien ellers skrive over den nye – uten feil, fordi appen henter sha-en
     rett før den skriver. De ukjente feltene eier appen aldri selv, så den
     ferske kopien har alltid rett for dem.

     utgaaende – listen slik tilDelt lager den
     ferske    – sidene i sider.json slik de ligger på GitHub nå, eller null */
  function flettUkjente(utgaaende, ferske) {
    if (!Array.isArray(ferske)) return utgaaende;
    const etterId = new Map(ferske.filter((p) => p && p.id).map((p) => [String(p.id), p]));
    return utgaaende.map((p) => {
      const fersk = etterId.get(String(p.id));
      if (!fersk) return p;
      const ut = {};
      for (const [k, v] of Object.entries(p)) if (KJENTE.includes(k)) ut[k] = v;
      for (const [k, v] of Object.entries(fersk)) if (!KJENTE.includes(k)) ut[k] = v;
      return ut;
    });
  }

  eksporter({ lesDelt, tilDelt, bareId, flettUkjente });
})(typeof module !== 'undefined' && module.exports
  ? (x) => { module.exports = x; }
  : (x) => { window.HM_DELT = x; });
