/**
 * SOS Meldingen & Bestellingen — formulierdefinities
 * -------------------------------------------------
 * Dit bestand bevat de opbouw van alle 4 formulieren. Wil je later vragen
 * toevoegen, aanpassen of verwijderen? Doe dat hier — de rest van de app
 * leest dit automatisch uit.
 *
 * Er zijn 2 soorten formulieren (herkenbaar aan `kind`):
 *
 * 1) kind: 'melding'  → Melding incident / schade / gedrag
 *    Vaste basisopbouw: gegevens melder, datum & plaats, betrokkenen,
 *    omschrijving, foto's, handtekening. De specifieke extra vragen per
 *    meldingstype worden hieronder aangevuld zodra je ze doorgeeft — dat
 *    kan gewoon door items toe te voegen aan `extraQuestions` (zelfde
 *    formaat als de vragen in de QHSE-app: id, text, hint, checkboxOptions).
 *
 * 2) kind: 'bestelling' → Bestelling materieel
 *    Een oplijstbare bestelbon: kies een artikel uit de catalogus
 *    (ORDER_CATALOG hieronder) of voer handmatig iets in, met aantal en
 *    eventueel maat/type/merk.
 */

const MELD_FORMS = [
  // =====================================================================
  // 1. MELDING INCIDENT
  // =====================================================================
  {
    id: 'incident',
    kind: 'melding',
    title: 'Melding incident',
    subtitle: 'Meld een incident, bijna-ongeval of onveilige situatie',
    color: '#c62828',
    docControl: {
      code: 'MLD_INC001',
      naam: 'Hamdaoui Abdelkerim',
      rev: '1-08-2026',
      versie: '1.0',
      beheerder: 'QHSE advisor',
      docTitle: 'Melding incident'
    },
    meta: [
      { id: 'naam_melder', label: 'Naam melder', type: 'text', required: true },
      { id: 'functie_melder', label: 'Functie / afdeling melder', type: 'text', required: false },
      { id: 'datum', label: 'Datum voorval', type: 'date', required: true },
      { id: 'tijdstip', label: 'Tijdstip (bv. 14:30)', type: 'text', required: false },
      { id: 'plaats', label: 'Plaats / locatie', type: 'text', required: true }
    ],
    // Extra specifieke vragen (checkbox/OK-NOK-stijl) komen hier terecht zodra je ze doorgeeft.
    extraQuestions: []
  },

  // =====================================================================
  // 2. MELDING SCHADE MATERIEEL/INSTALLATIE
  // =====================================================================
  {
    id: 'schade',
    kind: 'melding',
    title: 'Melding schade',
    subtitle: 'Schade aan materieel of installatie',
    color: '#a1642a',
    docControl: {
      code: 'MLD_SCH001',
      naam: 'Hamdaoui Abdelkerim',
      rev: '1-08-2026',
      versie: '1.0',
      beheerder: 'QHSE advisor',
      docTitle: 'Melding schade materieel/installatie'
    },
    meta: [
      { id: 'naam_melder', label: 'Naam melder', type: 'text', required: true },
      { id: 'functie_melder', label: 'Functie / afdeling melder', type: 'text', required: false },
      { id: 'datum', label: 'Datum vaststelling', type: 'date', required: true },
      { id: 'tijdstip', label: 'Tijdstip (bv. 14:30)', type: 'text', required: false },
      { id: 'plaats', label: 'Plaats / locatie', type: 'text', required: true },
      { id: 'materieel', label: 'Betrokken materieel / installatie (type, ID)', type: 'text', required: false }
    ],
    extraQuestions: []
  }
];

/**
 * BESTELLING MATERIEEL — catalogus
 * (De inhoud van dit bestelformulier — artikelen, categorieën, veldnamen —
 * staat in het Engels, op vraag van de klant. De andere 3 meldingsformulieren
 * hierboven blijven in het Nederlands.)
 *
 * hasSize   → toont een "size"-veld voor deze regel (kledij)
 * extraFields → extra tekstvelden per regel (bv. toner: type + merk)
 */
/**
 * Velden per artikel:
 *   id, label (EN), labelNl (NL), category
 *   articleNr  → artikelnummer (leeg = nog niet bekend; later aan te vullen in Instellingen)
 *   normCodes  → standaard EN-normen voor dit artikel (codes uit ORDER_NORMS; per bestelregel aanpasbaar)
 *   hasSize / extraFields (met optioneel `options` = keuzelijst) / legacy (verborgen in keuzelijst, blijft bestaan voor oude bestellingen)
 */
