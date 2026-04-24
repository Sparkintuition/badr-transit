const fs   = require('fs');
const path = require('path');
const db   = require('../db/db');

const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'logo.png');
const GOLD    = '#F59E0B';
const BORDER  = '#9CA3AF';
const M  = 35;
const PW = 525.28; // A4 595.28 - 2*35

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtAmt(cents) {
  if (cents === undefined || cents === null) return '—';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, '0');
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${cents < 0 ? '-' : ''}${wholeStr},${dec}`;
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
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

// ── Drawing helpers ──────────────────────────────────────────────────────────

function hLine(doc, x1, x2, y, color = BORDER, lw = 0.5) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(lw).strokeColor(color).stroke().restore();
}

function vLine(doc, x, y1, y2, color = BORDER, lw = 0.5) {
  doc.save().moveTo(x, y1).lineTo(x, y2).lineWidth(lw).strokeColor(color).stroke().restore();
}

function drawRect(doc, x, y, w, h, fill, stroke, lw = 0.5) {
  doc.save().rect(x, y, w, h).lineWidth(lw);
  if (fill && stroke) doc.fillAndStroke(fill, stroke);
  else if (fill)      doc.fill(fill);
  else if (stroke)    doc.stroke(stroke);
  doc.restore();
}

function textCell(doc, text, x, y, w, h, opts = {}) {
  const {
    align  = 'left',
    bold   = false,
    size   = 9,
    color  = '#111111',
    pad    = 4,
    italic = false,
  } = opts;
  let font = bold ? 'Helvetica-Bold' : 'Helvetica';
  if (italic && bold) font = 'Helvetica-BoldOblique';
  else if (italic)    font = 'Helvetica-Oblique';
  doc.save().font(font).fontSize(size).fillColor(color);
  const str = String(text ?? '');
  const tx = align === 'right'
    ? x + w - pad - doc.widthOfString(str)
    : x + pad;
  doc.text(str, tx, y + (h - size) / 2, { lineBreak: false }).restore();
}

// ── Shared header renderer ───────────────────────────────────────────────────
// Returns the y position right after the gold divider line.

function renderPdfHeader(doc) {
  const LOGO_H = 65;
  const LOGO_W = 90;
  let y = M;

  try {
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, M, y, { height: LOGO_H });
    }
  } catch (_) {}

  const nameX = M + LOGO_W + 8;
  const nameW = PW - LOGO_W - 8;
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#0D0D0D');
  doc.text('BADR TRANSIT', nameX, y + 10, { width: nameW, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(GOLD);
  doc.text('Transit, Transport, Logistique et Activités Connexes', nameX, y + 36, {
    width: nameW, align: 'right', lineBreak: false,
  });

  y += LOGO_H + 6;
  doc.save().moveTo(M, y).lineTo(M + PW, y).lineWidth(3).strokeColor(GOLD).stroke().restore();
  y += 10;
  return y;
}

// ── Shared footer renderer ───────────────────────────────────────────────────

function renderPdfFooter(doc, company) {
  const PAGE_H = doc.page.height;
  const footerY = PAGE_H - M - 44;
  hLine(doc, M, M + PW, footerY, '#BBBBBB', 0.5);

  const footerLines = [
    `S.A.R.L AU capital social de ${company.company_capital || '100 000'} MAD ; RC : ${company.company_rc || '535369'} ; TP : ${company.company_tp || '34103305'} ;`,
    `ICE: ${company.company_ice || '003037848000043'} ; IF : ${company.company_if || '51810692'} ; CNSS : ${company.company_cnss || '202200000223235'}`,
    `Siège social : ${company.company_address || '164, AV Ambassadeur Ben Aicha, Etage 1, Apt 7, Roches noires Casablanca'}`,
    `Tél : ${company.company_phone || '05 22 24 42 25 / 05 22 40 65 10'} ; Email : ${company.company_email || 'badrtransit22@gmail.com'}`,
  ];
  let fy = footerY + 6;
  for (const line of footerLines) {
    doc.font('Helvetica').fontSize(7).fillColor('#888888');
    doc.text(line, M, fy, { width: PW, align: 'center', lineBreak: false });
    fy += 9;
  }
}

module.exports = {
  GOLD, BORDER, M, PW,
  fmtAmt, fmtDate,
  getCompanySettings,
  hLine, vLine, drawRect, textCell,
  renderPdfHeader, renderPdfFooter,
};
