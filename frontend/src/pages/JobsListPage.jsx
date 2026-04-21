import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import { formatDate, jobStatusLabel, jobStatusBadgeClass } from '../utils/format';
import JobFormModal from './JobFormModal';

const inputClass = 'px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] focus:border-transparent';

const TYPE_PILLS = [
  { value: '', label: 'Tous' },
  { value: 'import', label: 'Import' },
  { value: 'export', label: 'Export' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'open', label: 'Ouvert' },
  { value: 'released', label: 'Livré' },
  { value: 'invoiced', label: 'Facturé' },
  { value: 'paid', label: 'Payé' },
  { value: 'cancelled', label: 'Annulé' },
];

export default function JobsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isLogistics = user?.role === 'logistics';

  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [commisFilter, setCommisFilter] = useState(isLogistics ? String(user.id) : '');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [viewAll, setViewAll] = useState(false); // logistics: toggle to see all

  const [clients, setClients] = useState([]);
  const [logisticsUsers, setLogisticsUsers] = useState([]);
  const [createModal, setCreateModal] = useState(false);

  useEffect(() => {
    api.get('/clients?include_inactive=0').then((r) => setClients(r.data)).catch(() => {});
    api.get('/auth/logistics-users').then((r) => setLogisticsUsers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset commis filter when logistics user toggles viewAll
  useEffect(() => {
    if (isLogistics) setCommisFilter(viewAll ? '' : String(user.id));
  }, [viewAll, isLogistics, user?.id]);

  const loadJobs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (typeFilter) params.set('type', typeFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (clientFilter) params.set('client_id', clientFilter);
    if (commisFilter) params.set('commis_user_id', commisFilter);
    if (includeArchived) params.set('include_archived', '1');

    api.get(`/jobs?${params}`)
      .then((r) => { setJobs(r.data.items); setTotal(r.data.total); })
      .catch(() => toast.error('Impossible de charger les dossiers.'))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, typeFilter, statusFilter, clientFilter, commisFilter, includeArchived]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">Dossiers</h1>
          <p className="text-sm text-[#A1A1AA] mt-1">Gérez vos dossiers import/export</p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          + Nouveau dossier
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-[#242424] rounded-xl border border-[#333333] p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par N° dossier, DUM ou expéditeur…"
            className={`${inputClass} flex-1 min-w-48`}
          />
          {/* Type pills */}
          <div className="flex gap-1">
            {TYPE_PILLS.map((p) => (
              <button key={p.value} onClick={() => { setTypeFilter(p.value); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  typeFilter === p.value
                    ? 'bg-[#1E3A8A] border-[#1E3A8A] text-white'
                    : 'border-[#333333] text-zinc-300 hover:border-[#555555]'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Status */}
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className={`${inputClass} w-44`}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Client */}
          <select value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
            className={`${inputClass} w-48`}>
            <option value="">Tous les clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Commis (admin/accountant only) */}
          {!isLogistics && (
            <select value={commisFilter} onChange={(e) => { setCommisFilter(e.target.value); setPage(1); }}
              className={`${inputClass} w-44`}>
              <option value="">Tous les commis</option>
              {logisticsUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}

          <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300 select-none">
            <input type="checkbox" checked={includeArchived}
              onChange={(e) => { setIncludeArchived(e.target.checked); setPage(1); }}
              className="rounded border-[#333333] bg-[#2A2A2A] focus:ring-[#3B5BDB]" />
            Inclure les archivés
          </label>

          {/* Logistics: toggle view all */}
          {isLogistics && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300 select-none">
              <input type="checkbox" checked={viewAll} onChange={(e) => setViewAll(e.target.checked)}
                className="rounded border-[#333333] bg-[#2A2A2A] focus:ring-[#3B5BDB]" />
              Tous les dossiers
            </label>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#242424] rounded-xl border border-[#333333] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#333333] bg-[#2A2A2A]">
              {['N° Dossier', 'Type', 'Client', 'Commis', 'DUM(s)', 'Progression', 'Statut', 'Créé le'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#333333]">
            {loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#A1A1AA] text-sm">Chargement…</td></tr>
            )}
            {!loading && jobs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <p className="text-[#A1A1AA] text-sm">
                    {debouncedSearch || typeFilter || statusFilter || clientFilter
                      ? 'Aucun dossier ne correspond à votre recherche.'
                      : 'Aucun dossier. Créez votre premier dossier import ou export.'}
                  </p>
                </td>
              </tr>
            )}
            {!loading && jobs.map((job) => (
              <tr key={job.id} className="hover:bg-[#2A2A2A] transition-colors cursor-pointer"
                onClick={() => navigate(`/app/dossiers/${job.id}`)}>
                {/* N° Dossier */}
                <td className="px-4 py-3">
                  <span className="font-semibold text-[#FAFAFA] font-mono text-xs">{job.dossier_number}</span>
                </td>
                {/* Type */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    job.type === 'import'
                      ? 'bg-blue-900/40 text-blue-300 border border-blue-800'
                      : 'bg-amber-900/40 text-amber-300 border border-amber-800'
                  }`}>
                    {job.type === 'import' ? 'Import' : 'Export'}
                  </span>
                </td>
                {/* Client */}
                <td className="px-4 py-3 text-zinc-300 max-w-[160px] truncate">{job.client?.name || '—'}</td>
                {/* Commis */}
                <td className="px-4 py-3 text-[#A1A1AA] text-xs">{job.commis_user?.name || '—'}</td>
                {/* DUM(s) */}
                <td className="px-4 py-3">
                  {job.dums.length === 0
                    ? <span className="text-[#A1A1AA]">—</span>
                    : <span className="font-mono text-xs text-zinc-300">
                        {job.dums[0].dum_number}
                        {job.dums.length > 1 && <span className="text-[#A1A1AA] ml-1">+{job.dums.length - 1}</span>}
                      </span>}
                </td>
                {/* Progression */}
                <td className="px-4 py-3">
                  <div>
                    <span className="text-xs text-zinc-300">{job.milestones_completed}/{job.milestones_total}</span>
                    <div className="mt-1 h-1.5 bg-[#333333] rounded-full overflow-hidden w-20">
                      <div className="h-full bg-[#F59E0B] rounded-full transition-all"
                        style={{ width: `${job.milestones_total > 0 ? (job.milestones_completed / job.milestones_total) * 100 : 0}%` }} />
                    </div>
                  </div>
                </td>
                {/* Statut */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${jobStatusBadgeClass(job.status, job.archived)}`}>
                    {jobStatusLabel(job.status, job.archived)}
                  </span>
                </td>
                {/* Créé le */}
                <td className="px-4 py-3 text-[#A1A1AA] text-xs whitespace-nowrap">{formatDate(job.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-[#A1A1AA]">{total} dossier{total > 1 ? 's' : ''}</p>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-300 rounded-lg hover:bg-[#2A2A2A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              ← Préc.
            </button>
            <span className="text-sm text-zinc-300">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-300 rounded-lg hover:bg-[#2A2A2A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Suiv. →
            </button>
          </div>
        </div>
      )}

      {createModal && (
        <JobFormModal
          mode="create"
          onClose={() => setCreateModal(false)}
          onSaved={(job) => {
            setCreateModal(false);
            loadJobs();
            if (job?.id) navigate(`/app/dossiers/${job.id}`);
          }}
        />
      )}
    </div>
  );
}
