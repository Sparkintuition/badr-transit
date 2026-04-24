import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';
import api from '../api';

const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] focus:border-transparent';
const labelClass = 'block text-sm font-medium text-zinc-300 mb-1';

const EMPTY_FORM = { name: '', phone: '', notes: '' };

function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div ref={ref} className="bg-[#242424] rounded-2xl border border-[#333333] shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[#FAFAFA]">{title}</h2>
          <button onClick={onClose} className="text-[#A1A1AA] hover:text-[#FAFAFA] text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function CommisAgentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const loadAgents = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (includeInactive) params.set('include_inactive', '1');
    if (search.trim()) params.set('search', search.trim());
    api.get(`/commis-agents?${params}`)
      .then((r) => setAgents(r.data))
      .catch(() => toast.error('Impossible de charger les commis.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAgents(); }, [search, includeInactive]);

  const openCreate = () => { setForm(EMPTY_FORM); setErrors({}); setModal({ mode: 'create' }); };
  const openEdit = (agent) => {
    setForm({ name: agent.name, phone: agent.phone || '', notes: agent.notes || '' });
    setErrors({});
    setModal({ mode: 'edit', agent });
  };

  const field = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setErrors({ name: 'Le nom est requis.' }); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (modal.mode === 'create') {
        await api.post('/commis-agents', body);
        toast.success('Commis créé.');
      } else {
        await api.put(`/commis-agents/${modal.agent.id}`, body);
        toast.success('Commis mis à jour.');
      }
      setModal(null);
      loadAgents();
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setErrors(data.errors);
      else toast.error(data?.error || 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (agent) => {
    try {
      await api.patch(`/commis-agents/${agent.id}/status`, { active: !agent.active });
      toast.success(agent.active ? 'Commis désactivé.' : 'Commis réactivé.');
      loadAgents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur.');
    }
  };

  const handleDelete = async (agent) => {
    if (!window.confirm(`Supprimer "${agent.name}" définitivement ?`)) return;
    try {
      await api.delete(`/commis-agents/${agent.id}`);
      toast.success('Commis supprimé.');
      loadAgents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur.');
    }
  };

  return (
    <div>
      {/* Info banner */}
      <div className="mb-5 px-4 py-3 rounded-xl bg-blue-900/20 border border-blue-800/40 text-sm text-blue-300">
        Cette section sera utilisée prochainement. Pour l'instant, saisissez les noms de commis directement lors de la création d'un dossier.
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">Commis</h1>
          <p className="text-sm text-[#A1A1AA] mt-1">Agents externes (porteurs, coursiers douane)</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          + Nouveau commis
        </button>
      </div>

      {/* Filters */}
      <div className="bg-[#242424] rounded-xl border border-[#333333] p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom…"
          className="px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] flex-1 min-w-48"
        />
        <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300 select-none">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-[#333333] bg-[#2A2A2A] focus:ring-[#3B5BDB]" />
          Inclure les inactifs
        </label>
      </div>

      {/* Table */}
      <div className="bg-[#242424] rounded-xl border border-[#333333] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#333333] bg-[#2A2A2A]">
              {['Nom', 'Téléphone', 'Dossiers', 'Statut', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#333333]">
            {loading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[#A1A1AA] text-sm">Chargement…</td></tr>
            )}
            {!loading && agents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <p className="text-[#A1A1AA] text-sm">Aucun commis enregistré.</p>
                </td>
              </tr>
            )}
            {!loading && agents.map((a) => (
              <tr key={a.id} className="hover:bg-[#2A2A2A] transition-colors">
                <td className="px-4 py-3 font-medium text-[#FAFAFA]">{a.name}</td>
                <td className="px-4 py-3 text-[#A1A1AA] text-xs font-mono">{a.phone || '—'}</td>
                <td className="px-4 py-3 text-zinc-300">{a.jobs_count}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    a.active
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-[#333333] text-[#A1A1AA]'
                  }`}>
                    {a.active ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(a)}
                      className="text-xs text-[#60A5FA] hover:underline font-medium">
                      Modifier
                    </button>
                    <button
                      onClick={() => handleToggleActive(a)}
                      className={`text-xs font-medium ${a.active ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                    >
                      {a.active ? 'Désactiver' : 'Réactiver'}
                    </button>
                    {isAdmin && (
                      <button onClick={() => handleDelete(a)}
                        className="text-xs text-red-400 hover:text-red-300 font-medium">
                        Supprimer
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit modal */}
      {modal && (
        <Modal
          title={modal.mode === 'create' ? 'Nouveau commis' : 'Modifier le commis'}
          onClose={() => setModal(null)}
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nom <span className="text-red-400">*</span></label>
              <input type="text" value={form.name} onChange={field('name')} className={inputClass} autoFocus />
              {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className={labelClass}>Téléphone</label>
              <input type="tel" value={form.phone} onChange={field('phone')} className={inputClass} placeholder="0600000000" />
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <textarea value={form.notes} onChange={field('notes')} rows={3}
                className={`${inputClass} resize-none`} placeholder="Informations complémentaires…" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(null)}
                className="flex-1 py-2 border border-[#333333] text-sm font-medium text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
                Annuler
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="flex-1 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
