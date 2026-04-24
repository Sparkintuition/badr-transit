import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import { formatMAD, formatDate, formatDateTime, DISBURSEMENT_STATUS_LABEL } from '../utils/format';
import MarkPaidDialog from '../components/MarkPaidDialog';
import CancelInvoiceDialog from '../components/CancelInvoiceDialog';

const STATUS_BADGE = {
  draft:     'bg-zinc-700 text-zinc-300 border border-zinc-600',
  sent:      'bg-blue-900/40 text-blue-300 border border-blue-800',
  paid:      'bg-emerald-700/60 text-white border border-emerald-600',
  overdue:   'bg-red-900/40 text-red-300 border border-red-800',
  cancelled: 'bg-zinc-800 text-zinc-500 border border-zinc-700',
};
const STATUS_LABEL = {
  draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée',
  overdue: 'En retard', cancelled: 'Annulée',
};
const cardClass = 'bg-[#242424] border border-[#333333] rounded-xl p-5';

function InfoField({ label, value, highlight }) {
  return (
    <div>
      <dt className="text-xs text-[#A1A1AA] uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className={`text-sm ${highlight ? 'text-red-400 font-medium' : 'text-[#FAFAFA]'}`}>
        {value || <span className="text-[#555555]">—</span>}
      </dd>
    </div>
  );
}

