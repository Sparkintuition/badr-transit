const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs   = require('fs');
const path = require('path');
const db   = require('../db/db');
const {
  GOLD, BORDER, M, PW,
  fmtDate,
  getCompanySettings,
  hLine, vLine, drawRect, textCell,
  renderPdfHeader, renderPdfFooter,
} = require('./pdfShared');

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  open:      'OUVERT',
  released:  'LIVRÉ',
  invoiced:  'FACTURÉ',
  paid:      'PAYÉ',
  archived:  'ARCHIVÉ',
  cancelled: 'ANNULÉ',
};

const STATUS_RGB = {
  open:      [37,  99,  235],  // blue-600
  released:  [22,  163, 74],   // green-600
  invoiced:  [217, 119, 6],    // amber-600
  paid:      [5,   150, 105],  // emerald-600
  archived:  [113, 113, 122],  // zinc-500
  cancelled: [220, 38,  38],   // red-600
};

// ── Milestone rows definition per job type ───────────────────────────────────
// type: 'milestone' uses job.milestones array; 'field' uses a direct job field value.

const MILESTONE_ROWS = {
  import: [
    { type: 'milestone', code: 'echange_bad',      label: 'Échange' },
    { type: 'field',     field: 'compagnie_transport', label: 'Compagnie de transport' },
    { type: 'milestone', code: 'remise_documents', label: 'Remise des documents', notesField: 'remise_documents_notes' },
    { type: 'milestone', code: 'mca',              label: 'MCA' },
    { type: 'milestone', code: 'main_levee',       label: 'Main levée' },
    { type: 'milestone', code: 'sortie',           label: 'Sortie' },
  ],
  export: [
    { type: 'milestone', code: 'main_levee_delivree', label: 'Main levée délivrée' },
    { type: 'milestone', code: 'sequence_deposee',    label: 'Séquence déposée' },
    { type: 'milestone', code: 'documents_vises',     label: 'Documents visés' },
    { type: 'milestone', code: 'dossier_valide',      label: 'Dossier validé' },
    { type: 'milestone', code: 'email_sortie',        label: 'Email de sortie' },
    { type: 'milestone', code: 'dossier_signe',       label: 'Dossier signé par' },
  ],
};

// ── Data fetch ───────────────────────────────────────────────────────────────

function fetchJobData(jobId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return null;

  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(job.client_id);

  const commisUser = job.commis_user_id
    ? db.prepare('SELECT id, name FROM users WHERE id = ?').get(job.commis_user_id)
    : null;

  const dums = db.prepare(
    'SELECT * FROM job_dums WHERE job_id = ? ORDER BY display_order, id'
  ).all(jobId);

  const milestones = db.prepare(`
    SELECT m.*, u.name AS completed_by_user_name
    FROM job_milestones m
    LEFT JOIN users u ON m.completed_by_user_id = u.id
    WHERE m.job_id = ? ORDER BY m.display_order
  `).all(jobId);

  const invoice = db.prepare(
    'SELECT id, facture_number FROM invoices WHERE job_id = ? AND status != ? ORDER BY id DESC LIMIT 1',
  ).get(jobId, 'cancelled');

  return { job, client, commisUser, dums, milestones, invoice: invoice || null };
}

// ── Milestone status text renderer ───────────────────────────────────────────

function milestoneRightText(ms, notesField, job) {
  if (!ms) return '';
  if (ms.status === 'completed') {
    let txt = fmtDate(ms.completed_at);
    if (ms.completed_by_user_name) txt += ` — ${ms.completed_by_user_name}`;
    if (notesField && job[notesField]) txt += `  ${job[notesField]}`;
    return txt;
  }
  if (ms.status === 'in_progress') return 'En cours';
  if (ms.status === 'skipped') return ms.notes ? `Ignoré — ${ms.notes}` : 'Ignoré';
  return '';
}

// ── Output path ──────────────────────────────────────────────────────────────

function buildOutputPath(jobId) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const ts   = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const dir  = path.join(__dirname, '..', '..', 'data', 'job_sheets', String(yyyy), mm);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `job_${jobId}_${ts}.pdf`);
}

// ── Main export ──────────────────────────────────────────────────────────────

