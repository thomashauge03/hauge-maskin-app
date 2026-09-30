# Hauge Maskin – skrivebordsapp

En Windows-skrivebordsapp som samler alle nettsidene og verktøyene til Hauge Maskin
på ett sted. Hver side ligger i sidemenyen, og du kan legge til dine egne
nettadresser når som helst.

![Logo](assets/logo.png)

## Last ned

| Fil | Når du bruker den |
| --- | --- |
| [**Hauge-Maskin-Setup-2.9.1.exe**](https://github.com/thomashauge03/hauge-maskin-app/releases/latest/download/Hauge-Maskin-Setup-2.9.1.exe) | **Anbefalt.** Vanlig installasjon, lager snarvei på skrivebordet – og **oppdaterer seg selv**. |
| [**Hauge-Maskin-2.9.1.exe**](https://github.com/thomashauge03/hauge-maskin-app/releases/latest/download/Hauge-Maskin-2.9.1.exe) | Portabel, kjører rett fra en minnepinne. Oppdaterer seg **ikke** selv. |

Alle versjoner ligger under [Releases](https://github.com/thomashauge03/hauge-maskin-app/releases).

> Windows SmartScreen kan gi en advarsel første gangen, fordi filen ikke er
> kodesignert. Velg **Mer info → Kjør likevel**.

## Felles sider for alle

Appen henter en felles sideliste fra [`sider.json`](sider.json) i dette repoet.
Du legger sider inn **ett** sted, og alle som har appen får dem automatisk – med
mindre de har endret adressen i Innstillinger.

Slik legger du til en ny felles side:

1. Rediger [`sider.json`](sider.json) og legg til et objekt i `pages`:
   ```json
   { "id": "ordre", "name": "Ordresystem", "url": "https://…", "group": "Verktøy", "color": "#e2001a", "image": "https://…/ikon.png" }
   ```
   `id` må være unik. `group`, `color` og `image` er valgfrie.
2. Commit og push til `main`.
3. Appene henter listen på nytt ved oppstart og hvert 15. minutt (kan endres i
   Innstillinger). Knappen **Synk** henter med en gang.

### Adminmodus – endre listen for alle rett fra appen

Med et GitHub-token lagt inn under **Innstillinger → Admin** kan du endre den
felles listen uten å røre GitHub manuelt. Da får dialogen to lagreknapper:

| Knapp | Hva skjer |
| --- | --- |
| **Bare meg** | Endringen gjelder denne maskinen (som før). |
| **For alle** | Skriver endringen til `sider.json` på GitHub. Alle andre får den ved neste synk, eller når de trykker **Synk**. |

Du kan også **Legg til for alle** når du lager en ny side. To måter å ta en side
ut av menyen på:

| Knapp | Hva skjer |
| --- | --- |
| **Skjul for alle** | Siden forsvinner fra menyen hos alle, men oppsettet står igjen. Hentes fram igjen når som helst. |
| **Fjern for alle** | Siden blir slettet fra listen. Det er endelig. |

Skjulte sider ligger nederst i menyen bak **«N skjulte sider»**. Trykk på en av dem
for å hente den fram igjen.

### Hvor skal siden vises?

Hver felles side har et valg for hvor den hører hjemme:

| Valg | Hva det gjør |
| --- | --- |
| **PC og mobil** | Standard. Siden står i menyen begge steder. |
| **Bare PC** | Siden forsvinner fra mobilappen. For systemer som ikke er til å bruke på en liten skjerm. |
| **Bare mobil** | Siden står bare på telefonen. |

Valget ligger i sideredigeringen og gjelder for alle. Sider merket **bare mobil**
står ikke i PC-menyen, men du finner dem igjen under «skjulte sider» og i
Innstillinger, så de kan endres derfra.

**Send alt ut til alle** (Innstillinger → Admin) sender hele listen slik du ser
den: navn, adresser, grupper, farger **og ikoner** – inkludert de ikonene appen har
hentet automatisk. Bruk denne når du har finpusset flere sider og vil at alle
skal få akkurat det samme oppsettet. De lokale endringene dine blir samtidig
gjort offisielle, så «endret»-prikkene forsvinner.

Ikoner blir lagret som små 192×192-bilder direkte i `sider.json`, så de virker også
uten nett. Appen stopper deg om listen skulle bli større enn 400 kB.

Slik lager du tokenet:

1. Gå til [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. **Repository access** → *Only select repositories* → `hauge-maskin-app`
3. **Permissions** → *Repository permissions* → **Contents: Read and write**
4. Lag tokenet, kopier det, og lim det inn i **Innstillinger → Admin → Lagre token**

Tokenet blir kryptert med nøkkelhvelvet i Windows og ligger bare på din
maskin. Det følger aldri med i eksport eller synkronisering. Bare maskiner med
token kan endre den felles listen – alle andre kan bare lese den.

### Endre en felles side på egen maskin

Felles sider kan også endres lokalt – høyreklikk på siden, eller bruk blyanten i
verktøylinjen. Navn, adresse, gruppe, farge og bilde kan overstyres, og
endringene gjelder bare den maskinen. Siden får en rød prikk i menyen.

- **Tilbakestill** i dialogen fjerner overstyringen, så siden følger den delte
  listen igjen.
- **Skjul** tar siden vekk fra menyen uten å slette den. Den havner nederst i menyen
  bak «N skjulte sider», merket **meg**, og ett trykk henter den fram igjen.

Det samme gjelder sidene du har lagt til selv: de blir ikke kastet, men lagt i
en papirkurv og merket **slettet** i samme liste. De 25 siste blir tatt vare på.

Alt som er tatt ut av menyen ligger også samlet under **Innstillinger → Skjulte og
slettede sider**. Den listen står alltid, også når den er tom, så du vet hvor du
skal lete.
- Nye sider i den delte listen dukker opp uansett, og overstyringene overlever
  synkroniseringen.

## Funksjoner

- **Siden som er åpen** – øverst i sidemenyen ser du ikonet og navnet på siden du
  står på. En rød bølge glir over bokstavene, så det aldri føles dødt.
- **Sidemeny med grupper** – organiser sidene i grupper (f.eks. Verktøy, Offentlig).
- **Legg til / rediger / slett sider** – knappen «Legg til side», eller høyreklikk
  på en side i menyen for å redigere.
- **Bilde på hver lenke** – velg en bildefil fra maskinen, lim inn en bildeadresse,
  eller la appen hente ikonet fra nettsiden selv. Bildene blir lagret i inntil 192×192.
- **Felles sideliste** – alle får de samme sidene, automatisk oppdatert.
- **Ekte nettleser i appen** – hver side blir lastet i et eget vindu og holder
  innlogging (delt økt), så du slipper å logge inn på nytt hver gang.
- **Verktøylinje** – tilbake, fram, last på nytt, hjem, kopier adresse og
  «åpne i nettleser».
- **Søk** – filtrer sidene med Ctrl+F.
- **Import / eksport** – ta med sidene dine over til en annen maskin (JSON-fil).
- **Mobilappen** – knappen nederst i sidemenyen viser en QR-kode. Skann den med
  telefonen, så kommer du til app-siden på nettsiden.
- **Hva er nytt** – etter hver oppdatering viser appen hva som er nytt, én gang.
  Trykk på versjonsnummeret nederst i sidemenyen for å se det igjen.
- **Moderne mørkt design** i svart, hvitt og HM-rødt.

## Hjelpemeny

Spørsmålstegnet i verktøylinjen (eller **F1**) åpner en forklaring på hva siden
du står på er, og en liste over alle de andre. Som admin skriver du teksten under
**Forklaring** i sideredigeringen, og **Lagre for alle** sender den ut til alle.

## Mobilappen

Knappen **Mobilappen** nederst i sidemenyen åpner en QR-kode til
[app-siden på nettsiden](https://haugemaskin.vercel.app/app). Siden spør etter
tilgangskoden for ansatte, og viser så nedlasting for Android, iPhone og PC –
alltid nyeste versjon, så koden trenger ikke endres når det kommer en ny versjon.
**Kopier lenke** i samme dialog er for å sende adressen på SMS eller e-post.

Adressen er `haugemaskin.vercel.app`, ikke `haugemaskin.no`: domenet peker
fortsatt til en gammel server med utløpt sertifikat. `vercel.app`-adressen
fortsetter å virke når domenet en gang blir koblet til Vercel.

QR-koden er en fast fil, `assets/mobil-qr.svg`. Flytter app-siden, lager du den
på nytt og endrer adressen i `src/index.html` og `test/mobil.test.js`:

```bash
npx qrcode@1.5.4 -e M -o assets/mobil-qr.svg https://ny-adresse
```

`npm test` skanner koden og sjekker at den leder dit dialogen sier.

## Hva er nytt

Første gang en ny versjon starter, åpner appen en liste over hva som er nytt.
Versjoner du ikke har sett før, er merket **NY** – har du hoppet over en
versjon, ser du også det som kom i mellomtiden. Nyinstallerte apper får ikke
listen. **Versjon X · Hva er nytt** nederst i sidemenyen åpner den når som helst.

Loggen ligger i [`src/endringer.json`](src/endringer.json), nyeste versjon øverst:

```json
{ "versjon": "2.8.0", "dato": "2026-09-30", "punkt": ["Kort og konkret, for dem som bruker appen"] }
```

**Før hver ny versjon:** legg til en oppføring øverst. `npm test` – og dermed
`npm run dist` – stopper hvis versjonen i `package.json` mangler i loggen.
Utgivelsesnotatet på GitHub lages fra samme oppføring (`somMarkdown` i
`src/nytt.js`), så appen og GitHub sier det samme.

## Lagret innlogging

Bruker du samme brukernavn og passord overalt, legger du det inn **én gang** under
**Innstillinger → Felles innlogging**. Appen fyller det da inn på alle sidene.

Trenger en enkelt side noe annet, legger du det inn under **Innlogging på denne
maskinen** i sideredigeringen. Det går foran den felles innloggingen for den siden.

- Passordene blir kryptert med nøkkelhvelvet i Windows og ligger **bare** på
  den maskinen. De blir aldri sendt til GitHub, kommer ikke med i eksport, og
  passerer aldri grensesnittet – bare hovedprosessen leser dem.
- En innlogging lagret for en enkelt side blir bare fylt inn på det
  **nettstedet den ble lagret for**.
- Den felles innloggingen blir bare fylt inn på **sider som står i menyen** –
  aldri på en tilfeldig side du har navigert deg fram til.
- Utfyllingen skjer **bare når du trykker nøkkelknappen** i verktøylinjen, aldri
  av seg selv når en side blir lastet.
- Appen fyller bare inn i et ekte innloggingsskjema. Finnes det ikke et
  passordfelt på siden, blir ingenting rørt – og søke- og filterfelt blir hoppet
  over.
- Appen trykker **ikke** «logg inn» selv. Du ser hva som blir fylt inn og
  bekrefter selv.
- Sider som bruker «Logg inn med Google/GitHub» har ikke passordfelt. Der er
  det den lagrede økten i appen som gjør at du slipper å logge inn på nytt.

## Dra filer mellom sidene

Laster du ned en fil fra en side – eller lager en PDF som egentlig går via
utskrift – havner den ikke i
nedlastingsmappen, men i et kort nederst i sidemenyen. Derfra drar du filen rett
inn i en annen side.

Knappene **åpne** og **åpne mappen** lar deg se filen uten å dra den noe sted. Etter at filen er dratt over, blir den slettet fra maskinen. Du får seks sekunder med
**Angre** før det skjer, i tilfelle slippet ikke gikk gjennom. Appen tar vare
på de ti siste filene; eldre blir ryddet bort automatisk.

## Hvor lagres hemmeligheter?

GitHub-tokenet og innloggingene blir kryptert med **Windows DPAPI**, knyttet til
brukerkontoen din. De ligger i `admin.dat` og `logins.dat` under
`%APPDATA%\hauge-maskin-app`, og overlever oppdateringer og ominstallasjoner.

Appen tillater bare **én kjørende utgave** om gangen. To utgaver som delte samme
datamappe kunne ødelegge krypteringsnøkkelen, og da gikk token og passord
tapt ved oppdatering.

## Hurtigtaster

| Tast | Handling |
| --- | --- |
| `Ctrl` + `N` | Legg til ny side |
| `Ctrl` + `F` | Søk i sidemenyen |
| `Ctrl` + `R` | Last siden på nytt |
| `Alt` + `←` / `→` | Tilbake / fram |
| `F1` | Åpne hjelpemenyen |
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

Testene kjøres først. Resultatet havner i `dist/` – både en NSIS-installer og
en portabel .exe.

## Hvor lagres sidene?

I `%APPDATA%\hauge-maskin-app\pages.json`.

## Teknologi

Electron 43, uten andre kjøretidsavhengigheter. Kildekode i `src/`:

| Fil | Rolle |
| --- | --- |
| `src/main.js` | Hovedprosess, vindu, lagring, innlogging, IPC |
| `src/preload.js` | Sikker bro mellom hovedprosess og grensesnitt |
| `src/index.html` | Grensesnittet |
| `src/renderer.js` | Logikk for sider, navigasjon og dialoger |
| `src/endringer.json` | Endringsloggen – hva som er nytt i hver versjon |
| `src/nytt.js` | Hva «Hva er nytt» skal vise etter en oppdatering |
| `src/styles.css` | Design |
