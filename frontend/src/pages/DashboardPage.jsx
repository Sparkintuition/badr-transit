import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import DisbursementDetailModal from '../components/DisbursementDetailModal';
import { formatMAD, formatMADShort, DISBURSEMENT_STATUS_LABEL } from '../utils/format';

const ROLE_LABEL = { admin: 'Administrateur', accountant: 'Comptable', logistics: 'Agent logistique' };

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, color, to }) {
  const inner = (
    <div className={`rounded-xl border p-4 transition-colors h-full ${
      color === 'red'   ? 'border-red-800/60 bg-red-900/10 hover:bg-red-900/20' :
      color === 'amber' ? 'border-amber-800/60 bg-amber-900/10 hover:bg-amber-900/20' :
                          'border-[#333333] bg-[#242424] hover:bg-[#2A2A2A]'
    }`}>
      <p className={`text-xs font-medium ${color === 'red' ? 'text-red-400' : color === 'amber' ? 'text-amber-400' : 'text-[#A1A1AA]'}`}>
        {title}
      </p>
      <p className={`text-2xl font-bold mt-1 ${color === 'red' ? 'text-red-300' : color === 'amber' ? 'text-amber-300' : 'text-[#FAFAFA]'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-[#A1A1AA] mt-0.5">{sub}</p>}
    </div>
  );
  if (to) return <Link to={to} className="block">{inner}</Link>;
  return inner;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  pending_signature: 'bg-blue-900/40 text-blue-300 border border-blue-800',
  signed:            'bg-amber-900/40 text-amber-300 border border-amber-800',
  invoiced:          'bg-emerald-900/40 text-emerald-300 border border-emerald-800',
  reimbursed:        'bg-emerald-700/60 text-white border border-emerald-600',
  cancelled:         'bg-red-900/40 text-red-300 border border-red-800',
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isAccountant = user?.role === 'accountant';
  const isLogistics = user?.role === 'logistics';
  const canSeeFinancial = isAdmin || isAccountant;

  const [stats, setStats] = useState(null);
  const [invoiceAlerts, setInvoiceAlerts] = useState(null);
  const [recentSigned, setRecentSigned] = useState([]);
  const [topClients, setTopClients] = useState([]);
  const [myJobs, setMyJobs] = useState([]);
  const [myDisbs, setMyDisbs] = useState([]);
  const [detailId, setDetailId] = useState(null);

  function refreshStats() {
    api.get('/disbursements/stats').then((r) => setStats(r.data)).catch(() => {});
    api.get('/invoices/alerts').then((r) => setInvoiceAlerts(r.data)).catch(() => {});
  }

  useEffect(() => {
    if (canSeeFinancial) {
      refreshStats();

      api.get('/disbursements', {
        params: { status: 'signed', page_size: '5' },
      }).then((r) => setRecentSigned(r.data.items || [])).catch(() => {});

      api.get('/disbursements', {
        params: { status: 'signed', page_size: '200' },
      }).then((r) => {
        const byClient = {};
        for (const d of (r.data.items || [])) {
          if (!d.invoice_id) {
            const key = d.job.client.id;
            if (!byClient[key]) byClient[key] = { name: d.job.client.name, total: 0 };
            byClient[key].total += d.amount_cents;
          }
        }
        setTopClients(Object.values(byClient).sort((a, b) => b.total - a.total).slice(0, 5));
      }).catch(() => {});
    }

    if (isLogistics) {
      api.get('/jobs', { params: { page_size: '10' } })
        .then((r) => setMyJobs(r.data.items || [])).catch(() => {});
      api.get('/disbursements', { params: { page_size: '10' } })
        .then((r) => setMyDisbs(r.data.items || [])).catch(() => {});
    }
  }, [canSeeFinancial, isLogistics]);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-[#FAFAFA]">Tableau de bord</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">
          Bienvenue, {user?.name} — {ROLE_LABEL[user?.role]}
        </p>
      </div>

      {/* Admin / Accountant */}
      {canSeeFinancial && stats && (
        <>
          {/* Row 1 — key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {invoiceAlerts && (
              <>
                <StatCard
                  title="⚠ Factures en retard"
                  value={invoiceAlerts.overdue?.count ?? 0}
                  sub={invoiceAlerts.overdue?.count > 0 ? formatMADShort(invoiceAlerts.overdue.total_amount_cents) : undefined}
                  color={invoiceAlerts.overdue?.count > 0 ? 'red' : 'default'}
                  to="/app/factures?overdue_only=1"
                />
                <StatCard
                  title="À encaisser"
                  value={invoiceAlerts.due_soon?.count > 0 ? `${invoiceAlerts.due_soon.count} proches` : '—'}
                  color={invoiceAlerts.due_soon?.count > 0 ? 'amber' : 'default'}
                  to="/app/factures?status=sent"
                />
              </>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard
              title="À valider"
              value={stats.pending_signature_count}
              sub={formatMADShort(stats.pending_signature_amount)}
              color={stats.pending_signature_count > 0 ? 'amber' : 'default'}
              to="/app/decaissements?status=pending_signature"
            />
            <StatCard
              title="Validés non facturés"
              value={stats.signed_uninvoiced_count}
              sub={stats.signed_uninvoiced_count > 0 ? formatMADShort(stats.signed_uninvoiced_amount) : undefined}
              color="default"
              to="/app/decaissements?status=signed"
            />
            <StatCard
              title="⚠ Alertes — Non facturés"
              value={stats.red_flag_count}
              sub={stats.red_flag_count > 0 ? formatMADShort(stats.red_flag_amount) : undefined}
              color={stats.red_flag_count > 0 ? 'red' : 'default'}
              to="/app/decaissements?red_flag=1"
            />
            <StatCard
              title="⚠ Alertes — Reçus manquants"
              value={stats.receipt_alert_count}
              sub={stats.receipt_alert_count > 0 ? formatMADShort(stats.receipt_alert_amount) : undefined}
              color={stats.receipt_alert_count > 0 ? 'amber' : 'default'}
              to="/app/decaissements"
            />
            <StatCard
              title="Décaissements ce mois"
              value={formatMADShort(stats.this_month_total)}
              color="default"
            />
          </div>

          {/* Row 2 — Recent signed not invoiced */}
          {recentSigned.length > 0 && (
            <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#333333] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#FAFAFA]">Récents — validés non facturés</h2>
                <Link to="/app/decaissements?status=signed" className="text-xs text-[#60A5FA] hover:underline">
                  Voir tout →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#333333]">
                      {['Dossier', 'Client', 'Type', 'Montant', 'Statut', 'Âge'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {recentSigned.map((d) => (
                      <tr key={d.id} onClick={() => setDetailId(d.id)}
                        className={`cursor-pointer hover:bg-[#2A2A2A] transition-colors ${d.is_red_flag_invoice ? 'border-l-4 border-red-500' : 'border-l-4 border-amber-500'}`}>
                        <td className="px-4 py-2.5 font-mono text-xs text-[#60A5FA]">{d.job.dossier_number}</td>
                        <td className="px-4 py-2.5 text-xs text-[#A1A1AA] max-w-[100px] truncate">{d.job.client.name}</td>
                        <td className="px-4 py-2.5 text-xs text-[#FAFAFA]">{d.type}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-right text-[#FAFAFA] whitespace-nowrap">{formatMAD(d.amount_cents)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[d.status] || ''}`}>
                            {DISBURSEMENT_STATUS_LABEL[d.status]}
                            {d.is_red_flag_invoice && ' 🔴'}
                          </span>
                        </td>
                        <td className={`px-4 py-2.5 text-xs ${d.is_red_flag ? 'text-red-400 font-medium' : 'text-amber-400'}`}>
                          {d.days_since_signed != null ? `${d.days_since_signed}j` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Row 3 — Top clients with outstanding */}
          {topClients.length > 0 && (
            <div className="bg-[#242424] border border-[#333333] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-[#FAFAFA] mb-4">Top 5 clients — montants non facturés</h2>
              <div className="space-y-3">
                {topClients.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="text-xs text-[#555555] w-4">{i + 1}</span>
                    <span className="flex-1 text-sm text-[#FAFAFA] truncate">{c.name}</span>
                    <span className="text-sm font-medium text-amber-300">{formatMAD(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Loading state */}
      {canSeeFinancial && !stats && (
        <div className="rounded-xl border border-dashed border-[#333333] bg-[#242424] py-16 text-center text-[#A1A1AA]">
          <p className="text-sm">Chargement…</p>
        </div>
      )}

      {/* Logistics view */}
      {isLogistics && (
        <div className="space-y-5">
          {myJobs.length > 0 && (
            <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#333333]">
                <h2 className="text-sm font-semibold text-[#FAFAFA]">Mes dossiers</h2>
              </div>
              <div className="divide-y divide-[#333333]">
                {myJobs.map((j) => (
                  <Link key={j.id} to={`/app/dossiers/${j.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-[#2A2A2A] transition-colors">
                    <span className="font-mono text-sm text-[#60A5FA]">{j.dossier_number}</span>
                    <span className="text-xs text-[#A1A1AA]">{j.client.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {myDisbs.length > 0 && (
            <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#333333]">
                <h2 className="text-sm font-semibold text-[#FAFAFA]">Mes décaissements</h2>
              </div>
              <div className="divide-y divide-[#333333]">
                {myDisbs.map((d) => (
                  <button key={d.id} type="button" onClick={() => setDetailId(d.id)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#2A2A2A] transition-colors text-left">
                    <div>
                      <span className="text-sm text-[#FAFAFA]">{d.type}</span>
                      <span className="text-xs text-[#A1A1AA] ml-2">{d.job.dossier_number}</span>
                    </div>
                    <span className="text-sm font-medium text-[#FAFAFA]">{formatMAD(d.amount_cents)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {myJobs.length === 0 && myDisbs.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#333333] bg-[#242424] py-16 text-center text-[#A1A1AA]">
              <p className="text-sm">Aucune activité récente.</p>
            </div>
          )}
        </div>
      )}

      {detailId && (
        <DisbursementDetailModal
          disbursementId={detailId}
          onClose={() => setDetailId(null)}
          onUpdated={refreshStats}
        />
      )}
    </div>
  );
}