const CLOTHING_NORMS = ['EN ISO 13688', 'EN 1149-5', 'EN ISO 14116'];

const ORDER_CATALOG = [
  // ---- PPE
  { id: 'abek', label: 'ABEK filters', labelNl: 'ABEK-filters', category: 'PPE', articleNr: '', normCodes: ['EN 14387'] },
  { id: 'handschoenen_chemie', label: 'Chemical gloves', labelNl: 'Chemicaliënbestendige handschoenen', category: 'PPE', articleNr: '', normCodes: ['EN ISO 374-1', 'EN 388'] },
  { id: 'overall_chemie', label: 'Chemical overall', labelNl: 'Chemisch bestendige overall', category: 'PPE', articleNr: '', normCodes: ['EN ISO 13688', 'EN 13034'] },
  { id: 'volgelaatsmasker', label: 'Full face mask', labelNl: 'Volgelaatsmasker', category: 'PPE', articleNr: '', normCodes: ['EN 136', 'EN 529'] },
  { id: 'oorbescherming', label: 'Ear protection', labelNl: 'Oorbescherming', category: 'PPE', articleNr: '', normCodes: ['EN 352'] },
  { id: 'bril_transparant', label: 'Safety glasses, clear', labelNl: 'Veiligheidsbril transparant', category: 'PPE', articleNr: '', normCodes: ['EN 166'] },
  { id: 'bril_donker', label: 'Safety glasses, dark', labelNl: 'Veiligheidsbril donker', category: 'PPE', articleNr: '', normCodes: ['EN 166', 'EN 172'] },
  { id: 'rsg_helm', label: 'RSG helmet', labelNl: 'RSG helm', category: 'PPE', articleNr: '', normCodes: ['EN 12941', 'EN 397'] },
  { id: 'rsg_motorunit', label: 'RSG blower motor unit and hose', labelNl: 'Aanblaasmotorunit en slang RSG', category: 'PPE', articleNr: '', normCodes: ['EN 12941'] },
  // ---- Equipment
  { id: 'zaklamp_vonkvrij', label: 'Spark-free torch', labelNl: 'Vonkvrije zaklamp', category: 'Equipment', articleNr: '', normCodes: ['EN IEC 60079-0', 'EN 60079-11'] },
  { id: 'multigasmeter', label: 'Multi-gas meter (CO, H2S, O2, LEL sensors)', labelNl: 'Multigasmeter met sensoren CO, H2S, O2 en LEL', category: 'Equipment', articleNr: '', normCodes: ['EN 60079-29', 'EN 45544', 'EN 50104'] },
  // ---- Clothing
  { id: 'parka', label: 'Lined parka', labelNl: 'Parka met voering', category: 'Clothing', hasSize: true, articleNr: '', normCodes: [...CLOTHING_NORMS, 'EN 342'] },
  { id: 'softshell_winter', label: 'Softshell, winter', labelNl: 'Softshell winter', category: 'Clothing', hasSize: true, articleNr: '', normCodes: [...CLOTHING_NORMS] },
  { id: 'softshell_zomer', label: 'Softshell, summer', labelNl: 'Softshell zomer', category: 'Clothing', hasSize: true, articleNr: '', normCodes: [...CLOTHING_NORMS] },
  { id: 'tshirt_polo', label: 'T-shirt or polo (choose)', labelNl: 'T-shirt of polo (keuze maken)', category: 'Clothing', hasSize: true, extraFields: [{ id: 'type', label: 'Choose', labelNl: 'Keuze', options: ['T-shirt', 'Polo'] }], articleNr: '', normCodes: [...CLOTHING_NORMS] },
  { id: 'trui', label: 'Sweater', labelNl: 'Sweater', category: 'Clothing', hasSize: true, articleNr: '', normCodes: [...CLOTHING_NORMS] },
  { id: 'overall_kledij', label: 'Coverall', labelNl: 'Overall', category: 'Clothing', hasSize: true, articleNr: '', normCodes: [...CLOTHING_NORMS, 'EN 13034'] },
  { id: 'broek', label: 'Work trousers', labelNl: 'Werkbroek', category: 'Clothing', hasSize: true, articleNr: '', normCodes: [...CLOTHING_NORMS] },
  { id: 'regenpak', label: 'Rain suit', labelNl: 'Regenpak', category: 'Clothing', hasSize: true, articleNr: '', normCodes: ['EN ISO 13688', 'EN 343', 'EN 1149-5'] },
  { id: 'thermo_onderkleding', label: 'Thermal underwear', labelNl: 'Thermo-onderkleding', category: 'Clothing', hasSize: true, articleNr: '', normCodes: ['EN ISO 13688', 'EN 14058'] },
  { id: 'bivakmuts_as', label: 'Antistatic balaclava', labelNl: 'Antistatische bivakmuts', category: 'Clothing', articleNr: '', normCodes: ['EN 1149-5', 'EN ISO 14116'] },
  { id: 'muts_as', label: 'Antistatic beanie', labelNl: 'Antistatische muts', category: 'Clothing', articleNr: '', normCodes: ['EN 1149-5', 'EN ISO 14116'] },
  { id: 'roots_boots', label: 'Roots boots', labelNl: 'Roots boots', category: 'Clothing', hasSize: true, articleNr: '', normCodes: ['EN ISO 20345:2022'] },
  { id: 'veiligheidsschoenen', label: 'Safety shoes', labelNl: 'Veiligheidsschoenen', category: 'Clothing', hasSize: true, articleNr: '', normCodes: ['EN ISO 20345:2022'] },
  { id: 'tshirt_lm', label: 'Long-sleeve T-shirt', labelNl: 'T-shirt lange mouw', category: 'Clothing', hasSize: true, articleNr: '', normCodes: [], legacy: true },
  // ---- Office
  { id: 'toner', label: 'Printer toner', labelNl: 'Printertoner', category: 'Office', articleNr: '', normCodes: [], extraFields: [{ id: 'type', label: 'Type' }, { id: 'merk', label: 'Brand' }] },
  { id: 'papier_a4', label: 'A4 paper', labelNl: 'A4-papier', category: 'Office', articleNr: '', normCodes: [] },
  // ---- Packaging
  { id: 'stickers', label: 'Stickers', labelNl: 'Stickers', category: 'Packaging', articleNr: '', normCodes: [] },
  { id: 'straps_drum', label: 'Drum straps', labelNl: 'Vatbanden', category: 'Packaging', articleNr: '', normCodes: [] },
  { id: 'verbinders_straps', label: 'Metal strap buckles', labelNl: 'Metalen bandsluitingen', category: 'Packaging', articleNr: '', normCodes: [] },
  { id: 'luchtkussens', label: 'Air cushions', labelNl: 'Luchtkussens', category: 'Packaging', articleNr: '', normCodes: [] }
];

