/* =====================================================================
   MELD_PDF — genereert een professioneel PDF-rapport met jsPDF.
   Vereist: jspdf + jspdf-autotable (CDN) en js/logo.js.
   ===================================================================== */
const MELD_PDF = (() => {

  const MARGIN = 40;
  const MM = 2.83465;
  const PHOTO_H = 60 * MM;
  const PHOTO_GAP = 8;
  const PHOTOS_PER_ROW = 3;

  const LABELS = {
    nl: { naam: 'Naam', rev: 'Rev.', versie: 'Versie', beheerder: 'Beheerder', gegevens: 'Gegevens', gegenereerd: 'gegenereerd op' },
    en: { naam: 'Name', rev: 'Rev.', versie: 'Version', beheerder: 'Manager', gegevens: 'Details', gegenereerd: 'generated on' }
  };
  function L(form) { return LABELS[form.lang || 'nl']; }

  async function build(entry, form, catalog, norms) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - MARGIN * 2;

    // Bestelbon: Nederlandstalige documentopmaak (Arial/Helvetica 12 pt, rode titels en kolomkoppen)
    if (entry.kind === 'bestelling') {
      form = { ...form, lang: 'nl', docControl: { ...form.docControl, docTitle: 'Bestelbon' } };
    }

    let y = drawFirstPageHeader(doc, form, pageWidth);
    if (entry.kind === 'melding') {
      y = await drawMetaBox(doc, form, entry, contentWidth, y);
      y = await drawMeldingBody(doc, entry, form, contentWidth, y);
    } else {
      y = await drawBestelbon(doc, entry, form, contentWidth, y, catalog, norms);
    }

    const pageCount = doc.internal.getNumberOfPages();
    const l = L(form);
    const locale = form.lang === 'en' ? 'en-GB' : 'nl-BE';
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120);
      doc.text(`${form.docControl.code} · ${l.gegenereerd} ${new Date().toLocaleString(locale)} · ${form.lang === 'en' ? 'page' : 'pagina'} ${i}/${pageCount}`, MARGIN, doc.internal.pageSize.getHeight() - 20);
      doc.setTextColor(0);
    }
    return doc.output('blob');
  }

  /* --------------------------- MELDING --------------------------- */
  async function drawMeldingBody(doc, entry, form, contentWidth, y) {
    if (entry.betrokkenen && entry.betrokkenen.length) {
      y = ensureSpace(doc, y, 26, form);
      y = sectionHeader(doc, 'Betrokkenen', contentWidth, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      for (const b of entry.betrokkenen) {
        y = ensureSpace(doc, y, 12, form);
        doc.text(`• ${b.naam || '-'}${b.rol ? '  —  ' + b.rol : ''}`, MARGIN + 4, y);
        y += 13;
      }
      y += 6;
    }

    y = ensureSpace(doc, y, 26, form);
    y = sectionHeader(doc, 'Omschrijving', contentWidth, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0);
    const lines = doc.splitTextToSize(entry.omschrijving || '-', contentWidth);
    for (const line of lines) {
      y = ensureSpace(doc, y, 12, form);
      doc.text(line, MARGIN, y);
      y += 12;
    }
    y += 10;

    if (form.extraQuestions && form.extraQuestions.length) {
      y = ensureSpace(doc, y, 26, form);
      y = sectionHeader(doc, 'Bijkomende vragen', contentWidth, y);
      for (const q of form.extraQuestions) {
        const a = entry.answers[q.id] || {};
        y = await drawQuestionBlock(doc, q, a, contentWidth, y, form);
      }
    }

    if (entry.photos && entry.photos.length) {
      y = ensureSpace(doc, y, 26, form);
      y = sectionHeader(doc, "Foto's", contentWidth, y);
      y = await drawPhotoGrid(doc, entry.photos, contentWidth, y, form);
      y += 8;
    }

    if (entry.signature) {
      y = ensureSpace(doc, y, 110, form);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(0);
      doc.text('Handtekening melder', MARGIN, y);
      y += 8;
      try { doc.addImage(entry.signature, 'PNG', MARGIN, y, 180, 65); } catch (e) {}
      y += 75;
    }
    return y;
  }

  /* -------------------------- BESTELBON (opmaak volgens voorbeeld) -------------------------- */
  const RED = [230, 0, 0];
  const BODY_PT = 12;          // Arial 12 pt (jsPDF-equivalent: Helvetica)
  const LINE_H = 16;
  const UNIT_NL = { Piece: 'stuk', Box: 'doos' };

  function euro(n) { return '€ ' + Number(n).toFixed(2).replace('.', ','); }
  function price(v) { const n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? null : n; }
  function dateNl(iso) { const q = String(iso || '').split('-'); return q.length === 3 ? `${q[2]}/${q[1]}/${q[0]}` : (iso || ''); }

  function redTitle(doc, text, y, form) {
    y = ensureSpace(doc, y, 40, form);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(BODY_PT); doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.text(text, MARGIN, y);
    doc.setTextColor(0);
    return y + LINE_H + 2;
  }

  async function drawBestelbon(doc, entry, form, contentWidth, y, catalog, norms) {
    const cat = catalog || (typeof ORDER_CATALOG !== 'undefined' ? ORDER_CATALOG : []);

    // ---- Titel
    y = redTitle(doc, `BESTELBON ${entry.orderNumber || ''}`.trim(), y, form);

    // ---- 1. Gegevens
    y = redTitle(doc, '1. GEGEVENS BESTELLING', y + 4, form);
    const info = [
      ['Ordernummer', entry.orderNumber || '-'],
      ['Besteldatum', dateNl(entry.meta.datum) || '-'],
      ['Leverancier', entry.supplierName || '-'],
      ['Besteller', entry.meta.naam_besteller || '-'],
      ['Voor werknemer', entry.meta.naam_werknemer || '-']
    ];
    doc.setFontSize(BODY_PT);
    for (const [label, val] of info) {
      y = ensureSpace(doc, y, LINE_H, form);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      const lt = label + ':  ';
      doc.text(lt, MARGIN, y);
      const lw = doc.getTextWidth(lt);
      doc.setFont('helvetica', 'normal');
      const vl = doc.splitTextToSize(String(val), contentWidth - lw);
      doc.text(vl, MARGIN + lw, y);
      y += vl.length * LINE_H;
    }
    y += 10;

    // ---- 2. Te bestellen levering en prestaties
    y = redTitle(doc, '2. TE BESTELLEN LEVERING EN PRESTATIES', y, form);
    if (entry.meta.doel) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(BODY_PT); doc.setTextColor(0);
      const intro = doc.splitTextToSize('Doel / beoogd gebruik: ' + entry.meta.doel, contentWidth);
      for (const line of intro) { y = ensureSpace(doc, y, LINE_H, form); doc.text(line, MARGIN, y); y += LINE_H; }
      y += 6;
    }

    const lines = (entry.lines || []).filter(l => l.itemId);
    let total = 0, anyPrice = false;
    const usedNorms = [];
    const rows = lines.map((l, i) => {
      const item = cat.find(c => c.id === l.itemId);
      let naam;
      if (l.itemId === 'manual') naam = l.customName || 'Ander materiaal';
      else if (item) {
        const nl = item.labelNl || item.label;
        naam = nl + (item.label && item.label !== nl ? ' / ' + item.label : '');
      } else naam = '-';
      const det = [];
      if (l.maat) det.push('maat ' + l.maat);
      if (l.type) det.push('type ' + l.type);
      if (l.merk) det.push('merk ' + l.merk);
      const codes = Array.isArray(l.norms) ? l.norms : ((item && item.normCodes) || []);
      codes.forEach(c => { if (!usedNorms.includes(c)) usedNorms.push(c); });
      const omschr = naam + (det.length ? ' (' + det.join(', ') + ')' : '') + (codes.length ? '\nNorm: ' + codes.join(', ') : '');
      const qty = Number(l.aantal) || 0;
      const unit = UNIT_NL[l.unit] || l.unit || '';
      const pr = price(l.prijs);
      let eenh = '', tot = '';
      if (pr !== null) { anyPrice = true; eenh = euro(pr); tot = euro(pr * qty); total += pr * qty; }
      return [String(i + 1), l.articleNr || '', omschr, `${qty || ''}${unit ? ' ' + unit : ''}`.trim(), eenh, tot];
    });

    const startPageNum = doc.internal.getNumberOfPages();
    doc.autoTable({
      head: [['Nr.', 'Artikelnr.', 'Omschrijving', 'Aantal', 'Eenheidsprijs (excl. btw)', 'Totaal (excl. btw)']],
      body: rows.length ? rows : [['', '', '', '', '', '']],
      foot: anyPrice ? [[{ content: 'Totaal (excl. btw)', colSpan: 5, styles: { halign: 'right' } }, euro(total)]] : undefined,
      showFoot: 'lastPage',
      startY: y,
      margin: { left: MARGIN, right: MARGIN, top: 70 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: BODY_PT, cellPadding: 5, textColor: 0, lineColor: 0, lineWidth: 0.5, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [242, 242, 242] },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        1: { cellWidth: 62 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 52 },
        4: { cellWidth: 96 },
        5: { cellWidth: 84 }
      },
      didDrawPage: () => { if (doc.internal.getNumberOfPages() > startPageNum) drawRunningHeader(doc, form); }
    });
    y = doc.lastAutoTable.finalY + 22;

    // ---- 3. Toegepaste EN-normen (met korte uitleg)
    if (usedNorms.length) {
      y = redTitle(doc, '3. TOEGEPASTE EN-NORMEN', y, form);
      doc.setFontSize(BODY_PT);
      for (const code of usedNorms) {
        const n = (norms || []).find(x => x.code === code);
        const lt = code + ':  ';
        doc.setFont('helvetica', 'bold');
        const lw = doc.getTextWidth(lt);
        const txt = doc.splitTextToSize(n ? (n.nl || n.en || '') : '', contentWidth - lw);
        y = ensureSpace(doc, y, LINE_H * Math.max(1, txt.length), form);
        doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.text(lt, MARGIN, y);
        doc.setFont('helvetica', 'normal'); doc.text(txt.length ? txt : [''], MARGIN + lw, y);
        y += LINE_H * Math.max(1, txt.length) + 2;
      }
      y += 10;
    }

    // ---- 4. Foto's per artikel
    const withPhotos = lines.filter(l => l.photos && l.photos.length);
    if (withPhotos.length) {
      y = redTitle(doc, "4. FOTO'S PER ARTIKEL", y, form);
      for (const l of withPhotos) {
        const item = cat.find(c => c.id === l.itemId);
        const naam = l.itemId === 'manual' ? (l.customName || 'Ander materiaal') : (item ? (item.labelNl || item.label) : '-');
        y = ensureSpace(doc, y, LINE_H, form);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(BODY_PT); doc.setTextColor(0);
        doc.text(naam, MARGIN, y);
        y += 14;
        y = await drawPhotoGrid(doc, l.photos, contentWidth, y, form);
        y += 8;
      }
    }
    return y;
  }

  /* -------------------------- BESTELLING (oude layout, niet meer gebruikt) -------------------------- */
  async function drawBestellingBody(doc, entry, form, contentWidth, y, catalog) {
    const cat = catalog || (typeof ORDER_CATALOG !== 'undefined' ? ORDER_CATALOG : []);
    y = ensureSpace(doc, y, 40, form);
    const lines = entry.lines || [];
    const rows = lines.map(l => {
      const item = cat.find(c => c.id === l.itemId);
      const naam = l.itemId === 'manual' ? (l.customName || 'Manual item') : (item ? item.label : '-');
      const details = [];
      if (l.maat) details.push('size ' + l.maat);
      if (l.type) details.push('type ' + l.type);
      if (l.merk) details.push('brand ' + l.merk);
      return [naam, details.join(', ') || '-', String(l.aantal || '-'), l.unit || '-'];
    });
    y = autoTableSection(doc, 'Ordered items', ['Item', 'Details', 'Quantity', 'Unit'], rows, y, form);

    const linesWithPhotos = lines.filter(l => l.photos && l.photos.length);
    if (linesWithPhotos.length) {
      y = ensureSpace(doc, y, 26, form);
      y = sectionHeader(doc, 'Photos per item', contentWidth, y);
      for (const l of linesWithPhotos) {
        const item = cat.find(c => c.id === l.itemId);
        const naam = l.itemId === 'manual' ? (l.customName || 'Manual item') : (item ? item.label : '-');
        y = ensureSpace(doc, y, 16, form);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
        doc.text(naam, MARGIN, y);
        y += 12;
        y = await drawPhotoGrid(doc, l.photos, contentWidth, y, form);
        y += 8;
      }
    }
    return y;
  }

  /* --------------------------- Bouwblokken --------------------------- */
  function sectionHeader(doc, title, contentWidth, y) {
    doc.setFillColor(240, 241, 240);
    doc.rect(MARGIN, y - 10, contentWidth, 16, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 30, 30);
    doc.text(title, MARGIN + 4, y + 2);
    doc.setTextColor(0);
    return y + 20;
  }

  async function drawPhotoGrid(doc, photoIds, contentWidth, y, form) {
    const photoW = (contentWidth - (PHOTOS_PER_ROW - 1) * PHOTO_GAP) / PHOTOS_PER_ROW;
    y = ensureSpace(doc, y, PHOTO_H + 10, form);
    let x = MARGIN, count = 0;
    for (const pid of photoIds) {
      const dataUrl = await QHSE_DB.getPhoto(pid);
      if (dataUrl) {
        if (count > 0 && count % PHOTOS_PER_ROW === 0) { x = MARGIN; y += PHOTO_H + PHOTO_GAP; y = ensureSpace(doc, y, PHOTO_H + 10, form); }
        try { doc.addImage(dataUrl, 'JPEG', x, y, photoW, PHOTO_H); } catch (e) {}
        x += photoW + PHOTO_GAP;
        count++;
      }
    }
    return y + PHOTO_H + 4;
  }

  async function drawQuestionBlock(doc, q, a, contentWidth, y, form) {
    y = ensureSpace(doc, y, 40, form);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0);
    const lines = doc.splitTextToSize(q.text, contentWidth);
    doc.text(lines, MARGIN, y);
    y += lines.length * 11;

    y = ensureSpace(doc, y, 14, form);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    const c = a.status === 'NOK' ? [198, 40, 40] : a.status === 'OK' ? [46, 125, 70] : [130, 130, 130];
    doc.setTextColor(c[0], c[1], c[2]);
    doc.text(`Status: ${a.status || '—'}`, MARGIN, y);
    doc.setTextColor(0);
    y += 12;

    if (a.checks && a.checks.length) {
      const cLines = doc.splitTextToSize(`Aangeduid: ${a.checks.join(', ')}`, contentWidth);
      y = ensureSpace(doc, y, cLines.length * 10, form);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.text(cLines, MARGIN, y);
      y += cLines.length * 10 + 2;
    }
    if (a.note) {
      const nLines = doc.splitTextToSize(`Opmerking: ${a.note}`, contentWidth);
      y = ensureSpace(doc, y, nLines.length * 10, form);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70);
      doc.text(nLines, MARGIN, y);
      doc.setTextColor(0);
      y += nLines.length * 10 + 3;
    }
    if (a.photos && a.photos.length) y = await drawPhotoGrid(doc, a.photos, contentWidth, y, form);

    y = ensureSpace(doc, y, 10, form);
    doc.setDrawColor(228); doc.line(MARGIN, y, MARGIN + contentWidth, y); doc.setDrawColor(0);
    y += 12;
    return y;
  }

  function autoTableSection(doc, title, headers, rows, startY, form) {
    const startPageNum = doc.internal.getNumberOfPages();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(0);
    doc.text(title, MARGIN, startY);
    doc.autoTable({
      head: [headers],
      body: rows.length ? rows : [headers.map(() => '-')],
      startY: startY + 8,
      margin: { left: MARGIN, right: MARGIN, top: 70 },
      styles: { fontSize: 8.5, cellPadding: 5, overflow: 'linebreak' },
      headStyles: { fillColor: [50, 50, 50] },
      didDrawPage: () => { if (doc.internal.getNumberOfPages() > startPageNum) drawRunningHeader(doc, form); }
    });
    return doc.lastAutoTable.finalY + 20;
  }

  /* -------------------------- Gegevens-kader -------------------------- */
  async function drawMetaBox(doc, form, entry, contentWidth, y) {
    const labelSize = 10.5, lineHeight = 17, padding = 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(0);
    y = ensureSpace(doc, y, 20, form);
    doc.text(L(form).gegevens, MARGIN, y);
    y += 8;

    doc.setFontSize(labelSize);
    const rows = form.meta.map(f => {
      const val = entry.meta[f.id] || '-';
      const labelText = f.label + ':  ';
      doc.setFont('helvetica', 'bold');
      const labelW = doc.getTextWidth(labelText);
      doc.setFont('helvetica', 'normal');
      const valueLines = doc.splitTextToSize(String(val), contentWidth - padding * 2 - labelW);
      return { labelText, labelW, valueLines };
    });
    const totalLines = rows.reduce((sum, r) => sum + r.valueLines.length, 0);
    const boxHeight = totalLines * lineHeight + padding * 2;

    y = ensureSpace(doc, y, boxHeight + 10, form);
    const boxTop = y;
    doc.setDrawColor(170); doc.setLineWidth(0.75);
    doc.rect(MARGIN, boxTop, contentWidth, boxHeight);

    let ly = boxTop + padding + labelSize - 1;
    doc.setFontSize(labelSize);
    for (const r of rows) {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
      doc.text(r.labelText, MARGIN + padding, ly);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 70, 200);
      doc.text(r.valueLines, MARGIN + padding + r.labelW, ly);
      ly += r.valueLines.length * lineHeight;
    }
    doc.setTextColor(0); doc.setDrawColor(0);
    return boxTop + boxHeight + 22;
  }

  /* -------------------------- Paginabeheer -------------------------- */
  function ensureSpace(doc, y, needed, form) {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + needed > pageHeight - 40) { doc.addPage(); return drawRunningHeader(doc, form); }
    return y;
  }

  // Firmagegevens — rechts uitgelijnd bovenaan op de eerste pagina (hier aanpasbaar)
  const COMPANY = {
    naam: 'Scandinavian Oil Services',
    lines: ['E-mail: h.abdelkerim@scanoil.com', 'Mobile: +32472847410', 'Adres: Noorderlaan 189 | 2030 Antwerpen']
  };

  function drawCompanyBlock(doc, pageWidth, y) {
    const xr = pageWidth - MARGIN;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text(COMPANY.naam, xr, y, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    COMPANY.lines.forEach((l, i) => doc.text(l, xr, y + 13 * (i + 1), { align: 'right' }));
    return y + 13 * (COMPANY.lines.length + 1);
  }

  function drawFirstPageHeader(doc, form, pageWidth) {
    const top = drawCompanyBlock(doc, pageWidth, 36) + 2, boxH = 78, colAw = 150, colCw = 130;
    const colBw = (pageWidth - MARGIN * 2) - colAw - colCw;
    const xA = MARGIN, xB = MARGIN + colAw, xC = MARGIN + colAw + colBw;
    const dc = form.docControl || {};

    doc.setDrawColor(180); doc.setLineWidth(0.75);
    doc.rect(MARGIN, top, pageWidth - MARGIN * 2, boxH);
    doc.line(xB, top, xB, top + boxH);
    doc.line(xC, top, xC, top + boxH);
    doc.line(xA + 50, top, xA + 50, top + boxH);

    const rows = [[L(form).naam, dc.naam], [L(form).rev, dc.rev], [L(form).versie, dc.versie], [L(form).beheerder, dc.beheerder]];
    const rowH = boxH / rows.length;
    rows.forEach((r, i) => {
      const ry = top + i * rowH;
      if (i > 0) doc.line(xA, ry, xB, ry);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(0);
      doc.text(String(r[0]), xA + 4, ry + rowH / 2 + 3);
      doc.setFont('helvetica', 'normal');
      doc.text(String(r[1] || '-'), xA + 54, ry + rowH / 2 + 3);
    });

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(String(dc.code || ''), xB + colBw / 2, top + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const titleLines = doc.splitTextToSize(String(dc.docTitle || form.title), colBw - 16);
    doc.text(titleLines, xB + colBw / 2, top + 46, { align: 'center' });

    const logoW = colCw - 16;
    const logoH = logoW / (typeof QHSE_LOGO_ASPECT !== 'undefined' ? QHSE_LOGO_ASPECT : 2.5);
    const logoY = top + (boxH - logoH) / 2;
    if (typeof QHSE_LOGO !== 'undefined') { try { doc.addImage(QHSE_LOGO, 'PNG', xC + 8, logoY, logoW, logoH); } catch (e) {} }

    doc.setDrawColor(0); doc.setTextColor(0);
    return top + boxH + 24;
  }

  function drawRunningHeader(doc, form) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const dc = form.docControl || {};
    const logoW = 62;
    const logoH = logoW / (typeof QHSE_LOGO_ASPECT !== 'undefined' ? QHSE_LOGO_ASPECT : 2.5);
    if (typeof QHSE_LOGO !== 'undefined') { try { doc.addImage(QHSE_LOGO, 'PNG', MARGIN, 18, logoW, logoH); } catch (e) {} }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
    doc.text(`${dc.code || ''} — ${dc.docTitle || form.title}`, pageWidth - MARGIN, 18 + logoH / 2 + 3, { align: 'right' });
    doc.setDrawColor(210);
    doc.line(MARGIN, 18 + logoH + 8, pageWidth - MARGIN, 18 + logoH + 8);
    doc.setDrawColor(0);
    return 18 + logoH + 26;
  }

  return { build };
})();
