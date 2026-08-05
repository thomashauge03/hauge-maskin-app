# Hauge Maskin – skrivebordsapp

Ein Windows-skrivebordsapp som samlar alle nettsidene og verktøya til Hauge Maskin
på éin stad. Kvar side ligg i sidemenyen, og du kan legge til dine eigne
nettadresser når som helst.

![Logo](assets/logo.png)

## Last ned

| Fil | Når du brukar den |
| --- | --- |
| [**Hauge-Maskin-Setup-1.3.2.exe**](https://github.com/thomashauge03/hauge-maskin-app/releases/latest/download/Hauge-Maskin-Setup-1.3.2.exe) | **Tilrådd.** Vanleg installasjon, lagar snarveg på skrivebordet – og **oppdaterer seg sjølv**. |
| [**Hauge-Maskin-1.3.2.exe**](https://github.com/thomashauge03/hauge-maskin-app/releases/latest/download/Hauge-Maskin-1.3.2.exe) | Portabel, køyrer rett frå ein minnepinne. Oppdaterer seg **ikkje** sjølv. |

Alle versjonar ligg under [Releases](https://github.com/thomashauge03/hauge-maskin-app/releases).

> Windows SmartScreen kan gi ei åtvaring første gongen, fordi fila ikkje er
> kodesignert. Vel **Meir info → Køyr likevel**.

## Felles sider for alle

Appen hentar ei felles sideliste frå [`sider.json`](sider.json) i dette repoet.
Du legg sider inn **éin** stad, og alle som har appen får dei automatisk – med
mindre dei har endra adressa i Innstillingar.

Slik legg du til ei ny felles side:

1. Rediger [`sider.json`](sider.json) og legg til eit objekt i `pages`:
   ```json
   { "id": "ordre", "name": "Ordresystem", "url": "https://…", "group": "Verktøy", "color": "#e2001a", "image": "https://…/ikon.png" }
   ```
   `id` må vere unik. `group`, `color` og `image` er valfrie.
2. Commit og push til `main`.
3. Appane hentar lista på nytt ved oppstart og kvart 15. minutt (kan endrast i
   Innstillingar). Knappen **Synk** hentar med ein gong.

### Adminmodus – endre lista for alle rett frå appen

Med eit GitHub-token lagt inn under **Innstillingar → Admin** kan du endre den
felles lista utan å røre GitHub manuelt. Då får dialogen to lagreknappar:

| Knapp | Kva skjer |
| --- | --- |
| **Berre meg** | Endringa gjeld denne maskina (som før). |
| **For alle** | Skriv endringa til `sider.json` på GitHub. Alle andre får ho ved neste synk, eller når dei trykkjer **Synk**. |

Du kan òg **Legg til for alle** når du lagar ei ny side, og **Fjern for alle**
for å ta ei side ut av lista.

Slik lagar du tokenet:

1. Gå til [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. **Repository access** → *Only select repositories* → `hauge-maskin-app`
3. **Permissions** → *Repository permissions* → **Contents: Read and write**
4. Lag tokenet, kopier det, og lim det inn i **Innstillingar → Admin → Lagre token**

Tokenet blir kryptert med Windows sin eigen nøkkelkvelv og ligg berre på di
maskin. Det følgjer aldri med i eksport eller synkronisering. Berre maskiner med
token kan endre den felles lista – alle andre kan berre lese ho.

### Endre ei felles side på eiga maskin

Felles sider kan òg endrast lokalt – høgreklikk på sida, eller bruk blyanten i
verktøylinja. Namn, adresse, gruppe, farge og bilde kan overstyrast, og
endringane gjeld berre den maskina. Sida får ein raud prikk i menyen.

- **Tilbakestill** i dialogen fjernar overstyringa, så sida følgjer den delte
  lista igjen.
- **Skjul** tek sida vekk frå menyen utan å slette ho. Skjulte sider kan hentast
  fram igjen under Innstillingar.
- Nye sider i den delte lista dukkar opp uansett, og overstyringane overlever
  synkroniseringa.

## Funksjonar

- **Sidemeny med grupper** – organiser sidene i grupper (t.d. Verktøy, Offentleg).
- **Legg til / rediger / slett sider** – knappen «Legg til side», eller høgreklikk
  på ei side i menyen for å redigere.
- **Bilde på kvar lenke** – vel ei biletfil frå maskina, lim inn ei bildeadresse,
  eller la appen hente ikonet frå nettsida sjølv. Bilda blir krympa til 64×64.
- **Felles sideliste** – alle får dei same sidene, automatisk oppdatert.
- **Ekte nettlesar i appen** – kvar side blir lasta i eit eige vindauge og held
  innlogging (delt økt), så du slepp å logge inn på nytt kvar gong.
- **Verktøylinje** – tilbake, fram, last på nytt, heim, kopier adresse og
  «opne i nettlesar».
- **Søk** – filtrer sidene med Ctrl+F.
- **Import / eksport** – ta med sidene dine over til ei anna maskin (JSON-fil).
- **Moderne mørkt design** i svart, kvitt og HM-raudt.

## Hurtigtastar

| Tast | Handling |
| --- | --- |
| `Ctrl` + `N` | Legg til ny side |
| `Ctrl` + `F` | Søk i sidemenyen |
| `Ctrl` + `R` | Last sida på nytt |
| `Alt` + `←` / `→` | Tilbake / fram |
| `Esc` | Lukk dialog |

## Kom i gang

```bash
npm install
npm start
```

## Lage installasjonsfil (.exe)

```bash
npm run dist
```

Resultatet hamnar i `dist/` – både ein NSIS-installer og ein portabel .exe.

## Kvar blir sidene lagra?

I `%APPDATA%\hauge-maskin-app\pages.json`.

## Teknologi

Electron 32, utan andre køyretidsavhengnader. Kjeldekode i `src/`:

| Fil | Rolle |
| --- | --- |
| `src/main.js` | Hovudprosess, vindauge, lagring, IPC |
| `src/preload.js` | Sikker bru mellom hovudprosess og grensesnitt |
| `src/index.html` | Grensesnittet |
| `src/renderer.js` | Logikk for sider, navigasjon og dialogar |
| `src/styles.css` | Design |