/**
 * EN-normen met korte uitleg (code, Nederlands, Engels).
 * Dit is de startlijst: in Instellingen → "EN-normen" kan je normen aanpassen of toevoegen.
 * Normen uit het document "Verplichte uitrusting engineers" (punt 1 en 2) zijn opgenomen.
 */
const ORDER_NORMS = [
  { code: 'EN 166', nl: 'Persoonlijke oogbescherming: algemene specificaties (bril, vizier).', en: 'Personal eye protection: specifications.' },
  { code: 'EN 172', nl: 'Zonnefilters voor industrieel gebruik (donkere veiligheidsbril).', en: 'Sunglare filters for industrial use.' },
  { code: 'EN 397', nl: 'Industriële veiligheidshelmen.', en: 'Industrial safety helmets.' },
  { code: 'EN 352', nl: 'Gehoorbeschermers: eisen en beproeving (oorkappen en oordopjes).', en: 'Hearing protectors: requirements and testing.' },
  { code: 'EN 136', nl: 'Ademhalingsbescherming: volgelaatsmaskers.', en: 'Respiratory protective devices: full face masks.' },
  { code: 'EN 529', nl: 'Ademhalingsbescherming: aanbevelingen voor keuze, gebruik, onderhoud en fit-check.', en: 'Respiratory protective devices: recommendations for selection, use, care and maintenance.' },
  { code: 'EN 14387', nl: 'Gas- en combinatiefilters (o.a. type ABEK).', en: 'Gas filters and combined filters (e.g. ABEK).' },
  { code: 'EN 12941', nl: 'Filterende ademhalingsapparatuur met aanblaasunit en helm of kap.', en: 'Powered filtering devices incorporating a helmet or hood.' },
  { code: 'EN ISO 374-1', nl: 'Handschoenen tegen gevaarlijke chemicaliën en micro-organismen (type A, B of C).', en: 'Protective gloves against dangerous chemicals and micro-organisms (type A, B or C).' },
  { code: 'EN 388', nl: 'Handschoenen tegen mechanische risico\u2019s (slijtage, snijden, scheuren, doorprikken).', en: 'Protective gloves against mechanical risks.' },
  { code: 'EN ISO 20345:2022', nl: 'Veiligheidsschoeisel met teenbescherming (200 J). Gebruikt: S3 WR/FO/SR/SC/LG/CI, type B.', en: 'Safety footwear with toe protection (200 J). In use: S3 WR/FO/SR/SC/LG/CI, type B.' },
  { code: 'EN ISO 13688', nl: 'Beschermende kledij: algemene eisen (pasvorm, comfort, markering).', en: 'Protective clothing: general requirements.' },
  { code: 'EN 1149-5', nl: 'Antistatische beschermende kledij: eisen aan materiaal en ontwerp.', en: 'Protective clothing, electrostatic properties: material and design requirements.' },
  { code: 'EN ISO 14116', nl: 'Vlamvertragende kledij: beperkte vlamverspreiding.', en: 'Protective clothing: limited flame spread.' },
  { code: 'EN 13034', nl: 'Kledij tegen vloeibare chemicaliën, type 6 (chemische spatten).', en: 'Protective clothing against liquid chemicals, type 6 (chemical splashes).' },
  { code: 'EN 342', nl: 'Kledij tegen koude.', en: 'Clothing for protection against cold.' },
  { code: 'EN 343', nl: 'Kledij tegen regen, wind en vocht.', en: 'Protective clothing against rain.' },
  { code: 'EN 14058', nl: 'Kledij tegen koele omgevingen.', en: 'Garments for protection against cool environments.' },
  { code: 'EN 60079-29', nl: 'Gasdetectoren in explosiegevaarlijke omgeving: prestatie-eisen, keuze en gebruik.', en: 'Gas detectors in explosive atmospheres: performance, selection and use.' },
  { code: 'EN 45544', nl: 'Detectoren voor toxische gassen en dampen (o.a. CO, H2S).', en: 'Detectors for toxic gases and vapours (e.g. CO, H2S).' },
  { code: 'EN 50104', nl: 'Detectoren voor zuurstof (O2): prestatie-eisen.', en: 'Oxygen detectors: performance requirements.' },
  { code: 'EN IEC 60079-0', nl: 'Explosieve atmosferen: algemene eisen voor toestellen.', en: 'Explosive atmospheres: general requirements for equipment.' },
  { code: 'EN 60079-11', nl: 'Explosieve atmosferen: eigenveiligheid \u201Ci\u201D (vonkvrij).', en: 'Explosive atmospheres: intrinsic safety "i".' },
  { code: 'EN ISO 12402', nl: 'Reddingsvesten.', en: 'Personal flotation devices.' },
  { code: 'NEN 2559', nl: 'Onderhoud en jaarlijkse controle van draagbare blustoestellen.', en: 'Maintenance and annual inspection of portable fire extinguishers.' },
  { code: 'DIN 13157', nl: 'EHBO-kist / verbanddoos: inhoud.', en: 'First aid kit: contents.' }
];

// Eenheid-opties per besteld artikel (stuk / doos)
const ORDER_UNITS = ['Piece', 'Box'];

const ORDER_FORM = {
  id: 'bestelling',
  kind: 'bestelling',
  lang: 'en',
  title: 'Material order',
  subtitle: 'Order PPE, clothing, office and packaging materials',
  color: '#2a6f8c',
  docControl: {
    code: 'MLD_BES001',
    naam: 'Hamdaoui Abdelkerim',
    rev: '1-08-2026',
    versie: '1.0',
    beheerder: 'QHSE advisor',
    docTitle: 'Material order'
  },
  meta: [
    { id: 'naam_werknemer', label: 'Employee name (for whom)', type: 'text', required: true },
    { id: 'naam_besteller', label: 'Orderer name', type: 'text', required: true },
    { id: 'datum', label: 'Order date', type: 'date', required: true },
    { id: 'doel', label: 'Purpose / intended use (optional)', type: 'text', required: false }
  ]
};

if (typeof module !== 'undefined') module.exports = { MELD_FORMS, ORDER_CATALOG, ORDER_NORMS, ORDER_FORM, ORDER_UNITS };
