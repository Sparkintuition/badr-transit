import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import DisbursementFormModal from './DisbursementFormModal';
import DisbursementDetailModal from '../components/DisbursementDetailModal';
import { formatDate, formatMAD, formatMADShort, DISBURSEMENT_METHOD_LABEL, DISBURSEMENT_STATUS_LABEL } from '../utils/format';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  pending_signature: 'bg-blue-900/40 text-blue-300 border border-blue-800',
  signed:            'bg-amber-900/40 text-amber-300 border border-amber-800',
  invoiced:          'bg-emerald-900/40 text-emerald-300 border border-emerald-800',
  reimbursed:        'bg-emerald-700/60 text-white border border-emerald-600',
  cancelled:         'bg-red-900/40 text-red-300 border border-red-800',
};

function StatusBadge({ d }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[d.status] || 'bg-zinc-700 text-zinc-300'}`}>
      {DISBURSEMENT_STATUS_LABEL[d.status] || d.status}
      {d.is_red_flag_invoice && <span title="Non facturé depuis trop longtemps">🔴</span>}
      {d.is_red_flag_receipt && <span title="Reçu manquant depuis trop longtemps">🟡</span>}
    </span>
  );
}

function MethodBadge({ method }) {
  const cls = {
    check:    'bg-purple-900/40 text-purple-300 border border-purple-800',
    cash:     'bg-green-900/40 text-green-300 border border-green-800',
    transfer: 'bg-cyan-900/40 text-cyan-300 border border-cyan-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls[method] || 'bg-zinc-700 text-zinc-300'}`}>
      {DISBURSEMENT_METHOD_LABEL[method] || method}
    </span>
  );
}

// ─── Row background by status/alerts ─────────────────────────────────────────

