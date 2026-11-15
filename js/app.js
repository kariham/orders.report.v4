/* =====================================================================
   SOS Meldingen & Bestellingen — app.js
   Vanilla JS, geen framework. Werkt 100% offline (IndexedDB).
   ===================================================================== */

const QHSE_STATUS = ['OK', 'NOK', 'NVT'];

const state = {
  view: 'home',       // home | form | history | view | settings
  formId: null,
  draft: null,
  entries: [],          // cache van alle opgeslagen meldingen/bestellingen
  viewingId: null,
  customCatalog: [],     // extra bestelartikelen toegevoegd via Instellingen
  emailRecipients: [],   // e-mailadressen voor PDF-verzending
  newItemPhotoId: null,  // tijdelijke foto voor het artikel dat nu wordt toegevoegd in Instellingen
  syncConfig: { clientId: '', tenantId: '', folder: 'Meldingen App' },
  lastSync: null,
  syncBusy: false,
  syncMessage: '',
  supplierMap: {},       // itemId -> leverancier
  norms: [],             // EN-normen [{ code, nl, en }]
  catalogEdits: {},      // aanpassingen op standaardartikelen: id -> { articleNr, normCodes, label, labelNl }
  openItem: null,        // artikel dat open staat in de artikel-editor (Instellingen)
  supplierDirectory: [], // [{ name, email }] leveranciers waar bestellingen naartoe gemaild worden
  historyTab: 'all'      // all | orders (in het overzichtsscherm)
};

const $app = document.getElementById('app');

function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

function getForm(id) {
  if (id === 'bestelling') return ORDER_FORM;
  return MELD_FORMS.find(f => f.id === id);
}
function allForms() { return [...MELD_FORMS, ORDER_FORM]; }
function fullCatalog() {
  const edits = state.catalogEdits || {};
  const base = ORDER_CATALOG.map(c => edits[c.id] ? { ...c, ...edits[c.id] } : c);
  return [...base, ...state.customCatalog];
}
function normByCode(code) { return (state.norms || []).find(n => n.code === code); }
function itemNameNl(c) { return c.labelNl || c.label; }
async function setItemField(id, field, value) {
  const ci = state.customCatalog.find(c => c.id === id);
  if (ci) { ci[field] = value; await QHSE_DB.setSetting('customCatalog', state.customCatalog); return; }
  state.catalogEdits[id] = { ...(state.catalogEdits[id] || {}), [field]: value };
  await QHSE_DB.setSetting('catalogEdits', state.catalogEdits);
}
function normChips(codes, removeAttrs) {
  return (codes || []).map(code => {
    const n = normByCode(code);
    return `<span class="norm-chip" title="${escapeAttr(n ? (n.nl + ' / ' + n.en) : code)}">${escapeHtml(code)}<button type="button" data-action="${removeAttrs.action}" ${removeAttrs.attrs} data-code="${escapeAttr(code)}">✕</button></span>`;
  }).join('');
}
function normOptions(exclude) {
  return (state.norms || []).filter(n => n.code && !(exclude || []).includes(n.code))
    .map(n => `<option value="${escapeAttr(n.code)}">${escapeHtml(n.code)} — ${escapeHtml(n.en || n.nl || '')}</option>`).join('');
}
function itemSupplier(itemId) { return (state.supplierMap && state.supplierMap[itemId]) || ''; }

/* ---------------------------------------------------------------------
   Init
--------------------------------------------------------------------- */
async function init() {
  state.entries = await QHSE_DB.getAllInspections();
  state.customCatalog = await QHSE_DB.getSetting('customCatalog', []);
  state.emailRecipients = await QHSE_DB.getSetting('emailRecipients', []);
  state.syncConfig = await QHSE_DB.getSetting('syncConfig', { clientId: '', tenantId: '', folder: 'Meldingen App' });
  state.lastSync = await QHSE_DB.getSetting('lastSync', null);
  state.supplierMap = await QHSE_DB.getSetting('supplierMap', {});
  state.supplierDirectory = await QHSE_DB.getSetting('supplierDirectory', []);
  state.norms = await QHSE_DB.getSetting('norms', null) || ORDER_NORMS.map(n => ({ ...n }));
  state.catalogEdits = await QHSE_DB.getSetting('catalogEdits', {});
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Als we net terugkeren van een Microsoft-login (redirect), sync meteen afwerken
  if (typeof QHSE_SYNC !== 'undefined' && QHSE_SYNC.isLibLoaded() && QHSE_SYNC.isConfigured(state.syncConfig)) {
    QHSE_SYNC.ensureMsal(state.syncConfig).then((msalApp) => {
      if (QHSE_SYNC.currentAccount(state.syncConfig) && window.location.hash === '') {
        // stille sync op app-start als we al ingelogd zijn
        runSync(true);
      } else if (state.view === 'settings') {
        renderSettings();
      }
    }).catch(() => {});
  }
}

/* ---------------------------------------------------------------------
   Nieuw formulier starten
--------------------------------------------------------------------- */
/**
 * Genereert bij elke nieuwe bestelling een nieuw, oplopend ordernummer: BES-<jaar>-<volgnr>.
 * Het volgnummer wordt bepaald uit de hoogste teller die ooit uitgegeven werd (instelling)
 * én het hoogste nummer in de bestaande bestellingen (bv. na synchronisatie van een ander toestel).
 * De teller wordt meteen bewaard, zodat een nummer nooit twee keer gebruikt wordt.
 */
