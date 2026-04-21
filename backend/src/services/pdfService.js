const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../db/db');

const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'logo.png');
const GOLD    = '#F59E0B';
const BORDER  = '#9CA3AF';
const GRAY_BG = '#F3F4F6';
const BOLD_BG = '#F9FAFB';
const M  = 35;
const PW = 525.28; // A4 595.28 - 2*35

// ── Amount formatter ────────────────────────────────────────────────────────
// Uses U+00A0 (non-breaking space, in WinAnsi/Helvetica) so PDFKit does NOT
// split "1\u00A0500,00" into two words and corrupt the right-alignment.
function fmtAmt(cents) {
  if (cents === undefined || cents === null) return '\u2014';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, '0');
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return `${cents < 0 ? '-' : ''}${wholeStr},${dec}`;
}

function fmtDate(isoStr) {
  if (!isoStr) return '\u2014';
  const s = String(isoStr).slice(0, 10);
  const [y, mo, d] = s.split('-');
  return `${d}/${mo}/${y}`;
}

function getCompanySettings() {
  try {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'company_%'").all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch { return {}; }
}

// ── Drawing helpers ─────────────────────────────────────────────────────────
function hLine(doc, x1, x2, y, color = BORDER, lw = 0.5) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(lw).strokeColor(color).stroke().restore();
}

function vLine(doc, x, y1, y2, color = BORDER, lw = 0.5) {
  doc.save().moveTo(x, y1).lineTo(x, y2).lineWidth(lw).strokeColor(color).stroke().restore();
}

function drawRect(doc, x, y, w, h, fill, stroke, lw = 0.5) {
  doc.save().rect(x, y, w, h).lineWidth(lw);
  if (fill && stroke) doc.fillAndStroke(fill, stroke);
  else if (fill) doc.fill(fill);
  else if (stroke) doc.stroke(stroke);
  doc.restore();
}

function textCell(doc, text, x, y, w, h, opts = {}) {
  const {
    align   = 'left',
    bold    = false,
    size    = 9,
    color   = '#111111',
    pad     = 4,
    italic  = false,
  } = opts;
  let font = bold ? 'Helvetica-Bold' : 'Helvetica';
  if (italic && bold) font = 'Helvetica-BoldOblique';
  else if (italic) font = 'Helvetica-Oblique';
  doc.save().font(font).fontSize(size).fillColor(color);
  const str = String(text ?? '');
  const tx = align === 'right'
    ? x + w - pad - doc.widthOfString(str)   // manual right-position, no word-split
    : x + pad;
  doc.text(str, tx, y + (h - size) / 2, { lineBreak: false })
    .restore();
}

