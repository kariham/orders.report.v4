# SOS Meldingen & Bestellingen

Offline-first web-app (PWA) voor operatoren, met 3 formulieren:

| Formulier | Type |
|---|---|
| **Melding incident** | Melding (gegevens melder, betrokkenen, omschrijving, foto's, handtekening) |
| **Melding schade materieel/installatie** | Melding |
| **Bestelling materieel** | Bestelbon (catalogus + manueel invoeren) |

Gebouwd met dezelfde technische basis als de QHSE-inspectietool: 100% offline (IndexedDB), foto's per melding, handtekening, professioneel PDF-rapport met logo, en delen met het team via het native deelmenu.

## Belangrijkste functies

- **Meldingen** (incident / schade): gegevens melder, datum & plaats, een oplijstbare lijst **betrokkenen** (naam + rol), vrije **omschrijving**, **foto's toevoegen**, en een **handtekening** van de melder.
- **Bestelling materieel**: kies artikels uit de catalogus (PBM's, kledij met maat, kantoor- en verpakkingsmateriaal), met aantal per regel. Staat een artikel er niet tussen? Kies **"Ander materiaal (manueel invoeren)"** om vrij te typen.
- **PDF-rapport** genereren en **direct delen**, met dezelfde professionele koptekst (logo + documentbeheer-kadertje) als de QHSE-tool.
- **Alles offline** bruikbaar, installeerbaar als app-icoon (PWA).

## Vragen per meldingstype aanvullen

Momenteel bevat elke melding enkel de basisopbouw (gegevens, betrokkenen, omschrijving, foto's, handtekening). Zodra je de specifieke vragen per meldingstype doorgeeft, vul je die aan in **`js/data.js`** bij het veld `extraQuestions` van de betreffende checklist, in exact hetzelfde formaat als in de QHSE-app:

```js
extraQuestions: [
  { id: 'inc01', text: 'Was er sprake van lichamelijk letsel?' },
  { id: 'inc02', text: 'Waren de juiste PBM\'s gedragen?', checkboxOptions: ['Helm', 'Veiligheidsbril', '...'] }
]
```

Deze vragen krijgen automatisch dezelfde OK/NOK/NVT-knoppen, opmerkingveld en foto-mogelijkheid als in de QHSE-tool, en verschijnen ook zo in het PDF-rapport.

## Bestellingen: ordernummer + verzenden naar leverancier

- **Ordernummer**: bij elke nieuwe bestelling wordt automatisch een nieuw nummer aangemaakt in het formaat `BES-<jaar>-<volgnr>` (bv. `BES-2026-0001`). De teller loopt per jaar op en wordt meteen bewaard; ook bij synchronisatie wordt het hoogste bestaande nummer meegenomen.
- **Leveranciers**: ⚙️ Instellingen → *Leveranciers & e-mailadressen* (naam + e-mailadres). In het bestelformulier kies je de leverancier; de adressen onder *E-mailadressen voor PDF-verzending* komen in CC.
- **Verzenden**: knop *📨 Save & send to supplier* (of op het overzichtsscherm *Verzenden naar leverancier*). De bestelbon-PDF wordt gedownload en je mailprogramma opent met leverancier, onderwerp en volledige bestellijst al ingevuld — de PDF voeg je zelf als bijlage toe (browserbeperking). Na verzenden krijgt de bestelling het label *verzonden*.
- **Opmaak bestelbon (PDF)**: Arial/Helvetica 12 pt, rode titels en rode kolomkoppen (Nr., Omschrijving, Aantal, Eenheidsprijs excl. btw, Totaal excl. btw). Eenheidsprijs per regel is optioneel.

## Artikelnr, EN-normen en vertalingen

- Elk artikel heeft een **artikelnr** (mag leeg blijven), een **Nederlandse en Engelse naam** en **standaard EN-normen**. Aanpassen kan in ⚙️ Instellingen → *Artikelen: artikelnr, EN-normen & vertaling* (klik een artikel open).
- De normenlijst (code + uitleg NL/EN) staat in ⚙️ Instellingen → *EN-normen*: normen aanpassen, toevoegen of verwijderen. Startlijst staat in `js/data.js` (`ORDER_NORMS`), de standaard PBM-lijst in `ORDER_CATALOG`.
- In het bestelformulier worden artikelnr en normen automatisch ingevuld bij het kiezen van een artikel; per regel kan je het artikelnr invullen en normen verwijderen of toevoegen.
- De PDF toont per regel artikelnr en normen, en onderaan een overzicht *Toegepaste EN-normen* met uitleg.

## Bestelcatalogus aanpassen

De volledige lijst bestelbare artikelen staat in `js/data.js` bij `ORDER_CATALOG`. Een artikel toevoegen, hernoemen of verwijderen kan daar gewoon. Artikelen met `hasSize: true` krijgen automatisch een maatveld (kledij); artikelen met `extraFields` krijgen extra invulvelden (zoals type/merk bij toner).

## Publiceren via GitHub Pages

Identiek aan de QHSE-tool:

1. Nieuwe (lege) repo aanmaken op GitHub.
2. Upload de volledige inhoud van deze map (dus **niet** de buitenste map zelf, wel alles wat erin zit: `index.html`, `manifest.json`, `sw.js`, `README.md`, en de mappen `css/`, `js/`, `icons/`) — bv. door alles in één keer naar de "uploading an existing file"-pagina te slepen.
3. **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main**, map: **/ (root)** → Save.
4. Na 1-2 minuten live op `https://<gebruikersnaam>.github.io/<repo-naam>/`.

## Documentcodes

In `js/data.js` staat per formulier een `docControl`-blok (documentcode, naam, revisiedatum, versie, beheerder) dat de koptekst van het PDF-rapport vult. Voorlopig ingevuld:

- Melding incident → `MLD_INC001`
- Melding schade → `MLD_SCH001`
- Bestelling materieel → `MLD_BES001`

Pas deze gerust aan naar jullie eigen documentnummers.

## Instellingen (⚙️)

Via het tandwiel-icoontje linksboven op het startscherm:

- **Extra artikelen toevoegen aan de bestellijst** — voor artikelen die niet in de standaardcatalogus staan, eventueel met een eigen foto zodat je ze makkelijk herkent. Ze worden lokaal opgeslagen (IndexedDB) en verschijnen meteen in de artikel-keuzelijst bij "Material order", zowel in de app als in het PDF-rapport.
- **Leverancier per artikel** — koppel elk artikel (standaard én zelf toegevoegd) aan een leverancier. Die naam verschijnt als hint zodra je dat artikel kiest in een bestelbon, en als kolom in het bestellingenoverzicht (zie hieronder).
- **E-mailadressen instellen** voor de knop "✉️ Verzenden via e-mail" op een afgewerkt formulier — meerdere adressen mogelijk.
- **Online synchronisatie (OneDrive)** — optioneel, zie de aparte sectie hieronder.

## Bestellingenoverzicht

In "📁 Alle formulieren" (startscherm) zit een tweede tabblad **"📦 Bestellingen overzicht"**: een tabel met élke bestelde regel uit alle bestelbonnen (datum, artikel, categorie, aantal, eenheid, maat, voor wie, besteld door, leverancier), nieuwste bovenaan. Tik op een rij om de volledige bestelbon te openen.

### Belangrijk over "Verzenden via e-mail"

Deze app draait volledig offline/statisch (geen server). Browsers laten om veiligheidsredenen **niet toe** dat een website automatisch een bestand als bijlage aan een e-mail toevoegt. De knop doet daarom het maximaal haalbare zonder server of extern account:

1. De PDF wordt gegenereerd en **gedownload** op het toestel.
2. Je e-mailprogramma opent met de ingestelde adressen, onderwerp en een korte instructie al ingevuld — inclusief een verborgen, machineleesbaar **JSON-blokje** met de kerngegevens van de melding/bestelling.
3. Je voegt de zonet gedownloade PDF **handmatig** toe als bijlage, en verzendt.

**Gedeelde, centrale historiek via SharePoint**: dat JSON-blokje in de mail is bedoeld om automatisch verwerkt te worden door een **Power Automate-flow**, die er een rij mee aanmaakt in een gedeelde SharePoint-lijst — zo krijg je een centrale historiek (met besteldatum, afzender, ...) die zichtbaar is voor iedereen, ongeacht van welk toestel de melding kwam. Volledige stap-voor-stap instructies (geen Azure-beheerder nodig) staan in **[`POWER_AUTOMATE_SETUP.md`](./POWER_AUTOMATE_SETUP.md)**.

Tip voor onderweg: de knop **"📤 Delen met team"** (Web Share) hecht de PDF op mobiel wél automatisch vast wanneer je "Mail" kiest uit het deelmenu — alleen vul je de geadresseerde dan zelf in, en zonder het JSON-blokje.

## Online synchronisatie tussen telefoons (OneDrive) — eenmalige setup

Met deze functie (⚙️ Instellingen → "Online synchronisatie") houden meerdere telefoons dezelfde meldingen en bestellingen bij, via een OneDrive-map van je bedrijfsaccount. Er is **geen eigen server** nodig — de app praat rechtstreeks met Microsoft (Graph API). Dit vraagt wél één eenmalige registratie in het Microsoft-beheerportaal (Entra ID / Azure AD) van je bedrijf. Dat kan je zelf doen (of je IT-afdeling), 5 minuten werk:

1. Ga naar **[entra.microsoft.com](https://entra.microsoft.com)** (of portal.azure.com → "Microsoft Entra ID") en log in met je werk-account.
2. **App registrations** → **New registration**.
3. Naam: bv. `SOS Meldingen App`.
4. **Supported account types**: kies **"Accounts in this organizational directory only"** (enkel jullie bedrijf — dit is de eenvoudigste en veiligste keuze).
5. **Redirect URI**: platform = **"Single-page application (SPA)"**, waarde = de **exacte GitHub Pages-URL** van de app, met een `/` op het einde. Bv.: `https://<gebruikersnaam>.github.io/<repo-naam>/`
6. Klik **Register**.
7. Op de "Overview"-pagina die verschijnt, noteer:
   - **Application (client) ID**
   - **Directory (tenant) ID**
8. Ga naar **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → zoek `Files.ReadWrite` → aanvinken → **Add permissions**. (`User.Read` staat er meestal al standaard bij.)
9. Als er een knop **"Grant admin consent for [bedrijfsnaam]"** verschijnt, klik daarop (of vraag dit aan je IT-beheerder). Zonder admin-consent werkt het meestal ook, maar dan krijgt elke collega bij de allereerste keer inloggen een extra goedkeuringsschermpje van Microsoft te zien — dat is normaal.

Geef me daarna gewoon de **Client ID** en **Tenant ID** door — die zijn niet geheim (het zijn geen wachtwoorden) — en ik vul ze in bij ⚙️ **Instellingen → Online synchronisatie**, samen met de naam van de OneDrive-map die je aanmaakt. Daarna log je op elke telefoon eenmalig in met hetzelfde werk-account, en kan iedereen op "🔄 Nu synchroniseren" tikken (of het gebeurt automatisch bij het openen van de app als je al bent ingelogd).

**Hoe het werkt in de praktijk**: bij elke sync haalt de app het gedeelde bestand op uit de OneDrive-map, voegt er de nieuwe/gewijzigde meldingen, bestellingen, extra artikelen en foto's van dit toestel aan toe, en schrijft het resultaat terug — zo blijft elk toestel na een sync helemaal up-to-date. Dit vraagt telkens een actieve internetverbinding; zonder internet blijft alles gewoon lokaal werken zoals voorheen, en haalt de eerstvolgende sync alles weer in evenwicht.

## Technische opbouw

```
index.html             → app-shell
manifest.json          → PWA-configuratie
sw.js                   → service worker (offline + auto-update van eigen bestanden)
css/style.css           → styling
js/data.js              → formulieren + bestelcatalogus (hier pas je content aan)
js/db.js                → IndexedDB-opslag (100% lokaal)
js/pdf.js                → PDF-rapportgeneratie (jsPDF + autotable)
js/app.js                → app-logica: navigatie, formulieren, foto's, handtekening, leveranciers, bestellingenoverzicht
js/sync.js               → online synchronisatie via OneDrive (Microsoft Graph + MSAL)
js/msal-browser.min.js   → Microsoft-inlogbibliotheek (lokaal meegeleverd, geen CDN nodig)
js/logo.js               → bedrijfslogo (base64)
icons/                   → app-iconen (PWA)
```

Geen build-stap, geen framework, geen backend — puur HTML/CSS/JavaScript.
