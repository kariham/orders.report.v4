# Power Automate + SharePoint — gedeelde historiek opzetten

Dit document legt uit hoe je meldingen en bestellingen, verzonden via de knop
**"✉️ Verzenden via e-mail"** in de app, automatisch laat verwerken tot een
gedeelde, doorzoekbare historiek in SharePoint — met besteldatum, afzender,
en een link naar de PDF. Geen Azure-app-registratie nodig, enkel een gewoon
Microsoft 365-account met toegang tot Power Automate (meestal standaard
inbegrepen) en een SharePoint-site.

## Hoe het geheel in elkaar zit

```
Operator vult formulier in op telefoon
        │
        ▼
"Verzenden via e-mail"-knop:
  • downloadt de PDF op het toestel
  • opent het mailprogramma, vooraf ingevuld met:
      - geadresseerde(n) = de adressen ingesteld in ⚙️ Instellingen
      - onderwerp
      - tekst MET een verborgen JSON-blokje (machineleesbaar)
Operator voegt de PDF toe als bijlage en verstuurt
        │
        ▼
Mail komt toe in een gedeeld postvak (bv. meldingen@julliebedrijf.com)
        │
        ▼
Power Automate-flow (automatisch, op de achtergrond):
  1. Vangt de nieuwe mail op
  2. Slaat de PDF-bijlage op in een SharePoint-documentbibliotheek
  3. Leest het JSON-blokje uit de mailtekst
  4. Maakt daarmee een nieuwe rij aan in een SharePoint-lijst
        │
        ▼
Iedereen met toegang tot die SharePoint-site ziet de volledige,
gedeelde historiek — sorteerbaar op datum, filterbaar per type, enz.
```

## Stap 1 — Gedeeld mailadres voorzien

Je hebt één vast e-mailadres nodig waar alle meldingen/bestellingen naartoe
gaan. Twee opties:
- Een **bestaand** gedeeld postvak of algemene mailbox hergebruiken.
- Een **nieuw** gedeeld postvak laten aanmaken door IT (Microsoft 365 admin
  center → Groepen → Gedeelde postvakken → Nieuw). Dit is een heel gewone,
  kleine actie — niet te verwarren met de Azure-app-registratie van eerder.

Zet dit adres in de app onder **⚙️ Instellingen → E-mailadressen voor
PDF-verzending**.

## Stap 2 — SharePoint-site en -lijst aanmaken

1. Ga naar je SharePoint-startpagina (`https://[jullienaam].sharepoint.com`)
   en maak een nieuwe site aan, of gebruik een bestaande (bv. een
   "QHSE"-teamsite).
2. Maak op die site een nieuwe **lijst** aan, genaamd bv. `Meldingen en bestellingen`.
3. Voeg de volgende kolommen toe (kolomnaam → type):

| Kolomnaam | Type | Opmerking |
|---|---|---|
| Type | Eén regel tekst | "melding" of "bestelling" |
| FormulierType | Eén regel tekst | "incident" / "schade" / "bestelling" |
| FormulierTitel | Eén regel tekst | |
| DocumentCode | Eén regel tekst | bv. MLD_INC001 |
| Datum | Datum | |
| Melder_Besteller | Eén regel tekst | naam melder / besteller |
| Functie | Eén regel tekst | (enkel bij meldingen) |
| Plaats | Eén regel tekst | (enkel bij meldingen) |
| Betrokkenen | Meerdere regels tekst | (enkel bij meldingen) |
| Omschrijving | Meerdere regels tekst | (enkel bij meldingen) |
| AantalFotos | Getal | (enkel bij meldingen) |
| NaamWerknemer | Eén regel tekst | (enkel bij bestellingen) |
| Items | Meerdere regels tekst | (enkel bij bestellingen) |
| AantalItems | Getal | (enkel bij bestellingen) |
| PdfBestand | Hyperlink of afbeelding | link naar het PDF-bestand in de documentbibliotheek |
| Verwerkt_op | Datum en tijd | (optioneel, standaard = "gemaakt op") |

4. Maak daarnaast (of op dezelfde site) een **documentbibliotheek** aan, bv.
   `Meldingen PDF's`, waar de PDF-bijlagen in opgeslagen worden.

## Stap 3 — De Power Automate-flow bouwen

