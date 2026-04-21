import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import { formatMAD, formatMADShort, formatDate } from '../utils/format';
import MarkPaidDialog from '../components/MarkPaidDialog';
import CancelInvoiceDialog from '../components/CancelInvoiceDialog';
import toast from 'react-hot-toast';

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

const ALL_STATUSES = ['draft', 'sent', 'overdue', 'paid', 'cancelled'];

function StatCard({ title, value, sub, color }) {
  return (
    <div className={`rounded-xl border p-4 ${
      color === 'red'   ? 'border-red-800/60 bg-red-900/10' :
      color === 'green' ? 'border-emerald-800/60 bg-emerald-900/10' :
      color === 'amber' ? 'border-amber-800/60 bg-amber-900/10' :
                          'border-[#333333] bg-[#242424]'
    }`}>
      <p className={`text-xs font-medium ${color === 'red' ? 'text-red-400' : color === 'green' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-[#A1A1AA]'}`}>
        {title}
      </p>
      <p className={`text-2xl font-bold mt-1 ${color === 'red' ? 'text-red-300' : color === 'green' ? 'text-emerald-300' : color === 'amber' ? 'text-amber-300' : 'text-[#FAFAFA]'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-[#A1A1AA] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function InvoicesListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const canWrite = ['admin', 'accountant'].includes(user?.role);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [markPaidId, setMarkPaidId] = useState(null);
  const [cancelId, setCancelId] = useState(null);
  const [actionMenuId, setActionMenuId] = useState(null);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  async function loadInvoices() {
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (selectedStatuses.length > 0) params.status = selectedStatuses.join(',');
      if (overdueOnly) params.overdue_only = '1';
      const r = await api.get('/invoices', { params });
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
      setSummary(r.data.summary || null);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInvoices(); }, [search, selectedStatuses, overdueOnly, page]);

  function toggleStatus(s) {
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
    setPage(1);
  }

  async function handleMarkSent(id) {
    try {
      await api.post(`/invoices/${id}/send`);
      toast.success('Facture marquée envoyée.');
      loadInvoices();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur.');
    }
    setActionMenuId(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">Factures</h1>
          <p className="text-sm text-[#A1A1AA] mt-1">Factures clients et suivi des paiements</p>
        </div>
        {canWrite && (
          <button onClick={() => navigate('/app/factures/nouveau')}
            className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors">
            + Nouvelle facture
          </button>
        )}
      </div>

      {/* Stat cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="Brouillons"
            value={items.filter((i) => i.status === 'draft').length}
            color="default"
          />
          <StatCard
            title="À encaisser"
            value={formatMADShort(summary.total_outstanding_cents)}
            sub={`${items.filter((i) => i.status === 'sent').length} factures`}
            color="amber"
          />
          <StatCard
            title="En retard"
            value={summary.count_overdue}
            color={summary.count_overdue > 0 ? 'red' : 'default'}
          />
          <StatCard
            title="Total TTC (filtre actuel)"
            value={formatMADShort(summary.total_ttc_cents)}
            color="green"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-[#242424] border border-[#333333] rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Rechercher (N° facture, dossier, client)…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 min-w-48 px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
          />
          <label className="flex items-center gap-2 text-sm text-[#A1A1AA] cursor-pointer">
            <input type="checkbox" checked={overdueOnly}
              onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }}
              className="rounded" />
            En retard seulement
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((s) => (
            <button key={s} onClick={() => toggleStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedStatuses.includes(s)
                  ? STATUS_BADGE[s]
                  : 'border border-[#333333] text-[#A1A1AA] hover:border-[#555555]'
              }`}>
              {STATUS_LABEL[s]}
            </button>
          ))}
          {selectedStatuses.length > 0 && (
            <button onClick={() => setSelectedStatuses([])}
              className="px-3 py-1 rounded-full text-xs text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors">
              Tout effacer ×
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#A1A1AA]">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#A1A1AA]">Aucune facture trouvée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#333333]">
                  {['Facture N°', 'Dossier', 'Client', 'Émise le', 'Échéance', 'Total TTC', 'Reste à payer', 'Statut', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {items.map((inv) => (
                  <tr key={inv.id}
                    className={`hover:bg-[#2A2A2A] transition-colors ${
                      inv.status === 'overdue' ? 'border-l-4 border-red-500' :
                      inv.status === 'paid' ? 'border-l-4 border-emerald-600' :
                      'border-l-4 border-transparent'
                    }`}>
                    <td className="px-4 py-2.5">
                      <Link to={`/app/factures/${inv.id}`}
                        className="font-mono text-xs text-[#60A5FA] hover:underline">
                        {inv.facture_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link to={`/app/dossiers/${inv.job.id}`}
                        className="font-mono text-xs text-[#60A5FA] hover:underline">
                        {inv.job.dossier_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#A1A1AA] max-w-[120px] truncate">{inv.client.name}</td>
                    <td className="px-4 py-2.5 text-xs text-[#A1A1AA]">{formatDate(inv.issue_date)}</td>
                    <td className={`px-4 py-2.5 text-xs ${inv.is_overdue ? 'text-red-400 font-medium' : 'text-[#A1A1AA]'}`}>
                      {formatDate(inv.due_date)}
                      {inv.is_overdue && ` (+${inv.days_overdue}j)`}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-[#FAFAFA] text-right whitespace-nowrap">
                      {formatMAD(inv.total_ttc_cents)}
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-medium text-right whitespace-nowrap ${inv.status === 'paid' ? 'text-emerald-400' : 'text-amber-300'}`}>
                      {formatMAD(inv.reste_a_payer_cents)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[inv.status] || ''}`}>
                        {STATUS_LABEL[inv.status] || inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 relative">
                      <div className="relative inline-block">
                        <button onClick={() => setActionMenuId(actionMenuId === inv.id ? null : inv.id)}
                          className="text-xs text-[#A1A1AA] hover:text-[#FAFAFA] px-2 py-1 rounded hover:bg-[#333333]">
                          ···
                        </button>
                        {actionMenuId === inv.id && (
                          <div className="absolute right-0 top-7 z-20 bg-[#1A1A1A] border border-[#333333] rounded-lg shadow-xl w-44 py-1">
                            <Link to={`/app/factures/${inv.id}`}
                              onClick={() => setActionMenuId(null)}
                              className="block px-4 py-2 text-xs text-[#FAFAFA] hover:bg-[#2A2A2A]">Voir</Link>
                            {inv.pdf_path && (
                              <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer"
                                onClick={() => setActionMenuId(null)}
                                className="block px-4 py-2 text-xs text-[#FAFAFA] hover:bg-[#2A2A2A]">Ouvrir PDF</a>
                            )}
                            {canWrite && inv._db_status === 'draft' && (
                              <button onClick={() => { handleMarkSent(inv.id); }}
                                className="w-full text-left px-4 py-2 text-xs text-[#FAFAFA] hover:bg-[#2A2A2A]">Marquer envoyée</button>
                            )}
                            {canWrite && (inv.status === 'sent' || inv.status === 'overdue') && (
                              <button onClick={() => { setMarkPaidId(inv.id); setActionMenuId(null); }}
                                className="w-full text-left px-4 py-2 text-xs text-emerald-400 hover:bg-[#2A2A2A]">Marquer payée</button>
                            )}
                            {isAdmin && inv._db_status !== 'paid' && inv._db_status !== 'cancelled' && (
                              <button onClick={() => { setCancelId(inv.id); setActionMenuId(null); }}
                                className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-[#2A2A2A]">Annuler</button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
          <span>{total} facture{total > 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded border border-[#333333] hover:bg-[#2A2A2A] disabled:opacity-40">
              ← Précédent
            </button>
            <span className="px-3 py-1">{page} / {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded border border-[#333333] hover:bg-[#2A2A2A] disabled:opacity-40">
              Suivant →
            </button>
          </div>
        </div>
      )}

      {/* Close action menu on outside click */}
      {actionMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setActionMenuId(null)} />
      )}

      {markPaidId && (
        <MarkPaidDialog
          invoiceId={markPaidId}
          onClose={() => setMarkPaidId(null)}
          onPaid={() => { setMarkPaidId(null); loadInvoices(); }}
        />
      )}
      {cancelId && (
        <CancelInvoiceDialog
          invoiceId={cancelId}
          onClose={() => setCancelId(null)}
          onCancelled={() => { setCancelId(null); loadInvoices(); }}
        />
      )}
    </div>
  );
}
