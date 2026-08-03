# Hauge Maskin – skrivebordsapp

Ein Windows-skrivebordsapp som samlar alle nettsidene og verktøya til Hauge Maskin
på éin stad. Kvar side ligg i sidemenyen, og du kan legge til dine eigne
nettadresser når som helst.

![Logo](assets/logo.png)

## Funksjonar

- **Sidemeny med grupper** – organiser sidene i grupper (t.d. Verktøy, Offentleg).
- **Legg til / rediger / slett sider** – knappen «Legg til side», eller høgreklikk
  på ei side i menyen for å redigere.
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