function rowClass(d) {
  if (d.status === 'cancelled') return 'opacity-60';
  if (d.is_red_flag_invoice) return 'border-l-4 border-red-500';
  if (d.is_red_flag_receipt) return 'border-l-4 border-amber-500';
  if (d.status === 'signed' && !d.invoice_id) return 'border-l-4 border-amber-700/60';
  if (d.status === 'reimbursed') return 'opacity-70';
  return '';
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ title, count, amount, color, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-colors w-full ${
        active ? 'border-[#3B5BDB] bg-[#3B5BDB]/10' :
        color === 'red' ? 'border-red-800/60 bg-red-900/10 hover:bg-red-900/20' :
        color === 'amber' ? 'border-amber-800/60 bg-amber-900/10 hover:bg-amber-900/20' :
        'border-[#333333] bg-[#242424] hover:bg-[#2A2A2A]'
      }`}
    >
      <p className={`text-xs font-medium ${color === 'red' ? 'text-red-400' : color === 'amber' ? 'text-amber-400' : 'text-[#A1A1AA]'}`}>
        {title}
      </p>
      <p className="text-xl font-bold text-[#FAFAFA] mt-1">{count ?? '—'}</p>
      {amount != null && <p className="text-xs text-[#A1A1AA] mt-0.5">{formatMADShort(amount)}</p>}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const ALL_STATUSES = ['pending_signature', 'signed', 'invoiced', 'reimbursed', 'cancelled'];
const STATUS_PILL_LABEL = {
  pending_signature: 'En attente',
  signed: 'Validés',
  invoiced: 'Facturés',
  reimbursed: 'Remboursés',
  cancelled: 'Annulés',
};

export default function DisbursementsListPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdmin = user?.role === 'admin';
  const isAccountant = user?.role === 'accountant';
  const canSeeStats = isAdmin || isAccountant;

  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [selectedStatuses, setSelectedStatuses] = useState(() => {
    const s = searchParams.get('status');
    return s ? s.split(',') : [];
  });
  const [redFlagOnly, setRedFlagOnly] = useState(searchParams.get('red_flag') === '1');
  const [receiptAlertOnly, setReceiptAlertOnly] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(searchParams.get('payment_method') || '');
  const [clientId, setClientId] = useState(searchParams.get('client_id') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('date_from') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('date_to') || '');
  const [page, setPage] = useState(1);

  // Data
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const PAGE_SIZE = 50;

  useEffect(() => {
    if (canSeeStats) {
      api.get('/disbursements/stats').then((r) => setStats(r.data)).catch(() => {});
    }
    api.get('/clients', { params: { page_size: 200 } })
      .then((r) => setClients(r.data.items || r.data || []))
      .catch(() => {});
  }, [canSeeStats]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = { page, page_size: PAGE_SIZE };
    if (search.trim()) params.search = search.trim();
    if (redFlagOnly) {
      params.red_flag = '1';
    } else if (receiptAlertOnly) {
      params.receipt_alert = '1';
    } else if (selectedStatuses.length > 0) {
      params.status = selectedStatuses.join(',');
    } else {
      params.include_cancelled = '1';
    }
    if (paymentMethod) params.payment_method = paymentMethod;
    if (clientId) params.client_id = clientId;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    try {
      const r = await api.get('/disbursements', { params });
      setItems(r.data.items);
      setTotal(r.data.total);
    } catch {
      toast.error('Impossible de charger les décaissements.');
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedStatuses, redFlagOnly, receiptAlertOnly, paymentMethod, clientId, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  function clearAlertFilters() {
    setRedFlagOnly(false);
    setReceiptAlertOnly(false);
  }

  function toggleStatus(s) {
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
    setPage(1);
    clearAlertFilters();
  }

  function handleStatCard(filter) {
    clearAlertFilters();
    setSelectedStatuses([]);
    setPage(1);
    if (filter === 'red_flag') { setRedFlagOnly(true); }
    else if (filter === 'receipt_alert') { setReceiptAlertOnly(true); }
    else if (filter === 'pending_signature') { setSelectedStatuses(['pending_signature']); }
    else if (filter === 'signed_uninvoiced') { setSelectedStatuses(['signed']); }
  }

  function refreshStats() {
    if (canSeeStats) api.get('/disbursements/stats').then((r) => setStats(r.data)).catch(() => {});
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">Décaissements</h1>
          <p className="text-sm text-[#A1A1AA] mt-1">Paiements effectués pour le compte des clients</p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          + Nouveau décaissement
        </button>
      </div>

      {/* Stats cards */}
      {canSeeStats && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard
            title="En attente de validation"
            count={stats.pending_signature_count}
            amount={stats.pending_signature_amount}
            color="default"
            onClick={() => handleStatCard('pending_signature')}
            active={selectedStatuses.length === 1 && selectedStatuses[0] === 'pending_signature' && !redFlagOnly && !receiptAlertOnly}
          />
          <StatCard
            title="Validés non facturés"
            count={stats.signed_uninvoiced_count}
            amount={stats.signed_uninvoiced_amount}
            color="amber"
            onClick={() => handleStatCard('signed_uninvoiced')}
            active={selectedStatuses.length === 1 && selectedStatuses[0] === 'signed' && !redFlagOnly && !receiptAlertOnly}
          />
          <StatCard
            title="Alertes — Non facturés"
            count={stats.red_flag_count}
            amount={stats.red_flag_amount}
            color="red"
            onClick={() => handleStatCard('red_flag')}
            active={redFlagOnly}
          />
          <StatCard
            title="Alertes — Reçus manquants"
            count={stats.receipt_alert_count}
            amount={stats.receipt_alert_amount}
            color="amber"
            onClick={() => handleStatCard('receipt_alert')}
            active={receiptAlertOnly}
          />
          <StatCard
            title="Ce mois-ci"
            count={null}
            amount={stats.this_month_total}
            color="default"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-[#242424] border border-[#333333] rounded-xl p-4 space-y-3">
        {/* Row 1 */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher (dossier, type, chèque…)"
            className="flex-1 min-w-48 px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
          />
          <select
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
          >
            <option value="">Tous les clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={paymentMethod}
            onChange={(e) => { setPaymentMethod(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
          >
            <option value="">Tous moyens</option>
            <option value="check">Chèque</option>
            <option value="cash">Espèces</option>
            <option value="transfer">Virement</option>
          </select>
        </div>

        {/* Row 2 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status pills */}
          <div className="flex flex-wrap gap-1.5">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedStatuses.includes(s)
                    ? 'bg-[#3B5BDB] border-[#3B5BDB] text-white'
                    : 'border-[#333333] text-[#A1A1AA] hover:border-[#555555] hover:text-[#FAFAFA]'
                }`}
              >
                {STATUS_PILL_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {/* Date range */}
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-1.5 bg-[#2A2A2A] border border-[#333333] rounded-lg text-xs text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
              title="Du" />
            <span className="text-xs text-[#A1A1AA]">→</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-1.5 bg-[#2A2A2A] border border-[#333333] rounded-lg text-xs text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
              title="Au" />
            {/* Alert toggles */}
            {canSeeStats && (
              <>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#A1A1AA] whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={redFlagOnly}
                    onChange={(e) => { setRedFlagOnly(e.target.checked); setReceiptAlertOnly(false); setSelectedStatuses([]); setPage(1); }}
                    className="rounded"
                  />
                  Non facturés
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#A1A1AA] whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={receiptAlertOnly}
                    onChange={(e) => { setReceiptAlertOnly(e.target.checked); setRedFlagOnly(false); setSelectedStatuses([]); setPage(1); }}
                    className="rounded"
                  />
                  Reçus manquants
                </label>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-[#A1A1AA] text-sm">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-[#A1A1AA] text-sm">Aucun décaissement trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#333333]">
                  {['Date', 'Dossier', 'Client', 'Type', 'Montant', 'Moyen', 'Référence', 'Statut', 'Reçu', 'Copie paiement', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {items.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setDetailId(d.id)}
                    className={`cursor-pointer hover:bg-[#2A2A2A] transition-colors ${rowClass(d)}`}
                  >
                    <td className="px-4 py-3 text-xs text-[#A1A1AA] whitespace-nowrap">
                      {formatDate(d.paid_date || d.requested_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-[#60A5FA]">{d.job.dossier_number}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#A1A1AA] max-w-[120px] truncate">{d.job.client.name}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-[#FAFAFA]">{d.type}</div>
                      {d.description && (
                        <div className="text-xs text-[#A1A1AA] truncate max-w-[160px]">{d.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#FAFAFA] text-right whitespace-nowrap">
                      <span className={d.status === 'cancelled' ? 'line-through text-[#A1A1AA]' : ''}>
                        {formatMAD(d.amount_cents)}
                      </span>
                    </td>
                    <td className="px-4 py-3"><MethodBadge method={d.payment_method} /></td>
                    <td className="px-4 py-3 text-xs text-[#A1A1AA] font-mono">{d.payment_reference || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge d={d} /></td>
                    {/* Receipt */}
                    <td className="px-4 py-3 text-center text-xs">
                      {d.has_receipt
                        ? <span className="text-emerald-400">✓</span>
                        : d.no_receipt_expected
                          ? <span className="text-zinc-500" title="Aucun reçu attendu">—</span>
                          : <span className="text-[#555555]">—</span>
                      }
                    </td>
                    {/* Payment proof (check + transfer only) */}
                    <td className="px-4 py-3 text-center text-xs">
                      {['check', 'transfer'].includes(d.payment_method)
                        ? d.has_payment_proof
                          ? <span className="text-emerald-400">✓</span>
                          : <span className="text-[#555555]">—</span>
                        : <span className="text-[#555555]">—</span>
                      }
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2 whitespace-nowrap">
                        <button
                          onClick={() => setDetailId(d.id)}
                          className="text-xs text-[#60A5FA] hover:underline"
                        >
                          Voir
                        </button>
                        {isAdmin && d.status === 'pending_signature' && (
                          <button
                            onClick={() => setDetailId(d.id)}
                            className="text-xs text-emerald-400 hover:underline"
                          >
                            Valider
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-[#333333] flex items-center justify-between text-xs text-[#A1A1AA]">
            <span>{total} résultats</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-[#333333] rounded text-xs disabled:opacity-40 hover:bg-[#2A2A2A] transition-colors"
              >
                ←
              </button>
              <span>Page {page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-[#333333] rounded text-xs disabled:opacity-40 hover:bg-[#2A2A2A] transition-colors"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {createModal && (
        <DisbursementFormModal
          onClose={() => setCreateModal(false)}
          onSaved={() => { setCreateModal(false); load(); refreshStats(); }}
        />
      )}
      {detailId && (
        <DisbursementDetailModal
          disbursementId={detailId}
          onClose={() => setDetailId(null)}
          onUpdated={() => { load(); refreshStats(); }}
        />
      )}
    </div>
  );
}
