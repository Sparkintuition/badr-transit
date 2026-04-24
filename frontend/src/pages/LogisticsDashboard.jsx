import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import DisbursementDetailModal from '../components/DisbursementDetailModal';
import { formatMAD, formatDate } from '../utils/format';

function fmtAssignmentText(entry, userId) {
  const dn = entry.dossier_number;
  if (!entry.from_user_id && entry.to_user_id === userId) return `Dossier ${dn} — réclamé`;
  if (entry.from_user_id === userId && !entry.to_user_id) return `Dossier ${dn} — libéré`;
  if (entry.to_user_id === userId && entry.is_force_claim) return `Dossier ${dn} — réclamé de force`;
  if (entry.to_user_id === userId) return `Dossier ${dn} — transféré vers vous`;
  if (entry.from_user_id === userId) return `Dossier ${dn} — transféré à ${entry.to_user_name || '—'}`;
  return `Dossier ${dn} — modification`;
}

export default function LogisticsDashboard() {
  const { user } = useAuth();
  const [myJobs, setMyJobs]             = useState([]);
  const [myDisbs, setMyDisbs]           = useState([]);
  const [stats, setStats]               = useState(null);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [recentAssignments, setRecentAssignments] = useState([]);
  const [detailId, setDetailId] = useState(null);

  function load() {
    api.get('/jobs', { params: { page_size: '10', declarant_user_id: user?.id } })
      .then((r) => setMyJobs(r.data.items || [])).catch(() => {});
    api.get('/disbursements', { params: { page_size: '10' } })
      .then((r) => setMyDisbs(r.data.items || [])).catch(() => {});
    api.get('/disbursements/stats')
      .then((r) => setStats(r.data)).catch(() => {});
    api.get('/jobs', { params: { unassigned: '1', page_size: '1' } })
      .then((r) => setUnassignedCount(r.data.total || 0)).catch(() => {});
    api.get('/jobs/my-assignments', { params: { limit: '3' } })
      .then((r) => setRecentAssignments(r.data || [])).catch(() => {});
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  const openJobs = myJobs.filter((j) => ['open', 'released'].includes(j.status));
  const pendingDisbs = myDisbs.filter((d) => d.status === 'signed' && !d.receipt_path && !d.no_receipt_expected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#FAFAFA]">Mon tableau de bord</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">Bienvenue, {user?.name}</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#333333] bg-[#242424] p-4">
          <p className="text-xs font-medium text-[#A1A1AA]">Dossiers ouverts</p>
          <p className="text-2xl font-bold text-[#FAFAFA] mt-1">{openJobs.length}</p>
        </div>
        <div className={`rounded-xl border p-4 ${pendingDisbs.length > 0 ? 'border-amber-800/60 bg-amber-900/10' : 'border-[#333333] bg-[#242424]'}`}>
          <p className={`text-xs font-medium ${pendingDisbs.length > 0 ? 'text-amber-400' : 'text-[#A1A1AA]'}`}>
            Justificatifs à fournir
          </p>
          <p className={`text-2xl font-bold mt-1 ${pendingDisbs.length > 0 ? 'text-amber-300' : 'text-[#FAFAFA]'}`}>
            {pendingDisbs.length}
          </p>
        </div>
        <Link to="/app/dossiers" className={`col-span-2 rounded-xl border p-4 transition-colors ${
          unassignedCount > 0
            ? 'border-amber-800/60 bg-amber-900/10 hover:bg-amber-900/20'
            : 'border-[#333333] bg-[#242424] hover:bg-[#2A2A2A]'
        }`}>
          <p className={`text-xs font-medium ${unassignedCount > 0 ? 'text-amber-400' : 'text-[#A1A1AA]'}`}>
            ⚠ Dossiers non réclamés
          </p>
          <p className={`text-2xl font-bold mt-1 ${unassignedCount > 0 ? 'text-amber-300' : 'text-[#FAFAFA]'}`}>
            {unassignedCount}
          </p>
          {unassignedCount > 0 && (
            <p className="text-xs text-amber-500/80 mt-0.5">Cliquer pour voir les dossiers disponibles</p>
          )}
        </Link>
      </div>

      {/* My open jobs */}
      {myJobs.length > 0 && (
        <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#333333] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Mes dossiers</h2>
            <Link to="/app/dossiers" className="text-xs text-[#60A5FA] hover:underline">Voir tout →</Link>
          </div>
          <div className="divide-y divide-[#333333]">
            {myJobs.map((j) => (
              <Link key={j.id} to={`/app/dossiers/${j.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-[#2A2A2A] transition-colors">
                <div>
                  <span className="font-mono text-sm text-[#60A5FA]">{j.dossier_number}</span>
                  <span className="text-xs text-[#A1A1AA] ml-3">{j.client?.name}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  j.status === 'open' ? 'bg-blue-900/40 text-blue-300 border border-blue-800' :
                  j.status === 'released' ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800' :
                  'bg-zinc-700 text-zinc-300'
                }`}>{j.status === 'open' ? 'Ouvert' : j.status === 'released' ? 'Livré' : j.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* My disbursements */}
      {myDisbs.length > 0 && (
        <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#333333] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Mes décaissements récents</h2>
            <Link to="/app/decaissements" className="text-xs text-[#60A5FA] hover:underline">Voir tout →</Link>
          </div>
          <div className="divide-y divide-[#333333]">
            {myDisbs.map((d) => (
              <button key={d.id} type="button" onClick={() => setDetailId(d.id)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#2A2A2A] transition-colors text-left">
                <div>
                  <span className="text-sm text-[#FAFAFA]">{d.type}</span>
                  <span className="text-xs text-[#A1A1AA] ml-2">{d.job?.dossier_number}</span>
                </div>
                <span className="text-sm font-medium text-[#FAFAFA]">{formatMAD(d.amount_cents)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent assignment activity */}
      {recentAssignments.length > 0 && (
        <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#333333]">
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Activité récente sur mes dossiers</h2>
          </div>
          <div className="divide-y divide-[#333333]">
            {recentAssignments.map((entry) => (
              <Link key={entry.id} to={`/app/dossiers/${entry.job_id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-[#2A2A2A] transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  {entry.is_force_claim
                    ? <span className="text-amber-400 text-xs">⚡</span>
                    : <span className="text-zinc-500 text-xs">→</span>}
                  <span className="text-sm text-zinc-300 truncate">{fmtAssignmentText(entry, user?.id)}</span>
                </div>
                <span className="text-xs text-[#A1A1AA] whitespace-nowrap ml-3">{formatDate(entry.changed_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {myJobs.length === 0 && myDisbs.length === 0 && recentAssignments.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#333333] bg-[#242424] py-16 text-center text-[#A1A1AA]">
          <p className="text-sm">Aucune activité récente.</p>
        </div>
      )}

      {detailId && (
        <DisbursementDetailModal disbursementId={detailId} onClose={() => setDetailId(null)} onUpdated={load} />
      )}
    </div>
  );
}
