export { formatMAD, formatMADShort } from './money';

export function formatDate(isoStr) {
  if (!isoStr) return '—';
  const s = String(isoStr).slice(0, 10);
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  // SQLite stores datetimes as "YYYY-MM-DD HH:MM:SS" (space separator, not T)
  const normalized = String(isoStr).replace(' ', 'T');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export const JOB_STATUS_LABEL = {
  open: 'Ouvert',
  released: 'Livré',
  invoiced: 'Facturé',
  paid: 'Payé',
  archived: 'Archivé',
  cancelled: 'Annulé',
};

export function jobStatusLabel(status, archived) {
  if (archived) return 'Archivé';
  return JOB_STATUS_LABEL[status] || status;
}

export function jobStatusBadgeClass(status, archived) {
  if (archived) return 'bg-zinc-700 text-zinc-300 border border-zinc-600';
  const map = {
    open:      'bg-blue-900/40 text-blue-300 border border-blue-800',
    released:  'bg-emerald-900/40 text-emerald-300 border border-emerald-800',
    invoiced:  'bg-amber-900/40 text-amber-300 border border-amber-800',
    paid:      'bg-emerald-700/60 text-white border border-emerald-600',
    cancelled: 'bg-red-900/40 text-red-300 border border-red-800',
  };
  return map[status] || 'bg-zinc-700 text-zinc-300';
}

export const DISBURSEMENT_METHOD_LABEL = {
  check: 'Chèque', cash: 'Espèces', transfer: 'Virement',
};

export const DISBURSEMENT_STATUS_LABEL = {
  pending_signature: 'En attente validation',
  signed: 'Validé',
  invoiced: 'Facturé',
  reimbursed: 'Remboursé',
  cancelled: 'Annulé',
};
