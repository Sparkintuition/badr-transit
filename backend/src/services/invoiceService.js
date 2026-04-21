const db = require('../db/db');

function buildInvoiceLines(job_id) {
  const serviceCharges = db.prepare(
    'SELECT * FROM service_charges WHERE job_id = ? AND invoice_id IS NULL ORDER BY created_at'
  ).all(job_id);

  const disbursements = db.prepare(
    "SELECT * FROM disbursements WHERE job_id = ? AND status = 'signed' AND invoice_id IS NULL ORDER BY paid_date, requested_at"
  ).all(job_id);

  const lines = [];

  for (const sc of serviceCharges) {
    lines.push({
      source_type: 'service',
      source_id: sc.id,
      designation: sc.designation,
      amount_cents: sc.amount_cents,
      is_taxable: true,
      tva_rate: sc.tva_rate,
    });
  }

  for (const d of disbursements) {
    const designation = d.description ? `${d.type} — ${d.description}` : d.type;
    lines.push({
      source_type: 'disbursement',
      source_id: d.id,
      designation,
      amount_cents: d.amount_cents,
      is_taxable: false,
      tva_rate: 0,
    });
  }

  return lines;
}

function computeInvoiceTotals({ lines, taxe_regionale_applied }) {
  let subtotalTaxable = 0;
  let subtotalNonTaxable = 0;
  let tva14 = 0;
  let tva20 = 0;

  for (const line of lines) {
    if (line.is_taxable) {
      subtotalTaxable += line.amount_cents;
      if (line.tva_rate === 14) tva14 += Math.round(line.amount_cents * 14 / 100);
      else if (line.tva_rate === 20) tva20 += Math.round(line.amount_cents * 20 / 100);
    } else {
      subtotalNonTaxable += line.amount_cents;
    }
  }

  const totalHt = subtotalTaxable + subtotalNonTaxable;
  const taxeRegionale = taxe_regionale_applied ? Math.round(subtotalTaxable * 4 / 100) : 0;
  const totalTtc = totalHt + tva14 + tva20 + taxeRegionale;

  return {
    subtotal_taxable_cents: subtotalTaxable,
    subtotal_non_taxable_cents: subtotalNonTaxable,
    total_ht_cents: totalHt,
    tva_14_cents: tva14,
    tva_20_cents: tva20,
    taxe_regionale_cents: taxeRegionale,
    total_ttc_cents: totalTtc,
  };
}

module.exports = { buildInvoiceLines, computeInvoiceTotals };