// ── Main PDF generator ───────────────────────────────────────────────────────
async function generateInvoicePdf(data, outputPath) {
  const { invoice, job, client, lines } = data;
  const company = getCompanySettings();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const PAGE_H = doc.page.height; // 841.89

    let y = M;

    // ─── 1. HEADER ──────────────────────────────────────────────────────────
    const LOGO_H = 65;
    const LOGO_W = 90;

    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, M, y, { height: LOGO_H });
      }
    } catch (_) {}

    // Company name right of logo
    const nameX = M + LOGO_W + 8;
    const nameW = PW - LOGO_W - 8;
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#0D0D0D');
    doc.text('BADR TRANSIT', nameX, y + 10, { width: nameW, align: 'right', lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(GOLD);
    doc.text('Transit, Transport, Logistique et Activit\u00e9s Connexes', nameX, y + 36, {
      width: nameW, align: 'right', lineBreak: false,
    });

    y += LOGO_H + 6;

    // Gold divider
    doc.save().moveTo(M, y).lineTo(M + PW, y).lineWidth(3).strokeColor(GOLD).stroke().restore();
    y += 10;

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
      ['FACTURE N\u00b0', String(invoice.facture_number ?? '')],
      ['DOSSIER N\u00b0', String(job.dossier_number ?? '')],
      ['\u00c9ch\u00e9ance le', fmtDate(invoice.due_date)],
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
    const firstDum = job.dums && job.dums.length > 0 ? job.dums[0].dum_number : '\u2014';
    const leftShip = [
      ['Dum N\u00b0',              firstDum],
      ['Destinataire',             job.expediteur_exportateur || '\u2014'],
      ['Nbre de TC',               job.nombre_colis_tc != null ? String(job.nombre_colis_tc) : '\u2014'],
      ['Poids Brut (Kgs)',         job.poids_brut_kg != null ? String(job.poids_brut_kg) : '\u2014'],
      ['Nature de marchandises',   job.nature_marchandise || '\u2014'],
    ];
    const rightShip = [
      ['Bureau',            job.bureau || '\u2014'],
      ['D\u00e9p\u00f4t de s\u00e9quence', fmtDate(job.depot_sequence_date)],
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
    const DES_W = Math.round(PW * 0.55); // ~55%
    const TAX_W = Math.round(PW * 0.22); // ~22%
    const NTX_W = PW - DES_W - TAX_W;    // ~23%
    const DES_X = M;
    const TAX_X = M + DES_W;
    const NTX_X = TAX_X + TAX_W;
    const HDR_H = 18;
    const ROW_H = 16;

    // Header row
    drawRect(doc, DES_X, y, PW, HDR_H, GRAY_BG, BORDER);
    vLine(doc, TAX_X, y, y + HDR_H);
    vLine(doc, NTX_X, y, y + HDR_H);
    textCell(doc, 'DESIGNATION', DES_X, y, DES_W, HDR_H, { bold: true, size: 8.5, color: '#333333', align: 'left' });
    textCell(doc, 'TAXABLE',     TAX_X, y, TAX_W, HDR_H, { bold: true, size: 8.5, color: '#333333', align: 'center' });
    textCell(doc, 'NON TAXABLE', NTX_X, y, NTX_W, HDR_H, { bold: true, size: 8.5, color: '#333333', align: 'center' });
    y += HDR_H;

    // Data rows — minimum 8 rows for visual weight
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

    // Column totals row (bottom of table, thin top border highlighted)
    drawRect(doc, DES_X, y, PW, ROW_H, GRAY_BG, BORDER, 0.5);
    vLine(doc, TAX_X, y, y + ROW_H, BORDER);
    vLine(doc, NTX_X, y, y + ROW_H, BORDER);
    // Sum taxable/non-taxable for display in columns
    const colTaxTotal  = lines.filter(l => l.is_taxable).reduce((s, l) => s + (l.amount_cents || 0), 0);
    const colNtxTotal  = lines.filter(l => !l.is_taxable).reduce((s, l) => s + (l.amount_cents || 0), 0);
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
      totalsTableRows.push({ lbl: 'TAXE R\u00c9GIONALE 4%', val: fmtAmt(invoice.taxe_regionale_cents), bold: false });
    totalsTableRows.push({ lbl: 'TOTAL TTC',    val: fmtAmt(invoice.total_ttc_cents),       bold: true });
    totalsTableRows.push({ lbl: 'AVANCE',        val: fmtAmt(invoice.avance_cents || 0),     bold: false });
    totalsTableRows.push({ lbl: 'RESTE \u00c0 PAYER', val: fmtAmt(invoice.reste_a_payer_cents), bold: true });

    const T_ROW_H = 16;
    const totalsH = totalsTableRows.length * T_ROW_H;

    // Left: amount-in-words box (~55% width)
    const WORDS_W = Math.round(PW * 0.54);
    const TTBL_W  = PW - WORDS_W - 6; // small gap
    const TTBL_X  = M + WORDS_W + 6;
    const T_LBL_W = Math.round(TTBL_W * 0.62);
    const T_VAL_W = TTBL_W - T_LBL_W;

    drawRect(doc, M, y, WORDS_W, totalsH, '#FAFAFA', BORDER, 0.6);
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#555555');
    doc.text('Arr\u00eat\u00e9e la pr\u00e9sente facture \u00e0 la somme de :', M + 6, y + 7, {
      width: WORDS_W - 12, lineBreak: true,
    });
    doc.font('Helvetica-BoldOblique').fontSize(8).fillColor('#111111');
    doc.text((invoice.amount_in_words || '').toUpperCase(), M + 6, doc.y + 4, {
      width: WORDS_W - 12, lineBreak: true,
    });

    // Right: totals table
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
    doc.text('Pi\u00e8ces jointes :', M, y, { lineBreak: false });
    // underline manually
    const pjLabelW = doc.widthOfString('Pi\u00e8ces jointes :');
    hLine(doc, M, M + pjLabelW, y + 10, '#333333', 0.5);
    y += 14;
    doc.font('Helvetica').fontSize(8).fillColor('#444444');
    const pieces = invoice.pieces_jointes
      || "COPIE DUM - COPIE FACTURE COMMERCIALE - FICHE D'IMPUTATION";
    doc.text(pieces, M, y, { width: PW * 0.65, lineBreak: true });

    // ─── 8. FOOTER (pinned to bottom) ───────────────────────────────────────
    const footerY = PAGE_H - M - 44;
    hLine(doc, M, M + PW, footerY, '#BBBBBB', 0.5);

    const footerLines = [
      `S.A.R.L AU capital social de ${company.company_capital || '100 000'} MAD ; RC : ${company.company_rc || '535369'} ; TP : ${company.company_tp || '34103305'} ;`,
      `ICE: ${company.company_ice || '003037848000043'} ; IF : ${company.company_if || '51810692'} ; CNSS : ${company.company_cnss || '202200000223235'}`,
      `Si\u00e8ge social : ${company.company_address || '164, AV Ambassadeur Ben Aicha, Etage 1, Apt 7, Roches noires Casablanca'}`,
      `T\u00e9l : ${company.company_phone || '05 22 24 42 25 / 05 22 40 65 10'} ; Email : ${company.company_email || 'badrtransit22@gmail.com'}`,
    ];
    let fy = footerY + 6;
    for (const line of footerLines) {
      doc.font('Helvetica').fontSize(7).fillColor('#888888');
      doc.text(line, M, fy, { width: PW, align: 'center', lineBreak: false });
      fy += 9;
    }

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

module.exports = { generateInvoicePdf };
