/**
 * QHSE_SYNC — eenvoudige online synchronisatie via OneDrive (Microsoft Graph).
 *
 * Idee: alle data (meldingen, bestellingen, extra artikelen, e-mailadressen
 * en de bijhorende foto's) wordt bij elke sync als 1 JSON-bestand
 * ("data.json") weggeschreven in een OneDrive-map. Elk toestel haalt dat
 * bestand op, voegt de eigen (nieuwere) gegevens toe, en schrijft het
 * resultaat terug. Zo blijven meerdere telefoons op elkaar afgestemd
 * zonder eigen server — enkel een Microsoft-login per toestel.
 *
 * Vereist eenmalige configuratie in Instellingen: Client ID, Tenant ID en
 * de naam van de OneDrive-map (zie README.md voor de Azure-registratie-
 * stappen). Werkt alleen als het toestel online is; de rest van de app
 * blijft 100% offline werken zoals voorheen.
 */
const QHSE_SYNC = (() => {
  const SCOPES = ['User.Read', 'Files.ReadWrite'];
  let msalInstance = null;
  let account = null;

  function isConfigured(cfg) {
    return !!(cfg && cfg.clientId && cfg.tenantId && cfg.folder);
  }

  function isLibLoaded() {
    return typeof msal !== 'undefined';
  }

  async function ensureMsal(cfg) {
    if (!isLibLoaded()) throw new Error('Microsoft-inlogbibliotheek kon niet geladen worden (ben je online?)');
    if (msalInstance && msalInstance.__clientId === cfg.clientId && msalInstance.__tenantId === cfg.tenantId) {
      return msalInstance;
    }
    msalInstance = new msal.PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
        redirectUri: window.location.origin + window.location.pathname
      },
      cache: { cacheLocation: 'localStorage' }
    });
    msalInstance.__clientId = cfg.clientId;
    msalInstance.__tenantId = cfg.tenantId;
    await msalInstance.initialize();

    // Vang eventuele redirect-terugkeer op (na inloggen bij Microsoft)
    const resp = await msalInstance.handleRedirectPromise().catch(() => null);
    if (resp && resp.account) account = resp.account;

    const existing = msalInstance.getAllAccounts();
    if (!account && existing.length) account = existing[0];
    return msalInstance;
  }

  async function login(cfg) {
    const msalApp = await ensureMsal(cfg);
    if (account) return account;
    // redirect-flow (betrouwbaarder dan popup in geïnstalleerde PWA's)
    await msalApp.loginRedirect({ scopes: SCOPES });
    return null; // pagina herlaadt na redirect
  }

  function logout() {
    if (msalInstance && account) {
      msalInstance.logoutRedirect({ account });
    }
    account = null;
  }

  function currentAccount(cfg) {
    return account;
  }

  async function getToken(cfg) {
    const msalApp = await ensureMsal(cfg);
    if (!account) throw new Error('Niet ingelogd bij Microsoft');
    try {
      const res = await msalApp.acquireTokenSilent({ scopes: SCOPES, account });
      return res.accessToken;
    } catch (e) {
      await msalApp.acquireTokenRedirect({ scopes: SCOPES, account });
      throw e; // pagina herlaadt
    }
  }

  async function graphFetch(cfg, path, options = {}) {
    const token = await getToken(cfg);
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });
    return res;
  }

  async function ensureFolder(cfg) {
    const safeName = cfg.folder.replace(/^\/+|\/+$/g, '');
    const check = await graphFetch(cfg, `/me/drive/root:/${encodeURIComponent(safeName)}`);
    if (check.ok) return;
    if (check.status !== 404) throw new Error('Kon OneDrive-map niet controleren (status ' + check.status + ')');
    const create = await graphFetch(cfg, '/me/drive/root/children', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: safeName, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
    });
    if (!create.ok) throw new Error('Kon OneDrive-map niet aanmaken (status ' + create.status + ')');
  }

  async function downloadData(cfg) {
    const safeName = cfg.folder.replace(/^\/+|\/+$/g, '');
    const res = await graphFetch(cfg, `/me/drive/root:/${encodeURIComponent(safeName)}/data.json:/content`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Kon data.json niet ophalen (status ' + res.status + ')');
    return res.json();
  }

  async function uploadData(cfg, data) {
    const safeName = cfg.folder.replace(/^\/+|\/+$/g, '');
    const res = await graphFetch(cfg, `/me/drive/root:/${encodeURIComponent(safeName)}/data.json:/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Kon data.json niet wegschrijven (status ' + res.status + ')');
  }

  /* -------------------------------------------------------------------
     Kern: alles ophalen, samenvoegen met lokale data, en terugschrijven.
  ------------------------------------------------------------------- */
  async function syncNow(cfg, onProgress) {
    const step = (msg) => { if (onProgress) onProgress(msg); };

    if (!isConfigured(cfg)) throw new Error('Synchronisatie is nog niet ingesteld');
    step('Verbinden met Microsoft…');
    await ensureMsal(cfg);
    if (!account) { await login(cfg); return; } // start redirect-login, syncNow stopt hier

    step('OneDrive-map controleren…');
    await ensureFolder(cfg);

    step('Gegevens ophalen…');
    const remote = (await downloadData(cfg)) || { entries: [], customCatalog: [], emailRecipients: [], photos: {} };

    const localEntries = await QHSE_DB.getAllInspections();
    const localCatalog = await QHSE_DB.getSetting('customCatalog', []);
    const localEmails = await QHSE_DB.getSetting('emailRecipients', []);
    const localSuppliers = await QHSE_DB.getSetting('supplierDirectory', []);
    const localNorms = await QHSE_DB.getSetting('norms', null);
    const localEdits = await QHSE_DB.getSetting('catalogEdits', {});

    step('Samenvoegen…');
    // --- entries: per id, nieuwste updatedAt wint ---
    const entryMap = new Map(localEntries.map(e => [e.id, e]));
    for (const re of (remote.entries || [])) {
      const le = entryMap.get(re.id);
      if (!le || (re.updatedAt || '') > (le.updatedAt || '')) entryMap.set(re.id, re);
    }
    const mergedEntries = [...entryMap.values()];

    // --- extra artikelen: unie per id ---
    const catalogMap = new Map(localCatalog.map(c => [c.id, c]));
    for (const rc of (remote.customCatalog || [])) {
      if (!catalogMap.has(rc.id)) catalogMap.set(rc.id, rc);
    }
    const mergedCatalog = [...catalogMap.values()];

    // --- e-mailadressen: unie, uniek ---
    const mergedEmails = [...new Set([...(localEmails || []), ...(remote.emailRecipients || [])])];

    // --- leveranciers (naam + e-mail): unie per naam ---
    const supplierMap = new Map((localSuppliers || []).map(x => [(x.name || '').toLowerCase(), x]));
    for (const rs of (remote.supplierDirectory || [])) {
      const k = (rs.name || '').toLowerCase();
      if (k && !supplierMap.has(k)) supplierMap.set(k, rs);
    }
    const mergedSuppliers = [...supplierMap.values()];

    // --- EN-normen: unie per code (lokaal wint) ; artikelaanpassingen: per artikel samenvoegen (lokaal wint) ---
    let mergedNorms = localNorms;
    if (Array.isArray(remote.norms)) {
      const nm = new Map((localNorms || []).map(n => [n.code, n]));
      for (const rn of remote.norms) if (rn && rn.code && !nm.has(rn.code)) nm.set(rn.code, rn);
      mergedNorms = localNorms ? [...nm.values()] : remote.norms;
    }
    const mergedEdits = { ...(remote.catalogEdits || {}) };
    for (const [id, ed] of Object.entries(localEdits || {})) mergedEdits[id] = { ...(mergedEdits[id] || {}), ...ed };

    // --- foto's die nodig zijn: verzamel alle photoId's uit de samengevoegde data ---
    const neededPhotoIds = new Set();
    mergedEntries.forEach(e => {
      (e.photos || []).forEach(id => neededPhotoIds.add(id));
      (e.lines || []).forEach(l => (l.photos || []).forEach(id => neededPhotoIds.add(id)));
    });
    mergedCatalog.forEach(c => { if (c.photoId) neededPhotoIds.add(c.photoId); });

    step('Foto\'s samenvoegen…');
    const remotePhotos = remote.photos || {};
    const outgoingPhotos = {};
    for (const pid of neededPhotoIds) {
      let dataUrl = await QHSE_DB.getPhoto(pid).catch(() => null);
      if (!dataUrl && remotePhotos[pid]) {
        dataUrl = remotePhotos[pid];
        await QHSE_DB.savePhoto(pid, dataUrl); // van ander toestel, lokaal opslaan
      }
      if (dataUrl) outgoingPhotos[pid] = dataUrl;
    }

    step('Lokaal opslaan…');
    for (const e of mergedEntries) await QHSE_DB.saveInspection(e);
    await QHSE_DB.setSetting('customCatalog', mergedCatalog);
    await QHSE_DB.setSetting('emailRecipients', mergedEmails);
    await QHSE_DB.setSetting('supplierDirectory', mergedSuppliers);
    if (mergedNorms) await QHSE_DB.setSetting('norms', mergedNorms);
    await QHSE_DB.setSetting('catalogEdits', mergedEdits);

    step('Terugschrijven naar OneDrive…');
    await uploadData(cfg, {
      entries: mergedEntries,
      customCatalog: mergedCatalog,
      emailRecipients: mergedEmails,
      supplierDirectory: mergedSuppliers,
      norms: mergedNorms || undefined,
      catalogEdits: mergedEdits,
      photos: outgoingPhotos,
      syncedAt: new Date().toISOString()
    });

    await QHSE_DB.setSetting('lastSync', new Date().toISOString());

    return { entries: mergedEntries, customCatalog: mergedCatalog, emailRecipients: mergedEmails, supplierDirectory: mergedSuppliers, norms: mergedNorms, catalogEdits: mergedEdits };
  }

  return { isConfigured, isLibLoaded, login, logout, currentAccount, syncNow, ensureMsal };
})();