async function generateJobSheetPdf(jobId) {
  const data = fetchJobData(jobId);
  if (!data) throw new Error(`Job ${jobId} not found`);

  const { job, client, commisUser, dums, milestones, invoice } = data;
  const company = getCompanySettings();

  const appUrlBase = (db.prepare("SELECT value FROM settings WHERE key = 'app_url_base'").get()?.value || 'http://localhost:3000').replace(/\/$/, '');
  const qrUrl = `${appUrlBase}/app/dossiers/${jobId}`;
  const qrBuffer = await QRCode.toBuffer(qrUrl, { type: 'png', width: 180, margin: 1 });

  const outputPath = buildOutputPath(jobId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const PAGE_W = doc.page.width;  // 595.28
    const PAGE_H = doc.page.height; // 841.89
    const FOOTER_Y = PAGE_H - M - 44;
    const QR_SIZE  = 60;
    const QR_X     = M + PW - QR_SIZE;
    const QR_Y     = FOOTER_Y - QR_SIZE - 6;

    // ─── 1. HEADER ──────────────────────────────────────────────────────────
    let y = renderPdfHeader(doc);

    // ─── 2. STATUS BADGE (top-right, overlapping the area just below header) ─
    const statusLabel = STATUS_LABEL[job.status] || job.status.toUpperCase();
    const statusRgb   = STATUS_RGB[job.status] || [100, 100, 100];
    const BADGE_W = 80;
    const BADGE_H = 20;
    const BADGE_X = M + PW - BADGE_W;
    const BADGE_Y = y + 2;
    doc.save()
      .rect(BADGE_X, BADGE_Y, BADGE_W, BADGE_H)
      .fillColor(`rgb(${statusRgb.join(',')})`)
      .fill()
      .restore();
    doc.save()
      .font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
    const slW = doc.widthOfString(statusLabel);
    doc.text(statusLabel, BADGE_X + (BADGE_W - slW) / 2, BADGE_Y + (BADGE_H - 8.5) / 2, { lineBreak: false })
      .restore();

    // ─── 3. TYPE LABEL + COMMIS ─────────────────────────────────────────────
    const typeLabel = job.type === 'export' ? 'EXPORT' : 'IMPORT';
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1E3A8A');
    doc.text(typeLabel, M, y + 4, { lineBreak: false });
    y += 22;

    if (commisUser) {
      doc.font('Helvetica').fontSize(8).fillColor('#555555');
      doc.text(`COMMIS : ${commisUser.name}`, M, y, { lineBreak: false });
    }
    y += 16;

    // ─── 4. IDENTIFICATION ROW ──────────────────────────────────────────────
    // 4 columns: DOSSIER N° | FACTURE N° | INSPECTEUR | REÇU LE
    const ID_H   = 22;
    const COL4_W = PW / 4;
    drawRect(doc, M, y, PW, ID_H, '#F8F8F8', BORDER, 0.5);
    vLine(doc, M + COL4_W,     y, y + ID_H, BORDER, 0.4);
    vLine(doc, M + COL4_W * 2, y, y + ID_H, BORDER, 0.4);
    vLine(doc, M + COL4_W * 3, y, y + ID_H, BORDER, 0.4);

    const idCols = [
      { label: 'DOSSIER N°',  value: job.dossier_number || '' },
      { label: 'FACTURE N°',  value: invoice ? invoice.facture_number : '' },
      { label: 'INSPECTEUR',  value: job.inspecteur || '' },
      { label: 'REÇU LE',     value: job.recu_le ? fmtDate(job.recu_le) : '' },
    ];
    for (let i = 0; i < idCols.length; i++) {
      const cx = M + i * COL4_W;
      doc.save().font('Helvetica').fontSize(6.5).fillColor('#888888');
      doc.text(idCols[i].label, cx + 4, y + 3, { width: COL4_W - 8, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111');
      doc.text(idCols[i].value || '—', cx + 4, y + 11, { width: COL4_W - 8, lineBreak: false });
      doc.restore();
    }
    y += ID_H + 6;

    // ─── 5. DUM SECTION ─────────────────────────────────────────────────────
    const isExport = job.type === 'export';
    const maxDumRows = isExport ? Math.max(4, dums.length) : Math.max(2, dums.length);
    const DUM_H = 18;
    const REPERT_W = 110;
    const DUM_AREA_W = PW - REPERT_W;

    const dumStartY = y;
    for (let i = 0; i < maxDumRows; i++) {
      const d = dums[i];
      hLine(doc, M, M + DUM_AREA_W, y + DUM_H, BORDER, 0.3);
      doc.save().font('Helvetica-Bold').fontSize(8).fillColor('#333333');
      doc.text(`DUM${i + 1} n° :`, M + 2, y + (DUM_H - 8) / 2, { lineBreak: false });
      doc.restore();

      const numX = M + 48;
      if (d) {
        // Dotted fill area for number
        doc.save().font('Helvetica').fontSize(8.5).fillColor('#111111');
        doc.text(d.dum_number, numX, y + (DUM_H - 8.5) / 2, { lineBreak: false });
        doc.restore();
      }
      // Date label + value
      const dateX = M + DUM_AREA_W / 2;
      doc.save().font('Helvetica-Bold').fontSize(8).fillColor('#333333');
      doc.text('Date :', dateX, y + (DUM_H - 8) / 2, { lineBreak: false });
      if (d && d.dum_date) {
        doc.font('Helvetica').fontSize(8.5).fillColor('#111111');
        doc.text(fmtDate(d.dum_date), dateX + 32, y + (DUM_H - 8.5) / 2, { lineBreak: false });
      }
      doc.restore();
      y += DUM_H;
    }

    // Répertoire box on right side of DUM area
    const reperY = dumStartY;
    const reperH = maxDumRows * DUM_H;
    drawRect(doc, M + DUM_AREA_W, reperY, REPERT_W, reperH, '#F8F8F8', BORDER, 0.5);
    doc.save().font('Helvetica-Bold').fontSize(7).fillColor('#888888');
    doc.text('Répertoire :', M + DUM_AREA_W + 4, reperY + 4, { lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).fillColor('#111111');
    doc.text(job.dossier_number || '', M + DUM_AREA_W + 4, reperY + 14, { lineBreak: false });
    doc.restore();

    y += 8;

    // ─── 6. CLIENT BLOCK (big centered name in bordered box) ─────────────────
    const CLIENT_H = 52;
    // Label above client name (EXPORTATEUR / EXPÉDITEUR for export, nothing for import)
    if (isExport) {
      drawRect(doc, M, y, PW, 16, '#EEEEEE', BORDER, 0.5);
      doc.save().font('Helvetica-Bold').fontSize(8).fillColor('#444444');
      doc.text('EXPORTATEUR', M, y + 4, { width: PW, align: 'center', lineBreak: false });
      doc.restore();
      y += 16;
    }
    drawRect(doc, M, y, PW, CLIENT_H, '#FFFFFF', BORDER, 0.8);
    const clientName = client ? client.name : '';
    // Shrink font if name is long
    let clientFontSize = 26;
    doc.font('Helvetica-Bold');
    while (clientFontSize > 10 && doc.fontSize(clientFontSize).widthOfString(clientName) > PW - 20) {
      clientFontSize -= 1;
    }
    doc.font('Helvetica-Bold').fontSize(clientFontSize).fillColor('#111111');
    const cnW = doc.widthOfString(clientName);
    const cnX = M + (PW - cnW) / 2;
    const cnY = y + (CLIENT_H - clientFontSize) / 2;
    doc.text(clientName, cnX, cnY, { lineBreak: false });
    y += CLIENT_H;

    // ─── 7. SHIPMENT DETAILS ROW ─────────────────────────────────────────────
    // Header: EXPÉDITEUR/DESTINATAIRE | Nombre de colis ou TC | Nature de la M/se | Poids
    const expedLabel = isExport ? 'DESTINATAIRE' : 'EXPÉDITEUR';
    const SH_HDR_H = 18;
    const SH_ROW_H = 28;
    // Column widths
    const SH_C1 = Math.round(PW * 0.28);
    const SH_C2 = Math.round(PW * 0.22);
    const SH_C3 = Math.round(PW * 0.28);
    const SH_C4 = PW - SH_C1 - SH_C2 - SH_C3;

    // Header row (gray)
    drawRect(doc, M, y, PW, SH_HDR_H, '#DDDDDD', BORDER, 0.5);
    vLine(doc, M + SH_C1,             y, y + SH_HDR_H, BORDER, 0.4);
    vLine(doc, M + SH_C1 + SH_C2,     y, y + SH_HDR_H, BORDER, 0.4);
    vLine(doc, M + SH_C1 + SH_C2 + SH_C3, y, y + SH_HDR_H, BORDER, 0.4);
    textCell(doc, expedLabel,            M,                         y, SH_C1, SH_HDR_H, { bold: true, size: 7, align: 'center', color: '#333333' });
    textCell(doc, 'Nombre\ncolis ou TC', M + SH_C1,                 y, SH_C2, SH_HDR_H, { bold: true, size: 7, align: 'center', color: '#333333' });
    textCell(doc, 'Nature de la M/se',  M + SH_C1 + SH_C2,         y, SH_C3, SH_HDR_H, { bold: true, size: 7, align: 'center', color: '#333333' });
    textCell(doc, 'Poids',              M + SH_C1 + SH_C2 + SH_C3, y, SH_C4, SH_HDR_H, { bold: true, size: 7, align: 'center', color: '#333333' });
    y += SH_HDR_H;

    // Values row
    drawRect(doc, M, y, PW, SH_ROW_H, '#FFFFFF', BORDER, 0.5);
    vLine(doc, M + SH_C1,             y, y + SH_ROW_H, BORDER, 0.4);
    vLine(doc, M + SH_C1 + SH_C2,     y, y + SH_ROW_H, BORDER, 0.4);
    vLine(doc, M + SH_C1 + SH_C2 + SH_C3, y, y + SH_ROW_H, BORDER, 0.4);
    textCell(doc, job.expediteur_exportateur || '',  M,                         y, SH_C1, SH_ROW_H, { bold: true, size: 9, color: '#111111' });
    textCell(doc, job.nombre_colis_tc || '',         M + SH_C1,                 y, SH_C2, SH_ROW_H, { size: 8.5, align: 'center', color: '#111111' });
    textCell(doc, job.nature_marchandise || '',      M + SH_C1 + SH_C2,         y, SH_C3, SH_ROW_H, { size: 8.5, color: '#111111' });
    const poidsStr = job.poids_brut_kg != null ? `${job.poids_brut_kg} kg` : '';
    textCell(doc, poidsStr,                          M + SH_C1 + SH_C2 + SH_C3, y, SH_C4, SH_ROW_H, { size: 8.5, align: 'center', color: '#111111' });
    y += SH_ROW_H + 2;

    // ─── 8. MILESTONES ──────────────────────────────────────────────────────
    const msRows = MILESTONE_ROWS[job.type] || MILESTONE_ROWS.import;
    const MS_ROW_H = 20;
    const MS_LABEL_W = Math.round(PW * 0.38);
    const MS_VAL_W   = PW - MS_LABEL_W;
    const msMap = Object.fromEntries(milestones.map((m) => [m.stage_code, m]));

    for (let i = 0; i < msRows.length; i++) {
      const row = msRows[i];
      const rowBg = i % 2 === 0 ? '#FFFFFF' : '#F9F9F9';
      drawRect(doc, M, y, PW, MS_ROW_H, rowBg, BORDER, 0.3);
      vLine(doc, M + MS_LABEL_W, y, y + MS_ROW_H, BORDER, 0.3);

      // Label
      textCell(doc, row.label, M, y, MS_LABEL_W, MS_ROW_H, { bold: false, size: 8.5, color: '#222222' });

      // Right value
      if (row.type === 'milestone') {
        const ms = msMap[row.code];
        const rightText = milestoneRightText(ms, row.notesField, job);
        const isSkipped = ms && ms.status === 'skipped';
        textCell(doc, rightText, M + MS_LABEL_W, y, MS_VAL_W, MS_ROW_H, {
          size: 8, color: isSkipped ? '#888888' : '#111111', italic: isSkipped,
        });
      } else if (row.type === 'field') {
        const val = job[row.field] || '';
        textCell(doc, val, M + MS_LABEL_W, y, MS_VAL_W, MS_ROW_H, { size: 8, color: '#111111' });
      }

      y += MS_ROW_H;
    }

    y += 6;

    // ─── 9. OBSERVATIONS ────────────────────────────────────────────────────
    const obsAvailH = QR_Y - y - 6;
    const OBS_H = Math.max(60, Math.min(obsAvailH, 90));
    drawRect(doc, M, y, PW, OBS_H, '#FFFFFF', BORDER, 0.6);
    doc.save().font('Helvetica-Bold').fontSize(8.5).fillColor('#222222');
    const obsLabelW = doc.widthOfString('OBSERVATIONS');
    doc.text('OBSERVATIONS', M + (PW - obsLabelW) / 2, y + 5, { lineBreak: false });
    // Underline
    hLine(doc, M + (PW - obsLabelW) / 2, M + (PW + obsLabelW) / 2, y + 16, '#222222', 0.6);
    doc.restore();
    if (job.observations) {
      doc.save().font('Helvetica').fontSize(8.5).fillColor('#333333');
      doc.text(job.observations, M + 6, y + 22, { width: PW - 12, lineBreak: true });
      doc.restore();
    }
    y += OBS_H + 4;

    // ─── 10. QR CODE ────────────────────────────────────────────────────────
    doc.image(qrBuffer, QR_X, QR_Y, { width: QR_SIZE });

    // Generated timestamp (bottom left)
    const now = new Date();
    const genStr = `Généré le ${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    doc.save().font('Helvetica').fontSize(7).fillColor('#AAAAAA');
    doc.text(genStr, M, QR_Y + QR_SIZE / 2 - 3, { lineBreak: false });
    doc.restore();

    // ─── 11. FOOTER ─────────────────────────────────────────────────────────
    renderPdfFooter(doc, company);

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

module.exports = { generateJobSheetPdf };
