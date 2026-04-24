import { useEffect, useState } from 'react';
import api from '../api';
import { formatDateTime } from '../utils/format';

const ACTION_BADGE = {
  create:   'bg-emerald-900/40 text-emerald-300 border border-emerald-800',
  update:   'bg-blue-900/40 text-blue-300 border border-blue-800',
  delete:   'bg-red-900/40 text-red-300 border border-red-800',
  validate: 'bg-amber-900/40 text-amber-300 border border-amber-800',
  sign:     'bg-amber-900/40 text-amber-300 border border-amber-800',
  cancel:   'bg-red-900/40 text-red-300 border border-red-800',
  pay:      'bg-emerald-900/40 text-emerald-300 border border-emerald-800',
  send:     'bg-blue-900/40 text-blue-300 border border-blue-800',
  archive:  'bg-zinc-800 text-zinc-400',
  restore:  'bg-zinc-800 text-zinc-300',
  login:    'bg-zinc-800 text-zinc-300',
};

const ENTITY_LINKS = {
  client:      (id) => `/app/clients/${id}`,
  job:         (id) => `/app/dossiers/${id}`,
  invoice:     (id) => `/app/factures/${id}`,
  disbursement: (id) => `/app/decaissements`,
};

function DiffPanel({ oldVal, newVal, onClose }) {
  if (!oldVal && !newVal) return null;

  const allKeys = new Set([
    ...Object.keys(oldVal || {}),
    ...Object.keys(newVal || {}),
  ]);

  const changed = [...allKeys].filter((k) => {
    const o = JSON.stringify((oldVal || {})[k]);
    const n = JSON.stringify((newVal || {})[k]);
    return o !== n;
  });

  const unchanged = [...allKeys].filter((k) => !changed.includes(k));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1A1A1A] border border-[#333333] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#333333]">
          <p className="text-sm font-semibold text-[#FAFAFA]">Détail des modifications</p>
          <button onClick={onClose} className="text-[#A1A1AA] hover:text-[#FAFAFA] text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-1 text-xs font-mono">
          {changed.length > 0 && (
            <>
              <p className="text-[#A1A1AA] uppercase tracking-wider text-[10px] mb-2">Modifié</p>
              {changed.map((k) => (
                <div key={k} className="grid grid-cols-[120px_1fr_1fr] gap-2 py-1 border-b border-[#2A2A2A]">
                  <span className="text-zinc-500">{k}</span>
                  <span className="text-red-400 line-through break-all">
                    {oldVal && (oldVal)[k] !== undefined ? JSON.stringify((oldVal)[k]) : '—'}
                  </span>
                  <span className="text-emerald-400 break-all">
                    {newVal && (newVal)[k] !== undefined ? JSON.stringify((newVal)[k]) : '—'}
                  </span>
                </div>
              ))}
            </>
          )}
          {unchanged.length > 0 && (
            <details className="mt-3">
              <summary className="text-[#A1A1AA] cursor-pointer text-[10px] uppercase tracking-wider">
                Inchangé ({unchanged.length})
              </summary>
              <div className="mt-2 space-y-1">
                {unchanged.map((k) => (
                  <div key={k} className="grid grid-cols-[120px_1fr] gap-2 py-1 border-b border-[#2A2A2A]">
                    <span className="text-zinc-500">{k}</span>
                    <span className="text-zinc-400 break-all">
                      {JSON.stringify((oldVal || newVal || {})[k])}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {changed.length === 0 && unchanged.length === 0 && (
            <p className="text-[#A1A1AA]">Aucun détail disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'Toutes les entités' },
  { value: 'client', label: 'Client' },
  { value: 'job', label: 'Dossier' },
  { value: 'disbursement', label: 'Décaissement' },
  { value: 'invoice', label: 'Facture' },
  { value: 'user', label: 'Utilisateur' },
  { value: 'service_charge', label: 'Prestation' },
  { value: 'setting', label: 'Paramètre' },
];

export default function AuditLogPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  const [diffEntry, setDiffEntry] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      if (entityType) params.entity_type = entityType;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const r = await api.get('/audit-log', { params });
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [search, entityType, dateFrom, dateTo, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#FAFAFA]">Journal d'audit</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">Historique de toutes les actions effectuées dans le système</p>
      </div>

      {/* Filters */}
      <div className="bg-[#242424] border border-[#333333] rounded-xl p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Rechercher (action, entité, utilisateur)…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 min-w-48 px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
          />
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
          >
            {ENTITY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#A1A1AA]">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
            />
            <label className="text-xs text-[#A1A1AA]">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
            />
          </div>
          {(search || entityType || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearch(''); setEntityType(''); setDateFrom(''); setDateTo(''); setPage(1); }}
              className="px-3 py-2 text-xs text-[#A1A1AA] hover:text-[#FAFAFA] border border-[#333333] rounded-lg hover:bg-[#2A2A2A]"
            >
              Effacer filtres ×
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#A1A1AA]">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#A1A1AA]">Aucune entrée trouvée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#333333]">
                  {['Date / Heure', 'Utilisateur', 'Action', 'Entité', 'Détails'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {items.map((entry) => {
                  const link = ENTITY_LINKS[entry.entity_type]?.(entry.entity_id);
                  const hasDiff = entry.old_value || entry.new_value;
                  return (
                    <tr key={entry.id} className="hover:bg-[#2A2A2A] transition-colors">
                      <td className="px-4 py-2.5 text-xs text-[#A1A1AA] whitespace-nowrap">
                        {formatDateTime(entry.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#FAFAFA]">
                        {entry.user_name || <span className="text-[#555555]">système</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_BADGE[entry.action] || 'bg-zinc-800 text-zinc-400'}`}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="text-[#A1A1AA]">{entry.entity_type} </span>
                        {link ? (
                          <a href={link} className="text-[#60A5FA] hover:underline">
                            {entry.entity_display}
                          </a>
                        ) : (
                          <span className="text-[#FAFAFA]">{entry.entity_display}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {hasDiff && (
                          <button
                            onClick={() => setDiffEntry(entry)}
                            className="text-xs text-[#60A5FA] hover:underline"
                          >
                            Voir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
          <span>{total} entrée{total > 1 ? 's' : ''}</span>
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

      {diffEntry && (
        <DiffPanel
          oldVal={diffEntry.old_value}
          newVal={diffEntry.new_value}
          onClose={() => setDiffEntry(null)}
        />
      )}
    </div>
  );
}
