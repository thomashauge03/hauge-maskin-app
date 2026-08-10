# Hauge Maskin – skrivebordsapp

Ein Windows-skrivebordsapp som samlar alle nettsidene og verktøya til Hauge Maskin
på éin stad. Kvar side ligg i sidemenyen, og du kan legge til dine eigne
nettadresser når som helst.

![Logo](assets/logo.png)

## Last ned

| Fil | Når du brukar den |
| --- | --- |
| [**Hauge-Maskin-Setup-2.5.3.exe**](https://github.com/thomashauge03/hauge-maskin-app/releases/latest/download/Hauge-Maskin-Setup-2.5.3.exe) | **Tilrådd.** Vanleg installasjon, lagar snarveg på skrivebordet – og **oppdaterer seg sjølv**. |
| [**Hauge-Maskin-2.5.3.exe**](https://github.com/thomashauge03/hauge-maskin-app/releases/latest/download/Hauge-Maskin-2.5.3.exe) | Portabel, køyrer rett frå ein minnepinne. Oppdaterer seg **ikkje** sjølv. |

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

Du kan òg **Legg til for alle** når du lagar ei ny side. To måtar å ta ei side
ut av menyen på:

| Knapp | Kva skjer |
| --- | --- |
| **Skjul for alle** | Sida forsvinn frå menyen hjå alle, men oppsettet står igjen. Hentast fram igjen når som helst. |
| **Fjern for alle** | Sida blir sletta frå lista. Det er endeleg. |

Skjulte sider ligg nedst i menyen bak **«N skjulte sider»**. Trykk på ei av dei
for å hente ho fram igjen.

**Send alt ut til alle** (Innstillingar → Admin) sender heile lista slik du ser
ho: namn, adresser, grupper, fargar **og ikon** – inkludert dei ikona appen har
henta automatisk. Bruk denne når du har finpussa fleire sider og vil at alle
skal få akkurat den same oppsettet. Dei lokale endringane dine blir samtidig
gjort offisielle, så «endra»-prikkane forsvinn.

Ikon blir lagra som små 192×192-bilde direkte i `sider.json`, så dei virkar òg
utan nett. Appen stoppar deg om lista skulle bli større enn 400 kB.

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
- **Skjul** tek sida vekk frå menyen utan å slette ho. Ho hamnar nedst i menyen
  bak «N skjulte sider», merkt **meg**, og eitt trykk hentar ho fram igjen.

Det same gjeld sidene du har lagt til sjølv: dei blir ikkje kasta, men lagde i
ei papirkorg og merkte **sletta** i same lista. Dei 25 siste blir tekne vare på.

Alt som er teke ut av menyen ligg òg samla under **Innstillingar → Skjulte og
sletta sider**. Den lista står alltid, òg når ho er tom, så du veit kvar du
skal leite.
- Nye sider i den delte lista dukkar opp uansett, og overstyringane overlever
  synkroniseringa.

## Funksjonar

- **Sida som er open** – øvst i sidemenyen ser du ikonet og namnet på sida du
  står på. Ei raud bølgje glir over bokstavane, så det aldri kjennest daudt.
- **Sidemeny med grupper** – organiser sidene i grupper (t.d. Verktøy, Offentleg).
- **Legg til / rediger / slett sider** – knappen «Legg til side», eller høgreklikk
  på ei side i menyen for å redigere.
- **Bilde på kvar lenke** – vel ei biletfil frå maskina, lim inn ei bildeadresse,
  eller la appen hente ikonet frå nettsida sjølv. Bilda blir lagra i inntil 192×192.
- **Felles sideliste** – alle får dei same sidene, automatisk oppdatert.
- **Ekte nettlesar i appen** – kvar side blir lasta i eit eige vindauge og held
  innlogging (delt økt), så du slepp å logge inn på nytt kvar gong.
- **Verktøylinje** – tilbake, fram, last på nytt, heim, kopier adresse og
  «opne i nettlesar».
- **Søk** – filtrer sidene med Ctrl+F.
- **Import / eksport** – ta med sidene dine over til ei anna maskin (JSON-fil).
- **Moderne mørkt design** i svart, kvitt og HM-raudt.

## Hjelpemeny

Spørsmålsteiknet i verktøylinja (eller **F1**) opnar ei forklaring på kva sida
du står på er, og ei liste over alle dei andre. Som admin skriv du teksten under
**Forklaring** i sideredigeringa, og **Lagre for alle** sender han ut til alle.

## Lagra innlogging

Brukar du same brukarnamn og passord overalt, legg du det inn **éin gong** under
**Innstillingar → Felles innlogging**. Appen fyller det då inn på alle sidene.

Treng ei enkelt side noko anna, legg du det inn under **Innlogging på denne
maskina** i sideredigeringa. Det går føre den felles innlogginga for den sida.

- Passorda blir krypterte med Windows sin eigen nøkkelkvelv og ligg **berre** på
  den maskina. Dei blir aldri sende til GitHub, kjem ikkje med i eksport, og
  passerer aldri grensesnittet – berre hovudprosessen les dei.
- Ei innlogging lagra for ei enkelt side blir berre fylt inn på den
  **nettstaden ho vart lagra for**.
- Den felles innlogginga blir berre fylt inn på **sider som står i menyen** –
  aldri på ei tilfeldig side du har navigert deg fram til.
- Utfyllinga skjer **berre når du trykkjer nøkkelknappen** i verktøylinja, aldri
  av seg sjølv når ei side blir lasta.
- Appen fyller berre inn i eit ekte innloggingsskjema. Finst det ikkje eit
  passordfelt på sida, blir ingenting rørt – og søke- og filterfelt blir hoppa
  over.
- Appen trykkjer **ikkje** «logg inn» sjølv. Du ser kva som blir fylt inn og
  bekreftar sjølv.
- Sider som brukar «Logg inn med Google/GitHub» har ikkje passordfelt. Der er
  det den lagra økta i appen som gjer at du slepp å logge inn på nytt.

## Dra filer mellom sidene

Lastar du ned ei fil frå ei side – eller lagar ein PDF som eigentleg går via
utskrift – hamnar ho ikkje i
nedlastingsmappa, men i eit kort nedst i sidemenyen. Derifrå drar du fila rett
inn i ei anna side.

Knappane **opne** og **opne mappa** lèt deg sjå fila utan å dra ho nokon stad. Etter at fila er dradd over, blir ho sletta frå maskina. Du får seks sekund med
**Angre** før det skjer, i tilfelle slippet ikkje gjekk gjennom. Appen tek vare
på dei ti siste filene; eldre blir rydda bort automatisk.

## Kvar blir hemmelegheiter lagra?

GitHub-tokenet og innloggingane blir krypterte med **Windows DPAPI**, knytt til
brukarkontoen din. Dei ligg i `admin.dat` og `logins.dat` under
`%APPDATA%\hauge-maskin-app`, og overlever oppdateringar og ominstallasjonar.

Appen tillèt berre **éi køyrande utgåve** om gongen. To utgåver som delte same
datamappe kunne øydeleggje krypteringsnøkkelen, og då gjekk token og passord
tapt ved oppdatering.

## Hurtigtastar

| Tast | Handling |
| --- | --- |
| `Ctrl` + `N` | Legg til ny side |
| `Ctrl` + `F` | Søk i sidemenyen |
| `Ctrl` + `R` | Last sida på nytt |
| `Alt` + `←` / `→` | Tilbake / fram |
| `F1` | Opne hjelpemenyen |
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

Electron 43, utan andre køyretidsavhengnader. Kjeldekode i `src/`:

| Fil | Rolle |
| --- | --- |
| `src/main.js` | Hovudprosess, vindauge, lagring, innlogging, IPC |
| `src/preload.js` | Sikker bru mellom hovudprosess og grensesnitt |
| `src/index.html` | Grensesnittet |
| `src/renderer.js` | Logikk for sider, navigasjon og dialogar |
| `src/styles.css` | Design |
