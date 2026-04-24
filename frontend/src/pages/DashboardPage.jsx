import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import DisbursementDetailModal from '../components/DisbursementDetailModal';
import LogisticsDashboard from './LogisticsDashboard';
import { formatMAD, formatMADShort, formatDate } from '../utils/format';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function thisMonthRange() {
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${last}` };
}

function fmtTime(d) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Stat card (alert style) ──────────────────────────────────────────────────

function AlertCard({ title, value, sub, color, to }) {
  const inner = (
    <div className={`rounded-xl border p-4 h-full transition-colors ${
      color === 'red'   ? 'border-red-800/60 bg-red-900/10 hover:bg-red-900/20' :
      color === 'amber' ? 'border-amber-800/60 bg-amber-900/10 hover:bg-amber-900/20' :
      color === 'green' ? 'border-emerald-800/60 bg-emerald-900/10 hover:bg-emerald-900/20' :
                          'border-[#333333] bg-[#242424] hover:bg-[#2A2A2A]'
    }`}>
      <p className={`text-xs font-medium ${
        color === 'red' ? 'text-red-400' : color === 'amber' ? 'text-amber-400' : color === 'green' ? 'text-emerald-400' : 'text-[#A1A1AA]'
      }`}>{title}</p>
      <p className={`text-2xl font-bold mt-1 ${
        color === 'red' ? 'text-red-300' : color === 'amber' ? 'text-amber-300' : color === 'green' ? 'text-emerald-300' : 'text-[#FAFAFA]'
      }`}>{value}</p>
      {sub && <p className="text-xs text-[#A1A1AA] mt-0.5">{sub}</p>}
    </div>
  );
  if (to) return <Link to={to} className="block h-full">{inner}</Link>;
  return inner;
}

// ─── Aged receivables bar ─────────────────────────────────────────────────────

const AR_SEGMENTS = [
  { key: 'current',  label: 'À terme',  color: '#10B981' },
  { key: '1_30',    label: '1-30j',    color: '#F59E0B' },
  { key: '31_60',   label: '31-60j',   color: '#F97316' },
  { key: '61_90',   label: '61-90j',   color: '#EF4444' },
  { key: '90_plus', label: '>90j',     color: '#991B1B' },
];

function AgedBar({ buckets, total }) {
  if (!total) return <p className="text-sm text-[#A1A1AA]">Aucune créance en cours.</p>;
  return (
    <div className="space-y-3">
      <div className="flex h-7 rounded-md overflow-hidden gap-px">
        {AR_SEGMENTS.map(({ key, color }) => {
          const pct = (buckets[key]?.total_cents || 0) / total * 100;
          if (pct < 0.5) return null;
          return (
            <div key={key} style={{ width: `${pct}%`, backgroundColor: color }}
              title={`${formatMAD(buckets[key]?.total_cents || 0)}`} />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {AR_SEGMENTS.map(({ key, label, color }) => {
          const b = buckets[key] || { count: 0, total_cents: 0 };
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-[#A1A1AA]">{label}</span>
              <span className="text-xs font-medium text-[#FAFAFA]">{formatMADShort(b.total_cents)}</span>
              {b.count > 0 && <span className="text-xs text-[#555555]">({b.count})</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin     = user?.role === 'admin';
  const isLogistics = user?.role === 'logistics';
  const canSee      = !isLogistics;

  if (isLogistics) return <LogisticsDashboard />;

  const [stats, setStats]             = useState(null);
  const [alerts, setAlerts]           = useState(null);
  const [agedAR, setAgedAR]           = useState(null);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  const [recentJobs, setRecentJobs]   = useState([]);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [detailId, setDetailId]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function loadAll() {
    const { from, to } = thisMonthRange();

    await Promise.allSettled([
      api.get('/disbursements/stats').then((r) => setStats(r.data)),
      api.get('/invoices/alerts').then((r) => setAlerts(r.data)),
      api.get('/invoices/aged-receivables').then((r) => setAgedAR(r.data)),
      api.get('/invoices', { params: { status: 'paid', payment_date_from: from, payment_date_to: to, page_size: 500 } })
        .then((r) => setPaidThisMonth(r.data.summary?.total_ttc_cents || 0)),
      api.get('/jobs', { params: { page_size: 5 } })
        .then((r) => setRecentJobs(r.data.items || [])),
      api.get('/invoices', { params: { page_size: 5 } })
        .then((r) => setRecentInvoices(r.data.items || [])),
      api.get('/jobs', { params: { unassigned: '1', page_size: '1' } })
        .then((r) => setUnassignedCount(r.data.total || 0)),
    ]);

    setLastRefresh(new Date());
  }

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 60000);
    return () => clearInterval(iv);
  }, []);

  const topClientsToRelance = (agedAR?.by_client || [])
    .filter((c) => c['1_30_cents'] + c['31_60_cents'] + c['61_90_cents'] + c['90_plus_cents'] > 0)
    .slice(0, 5);

  const JOB_STATUS_CLASS = {
    open:     'bg-blue-900/40 text-blue-300 border border-blue-800',
    released: 'bg-emerald-900/40 text-emerald-300 border border-emerald-800',
    invoiced: 'bg-amber-900/40 text-amber-300 border border-amber-800',
    paid:     'bg-emerald-700/60 text-white border border-emerald-600',
  };
  const JOB_STATUS_LABEL = { open:'Ouvert', released:'Livré', invoiced:'Facturé', paid:'Payé' };
  const INV_STATUS_BADGE = {
    draft:   'bg-zinc-700 text-zinc-300', sent:'bg-blue-900/40 text-blue-300',
    paid:    'bg-emerald-700/60 text-white', overdue:'bg-red-900/40 text-red-300', cancelled:'bg-zinc-800 text-zinc-500',
  };
  const INV_STATUS_LABEL = { draft:'Brouillon', sent:'Envoyée', paid:'Payée', overdue:'En retard', cancelled:'Annulée' };

  return (
    <div className="space-y-6">
      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">Tableau de bord</h1>
          <p className="text-sm text-[#A1A1AA] mt-0.5">Bonjour, {user?.name}</p>
        </div>
        <p className="text-xs text-[#555555]">Mis à jour à {fmtTime(lastRefresh)}</p>
      </div>

      {/* ── Row 1 — Alert cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AlertCard
          title="⚠ Alertes — Non facturés"
          value={stats?.red_flag_count ?? '…'}
          sub={stats?.red_flag_count > 0 ? formatMADShort(stats.red_flag_amount) : undefined}
          color={stats?.red_flag_count > 0 ? 'red' : 'default'}
          to="/app/decaissements?red_flag=1"
        />
        <AlertCard
          title="⌛ Reçus manquants"
          value={stats?.receipt_alert_count ?? '…'}
          color={stats?.receipt_alert_count > 0 ? 'amber' : 'default'}
          to="/app/decaissements"
        />
        {isAdmin && (
          <AlertCard
            title="📝 En attente de validation"
            value={stats?.pending_signature_count ?? '…'}
            sub={stats?.pending_signature_count > 0 ? formatMADShort(stats.pending_signature_amount) : undefined}
            color={stats?.pending_signature_count > 0 ? 'amber' : 'default'}
            to="/app/decaissements?status=pending_signature"
          />
        )}
        <AlertCard
          title="🔴 Factures en retard"
          value={alerts?.overdue?.count ?? '…'}
          sub={alerts?.overdue?.count > 0 ? formatMADShort(alerts.overdue.total_amount_cents) : undefined}
          color={alerts?.overdue?.count > 0 ? 'red' : 'default'}
          to="/app/factures?overdue_only=1"
        />
        <AlertCard
          title="📋 Dossiers non réclamés"
          value={unassignedCount}
          color={unassignedCount > 0 ? 'amber' : 'default'}
          to="/app/dossiers"
        />
      </div>

      {/* ── Row 2 — Financial pulse ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AlertCard
          title="💰 Encaissé ce mois"
          value={formatMADShort(paidThisMonth)}
          color={paidThisMonth > 0 ? 'green' : 'default'}
        />
        <AlertCard
          title="📤 À encaisser (en cours)"
          value={formatMADShort(agedAR?.total_outstanding_cents ?? 0)}
          color={agedAR?.total_outstanding_cents > 0 ? 'amber' : 'default'}
          to="/app/factures?status=sent"
        />
        <AlertCard
          title="📊 Décaissements ce mois"
          value={formatMADShort(stats?.this_month_total ?? 0)}
          color="default"
        />
      </div>

      {/* ── Row 3 — Aged receivables bar ── */}
      <div className="bg-[#242424] border border-[#333333] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">Créances par ancienneté</h2>
          {agedAR && (
            <span className="text-xs text-[#A1A1AA]">
              Total : <span className="text-[#FAFAFA] font-medium">{formatMAD(agedAR.total_outstanding_cents)}</span>
              {agedAR.total_overdue_cents > 0 && (
                <span className="text-red-400 ml-2">dont {formatMAD(agedAR.total_overdue_cents)} en retard</span>
              )}
            </span>
          )}
        </div>
        {agedAR
          ? <AgedBar buckets={agedAR.buckets} total={agedAR.total_outstanding_cents} />
          : <div className="h-7 rounded-md bg-[#333333] animate-pulse" />}
      </div>

      {/* ── Row 4 — Top clients to follow up ── */}
      {topClientsToRelance.length > 0 && (
        <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#333333]">
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Top clients à relancer</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#333333]">
                {['Client', 'Total dû', 'Dont en retard', '>90j'].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333333]">
              {topClientsToRelance.map((c) => (
                <tr key={c.client_id} className="hover:bg-[#2A2A2A] cursor-pointer transition-colors"
                  onClick={() => window.location.href = `/app/clients/${c.client_id}`}>
                  <td className="px-4 py-2.5 text-sm font-medium text-[#60A5FA] hover:underline">{c.client_name}</td>
                  <td className="px-4 py-2.5 text-sm font-mono text-[#FAFAFA]">{formatMADShort(c.total_cents)}</td>
                  <td className="px-4 py-2.5 text-sm font-mono text-amber-300">
                    {formatMADShort((c['1_30_cents'] || 0) + (c['31_60_cents'] || 0) + (c['61_90_cents'] || 0) + (c['90_plus_cents'] || 0))}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-mono text-red-400">
                    {c['90_plus_cents'] > 0 ? formatMADShort(c['90_plus_cents']) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Row 5 — Recent jobs + recent invoices ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent jobs */}
        <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#333333] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Dossiers récents</h2>
            <Link to="/app/dossiers" className="text-xs text-[#60A5FA] hover:underline">Voir tout →</Link>
          </div>
          {recentJobs.length === 0
            ? <p className="px-5 py-8 text-xs text-[#A1A1AA] text-center">Aucun dossier.</p>
            : <div className="divide-y divide-[#333333]">
                {recentJobs.map((j) => (
                  <Link key={j.id} to={`/app/dossiers/${j.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-[#2A2A2A] transition-colors">
                    <div>
                      <span className="font-mono text-xs text-[#60A5FA]">{j.dossier_number}</span>
                      <span className="text-xs text-[#A1A1AA] ml-2 max-w-[120px] truncate inline-block align-bottom">{j.client?.name}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${JOB_STATUS_CLASS[j.status] || 'bg-zinc-700 text-zinc-300'}`}>
                      {JOB_STATUS_LABEL[j.status] || j.status}
                    </span>
                  </Link>
                ))}
              </div>
          }
        </div>

        {/* Recent invoices */}
        <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#333333] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Factures récentes</h2>
            <Link to="/app/factures" className="text-xs text-[#60A5FA] hover:underline">Voir tout →</Link>
          </div>
          {recentInvoices.length === 0
            ? <p className="px-5 py-8 text-xs text-[#A1A1AA] text-center">Aucune facture.</p>
            : <div className="divide-y divide-[#333333]">
                {recentInvoices.map((inv) => (
                  <Link key={inv.id} to={`/app/factures/${inv.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-[#2A2A2A] transition-colors">
                    <div>
                      <span className="font-mono text-xs text-[#60A5FA]">{inv.facture_number}</span>
                      <span className="text-xs text-[#A1A1AA] ml-2 max-w-[100px] truncate inline-block align-bottom">{inv.client?.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-[#FAFAFA]">{formatMADShort(inv.total_ttc_cents)}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${INV_STATUS_BADGE[inv.status] || ''}`}>
                        {INV_STATUS_LABEL[inv.status] || inv.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
          }
        </div>
      </div>

      {detailId && (
        <DisbursementDetailModal disbursementId={detailId} onClose={() => setDetailId(null)} onUpdated={loadAll} />
      )}
    </div>
  );
}
