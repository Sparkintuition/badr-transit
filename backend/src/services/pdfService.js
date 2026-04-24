const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const {
  BORDER, M, PW,
  fmtAmt, fmtDate,
  getCompanySettings,
  hLine, vLine, drawRect, textCell,
  renderPdfHeader, renderPdfFooter,
} = require('./pdfShared');

const GRAY_BG = '#F3F4F6';
const BOLD_BG = '#F9FAFB';

// ── Main PDF generator ───────────────────────────────────────────────────────
async function generateInvoicePdf(data, outputPath) {
  const { invoice, job, client, lines } = data;
  const company = getCompanySettings();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const PAGE_H = doc.page.height; // 841.89

    // ─── 1. HEADER ──────────────────────────────────────────────────────────
    let y = renderPdfHeader(doc);

    // ─── 2. DATE ────────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(9).fillColor('#444444');
    doc.text(`Casablanca le : ${fmtDate(invoice.issue_date)}`, M, y, {
      width: PW, align: 'right', lineBreak: false,
    });
    y += 18;

    // ─── 3. IDENTIFICATION BLOCK ─────────────────────────────────────────────
    const ID_LABEL_W = 82;
    const ID_VAL_W   = 90;
    const ID_ROW_H   = 16;
    const infoRows = [
      ['FACTURE N°', String(invoice.facture_number ?? '')],
      ['DOSSIER N°', String(job.dossier_number ?? '')],
      ['Échéance le', fmtDate(invoice.due_date)],
    ];
    const idStartY = y;
    for (const [lbl, val] of infoRows) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#222222');
      doc.text(`${lbl}`, M, y + (ID_ROW_H - 9) / 2, { width: ID_LABEL_W, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor('#222222');
      doc.text(`: ${val}`, M + ID_LABEL_W, y + (ID_ROW_H - 9) / 2, { width: ID_VAL_W + 10, lineBreak: false });
      y += ID_ROW_H;
    }
    const idEndY = y;

    // Client box (right)
    const CBOX_X = M + 260;
    const CBOX_W = PW - 260;
    const CBOX_H = infoRows.length * ID_ROW_H + 4;
    drawRect(doc, CBOX_X, idStartY, CBOX_W, CBOX_H, '#FFFFFF', BORDER, 0.6);
    let cy = idStartY + 6;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111111');
    doc.text(client.name ?? '', CBOX_X + 6, cy, { width: CBOX_W - 12, lineBreak: false });
    cy += 14;
    if (client.address) {
      doc.font('Helvetica').fontSize(8).fillColor('#444444');
      doc.text(client.address, CBOX_X + 6, cy, { width: CBOX_W - 12, lineBreak: true });
      cy = doc.y + 2;
    }
    if (client.ice) {
      doc.font('Helvetica').fontSize(8).fillColor('#444444');
      doc.text(`ICE : ${client.ice}`, CBOX_X + 6, cy, { width: CBOX_W - 12, lineBreak: false });
    }

    y = Math.max(idEndY, idStartY + CBOX_H) + 10;

    // ─── 4. SHIPMENT INFO BOX ────────────────────────────────────────────────
    const firstDum = job.dums && job.dums.length > 0 ? job.dums[0].dum_number : '—';
    const leftShip = [
      ['Dum N°',              firstDum],
      ['Destinataire',             job.expediteur_exportateur || '—'],
      ['Nbre de TC',               job.nombre_colis_tc != null ? String(job.nombre_colis_tc) : '—'],
      ['Poids Brut (Kgs)',         job.poids_brut_kg != null ? String(job.poids_brut_kg) : '—'],
      ['Nature de marchandises',   job.nature_marchandise || '—'],
    ];
    const rightShip = [
      ['Bureau',            job.bureau || '—'],
      ['Dépôt de séquence', fmtDate(job.depot_sequence_date)],
    ];

    const SHIP_ROW_H = 14;
    const shipH = Math.max(leftShip.length, rightShip.length) * SHIP_ROW_H + 10;
    drawRect(doc, M, y, PW, shipH, '#FFFFFF', BORDER, 0.6);
    vLine(doc, M + PW / 2, y, y + shipH, BORDER);

    const halfShip = PW / 2;
    let lsy = y + 5;
    for (const [lbl, val] of leftShip) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333');
      doc.text(`${lbl} :`, M + 5, lsy, { width: 100, lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor('#111111');
      doc.text(val, M + 108, lsy, { width: halfShip - 115, lineBreak: false });
      lsy += SHIP_ROW_H;
    }
    let rsy = y + 5;
    for (const [lbl, val] of rightShip) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333');
      doc.text(`${lbl} :`, M + halfShip + 5, rsy, { width: 100, lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor('#111111');
      doc.text(val, M + halfShip + 108, rsy, { width: halfShip - 115, lineBreak: false });
      rsy += SHIP_ROW_H;
    }
    y += shipH + 10;

    // ─── 5. LINE ITEMS TABLE ─────────────────────────────────────────────────
    const DES_W = Math.round(PW * 0.55);
    const TAX_W = Math.round(PW * 0.22);
    const NTX_W = PW - DES_W - TAX_W;
    const DES_X = M;
    const TAX_X = M + DES_W;
    const NTX_X = TAX_X + TAX_W;
    const HDR_H = 18;
    const ROW_H = 16;

    drawRect(doc, DES_X, y, PW, HDR_H, GRAY_BG, BORDER);
    vLine(doc, TAX_X, y, y + HDR_H);
    vLine(doc, NTX_X, y, y + HDR_H);
    textCell(doc, 'DESIGNATION', DES_X, y, DES_W, HDR_H, { bold: true, size: 8.5, color: '#333333', align: 'left' });
    textCell(doc, 'TAXABLE',     TAX_X, y, TAX_W, HDR_H, { bold: true, size: 8.5, color: '#333333', align: 'center' });
    textCell(doc, 'NON TAXABLE', NTX_X, y, NTX_W, HDR_H, { bold: true, size: 8.5, color: '#333333', align: 'center' });
    y += HDR_H;

    const minRows = Math.max(lines.length, 8);
    for (let i = 0; i < minRows; i++) {
      drawRect(doc, DES_X, y, PW, ROW_H, '#FFFFFF', BORDER, 0.3);
      vLine(doc, TAX_X, y, y + ROW_H, BORDER, 0.3);
      vLine(doc, NTX_X, y, y + ROW_H, BORDER, 0.3);
      if (i < lines.length) {
        const ln = lines[i];
        textCell(doc, ln.designation ?? '', DES_X, y, DES_W, ROW_H, { size: 8.5, color: '#111111' });
        if (ln.is_taxable) {
          textCell(doc, fmtAmt(ln.amount_cents), TAX_X, y, TAX_W, ROW_H, { size: 8.5, align: 'right' });
        } else {
          textCell(doc, fmtAmt(ln.amount_cents), NTX_X, y, NTX_W, ROW_H, { size: 8.5, align: 'right' });
        }
      }
      y += ROW_H;
    }

    drawRect(doc, DES_X, y, PW, ROW_H, GRAY_BG, BORDER, 0.5);
    vLine(doc, TAX_X, y, y + ROW_H, BORDER);
    vLine(doc, NTX_X, y, y + ROW_H, BORDER);
    const colTaxTotal = lines.filter(l => l.is_taxable).reduce((s, l) => s + (l.amount_cents || 0), 0);
    const colNtxTotal = lines.filter(l => !l.is_taxable).reduce((s, l) => s + (l.amount_cents || 0), 0);
    if (colTaxTotal > 0) textCell(doc, fmtAmt(colTaxTotal), TAX_X, y, TAX_W, ROW_H, { bold: true, size: 8.5, align: 'right' });
    if (colNtxTotal > 0) textCell(doc, fmtAmt(colNtxTotal), NTX_X, y, NTX_W, ROW_H, { bold: true, size: 8.5, align: 'right' });
    y += ROW_H + 8;

    // ─── 6. TOTALS SECTION ───────────────────────────────────────────────────
    const totalsTableRows = [
      { lbl: 'Sous-total Taxable',     val: fmtAmt(invoice.subtotal_taxable_cents),     bold: false },
      { lbl: 'Sous-total Non Taxable', val: fmtAmt(invoice.subtotal_non_taxable_cents),  bold: false },
      { lbl: 'TOTAL HT',               val: fmtAmt(invoice.total_ht_cents),              bold: true  },
    ];
    if (invoice.tva_14_cents > 0)
      totalsTableRows.push({ lbl: 'TVA 14 %', val: fmtAmt(invoice.tva_14_cents), bold: false });
    if (invoice.tva_20_cents > 0)
      totalsTableRows.push({ lbl: 'TVA 20 %', val: fmtAmt(invoice.tva_20_cents), bold: false });
    if (invoice.taxe_regionale_applied)
      totalsTableRows.push({ lbl: 'TAXE RÉGIONALE 4%', val: fmtAmt(invoice.taxe_regionale_cents), bold: false });
    totalsTableRows.push({ lbl: 'TOTAL TTC',       val: fmtAmt(invoice.total_ttc_cents),       bold: true });
    totalsTableRows.push({ lbl: 'AVANCE',           val: fmtAmt(invoice.avance_cents || 0),     bold: false });
    totalsTableRows.push({ lbl: 'RESTE À PAYER',    val: fmtAmt(invoice.reste_a_payer_cents),   bold: true });

    const T_ROW_H = 16;
    const totalsH = totalsTableRows.length * T_ROW_H;

    const WORDS_W = Math.round(PW * 0.54);
    const TTBL_W  = PW - WORDS_W - 6;
    const TTBL_X  = M + WORDS_W + 6;
    const T_LBL_W = Math.round(TTBL_W * 0.62);
    const T_VAL_W = TTBL_W - T_LBL_W;

    drawRect(doc, M, y, WORDS_W, totalsH, '#FAFAFA', BORDER, 0.6);
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#555555');
    doc.text('Arrêtée la présente facture à la somme de :', M + 6, y + 7, {
      width: WORDS_W - 12, lineBreak: true,
    });
    doc.font('Helvetica-BoldOblique').fontSize(8).fillColor('#111111');
    doc.text((invoice.amount_in_words || '').toUpperCase(), M + 6, doc.y + 4, {
      width: WORDS_W - 12, lineBreak: true,
    });

    let ty = y;
    for (const row of totalsTableRows) {
      const bg = row.bold ? BOLD_BG : '#FFFFFF';
      drawRect(doc, TTBL_X, ty, TTBL_W, T_ROW_H, bg, BORDER, row.bold ? 0.7 : 0.4);
      vLine(doc, TTBL_X + T_LBL_W, ty, ty + T_ROW_H, BORDER, 0.4);
      textCell(doc, row.lbl, TTBL_X, ty, T_LBL_W, T_ROW_H, {
        bold: row.bold, size: 8, color: row.bold ? '#000000' : '#333333',
      });
      textCell(doc, row.val, TTBL_X + T_LBL_W, ty, T_VAL_W, T_ROW_H, {
        align: 'right', bold: row.bold, size: 8, color: row.bold ? '#000000' : '#333333',
      });
      ty += T_ROW_H;
    }

    y += totalsH + 12;

    // ─── 7. PIÈCES JOINTES ───────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#333333');
    doc.text('Pièces jointes :', M, y, { lineBreak: false });
    const pjLabelW = doc.widthOfString('Pièces jointes :');
    hLine(doc, M, M + pjLabelW, y + 10, '#333333', 0.5);
    y += 14;
    doc.font('Helvetica').fontSize(8).fillColor('#444444');
    const pieces = invoice.pieces_jointes
      || "COPIE DUM - COPIE FACTURE COMMERCIALE - FICHE D'IMPUTATION";
    doc.text(pieces, M, y, { width: PW * 0.65, lineBreak: true });

    // ─── 8. FOOTER ──────────────────────────────────────────────────────────
    renderPdfFooter(doc, company);

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

module.exports = { generateInvoicePdf };
