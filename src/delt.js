/* Den felles sidelista inn og ut av appen.

   Lista i sider.json blir også skriven av adminbordet, og ho kan ha felt
   denne appen ikkje kjenner – til dømes `nokkel`, som slår av nøkkelknappen
   i mobilappen. Før vart slike felt kasta ved lesing, og ei publisering herifrå
   sletta dei stilt for alle. No blir dei lagde i `ekstra` og sende uendra
   tilbake.

   Brukt både i hovudprosessen (require) og i grensesnittet (window.HM_DELT),
   og testa med `npm test` (test/delt.test.js). */
(function (eksporter) {
  const KJENDE = ['id', 'name', 'url', 'group', 'color', 'image', 'help', 'hidden', 'plattform'];

  function lesDelt(liste) {
    return liste
      .filter((p) => p && p.name && p.url)
      .map((p, i) => {
        const ekstra = {};
        for (const [k, v] of Object.entries(p)) if (!KJENDE.includes(k)) ekstra[k] = v;
        return {
          id: 'shared:' + (p.id || String(i)),
          name: String(p.name),
          url: String(p.url),
          group: p.group ? String(p.group) : 'Felles',
          color: p.color ? String(p.color) : '#e2001a',
          image: p.image ? String(p.image) : '',
          help: p.help ? String(p.help) : '',
          hidden: p.hidden === true, // skjult for alle, sett av admin
          // 'begge' | 'pc' | 'mobil' - kvar sida skal visast
          plattform: ['pc', 'mobil'].includes(p.plattform) ? p.plattform : 'begge',
          shared: true,
          ekstra
        };
      });
  }

  const bareId = (id) => String(id).replace(/^shared:/, '');

  function tilDelt(liste) {
    return liste.map((p) => {
      // Ukjende felt først, så dei kjende går føre om begge finst
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

  /* Rett før publisering: felt appen ikkje kjenner, blir tekne frå den
     ferske kopien på GitHub, ikkje frå appen si mellomlagra liste.

     Appen synkar kvart 15. minutt. Slår nokon av nøkkelknappen i
     adminbordet, og nokon publiserer frå PC før neste synk, ville den gamle
     verdien elles skrive over den nye – utan feil, fordi appen hentar sha-en
     rett før den skriv. Dei ukjende felta eig appen aldri sjølv, så den
     ferske kopien har alltid rett for dei.

     utgaaende – lista slik tilDelt lagar ho
     ferske    – sidene i sider.json slik dei ligg på GitHub no, eller null */
  function flettUkjende(utgaaende, ferske) {
    if (!Array.isArray(ferske)) return utgaaende;
    const etterId = new Map(ferske.filter((p) => p && p.id).map((p) => [String(p.id), p]));
    return utgaaende.map((p) => {
      const fersk = etterId.get(String(p.id));
      if (!fersk) return p;
      const ut = {};
      for (const [k, v] of Object.entries(p)) if (KJENDE.includes(k)) ut[k] = v;
      for (const [k, v] of Object.entries(fersk)) if (!KJENDE.includes(k)) ut[k] = v;
      return ut;
    });
  }

  eksporter({ lesDelt, tilDelt, bareId, flettUkjende });
})(typeof module !== 'undefined' && module.exports
  ? (x) => { module.exports = x; }
  : (x) => { window.HM_DELT = x; });