function TotalsBox({ inv }) {
  const rows = [
    ['Sous-total Taxable', formatMAD(inv.subtotal_taxable_cents), false],
    ['Sous-total Non Taxable', formatMAD(inv.subtotal_non_taxable_cents), false],
    ['TOTAL HT', formatMAD(inv.total_ht_cents), true],
  ];
  if (inv.tva_14_cents > 0) rows.push(['TVA 14 %', formatMAD(inv.tva_14_cents), false]);
  if (inv.tva_20_cents > 0) rows.push(['TVA 20 %', formatMAD(inv.tva_20_cents), false]);
  if (inv.taxe_regionale_applied) rows.push(['Taxe Régionale 4%', formatMAD(inv.taxe_regionale_cents), false]);
  rows.push(['TOTAL TTC', formatMAD(inv.total_ttc_cents), true]);
  if (inv.avance_cents > 0) rows.push(['Avance', formatMAD(inv.avance_cents), false]);
  rows.push(['RESTE À PAYER', formatMAD(inv.reste_a_payer_cents), true]);

  return (
    <div className="border border-[#333333] rounded-lg overflow-hidden">
      {rows.map(([label, value, bold]) => (
        <div key={label} className={`flex justify-between px-4 py-2 ${bold ? 'bg-[#2A2A2A]' : ''}`}>
          <span className={`text-xs ${bold ? 'font-semibold text-[#FAFAFA]' : 'text-[#A1A1AA]'}`}>{label}</span>
          <span className={`text-xs font-mono ${bold ? 'font-bold text-[#FAFAFA]' : 'text-[#FAFAFA]'}`}>{value}</span>
        </div>
      ))}
      <div className="px-4 py-3 border-t border-[#333333] bg-[#1A1A1A]">
        <p className="text-xs text-[#A1A1AA] italic">{inv.amount_in_words}</p>
      </div>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const canWrite = ['admin', 'accountant'].includes(user?.role);

  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  async function loadInvoice() {
    setLoading(true);
    try {
      const r = await api.get(`/invoices/${id}`);
      setInv(r.data);
      setNotesDraft(r.data.notes || '');
    } catch {
      toast.error('Facture introuvable.');
      navigate('/app/factures');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInvoice(); }, [id]);

  async function handleMarkSent() {
    try {
      await api.post(`/invoices/${id}/send`);
      toast.success('Facture marquée envoyée.');
      loadInvoice();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur.'); }
  }

  async function handleRegenPdf() {
    try {
      await api.post(`/invoices/${id}/regenerate-pdf`);
      toast.success('PDF régénéré.');
      loadInvoice();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur.'); }
  }

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await api.put(`/invoices/${id}`, { notes: notesDraft });
      toast.success('Notes enregistrées.');
      setEditingNotes(false);
      loadInvoice();
    } catch { toast.error('Erreur.'); }
    finally { setSavingNotes(false); }
  }

  if (loading) return <div className="py-16 text-center text-sm text-[#A1A1AA]">Chargement…</div>;
  if (!inv) return null;

  const isOverdue = inv.status === 'overdue';
  const isDraft = inv._db_status === 'draft';
  const isSent = inv._db_status === 'sent' || isOverdue;
  const isPaid = inv._db_status === 'paid';
  const isCancelled = inv._db_status === 'cancelled';

  return (
    <div className="space-y-5">
      <Link to="/app/factures" className="text-sm text-[#60A5FA] hover:underline">← Retour aux factures</Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[#FAFAFA] font-mono">{inv.facture_number}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[inv.status]}`}>
              {STATUS_LABEL[inv.status] || inv.status}
            </span>
          </div>
          <p className="text-sm text-[#A1A1AA] mt-1">
            <Link to={`/app/dossiers/${inv.job.id}`} className="text-[#60A5FA] hover:underline">{inv.job.dossier_number}</Link>
            {' · '}{inv.client.name}
          </p>
        </div>

        {/* Actions */}
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {inv.pdf_path && (
              <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
                Ouvrir PDF
              </a>
            )}
            <button onClick={handleRegenPdf}
              className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-400 rounded-lg hover:bg-[#2A2A2A] transition-colors">
              Régénérer PDF
            </button>
            {isDraft && (
              <button onClick={handleMarkSent}
                className="px-3 py-1.5 text-sm bg-blue-800/50 border border-blue-700 text-blue-300 rounded-lg hover:bg-blue-800/70 transition-colors">
                Marquer envoyée
              </button>
            )}
            {isSent && (
              <button onClick={() => setMarkPaidOpen(true)}
                className="px-3 py-1.5 text-sm bg-emerald-700/50 border border-emerald-700 text-emerald-300 rounded-lg hover:bg-emerald-700/70 transition-colors">
                Marquer payée
              </button>
            )}
            {isAdmin && !isPaid && !isCancelled && (
              <button onClick={() => setCancelOpen(true)}
                className="px-3 py-1.5 text-sm border border-red-800 text-red-400 rounded-lg hover:bg-red-900/20 transition-colors">
                Annuler
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl px-5 py-4">
          <p className="text-sm font-semibold text-red-400">Facture annulée</p>
          {inv.cancelled_reason && <p className="text-xs text-red-300 mt-1">{inv.cancelled_reason}</p>}
        </div>
      )}

      {/* Overdue banner */}
      {isOverdue && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl px-5 py-3">
          <p className="text-sm text-red-400">
            En retard de <strong>{inv.days_overdue} jour{inv.days_overdue > 1 ? 's' : ''}</strong> — Échéance le {formatDate(inv.due_date)}
          </p>
        </div>
      )}

      {/* Info grid */}
      <div className={cardClass}>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <InfoField label="N° Facture" value={inv.facture_number} />
          <InfoField label="Date d'émission" value={formatDate(inv.issue_date)} />
          <InfoField label="Échéance" value={formatDate(inv.due_date)} highlight={isOverdue} />
          <InfoField label="Dossier" value={inv.job.dossier_number} />
          <div>
            <dt className="text-xs text-[#A1A1AA] uppercase tracking-wide mb-0.5">Client</dt>
            <dd className="text-sm text-[#FAFAFA] flex items-center gap-2">
              {inv.client.name}
              <Link to={`/app/clients/${inv.client.id}`} className="text-xs text-[#60A5FA] hover:underline">
                Voir relevé →
              </Link>
            </dd>
          </div>
          <InfoField label="Créé le" value={formatDateTime(inv.created_at)} />
          {isPaid && <InfoField label="Paiement reçu le" value={formatDate(inv.payment_date)} />}
          {isPaid && <InfoField label="Moyen de paiement" value={inv.payment_method} />}
        </dl>
      </div>

      {/* Line items */}
      <div className={cardClass}>
        <p className="text-sm font-semibold text-[#FAFAFA] mb-4">Lignes de facturation</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#333333]">
                <th className="pb-2 text-left text-xs text-[#A1A1AA] font-medium">Désignation</th>
                <th className="pb-2 text-right text-xs text-[#A1A1AA] font-medium">Taxable</th>
                <th className="pb-2 text-right text-xs text-[#A1A1AA] font-medium">Non Taxable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333333]">
              {inv.lines.map((ln) => (
                <tr key={ln.id} className="hover:bg-[#2A2A2A]">
                  <td className="py-2 text-xs text-zinc-300">{ln.designation}</td>
                  <td className="py-2 text-xs text-right font-mono text-[#FAFAFA]">
                    {ln.is_taxable ? formatMAD(ln.amount_cents) : '—'}
                  </td>
                  <td className="py-2 text-xs text-right font-mono text-[#FAFAFA]">
                    {!ln.is_taxable ? formatMAD(ln.amount_cents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={cardClass}>
          <p className="text-sm font-semibold text-[#FAFAFA] mb-4">Totaux</p>
          <TotalsBox inv={inv} />
        </div>

        {/* Linked disbursements */}
        {inv.disbursements.length > 0 && (
          <div className={cardClass}>
            <p className="text-sm font-semibold text-[#FAFAFA] mb-4">Décaissements liés</p>
            <div className="space-y-2">
              {inv.disbursements.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-[#333333] last:border-0">
                  <div>
                    <span className="text-xs text-zinc-300">{d.type}</span>
                    {d.description && <span className="text-xs text-[#A1A1AA] ml-1">— {d.description}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[#FAFAFA]">{formatMAD(d.amount_cents)}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      d.status === 'reimbursed' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'
                    }`}>
                      {DISBURSEMENT_STATUS_LABEL[d.status] || d.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pièces jointes */}
      {inv.pieces_jointes && (
        <div className={cardClass}>
          <p className="text-sm font-semibold text-[#FAFAFA] mb-2">Pièces jointes</p>
          <p className="text-xs text-[#A1A1AA]">{inv.pieces_jointes}</p>
        </div>
      )}

      {/* Notes internes */}
      {canWrite && (
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-[#FAFAFA]">Notes internes</p>
            {!editingNotes && (
              <button onClick={() => setEditingNotes(true)}
                className="text-xs text-[#60A5FA] hover:underline">Modifier</button>
            )}
          </div>
          {editingNotes ? (
            <>
              <textarea rows={3} value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] resize-none" />
              <div className="flex gap-2 mt-2">
                <button onClick={saveNotes} disabled={savingNotes}
                  className="px-3 py-1.5 bg-[#1E3A8A] text-white text-xs rounded-lg hover:bg-[#1E40AF] disabled:opacity-50">
                  {savingNotes ? '…' : 'Enregistrer'}
                </button>
                <button onClick={() => { setEditingNotes(false); setNotesDraft(inv.notes || ''); }}
                  className="px-3 py-1.5 border border-[#333333] text-xs text-zinc-300 rounded-lg hover:bg-[#2A2A2A]">
                  Annuler
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-[#A1A1AA]">{inv.notes || <em>Aucune note.</em>}</p>
          )}
        </div>
      )}

      {markPaidOpen && (
        <MarkPaidDialog invoiceId={id} onClose={() => setMarkPaidOpen(false)}
          onPaid={() => { setMarkPaidOpen(false); loadInvoice(); }} />
      )}
      {cancelOpen && (
        <CancelInvoiceDialog invoiceId={id} onClose={() => setCancelOpen(false)}
          onCancelled={() => { setCancelOpen(false); loadInvoice(); }} />
      )}
    </div>
  );
}