Ga naar [make.powerautomate.com](https://make.powerautomate.com) → **Nieuwe
flow → Automatisering vanaf leeg**.

**Trigger:**
- `When a new email arrives (V3)` (Office 365 Outlook-connector)
- Mailbox adres: het gedeelde postvak van Stap 1
- Folder: Postvak IN

**Actie 1 — PDF-bijlage opslaan:**
- `Create file` (SharePoint-connector)
- Site adres: jullie SharePoint-site
- Map pad: de documentbibliotheek van Stap 2 (bv. `/Meldingen PDF's`)
- Bestandsnaam: `Attachments name` (dynamische inhoud van de trigger)
- Bestandsinhoud: `Attachments content`

*(Tip: zet er een "Apply to each" rond als je zeker wil zijn van meerdere
bijlagen, al verstuurt de app er maar één.)*

**Actie 2 — Het JSON-blokje uit de mailtekst halen:**
- Actie `Compose` (naam: "ExtraheerJSON"), met deze expressie in het
  invoerveld (Formule-modus):
```
substring(
  triggerBody()?['body'],
  add(indexOf(triggerBody()?['body'], '---SOS-DATA-START---'), 21),
  sub(indexOf(triggerBody()?['body'], '---SOS-DATA-END---'),
      add(indexOf(triggerBody()?['body'], '---SOS-DATA-START---'), 21))
)
```
Dit knipt exact het stuk tekst tussen de twee merktekens uit de mail.

**Actie 3 — JSON parsen:**
- Actie `Parse JSON`
- Inhoud: uitkomst van de vorige `Compose`-actie
- Schema — plak dit in (klik "Genereren op basis van voorbeeld" en plak een
  van de JSON-blokjes uit een echte testmail, of gebruik dit schema
  rechtstreeks):

```json
{
  "type": "object",
  "properties": {
    "type": { "type": "string" },
    "formId": { "type": "string" },
    "formTitle": { "type": "string" },
    "documentCode": { "type": "string" },
    "datum": { "type": "string" },
    "submittedAt": { "type": "string" },
    "pdfFilename": { "type": "string" },
    "naamMelder": { "type": "string" },
    "functieMelder": { "type": "string" },
    "tijdstip": { "type": "string" },
    "plaats": { "type": "string" },
    "materieel": { "type": "string" },
    "betrokkenen": { "type": "string" },
    "omschrijving": { "type": "string" },
    "aantalFotos": { "type": "integer" },
    "naamWerknemer": { "type": "string" },
    "naamBesteller": { "type": "string" },
    "items": { "type": "string" },
    "aantalItems": { "type": "integer" }
  }
}
```

*(Niet elk veld zit in elke e-mail — bij een melding ontbreken bv.
`naamWerknemer`/`items`, bij een bestelling ontbreken `naamMelder`/
`omschrijving`. Dat is geen probleem: Power Automate laat ontbrekende
velden gewoon leeg.)*

**Actie 4 — Rij aanmaken in de SharePoint-lijst:**
- Actie `Create item` (SharePoint-connector)
- Site adres + Lijstnaam: de lijst van Stap 2
- Vul elke kolom in met het overeenkomstige veld uit de `Parse JSON`-stap
  (dynamische inhoud), bv. `Datum` ← `datum`, `Melder_Besteller` ←
  `coalesce(naamMelder, naamBesteller)` (gebruik de expressie-editor voor
  die laatste, of gebruik gewoon 2 losse Create item-acties met een
  If-conditie op `type`).
- `PdfBestand`: gebruik de link/`Path` van het bestand aangemaakt in Actie 1.

**Testen:** verstuur vanuit de app een testmelding naar het gedeelde
postvak, en controleer of de flow een rij + PDF correct aanmaakt. Pas de
mapping gerust aan naar wat voor jullie het handigst leest.

## Resultaat

Vanaf dan verschijnt elke melding/bestelling, van eender welke operator op
eender welk toestel, automatisch als rij in diezelfde SharePoint-lijst —
een volledig gedeelde, centrale historiek, met sorteer- en filtermogelijkheden
via SharePoint zelf (bv. een "Groeperen op Type" of "Groeperen op Datum"-weergave).

## Nog verder automatiseren?

Wil je notificaties (bv. een Teams-bericht bij elke nieuwe NOK-melding), of
wil je later toch overstappen naar rechtstreekse SharePoint-integratie in de
app zelf (zodat de historiek ook **in de app** zichtbaar wordt, niet enkel in
SharePoint)? Dat laatste kan, maar vraagt dan wél de Azure-app-registratie
van eerder — een logische volgende stap zodra dit eenvoudigere systeem
draait en jullie de meerwaarde ervaren.