async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `BES-${year}-`;
  let max = await QHSE_DB.getSetting('orderCounter_' + year, 0);
  state.entries.forEach(e => {
    if (e.orderNumber && e.orderNumber.startsWith(prefix)) {
      const n = parseInt(e.orderNumber.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  const next = max + 1;
  await QHSE_DB.setSetting('orderCounter_' + year, next);
  return prefix + String(next).padStart(4, '0');
}

function supplierEmail(name) {
  const s = (state.supplierDirectory || []).find(x => x.name === name);
  return s ? (s.email || '').trim() : '';
}
function isValidEmail(v) { return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v || ''); }
function fmtDate(iso) { if (!iso) return ''; const p = String(iso).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }
function fmtEuro(n) { return '€ ' + Number(n).toFixed(2).replace('.', ','); }
function parsePrice(v) { const n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? null : n; }

async function newEntry(formId) {
  const form = getForm(formId);
  const metaValues = {};
  form.meta.forEach(f => { metaValues[f.id] = f.type === 'date' ? todayISO() : ''; });

  if (form.kind === 'melding') {
    const answers = {};
    (form.extraQuestions || []).forEach(q => { answers[q.id] = { status: null, note: '', photos: [], checks: [] }; });
    state.draft = {
      id: uid('mld'), formId, kind: 'melding', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      meta: metaValues, betrokkenen: [], omschrijving: '', photos: [], answers, signature: null, finished: false
    };
  } else {
    state.draft = {
      id: uid('bes'), formId, kind: 'bestelling', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      meta: metaValues, lines: [], finished: false,
      orderNumber: await nextOrderNumber(), supplierName: '', sentAt: null, sentTo: ''
    };
  }
  state.view = 'form';
  render();
}

function openEntry(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;
  state.draft = JSON.parse(JSON.stringify(e));
  state.formId = e.formId;
  state.view = 'form';
  render();
}

function viewEntry(id) { state.viewingId = id; state.view = 'view'; render(); }

async function saveDraft(silent) {
  state.draft.updatedAt = new Date().toISOString();
  await QHSE_DB.saveInspection(state.draft);
  state.entries = await QHSE_DB.getAllInspections();
  if (!silent) toast('Opgeslagen ✓');
}

async function deleteEntry(id) {
  if (!confirm('Dit formulier definitief verwijderen?')) return;
  await QHSE_DB.deleteInspection(id);
  state.entries = await QHSE_DB.getAllInspections();
  render();
}

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------------------------------------------------------------
   RENDER: router
--------------------------------------------------------------------- */
function render() {
  if (state.view === 'home') return renderHome();
  if (state.view === 'form') return renderForm();
  if (state.view === 'history') return renderHistory();
  if (state.view === 'view') return renderViewEntry();
  if (state.view === 'settings') return renderSettings();
}

function logoImg(cls) { return `<img src="${QHSE_LOGO}" class="${cls || 'logo'}" alt="Scandinavian Oil Services">`; }

/* ---------------------------------------------------------------------
   HOME
--------------------------------------------------------------------- */
function renderHome() {
  const meldCount = state.entries.filter(e => e.kind === 'melding').length;
  const besCount = state.entries.filter(e => e.kind === 'bestelling').length;
  const openCount = state.entries.filter(e => !e.finished).length;

  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn ghost-btn" data-action="go-settings" title="Instellingen">⚙️</button>
      <div class="brand">${logoImg('brand-logo')}<span class="brand-sub">Meldingen &amp; Bestellingen</span></div>
      <span class="icon-btn ghost-btn spacer"></span>
    </header>

    <div class="stat-row">
      <div class="stat-card"><div class="stat-value">${meldCount}</div><div class="stat-label">Meldingen</div></div>
      <div class="stat-card"><div class="stat-value">${besCount}</div><div class="stat-label">Bestellingen</div></div>
      <div class="stat-card warn"><div class="stat-value">${openCount}</div><div class="stat-label">Niet afgewerkt</div></div>
    </div>

    <h2 class="section-title">Kies een formulier</h2>
    <div class="checklist-grid">
      ${allForms().map(f => `
        <button class="checklist-card" style="--accent:${f.color}" data-action="new" data-id="${f.id}">
          <span class="cc-title">${f.title}</span>
          <span class="cc-sub">${f.subtitle}</span>
        </button>
      `).join('')}
    </div>

    <button class="link-btn" data-action="go-history">📁 Bekijk alle formulieren (${state.entries.length})</button>
    <footer class="footnote">Scandinavian Oil Services — Blending &amp; Logistics B.V. · werkt volledig offline</footer>
  `;
  bindGlobal();
}

/* ---------------------------------------------------------------------
   HISTORY
--------------------------------------------------------------------- */
function renderHistory() {
  const sorted = [...state.entries].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-action="go-home">←</button>
      <div class="brand"><span class="brand-mark">Alle formulieren</span></div>
      <span></span>
    </header>
    <div class="tab-switch">
      <button class="tab-btn ${state.historyTab === 'all' ? 'active' : ''}" data-action="history-tab" data-tab="all">📁 Alle formulieren</button>
      <button class="tab-btn ${state.historyTab === 'orders' ? 'active' : ''}" data-action="history-tab" data-tab="orders">📦 Bestellingen overzicht</button>
    </div>
    ${state.historyTab === 'orders' ? renderOrdersOverview() : renderAllFormsList(sorted)}
  `;
  bindGlobal();
}

function renderAllFormsList(sorted) {
  return `
    <div class="list">
      ${sorted.length === 0 ? '<p class="empty">Nog niets opgeslagen.</p>' : sorted.map(e => {
        const f = getForm(e.formId);
        const sub = e.kind === 'melding' ? (e.meta.naam_melder || '') : ((e.orderNumber ? e.orderNumber + ' · ' : '') + (e.meta.naam_werknemer || ''));
        return `
        <div class="list-item" style="--accent:${f.color}">
          <div class="li-main" data-action="open-view" data-id="${e.id}">
            <div class="li-title">${f.title}${e.finished ? '' : ' <span class="badge draft">concept</span>'}${e.sentAt ? ' <span class="badge ok">verzonden</span>' : ''}</div>
            <div class="li-sub">${sub} · ${e.meta.datum || ''}</div>
          </div>
          <div class="li-side">
            <button class="icon-btn small" data-action="open-edit" data-id="${e.id}" title="Bewerken">✏️</button>
            <button class="icon-btn small" data-action="delete" data-id="${e.id}" title="Verwijderen">🗑️</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function renderOrdersOverview() {
  const orderEntries = state.entries.filter(e => e.kind === 'bestelling');
  const rows = [];
  orderEntries.forEach(e => {
    (e.lines || []).forEach(l => {
      const item = fullCatalog().find(c => c.id === l.itemId);
      const artikel = l.itemId === 'manual' ? (l.customName || 'Other material') : (item ? item.label : (l.itemId || '-'));
      const categorie = item ? item.category : (l.itemId === 'manual' ? 'Other' : '-');
      const supplier = item ? itemSupplier(item.id) : '';
      rows.push({
        datum: e.meta.datum || '',
        artikel, categorie,
        aantal: l.aantal || '',
        unit: l.unit || '',
        maat: l.maat || '',
        voor: e.meta.naam_werknemer || '',
        besteller: e.meta.naam_besteller || '',
        supplier: supplier || e.supplierName || '',
        orderNumber: e.orderNumber || '',
        entryId: e.id
      });
    });
  });
  rows.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));

  if (!rows.length) return '<p class="empty" style="margin:16px">Nog geen bestellingen geregistreerd.</p>';

  return `
    <div class="orders-table-wrap">
      <table class="orders-table">
        <thead>
          <tr>
            <th>Ordernr.</th><th>Datum</th><th>Artikel</th><th>Categorie</th><th>Aantal</th><th>Eenheid</th>
            <th>Maat</th><th>Voor</th><th>Besteld door</th><th>Leverancier</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr data-action="open-view" data-id="${r.entryId}">
              <td>${escapeHtml(r.orderNumber)}</td>
              <td>${escapeHtml(r.datum)}</td>
              <td>${escapeHtml(r.artikel)}</td>
              <td>${escapeHtml(r.categorie)}</td>
              <td>${escapeHtml(String(r.aantal))}</td>
              <td>${escapeHtml(r.unit)}</td>
              <td>${escapeHtml(r.maat)}</td>
              <td>${escapeHtml(r.voor)}</td>
              <td>${escapeHtml(r.besteller)}</td>
              <td>${escapeHtml(r.supplier)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="footnote" style="padding:10px 14px 20px">Tik op een rij om de volledige bestelbon te openen.</p>
  `;
}

/* ---------------------------------------------------------------------
   SETTINGS — extra bestelartikelen + e-mailadressen voor PDF-verzending
--------------------------------------------------------------------- */
function renderNewItemPhotoRow() {
  return `
    ${state.newItemPhotoId ? `
      <span class="photo-chip">
        <img data-photo-thumb="${state.newItemPhotoId}" class="thumb">
        <button data-action="remove-newitem-photo">✕</button>
      </span>` : ''}
    <label class="btn tiny photo-add">📷 ${state.newItemPhotoId ? 'Andere foto' : 'Foto toevoegen'}
      <input type="file" accept="image/*" capture="environment" style="display:none" data-action="add-newitem-photo">
    </label>`;
}
async function runSync(silent) {
  if (state.syncBusy) return;
  state.syncBusy = true;
  state.syncMessage = '';
  if (state.view === 'settings') renderSettings();
  try {
    const result = await QHSE_SYNC.syncNow(state.syncConfig, (msg) => {
      state.syncMessage = msg;
      if (state.view === 'settings') renderSettings();
    });
    if (result) {
      state.entries = await QHSE_DB.getAllInspections();
      state.customCatalog = result.customCatalog;
      state.emailRecipients = result.emailRecipients;
      state.supplierDirectory = result.supplierDirectory || state.supplierDirectory;
      if (result.norms) state.norms = result.norms;
      state.catalogEdits = result.catalogEdits || state.catalogEdits;
      state.lastSync = await QHSE_DB.getSetting('lastSync', null);
      state.syncMessage = 'Synchronisatie voltooid ✓';
      if (!silent) toast('Gesynchroniseerd ✓');
    }
  } catch (err) {
    state.syncMessage = 'Synchronisatie mislukt: ' + (err && err.message ? err.message : 'onbekende fout');
    if (!silent) toast('Synchronisatie mislukt');
  } finally {
    state.syncBusy = false;
    if (state.view === 'settings') renderSettings();
  }
}

function renderCatalogEditor() {
  const catalog = fullCatalog().filter(c => !c.legacy);
  const grouped = {};
  catalog.forEach(c => { grouped[c.category] = grouped[c.category] || []; grouped[c.category].push(c); });
  return Object.entries(grouped).map(([cat, items]) => `
    <div class="supplier-group">
      <div class="supplier-group-title">${escapeHtml(cat)}</div>
      ${items.map(c => `
        <details class="item-edit" data-item-id="${c.id}" ${state.openItem === c.id ? 'open' : ''}>
          <summary>${escapeHtml(itemNameNl(c))}${c.labelNl && c.labelNl !== c.label ? ' / ' + escapeHtml(c.label) : ''}
            <span class="item-edit-meta">art.nr ${escapeHtml(c.articleNr || '—')} · ${(c.normCodes || []).length ? escapeHtml(c.normCodes.join(', ')) : 'geen norm'}</span></summary>
          <div class="field"><label>Naam (NL)</label><input type="text" data-item-field="labelNl" value="${escapeAttr(c.labelNl || '')}"></div>
          <div class="field"><label>Name (EN)</label><input type="text" data-item-field="label" value="${escapeAttr(c.label || '')}"></div>
          <div class="field"><label>Artikelnr.</label><input type="text" data-item-field="articleNr" placeholder="nog niet bekend" value="${escapeAttr(c.articleNr || '')}"></div>
          <div class="field"><label>Standaard EN-normen</label>
            <div class="norm-chips">${normChips(c.normCodes, { action: 'remove-item-norm', attrs: `data-id="${c.id}"` }) || '<span class="hint" style="margin:0">Geen norm gekoppeld</span>'}</div>
            <select data-item-norm-add="${c.id}"><option value="">+ Norm toevoegen…</option>${normOptions(c.normCodes)}</select>
          </div>
        </details>`).join('')}
    </div>`).join('');
}

function renderSupplierSection() {
  const catalog = fullCatalog();
  const grouped = {};
  catalog.forEach(c => { grouped[c.category] = grouped[c.category] || []; grouped[c.category].push(c); });

  return `
    <h3>Leverancier per artikel</h3>
    <p class="hint">Koppel elk artikel aan een leverancier, zodat je bij het bestellen meteen weet waar je moet zijn.</p>
    ${Object.entries(grouped).map(([cat, items]) => `
      <div class="supplier-group">
        <div class="supplier-group-title">${escapeHtml(cat)}</div>
        ${items.map(c => `
          <div class="field supplier-row">
            <label>${escapeHtml(c.label)}</label>
            <input type="text" placeholder="Leverancier (bv. Bosman Supplies)" data-supplier-id="${c.id}" value="${escapeAttr(state.supplierMap[c.id] || '')}">
          </div>
        `).join('')}
      </div>
    `).join('')}
    <button class="btn secondary" data-action="save-suppliers">💾 Leveranciers opslaan</button>
  `;
}

function renderSyncSection() {
  const cfg = state.syncConfig || {};
  const libOk = typeof QHSE_SYNC !== 'undefined' && QHSE_SYNC.isLibLoaded();
  const configured = typeof QHSE_SYNC !== 'undefined' && QHSE_SYNC.isConfigured(cfg);
  const account = libOk && configured ? QHSE_SYNC.currentAccount(cfg) : null;
  const lastSyncTxt = state.lastSync ? new Date(state.lastSync).toLocaleString('nl-BE') : 'nog nooit';

  let body = '';

  if (!libOk) {
    body = `<p class="hint">⚠️ Online synchronisatie is nu niet beschikbaar (geen internetverbinding). De rest van de app werkt gewoon offline verder.</p>`;
  } else if (!configured) {
    body = `
      <p class="hint">Optioneel: synchroniseer je meldingen en bestellingen automatisch tussen al jullie telefoons via een OneDrive-map. Eenmalig instellen — zie README.md voor de stap-voor-stap Azure-registratie.</p>
      <div class="field"><label>Client ID</label><input type="text" id="syncClientId" placeholder="bv. 3f8a1c2b-...." value="${escapeAttr(cfg.clientId || '')}"></div>
      <div class="field"><label>Tenant ID</label><input type="text" id="syncTenantId" placeholder="bv. 7e21bd4a-...." value="${escapeAttr(cfg.tenantId || '')}"></div>
      <div class="field"><label>Naam van de OneDrive-map</label><input type="text" id="syncFolder" placeholder="Meldingen App" value="${escapeAttr(cfg.folder || 'Meldingen App')}"></div>
      <button class="btn secondary" data-action="save-sync-config">💾 Synchronisatie instellen</button>
    `;
  } else if (!account) {
    body = `
      <p class="hint">Synchronisatie is ingesteld (map: <strong>${escapeHtml(cfg.folder)}</strong>). Log in met je Microsoft werk-account om te starten.</p>
      <button class="btn primary" data-action="connect-onedrive">🔗 Verbind met Microsoft</button>
      <button class="btn tiny" data-action="edit-sync-config" style="margin-top:8px">Instellingen wijzigen</button>
    `;
  } else {
    body = `
      <p class="hint">✅ Verbonden als <strong>${escapeHtml(account.username || account.name || '')}</strong> · map: <strong>${escapeHtml(cfg.folder)}</strong></p>
      <p class="hint">Laatst gesynchroniseerd: ${lastSyncTxt}</p>
      ${state.syncMessage ? `<p class="hint" style="color:var(--accent)">${escapeHtml(state.syncMessage)}</p>` : ''}
      <button class="btn primary" data-action="sync-now" ${state.syncBusy ? 'disabled' : ''}>${state.syncBusy ? '⏳ Bezig…' : '🔄 Nu synchroniseren'}</button>
      <button class="btn tiny" data-action="disconnect-onedrive" style="margin-top:8px">Ontkoppelen</button>
    `;
  }

  return `<h3>Online synchronisatie (OneDrive)</h3>${body}`;
}

function renderSettings() {
  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-action="go-home">←</button>
      <div class="brand"><span class="brand-mark">Instellingen</span></div>
      <span></span>
    </header>
    <div class="form-wrap">

      <section class="card">
        <h3>Extra artikelen in de bestellijst</h3>
        <p class="hint">Voeg hier artikelen toe die niet in de standaardlijst staan, eventueel met een foto zodat je ze makkelijk herkent. Ze verschijnen meteen bovenaan bij "Bestelling materieel".</p>
        ${state.customCatalog.length ? state.customCatalog.map(c => `
          <div class="list-item" style="--accent:#2a6f8c">
            ${c.photoId ? `
              <span class="photo-chip">
                <img data-photo-thumb="${c.photoId}" class="thumb">
                <button data-action="remove-item-photo" data-id="${c.id}" title="Foto verwijderen">✕</button>
              </span>` : ''}
            <div class="li-main">
              <div class="li-title">${escapeHtml(c.label)}</div>
              <div class="li-sub">${escapeHtml(c.category)}${c.hasSize ? ' · has size' : ''}</div>
            </div>
            <label class="btn tiny photo-add" title="${c.photoId ? 'Foto vervangen' : 'Foto toevoegen'}">📷
              <input type="file" accept="image/*" style="display:none" data-action="add-item-photo" data-id="${c.id}">
            </label>
            <button class="icon-btn small" data-action="remove-catalog-item" data-id="${c.id}" title="Artikel verwijderen">🗑️</button>
          </div>
        `).join('') : '<p class="empty">Nog geen extra artikelen toegevoegd.</p>'}

        <div class="field" style="margin-top:14px">
          <label>Artikelnaam</label>
          <input type="text" id="newItemLabel" placeholder="bv. Safety goggles">
        </div>
        <div class="field">
          <label>Categorie</label>
          <input type="text" id="newItemCategory" placeholder="bv. PPE, Office, Packaging, Clothing…">
        </div>
        <div class="field">
          <label class="checkbox-label"><input type="checkbox" id="newItemHasSize"> Dit artikel heeft een maat (kledij)</label>
        </div>
        <div class="field">
          <label>Foto (optioneel)</label>
          <div class="photo-row" id="newItemPhotoRow">${renderNewItemPhotoRow()}</div>
        </div>
        <button class="btn secondary" data-action="add-catalog-item">+ Artikel toevoegen aan de lijst</button>
      </section>

      <section class="card">
        ${renderSupplierSection()}
      </section>

      <section class="card">
        <h3>Artikelen: artikelnr, EN-normen &amp; vertaling</h3>
        <p class="hint">Klik een artikel open om het artikelnummer, de Engelse/Nederlandse naam en de standaard EN-normen aan te passen. Laat het artikelnr leeg zolang het niet bekend is. Wijzigingen worden meteen bewaard en gelden voor nieuwe bestellingen.</p>
        ${renderCatalogEditor()}
      </section>

      <section class="card">
        <h3>EN-normen</h3>
        <p class="hint">Lijst van normen met korte uitleg. Pas een norm aan of voeg er een toe; daarna kan je ze koppelen aan artikelen (hierboven) of per bestelregel kiezen.</p>
        ${state.norms.map((n, i) => `
          <div class="norm-edit" data-norm-index="${i}">
            <div class="hose-row">
              <input type="text" placeholder="Code (bv. EN 166)" data-norm-field="code" value="${escapeAttr(n.code || '')}">
              <button class="icon-btn small" data-action="remove-norm" data-index="${i}" title="Norm verwijderen">🗑️</button>
            </div>
            <input type="text" placeholder="Uitleg (NL)" data-norm-field="nl" value="${escapeAttr(n.nl || '')}">
            <input type="text" placeholder="Explanation (EN)" data-norm-field="en" value="${escapeAttr(n.en || '')}">
          </div>`).join('')}
        <button class="btn tiny" data-action="add-norm">+ Norm toevoegen</button>
        <button class="btn tiny" data-action="reset-norms" title="Voegt ontbrekende standaardnormen terug toe">↺ Standaardnormen aanvullen</button>
      </section>

      <section class="card">
        <h3>Leveranciers &amp; e-mailadressen</h3>
        <p class="hint">Bestellingen worden met de knop "Verzenden naar leverancier" naar het e-mailadres van de gekozen leverancier gestuurd. De adressen hieronder (E-mailadressen voor PDF-verzending) komen in CC.</p>
        <div class="hose-list">
          ${state.supplierDirectory.map((s, i) => `
            <div class="hose-row-wrap" data-supplier-index="${i}">
              <div class="hose-row">
                <input type="text" placeholder="Naam leverancier" data-supplier-field="name" value="${escapeAttr(s.name || '')}">
                <input type="email" placeholder="bestellingen@leverancier.be" data-supplier-field="email" value="${escapeAttr(s.email || '')}">
                <button class="icon-btn small" data-action="remove-supplier-dir" data-index="${i}">✕</button>
              </div>
            </div>`).join('')}
        </div>
        <button class="btn tiny" data-action="add-supplier-dir">+ Leverancier toevoegen</button>
      </section>

      <section class="card">
        <h3>E-mailadressen voor PDF-verzending</h3>
        <p class="hint">Deze adressen worden gebruikt bij de knop "✉️ Verzenden via e-mail" op een formulier.</p>
        <div class="hose-list">
          ${state.emailRecipients.map((addr, i) => `
            <div class="hose-row-wrap" data-email-index="${i}">
              <div class="hose-row">
                <input type="email" placeholder="naam@bedrijf.com" data-email-field="addr" value="${escapeAttr(addr)}" style="grid-column: 1 / span 2;">
                <button class="icon-btn small" data-action="remove-email" data-index="${i}">✕</button>
              </div>
            </div>`).join('')}
        </div>
        <button class="btn tiny" data-action="add-email">+ E-mailadres toevoegen</button>
      </section>

      <section class="card" id="syncCard">
        ${renderSyncSection()}
      </section>

      <div class="action-bar column">
        <button class="btn primary large" data-action="save-settings">💾 Instellingen opslaan</button>
      </div>

      <p class="footnote" style="padding:0 14px 20px">
        ℹ️ De knop "Verzenden via e-mail" opent je e-mailprogramma met deze adressen al ingevuld en downloadt de PDF —
        browsers laten om veiligheidsredenen niet toe dat een bestand automatisch als bijlage wordt toegevoegd,
        dus dat laatste stapje (bijlage toevoegen) doe je zelf nog even in je mailprogramma.
      </p>
    </div>
  `;
  bindGlobal();
}


function renderViewEntry() {
  const e = state.entries.find(x => x.id === state.viewingId);
  if (!e) { state.view = 'history'; return render(); }
  const f = getForm(e.formId);
  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-action="go-history">←</button>
      <div class="brand"><span class="brand-mark">${f.title}</span></div>
      <button class="icon-btn" data-action="open-edit" data-id="${e.id}">✏️</button>
    </header>
    <div class="form-wrap" id="viewWrap"><p class="empty">Bezig met laden…</p></div>
    <div class="action-bar">
      <button class="btn secondary" data-action="export-pdf" data-id="${e.id}">📄 PDF genereren</button>
      <button class="btn primary" data-action="share-pdf" data-id="${e.id}">📤 Delen met team</button>
      <button class="btn secondary" data-action="email-pdf" data-id="${e.id}">✉️ Verzenden via e-mail</button>
      ${e.kind === 'bestelling' ? `<button class="btn primary" data-action="send-supplier" data-id="${e.id}">📨 Verzenden naar leverancier${e.sentAt ? ' (opnieuw)' : ''}</button>` : ''}
    </div>
  `;
  bindGlobal();
  renderSummaryHtml(e, f);
}

function renderSummaryHtml(e, f) {
  const extraMeta = e.kind === 'bestelling'
    ? `<div class="meta-row"><span>Ordernummer</span><strong>${escapeHtml(e.orderNumber || '-')}</strong></div>` +
      `<div class="meta-row"><span>Leverancier</span><strong>${escapeHtml(e.supplierName || '-')}</strong></div>` +
      (e.sentAt ? `<div class="meta-row"><span>Verzonden</span><strong>${escapeHtml(new Date(e.sentAt).toLocaleString('nl-BE'))} → ${escapeHtml(e.sentTo || '')}</strong></div>` : '')
    : '';
  const metaHtml = extraMeta + f.meta.map(mf => `<div class="meta-row"><span>${mf.label}</span><strong>${e.meta[mf.id] || '-'}</strong></div>`).join('');

  let body = '';
  if (e.kind === 'melding') {
    const betrokkenenHtml = (e.betrokkenen || []).length
      ? `<div class="view-section"><h3>Betrokkenen</h3>${e.betrokkenen.map(b => `<div class="view-q"><div class="vq-text"><strong>${b.naam || '-'}</strong>${b.rol ? ' — ' + b.rol : ''}</div></div>`).join('')}</div>`
      : '';
    const omschrijvingHtml = `<div class="view-section"><h3>Omschrijving</h3><div class="view-q"><div class="vq-note">${(e.omschrijving || '-').replace(/\n/g, '<br>')}</div></div></div>`;
    const fotosHtml = (e.photos && e.photos.length) ? `<div class="view-section"><h3>Foto's</h3><div class="vq-photos" data-photo-ids="${e.photos.join(',')}"></div></div>` : '';
    const sigHtml = e.signature ? `<div class="view-section"><h3>Handtekening melder</h3><img class="sig-img" src="${e.signature}"></div>` : '';
    body = betrokkenenHtml + omschrijvingHtml + fotosHtml + sigHtml;
  } else {
    const linesHtml = `<div class="view-section"><h3>Ordered items</h3>${(e.lines || []).map(l => {
      const item = fullCatalog().find(c => c.id === l.itemId);
      const naam = l.itemId === 'manual' ? (l.customName || 'Manual item') : (item ? item.label : '-');
      const details = [];
      if (l.articleNr) details.push('art. ' + l.articleNr);
      if (l.norms && l.norms.length) details.push(l.norms.join(', '));
      if (l.maat) details.push('size ' + l.maat);
      if (l.type) details.push('type ' + l.type);
      if (l.merk) details.push('brand ' + l.merk);
      return `<div class="view-q"><div class="vq-text"><strong>${naam}</strong> — quantity: ${l.aantal || '-'}${l.unit ? ' ' + l.unit : ''}${parsePrice(l.prijs) !== null ? ' @ ' + fmtEuro(parsePrice(l.prijs)) : ''}${details.length ? ' (' + details.join(', ') + ')' : ''}</div>${(l.photos && l.photos.length) ? `<div class="vq-photos" data-photo-ids="${l.photos.join(',')}"></div>` : ''}</div>`;
    }).join('') || '<p class="empty">No items added.</p>'}</div>`;
    body = linesHtml;
  }

  document.getElementById('viewWrap').innerHTML = `<div class="meta-block">${metaHtml}</div>${body}`;

  document.querySelectorAll('.vq-photos').forEach(async el => {
    const ids = el.dataset.photoIds.split(',').filter(Boolean);
    for (const id of ids) {
      const url = await QHSE_DB.getPhoto(id);
      if (url) { const img = document.createElement('img'); img.src = url; img.className = 'thumb'; el.appendChild(img); }
    }
  });
}

/* ---------------------------------------------------------------------
   FORM
--------------------------------------------------------------------- */
function renderForm() {
  const f = getForm(state.draft.formId);
  const d = state.draft;

  if (f.kind === 'melding') {
    $app.innerHTML = `
      <header class="topbar" style="--accent:${f.color}">
        <button class="icon-btn" data-action="go-home-confirm">←</button>
        <div class="brand"><span class="brand-mark">${f.title}</span></div>
        <button class="icon-btn" data-action="save-draft">💾</button>
      </header>
      <div class="form-wrap">
        <section class="card"><h3>Gegevens melder</h3>${f.meta.map(mf => renderMetaField(mf, d)).join('')}</section>

        <section class="card">
          <h3>Betrokkenen</h3>
          <div class="hose-list">
            ${(d.betrokkenen || []).map((b, i) => `
              <div class="hose-row-wrap" data-betrokkene-index="${i}">
                <div class="hose-row">
                  <input type="text" placeholder="Naam" data-betrokkene-field="naam" value="${escapeAttr(b.naam || '')}">
                  <input type="text" placeholder="Functie / rol" data-betrokkene-field="rol" value="${escapeAttr(b.rol || '')}">
                  <button class="icon-btn small" data-action="remove-betrokkene" data-index="${i}">✕</button>
                </div>
              </div>`).join('')}
          </div>
          <button class="btn tiny" data-action="add-betrokkene">+ Betrokkene toevoegen</button>
        </section>

        <section class="card">
          <h3>Omschrijving</h3>
          <textarea class="wide-textarea" placeholder="Beschrijf wat er gebeurd is…" data-action="omschrijving">${d.omschrijving || ''}</textarea>
        </section>

        ${(f.extraQuestions && f.extraQuestions.length) ? `
          <section class="card"><h3>Bijkomende vragen</h3>${f.extraQuestions.map(q => renderQuestion(q, d)).join('')}</section>
        ` : ''}

        <section class="card">
          <h3>Foto's</h3>
          <div class="photo-row">
            ${(d.photos || []).map(pid => `<span class="photo-chip"><img data-photo-thumb="${pid}" class="thumb"><button data-action="remove-photo-general" data-pid="${pid}">✕</button></span>`).join('')}
            <label class="btn tiny photo-add">📷 Foto toevoegen
              <input type="file" accept="image/*" capture="environment" multiple style="display:none" data-action="add-photo-general">
            </label>
          </div>
        </section>

        <section class="card">
          <h3>Handtekening melder</h3>
          <canvas id="sigPad" class="sig-pad" width="600" height="200"></canvas>
          <div class="sig-actions"><button class="btn secondary" data-action="clear-sig">Wissen</button></div>
        </section>

        <div class="action-bar column">
          <button class="btn primary large" data-action="finish">✅ Melding afronden &amp; opslaan</button>
          <button class="btn secondary" data-action="save-draft">Opslaan als concept</button>
        </div>
      </div>`;
    bindGlobal();
    initSignaturePad(d.signature);
    return;
  }

  // --- Bestelling ---
  $app.innerHTML = `
    <header class="topbar" style="--accent:${f.color}">
      <button class="icon-btn" data-action="go-home-confirm">←</button>
      <div class="brand"><span class="brand-mark">${f.title}</span></div>
      <button class="icon-btn" data-action="save-draft">💾</button>
    </header>
    <div class="form-wrap">
      <section class="card">
        <h3>Details</h3>
        <div class="order-number-banner">Order no.: <strong>${escapeHtml(d.orderNumber || '-')}</strong></div>
        ${f.meta.map(mf => renderMetaField(mf, d)).join('')}
        <div class="field">
          <label>Supplier (order is e-mailed to this supplier)</label>
          <select data-order-supplier>
            <option value="">Choose a supplier…</option>
            ${(state.supplierDirectory || []).filter(s => s.name).map(s => `<option value="${escapeAttr(s.name)}" ${d.supplierName === s.name ? 'selected' : ''}>${escapeHtml(s.name)}${s.email ? ' — ' + escapeHtml(s.email) : ' (no e-mail set)'}</option>`).join('')}
          </select>
          ${(state.supplierDirectory || []).length ? '' : '<div class="hint">No suppliers yet — add them with their e-mail address under ⚙️ Settings → Leveranciers &amp; e-mailadressen.</div>'}
        </div>
      </section>

      <section class="card">
        <h3>Items</h3>
        ${(d.lines || []).map((l, i) => renderOrderLine(l, i)).join('') || '<p class="hint">No items added yet.</p>'}
        <button class="btn tiny" data-action="add-line">+ Add item</button>
      </section>

      <div class="action-bar column">
        <button class="btn primary large" data-action="finish-send">📨 Save &amp; send to supplier</button>
        <button class="btn secondary" data-action="finish">✅ Complete &amp; save (don't send)</button>
        <button class="btn secondary" data-action="save-draft">Save as draft</button>
      </div>
    </div>`;
  bindGlobal();
}

function renderMetaField(f, d) {
  const val = d.meta[f.id];
  if (f.type === 'date') return `<div class="field"><label>${f.label}</label><input type="date" data-meta="${f.id}" value="${val || ''}"></div>`;
  return `<div class="field"><label>${f.label}</label><input type="text" data-meta="${f.id}" value="${escapeAttr(val || '')}" placeholder="${f.label}"></div>`;
}

function renderQuestion(q, d) {
  const a = d.answers[q.id];
  return `
    <div class="question ${a.status === 'NOK' ? 'is-nok' : ''}" data-qid="${q.id}">
      <div class="q-text">${q.text}</div>
      ${q.hint ? `<div class="q-hint">${q.hint}</div>` : ''}
      ${q.checkboxOptions ? `<div class="check-row">${q.checkboxOptions.map(opt => `<button class="chip ${a.checks && a.checks.includes(opt) ? 'active' : ''}" data-action="toggle-check" data-qid="${q.id}" data-opt="${escapeAttr(opt)}">${opt}</button>`).join('')}</div>` : ''}
      <div class="q-status-row">
        ${QHSE_STATUS.map(s => `<button class="status-btn status-${s.toLowerCase()} ${a.status === s ? 'active' : ''}" data-action="set-status" data-qid="${q.id}" data-status="${s}">${s}</button>`).join('')}
      </div>
      <div class="q-extra" style="${a.status === 'NOK' ? '' : 'display:none'}">
        <textarea placeholder="Opmerking / vaststelling…" data-action="note" data-qid="${q.id}">${a.note || ''}</textarea>
        <div class="photo-row" data-qid="${q.id}">
          ${(a.photos || []).map(pid => `<span class="photo-chip"><img data-photo-thumb="${pid}" class="thumb"><button data-action="remove-photo" data-qid="${q.id}" data-pid="${pid}">✕</button></span>`).join('')}
          <label class="btn tiny photo-add">📷 Foto toevoegen<input type="file" accept="image/*" capture="environment" multiple style="display:none" data-action="add-photo" data-qid="${q.id}"></label>
        </div>
      </div>
    </div>`;
}

function renderOrderLine(l, i) {
  const catalog = fullCatalog();
  const item = catalog.find(c => c.id === l.itemId);
  const grouped = {};
  catalog.forEach(c => { grouped[c.category] = grouped[c.category] || []; grouped[c.category].push(c); });

  return `
    <div class="order-line" data-line-index="${i}">
      <div class="order-line-row">
        <select data-line-field="itemId" class="order-select">
          <option value="">Choose an item…</option>
          ${Object.entries(grouped).map(([cat, items]) => `
            <optgroup label="${escapeAttr(cat)}">
              ${items.filter(c => !c.legacy || l.itemId === c.id).map(c => `<option value="${c.id}" ${l.itemId === c.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
            </optgroup>`).join('')}
          <option value="manual" ${l.itemId === 'manual' ? 'selected' : ''}>Other material (enter manually)</option>
        </select>
        <input type="number" min="1" placeholder="Qty" data-line-field="aantal" class="order-aantal" value="${l.aantal || ''}">
        <select data-line-field="unit" class="order-unit">
          <option value="">Unit…</option>
          ${ORDER_UNITS.map(u => `<option value="${u}" ${l.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
        <button class="icon-btn small" data-action="remove-line" data-index="${i}">✕</button>
      </div>
      ${l.itemId === 'manual' ? `<input type="text" placeholder="Material description" data-line-field="customName" class="order-extra-field" value="${escapeAttr(l.customName || '')}">` : ''}
      ${item && item.hasSize ? `<input type="text" placeholder="Size" data-line-field="maat" class="order-extra-field" value="${escapeAttr(l.maat || '')}">` : ''}
      ${item && item.extraFields ? item.extraFields.map(ef => ef.options
        ? `<select data-line-field="${ef.id}" class="order-extra-field"><option value="">${escapeHtml(ef.label)}…</option>${ef.options.map(o => `<option value="${escapeAttr(o)}" ${l[ef.id] === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`
        : `<input type="text" placeholder="${ef.label}" data-line-field="${ef.id}" class="order-extra-field" value="${escapeAttr(l[ef.id] || '')}">`).join('') : ''}
      ${l.itemId ? `
        ${item && item.labelNl && item.labelNl !== item.label ? `<div class="hint" style="margin:0">🇳🇱 ${escapeHtml(item.labelNl)}</div>` : ''}
        <input type="text" placeholder="Article no. (leave empty if unknown)" data-line-field="articleNr" class="order-extra-field" value="${escapeAttr(l.articleNr || '')}">
        <div class="norm-box">
          <div class="norm-title">EN standards</div>
          <div class="norm-chips">${normChips(l.norms, { action: 'remove-line-norm', attrs: `data-index="${i}"` }) || '<span class="hint" style="margin:0">None selected</span>'}</div>
          <select data-line-norm-add class="order-extra-field"><option value="">+ Add standard…</option>${normOptions(l.norms)}</select>
        </div>` : ''}
      <input type="text" inputmode="decimal" placeholder="Unit price excl. VAT (optional, €)" data-line-field="prijs" class="order-extra-field" value="${escapeAttr(l.prijs || '')}">
      ${item && itemSupplier(item.id) ? `<div class="hint" style="margin:0">🏭 Supplier: <strong>${escapeHtml(itemSupplier(item.id))}</strong></div>` : ''}
      <div class="photo-row">
        ${(l.photos || []).map(pid => `<span class="photo-chip"><img data-photo-thumb="${pid}" class="thumb"><button data-action="remove-line-photo" data-index="${i}" data-pid="${pid}">✕</button></span>`).join('')}
        <label class="btn tiny photo-add">📷 Add photo
          <input type="file" accept="image/*" capture="environment" multiple style="display:none" data-action="add-line-photo" data-index="${i}">
        </label>
      </div>
    </div>`;
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

/* ---------------------------------------------------------------------
   Signature pad
--------------------------------------------------------------------- */
let sigCtx = null, sigDrawing = false;
function initSignaturePad(existingDataUrl) {
  const canvas = document.getElementById('sigPad');
  if (!canvas) return;
  sigCtx = canvas.getContext('2d');
  sigCtx.lineWidth = 2.5; sigCtx.lineCap = 'round'; sigCtx.strokeStyle = '#1a1a1a';
  if (existingDataUrl) { const img = new Image(); img.onload = () => sigCtx.drawImage(img, 0, 0, canvas.width, canvas.height); img.src = existingDataUrl; }
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) }; };
  const start = (e) => { sigDrawing = true; const p = pos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); e.preventDefault(); };
  const move = (e) => { if (!sigDrawing) return; const p = pos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); e.preventDefault(); };
  const end = () => { if (!sigDrawing) return; sigDrawing = false; state.draft.signature = canvas.toDataURL('image/png'); };
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
}

/* ---------------------------------------------------------------------
   Foto's — resize/compress
--------------------------------------------------------------------- */
function fileToCompressedDataUrl(file, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const reader = new FileReader();
    reader.onload = () => { img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) { const ratio = Math.min(maxDim / width, maxDim / height); width = Math.round(width * ratio); height = Math.round(height * ratio); }
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    }; img.onerror = reject; img.src = reader.result; };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
async function loadThumb(imgEl, photoId) { const url = await QHSE_DB.getPhoto(photoId); if (url) imgEl.src = url; }

/* ---------------------------------------------------------------------
   Event delegation — property-toewijzing (onclick/oninput/onchange),
   NIET addEventListener, zodat handlers bij elke render vervangen
   worden i.p.v. stapelen (voorkomt dubbele foto-verwerking).
--------------------------------------------------------------------- */
function bindGlobal() {
  $app.querySelectorAll('[data-photo-thumb]').forEach(img => loadThumb(img, img.dataset.photoThumb));

  $app.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'new') return newEntry(btn.dataset.id);
    if (action === 'go-home') { state.view = 'home'; return render(); }
    if (action === 'go-home-confirm') { await saveDraft(true); state.view = 'home'; return render(); }
    if (action === 'go-history') { state.view = 'history'; return render(); }
    if (action === 'history-tab') { state.historyTab = btn.dataset.tab; return renderHistory(); }
    if (action === 'go-settings') { state.view = 'settings'; return render(); }
    if (action === 'open-view') return viewEntry(btn.dataset.id);
    if (action === 'open-edit') return openEntry(btn.dataset.id);
    if (action === 'delete') return deleteEntry(btn.dataset.id);
    if (action === 'save-draft') return saveDraft(false);

    if (action === 'finish') {
      state.draft.finished = true;
      await saveDraft(true);
      state.viewingId = state.draft.id;
      state.view = 'view';
      toast('Opgeslagen ✓');
      return render();
    }

    if (action === 'finish-send') {
      const err = validateOrderForSend(state.draft);
      if (err) { toast(err); return; }
      state.draft.finished = true;
      await saveDraft(true);
      state.viewingId = state.draft.id;
      state.view = 'view';
      render();
      return sendOrderToSupplier(state.draft.id);
    }
    if (action === 'send-supplier') { return sendOrderToSupplier(btn.dataset.id); }

    if (action === 'set-status') {
      state.draft.answers[btn.dataset.qid].status = btn.dataset.status;
      renderForm(); initSignaturePad(state.draft.signature); return;
    }
    if (action === 'toggle-check') {
      const a = state.draft.answers[btn.dataset.qid]; a.checks = a.checks || [];
      const i = a.checks.indexOf(btn.dataset.opt);
      if (i === -1) a.checks.push(btn.dataset.opt); else a.checks.splice(i, 1);
      renderForm(); initSignaturePad(state.draft.signature); return;
    }
    if (action === 'remove-photo') {
      const qid = btn.dataset.qid, pid = btn.dataset.pid;
      state.draft.answers[qid].photos = state.draft.answers[qid].photos.filter(p => p !== pid);
      await QHSE_DB.deletePhoto(pid);
      renderForm(); initSignaturePad(state.draft.signature); return;
    }

    if (action === 'add-betrokkene') { state.draft.betrokkenen = state.draft.betrokkenen || []; state.draft.betrokkenen.push({ naam: '', rol: '' }); renderForm(); initSignaturePad(state.draft.signature); return; }
    if (action === 'remove-betrokkene') { state.draft.betrokkenen.splice(Number(btn.dataset.index), 1); renderForm(); initSignaturePad(state.draft.signature); return; }

    if (action === 'remove-photo-general') {
      const pid = btn.dataset.pid;
      state.draft.photos = (state.draft.photos || []).filter(p => p !== pid);
      await QHSE_DB.deletePhoto(pid);
      renderForm(); initSignaturePad(state.draft.signature); return;
    }

    if (action === 'clear-sig') { const c = document.getElementById('sigPad'); sigCtx.clearRect(0, 0, c.width, c.height); state.draft.signature = null; return; }

    if (action === 'add-line') { state.draft.lines = state.draft.lines || []; state.draft.lines.push({}); renderForm(); return; }
    if (action === 'remove-line') { state.draft.lines.splice(Number(btn.dataset.index), 1); renderForm(); return; }
    if (action === 'remove-line-photo') {
      const idx = Number(btn.dataset.index), pid = btn.dataset.pid;
      const line = state.draft.lines[idx];
      line.photos = (line.photos || []).filter(p => p !== pid);
      await QHSE_DB.deletePhoto(pid);
      renderForm(); return;
    }

    if (action === 'add-catalog-item') {
      const labelEl = document.getElementById('newItemLabel');
      const catEl = document.getElementById('newItemCategory');
      const sizeEl = document.getElementById('newItemHasSize');
      const label = labelEl.value.trim();
      if (!label) { toast('Geef een artikelnaam in'); return; }
      state.customCatalog.push({
        id: uid('custom'),
        label,
        category: catEl.value.trim() || 'Other',
        hasSize: sizeEl.checked,
        photoId: state.newItemPhotoId || null
      });
      state.newItemPhotoId = null;
      await QHSE_DB.setSetting('customCatalog', state.customCatalog);
      toast('Artikel toegevoegd ✓');
      renderSettings();
      return;
    }
    if (action === 'remove-newitem-photo') {
      if (state.newItemPhotoId) { await QHSE_DB.deletePhoto(state.newItemPhotoId); state.newItemPhotoId = null; }
      const row = document.getElementById('newItemPhotoRow');
      if (row) row.innerHTML = renderNewItemPhotoRow();
      $app.querySelectorAll('[data-photo-thumb]').forEach(img => loadThumb(img, img.dataset.photoThumb));
      return;
    }
    if (action === 'add-item-photo') { return; } // afgehandeld via onchange (file input)
    if (action === 'remove-item-photo') {
      const item = state.customCatalog.find(c => c.id === btn.dataset.id);
      if (item && item.photoId) { await QHSE_DB.deletePhoto(item.photoId); item.photoId = null; }
      await QHSE_DB.setSetting('customCatalog', state.customCatalog);
      renderSettings();
      return;
    }
    if (action === 'save-sync-config') {
      const clientId = document.getElementById('syncClientId').value.trim();
      const tenantId = document.getElementById('syncTenantId').value.trim();
      const folder = document.getElementById('syncFolder').value.trim() || 'Meldingen App';
      if (!clientId || !tenantId) { toast('Vul Client ID en Tenant ID in'); return; }
      state.syncConfig = { clientId, tenantId, folder };
      await QHSE_DB.setSetting('syncConfig', state.syncConfig);
      toast('Synchronisatie ingesteld ✓');
      renderSettings();
      return;
    }
    if (action === 'edit-sync-config') {
      state.syncConfig = { clientId: '', tenantId: '', folder: state.syncConfig.folder || 'Meldingen App' };
      renderSettings();
      return;
    }
    if (action === 'connect-onedrive') {
      try { await QHSE_SYNC.login(state.syncConfig); } catch (e) { toast('Inloggen mislukt'); }
      return;
    }
    if (action === 'sync-now') { runSync(false); return; }
    if (action === 'disconnect-onedrive') {
      QHSE_SYNC.logout();
      renderSettings();
      return;
    }
    if (action === 'save-suppliers') {
      const map = {};
      $app.querySelectorAll('[data-supplier-id]').forEach(inp => {
        const v = inp.value.trim();
        if (v) map[inp.dataset.supplierId] = v;
      });
      state.supplierMap = map;
      await QHSE_DB.setSetting('supplierMap', map);
      toast('Leveranciers opgeslagen ✓');
      return;
    }
    if (action === 'remove-catalog-item') {
      state.customCatalog = state.customCatalog.filter(c => c.id !== btn.dataset.id);
      await QHSE_DB.setSetting('customCatalog', state.customCatalog);
      renderSettings();
      return;
    }
    if (action === 'add-email') { state.emailRecipients.push(''); renderSettings(); return; }
    if (action === 'remove-email') { state.emailRecipients.splice(Number(btn.dataset.index), 1); await QHSE_DB.setSetting('emailRecipients', state.emailRecipients); renderSettings(); return; }
    if (action === 'remove-line-norm') {
      const ln = state.draft.lines[Number(btn.dataset.index)];
      ln.norms = (ln.norms || []).filter(c => c !== btn.dataset.code);
      renderForm(); return;
    }
    if (action === 'remove-item-norm') {
      const id = btn.dataset.id;
      const item = fullCatalog().find(c => c.id === id);
      await setItemField(id, 'normCodes', ((item && item.normCodes) || []).filter(c => c !== btn.dataset.code));
      state.openItem = id; renderSettings(); return;
    }
    if (action === 'add-norm') { state.norms.push({ code: '', nl: '', en: '' }); await QHSE_DB.setSetting('norms', state.norms); renderSettings(); return; }
    if (action === 'remove-norm') { state.norms.splice(Number(btn.dataset.index), 1); await QHSE_DB.setSetting('norms', state.norms); renderSettings(); return; }
    if (action === 'reset-norms') {
      // ontbrekende standaardnormen opnieuw toevoegen (bestaande, ook aangepaste, blijven ongewijzigd)
      ORDER_NORMS.forEach(n => { if (!state.norms.some(x => x.code === n.code)) state.norms.push({ ...n }); });
      await QHSE_DB.setSetting('norms', state.norms); toast('Standaardnormen aangevuld ✓'); renderSettings(); return;
    }
    if (action === 'add-supplier-dir') { state.supplierDirectory.push({ name: '', email: '' }); renderSettings(); return; }
    if (action === 'remove-supplier-dir') { state.supplierDirectory.splice(Number(btn.dataset.index), 1); await QHSE_DB.setSetting('supplierDirectory', state.supplierDirectory); renderSettings(); return; }
    if (action === 'save-settings') { state.supplierDirectory = state.supplierDirectory.filter(s => (s.name || '').trim()); await QHSE_DB.setSetting('supplierDirectory', state.supplierDirectory); await QHSE_DB.setSetting('emailRecipients', state.emailRecipients); await QHSE_DB.setSetting('customCatalog', state.customCatalog); toast('Instellingen opgeslagen ✓'); return; }

    if (action === 'export-pdf') {
      const e = state.entries.find(x => x.id === btn.dataset.id);
      toast('PDF wordt gegenereerd…');
      const blob = await MELD_PDF.build(e, getForm(e.formId), fullCatalog(), state.norms);
      downloadBlob(blob, pdfFileName(e));
      return;
    }
    if (action === 'share-pdf') {
      const e = state.entries.find(x => x.id === btn.dataset.id);
      toast('PDF wordt voorbereid…');
      const blob = await MELD_PDF.build(e, getForm(e.formId), fullCatalog(), state.norms);
      const file = new File([blob], pdfFileName(e), { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'SOS formulier', text: pdfFileName(e) }); return; } catch (err) {}
      }
      downloadBlob(blob, pdfFileName(e));
      toast('Delen niet ondersteund op dit toestel — PDF gedownload');
      return;
    }
    if (action === 'email-pdf') {
      const validRecipients = state.emailRecipients.map(a => a.trim()).filter(Boolean);
      if (!validRecipients.length) {
        toast('Geen e-mailadres ingesteld — ga naar Instellingen ⚙️');
        return;
      }
      const e = state.entries.find(x => x.id === btn.dataset.id);
      const f = getForm(e.formId);
      toast('PDF wordt gedownload…');
      const blob = await MELD_PDF.build(e, f, fullCatalog(), state.norms);
      const filename = pdfFileName(e);
      downloadBlob(blob, filename);

      const payload = buildStructuredPayload(e, f, filename);
      const jsonBlock = JSON.stringify(payload);
      const subject = encodeURIComponent(`${f.title} — ${e.meta.naam_melder || e.meta.naam_werknemer || ''} — ${e.meta.datum || ''}`);
      const bodyText =
        `Bijgevoegd het PDF-rapport "${filename}".\n\n` +
        `(Dit bestand is zonet gedownload op dit toestel — voeg het toe als bijlage voor je deze e-mail verzendt; browsers laten geen automatische bijlage toe.)\n\n` +
        `--- Niet verwijderen: onderstaand blok wordt automatisch verwerkt (bv. door Power Automate) ---\n` +
        `---SOS-DATA-START---\n${jsonBlock}\n---SOS-DATA-END---`;
      const body = encodeURIComponent(bodyText);
      const mailto = `mailto:${validRecipients.join(',')}?subject=${subject}&body=${body}`;
      window.location.href = mailto;
      toast('PDF gedownload — voeg het toe als bijlage in je mailprogramma');
      return;
    }
  };

  const handleFieldChange = async (e) => {
    const el = e.target;

    if (el.dataset.action === 'add-newitem-photo') {
      const file = (el.files || [])[0]; el.value = '';
      if (!file) return;
      if (state.newItemPhotoId) await QHSE_DB.deletePhoto(state.newItemPhotoId);
      const dataUrl = await fileToCompressedDataUrl(file, 600);
      const pid = uid('photo');
      await QHSE_DB.savePhoto(pid, dataUrl);
      state.newItemPhotoId = pid;
      const row = document.getElementById('newItemPhotoRow');
      if (row) row.innerHTML = renderNewItemPhotoRow();
      $app.querySelectorAll('[data-photo-thumb]').forEach(img => loadThumb(img, img.dataset.photoThumb));
      return;
    }
    if (el.dataset.action === 'add-item-photo') {
      const file = (el.files || [])[0]; el.value = '';
      if (!file) return;
      const item = state.customCatalog.find(c => c.id === el.dataset.id);
      if (!item) return;
      if (item.photoId) await QHSE_DB.deletePhoto(item.photoId);
      const dataUrl = await fileToCompressedDataUrl(file, 600);
      const pid = uid('photo');
      await QHSE_DB.savePhoto(pid, dataUrl);
      item.photoId = pid;
      await QHSE_DB.setSetting('customCatalog', state.customCatalog);
      renderSettings();
      return;
    }
    if (el.dataset.action === 'add-photo-general') {
      const files = Array.from(el.files || []); el.value = '';
      state.draft.photos = state.draft.photos || [];
      for (const file of files) { const dataUrl = await fileToCompressedDataUrl(file, 1000); const pid = uid('photo'); await QHSE_DB.savePhoto(pid, dataUrl); state.draft.photos.push(pid); }
      renderForm(); initSignaturePad(state.draft.signature); return;
    }
    if (el.dataset.action === 'add-photo') {
      const qid = el.dataset.qid; const files = Array.from(el.files || []); el.value = '';
      for (const file of files) { const dataUrl = await fileToCompressedDataUrl(file, 1000); const pid = uid('photo'); await QHSE_DB.savePhoto(pid, dataUrl); state.draft.answers[qid].photos.push(pid); }
      renderForm(); initSignaturePad(state.draft.signature); return;
    }
    if (el.dataset.action === 'add-line-photo') {
      const idx = Number(el.dataset.index);
      const files = Array.from(el.files || []); el.value = '';
      const line = state.draft.lines[idx];
      line.photos = line.photos || [];
      for (const file of files) { const dataUrl = await fileToCompressedDataUrl(file, 1000); const pid = uid('photo'); await QHSE_DB.savePhoto(pid, dataUrl); line.photos.push(pid); }
      renderForm(); return;
    }
    if (el.dataset.action === 'omschrijving') { state.draft.omschrijving = el.value; return; }
    if (el.dataset.action === 'note') { state.draft.answers[el.dataset.qid].note = el.value; return; }
    if (el.dataset.meta) { state.draft.meta[el.dataset.meta] = el.value; return; }
    if (el.dataset.orderSupplier !== undefined) { state.draft.supplierName = el.value; return; }
    if (el.dataset.lineNormAdd !== undefined) {
      if (!el.value) return;
      const idx = Number(el.closest('.order-line').dataset.lineIndex);
      const ln = state.draft.lines[idx]; ln.norms = ln.norms || [];
      if (!ln.norms.includes(el.value)) ln.norms.push(el.value);
      renderForm(); return;
    }
    if (el.closest('.norm-edit') && el.dataset.normField) {
      const idx = Number(el.closest('.norm-edit').dataset.normIndex);
      state.norms[idx][el.dataset.normField] = el.value;
      if (e.type === 'change') await QHSE_DB.setSetting('norms', state.norms);
      return;
    }
    if (el.closest('.item-edit') && el.dataset.itemField) {
      if (e.type === 'change') await setItemField(el.closest('.item-edit').dataset.itemId, el.dataset.itemField, el.value);
      return;
    }
    if (el.dataset.itemNormAdd !== undefined) {
      if (!el.value) return;
      const id = el.dataset.itemNormAdd;
      const item = fullCatalog().find(c => c.id === id);
      const codes = [...((item && item.normCodes) || [])];
      if (!codes.includes(el.value)) codes.push(el.value);
      await setItemField(id, 'normCodes', codes);
      state.openItem = id; renderSettings(); return;
    }
    if (el.closest('.hose-row-wrap') && el.dataset.supplierField) {
      const idx = Number(el.closest('.hose-row-wrap').dataset.supplierIndex);
      state.supplierDirectory[idx][el.dataset.supplierField] = el.value; return;
    }
    if (el.closest('.hose-row-wrap') && el.dataset.emailField) {
      const row = el.closest('.hose-row-wrap'); const idx = Number(row.dataset.emailIndex);
      state.emailRecipients[idx] = el.value; return;
    }
    if (el.closest('.hose-row-wrap') && el.dataset.betrokkeneField) {
      const row = el.closest('.hose-row-wrap'); const idx = Number(row.dataset.betrokkeneIndex);
      state.draft.betrokkenen[idx][el.dataset.betrokkeneField] = el.value; return;
    }
    if (el.closest('.order-line') && el.dataset.lineField) {
      const row = el.closest('.order-line'); const idx = Number(row.dataset.lineIndex);
      const field = el.dataset.lineField;
      state.draft.lines[idx][field] = el.value;
      if (field === 'itemId') {
        // leverancier automatisch voorstellen als er nog geen gekozen is en het artikel een gekoppelde leverancier heeft die in het overzicht staat
        const chosen = fullCatalog().find(c => c.id === el.value);
        state.draft.lines[idx].articleNr = chosen ? (chosen.articleNr || '') : '';
        state.draft.lines[idx].norms = chosen ? [...(chosen.normCodes || [])] : [];
        const sup = itemSupplier(el.value);
        if (!state.draft.supplierName && sup && (state.supplierDirectory || []).some(s => s.name === sup)) state.draft.supplierName = sup;
        renderForm();  // herbouw om maat/extra velden correct te tonen
      }
      return;
    }
  };
  $app.oninput = handleFieldChange;
  $app.onchange = handleFieldChange;
}

/* ---------------------------------------------------------------------
   Bestelling verzenden naar leverancier
--------------------------------------------------------------------- */
function validateOrderForSend(e) {
  if (!e.supplierName) return 'Choose a supplier first';
  if (!isValidEmail(supplierEmail(e.supplierName))) return 'No valid e-mail for this supplier — add it in ⚙️ Settings';
  const lines = (e.lines || []).filter(l => l.itemId);
  if (!lines.length) return 'Add at least one item';
  if (lines.some(l => !(Number(l.aantal) > 0))) return 'Enter a quantity for every item';
  if (lines.some(l => l.itemId === 'manual' && !(l.customName || '').trim())) return 'Describe the manual item';
  return '';
}

function orderLineName(l) {
  const item = fullCatalog().find(c => c.id === l.itemId);
  const naam = l.itemId === 'manual' ? (l.customName || 'Ander materiaal')
    : (item ? (itemNameNl(item) + (item.label && itemNameNl(item) !== item.label ? ' / ' + item.label : '')) : '-');
  const det = [];
  if (l.maat) det.push('maat ' + l.maat);
  if (l.type) det.push('type ' + l.type);
  if (l.merk) det.push('merk ' + l.merk);
  return naam + (det.length ? ' (' + det.join(', ') + ')' : '');
}
const UNIT_NL = { Piece: 'stuk', Box: 'doos' };

async function sendOrderToSupplier(id) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return;
  const err = validateOrderForSend(e);
  if (err) { toast(err); return; }
  const to = supplierEmail(e.supplierName);
  const cc = state.emailRecipients.map(x => x.trim()).filter(isValidEmail);

  toast('Bestelbon wordt gegenereerd…');
  const f = getForm(e.formId);
  const blob = await MELD_PDF.build(e, f, fullCatalog(), state.norms);
  const filename = pdfFileName(e);
  downloadBlob(blob, filename);

  const lines = (e.lines || []).filter(l => l.itemId);
  let total = 0, anyPrice = false;
  const lineTxt = lines.map((l, i) => {
    const p = parsePrice(l.prijs);
    let txt = `${i + 1}. ${orderLineName(l)}${l.articleNr ? ' — art.nr ' + l.articleNr : ''} — ${l.aantal} ${UNIT_NL[l.unit] || l.unit || ''}`.trim();
    if (l.norms && l.norms.length) txt += ` — norm: ${l.norms.join(', ')}`;
    if (p !== null) { anyPrice = true; total += p * Number(l.aantal); txt += ` — ${fmtEuro(p)} per eenheid (excl. btw)`; }
    return txt;
  }).join('\n');

  const body =
    `Beste,\n\n` +
    `Hierbij onze bestelling ${e.orderNumber}.\n\n` +
    `Ordernummer: ${e.orderNumber}\n` +
    `Besteldatum: ${fmtDate(e.meta.datum)}\n` +
    `Besteller: ${e.meta.naam_besteller || ''}\n` +
    (e.meta.naam_werknemer ? `Voor: ${e.meta.naam_werknemer}\n` : '') +
    (e.meta.doel ? `Doel / beoogd gebruik: ${e.meta.doel}\n` : '') +
    `\nTe bestellen:\n${lineTxt}\n` +
    (anyPrice ? `\nTotaal (excl. btw): ${fmtEuro(total)}\n` : '') +
    `\nDe volledige bestelbon (PDF) vindt u in bijlage. Gelieve de levering te bevestigen en bij de levering en factuur het ordernummer ${e.orderNumber} te vermelden.\n\n` +
    `Met vriendelijke groeten,\n${e.meta.naam_besteller || ''}\nScandinavian Oil Services — Blending & Logistics B.V.`;

  const subject = `Bestelling ${e.orderNumber} — Scandinavian Oil Services`;
  let mailto = `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (cc.length) mailto += `&cc=${cc.map(c => encodeURIComponent(c).replace(/%40/g, '@')).join(',')}`;

  e.sentAt = new Date().toISOString();
  e.sentTo = to;
  e.updatedAt = e.sentAt;
  await QHSE_DB.saveInspection(e);
  state.entries = await QHSE_DB.getAllInspections();

  window.location.href = mailto;
  toast('Mail geopend — voeg de gedownloade PDF toe als bijlage en verzend');
  if (state.view === 'view' && state.viewingId === id) renderViewEntry();
}

function truncateText(str, max) {
  str = str || '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * Bouwt een compacte, machineleesbare samenvatting van een melding/bestelling.
 * Dit JSON-blokje wordt mee in de e-mailtekst gestuurd (zie actie 'email-pdf'),
 * zodat een Power Automate-flow er automatisch een rij mee kan aanmaken in een
 * SharePoint-lijst — zonder dat de app zelf hoeft in te loggen op SharePoint.
 * Zie POWER_AUTOMATE_SETUP.md voor de volledige flow-configuratie + het schema.
 */
function buildStructuredPayload(entry, form, pdfFilename) {
  const base = {
    type: entry.kind,               // 'melding' | 'bestelling'
    formId: entry.formId,           // 'incident' | 'schade' | 'gedrag' | 'bestelling'
    formTitle: form.title,
    documentCode: form.docControl ? form.docControl.code : '',
    datum: entry.meta.datum || '',
    submittedAt: entry.updatedAt || entry.createdAt || '',
    pdfFilename: pdfFilename || ''
  };

  if (entry.kind === 'melding') {
    return {
      ...base,
      naamMelder: entry.meta.naam_melder || '',
      functieMelder: entry.meta.functie_melder || '',
      tijdstip: entry.meta.tijdstip || '',
      plaats: entry.meta.plaats || '',
      materieel: entry.meta.materieel || '',
      betrokkenen: (entry.betrokkenen || [])
        .map(b => `${b.naam || ''}${b.rol ? ' (' + b.rol + ')' : ''}`.trim())
        .filter(Boolean).join('; '),
      omschrijving: truncateText(entry.omschrijving, 500),
      aantalFotos: (entry.photos || []).length
    };
  }

  const catalog = fullCatalog();
  return {
    ...base,
    ordernummer: entry.orderNumber || '',
    leverancier: entry.supplierName || '',
    naamWerknemer: entry.meta.naam_werknemer || '',
    naamBesteller: entry.meta.naam_besteller || '',
    items: truncateText((entry.lines || []).map(l => {
      const item = catalog.find(c => c.id === l.itemId);
      const naam = l.itemId === 'manual' ? (l.customName || 'Manual item') : (item ? item.label : '-');
      return `${naam} x${l.aantal || '?'} ${l.unit || ''}`.trim();
    }).join('; '), 600),
    aantalItems: (entry.lines || []).length
  };
}

function pdfFileName(e) {
  if (e.kind === 'bestelling') return `Bestelbon_${e.orderNumber || 'BES'}_${(e.supplierName || '').replace(/[^A-Za-z0-9]+/g, '_')}_${e.meta.datum || ''}.pdf`.replace(/_+/g, '_').replace(/_\.pdf$/, '.pdf');
  const f = getForm(e.formId);
  const naam = e.kind === 'melding' ? (e.meta.naam_melder || 'melding') : (e.meta.naam_werknemer || 'bestelling');
  return `SOS_${f.title.replace(/\s+/g, '_')}_${naam.replace(/\s+/g, '_')}_${e.meta.datum || ''}.pdf`;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

init();
