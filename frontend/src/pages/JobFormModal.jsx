import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] focus:border-transparent';
const labelClass = 'block text-sm font-medium text-zinc-300 mb-1';

const EMPTY_FORM = {
  type: 'import',
  dossier_number: '',
  client_id: '',
  commis_user_id: '',
  inspecteur: '',
  recu_le: '',
  expediteur_exportateur: '',
  nombre_colis_tc: '',
  poids_brut_kg: '',
  nature_marchandise: '',
  bureau: '',
  depot_sequence_date: '',
  arrival_date: '',
  compagnie_transport: '',
  observations: '',
};

function fromJob(job) {
  return {
    type: job.type,
    dossier_number: job.dossier_number ?? '',
    client_id: String(job.client_id ?? job.client?.id ?? ''),
    commis_user_id: String(job.commis_user_id ?? job.commis_user?.id ?? ''),
    inspecteur: job.inspecteur ?? '',
    recu_le: job.recu_le ?? '',
    expediteur_exportateur: job.expediteur_exportateur ?? '',
    nombre_colis_tc: job.nombre_colis_tc ?? '',
    poids_brut_kg: job.poids_brut_kg != null ? String(job.poids_brut_kg) : '',
    nature_marchandise: job.nature_marchandise ?? '',
    bureau: job.bureau ?? '',
    depot_sequence_date: job.depot_sequence_date ?? '',
    arrival_date: job.arrival_date ?? '',
    compagnie_transport: job.compagnie_transport ?? '',
    observations: job.observations ?? '',
  };
}

export default function JobFormModal({ mode, job, onClose, onSaved }) {
  const [form, setForm] = useState(mode === 'edit' && job ? fromJob(job) : EMPTY_FORM);
  const [clients, setClients] = useState([]);
  const [logisticsUsers, setLogisticsUsers] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const ref = useRef();

  useEffect(() => {
    api.get('/clients?include_inactive=0').then((r) => setClients(r.data)).catch(() => {});
    api.get('/auth/logistics-users').then((r) => setLogisticsUsers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFieldErrors((err) => ({ ...err, [k]: undefined, _: undefined }));
  };

  const setType = (t) => {
    setForm((f) => ({ ...f, type: t }));
    setFieldErrors((err) => ({ ...err, type: undefined }));
  };

  const fillAutoNumber = async () => {
    try {
      const r = await api.get('/settings/next-dossier-number');
      setForm((f) => ({ ...f, dossier_number: r.data.value }));
    } catch {
      toast.error('Impossible de récupérer le numéro suivant.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});

    const body = {
      type: form.type,
      client_id: form.client_id ? parseInt(form.client_id, 10) : null,
      commis_user_id: form.commis_user_id ? parseInt(form.commis_user_id, 10) : null,
      dossier_number: form.dossier_number.trim() || null,
      inspecteur: form.inspecteur || null,
      recu_le: form.recu_le || null,
      expediteur_exportateur: form.expediteur_exportateur || null,
      nombre_colis_tc: form.nombre_colis_tc || null,
      poids_brut_kg: form.poids_brut_kg ? parseFloat(form.poids_brut_kg) : null,
      nature_marchandise: form.nature_marchandise || null,
      bureau: form.bureau || null,
      depot_sequence_date: form.depot_sequence_date || null,
      arrival_date: form.arrival_date || null,
      compagnie_transport: form.compagnie_transport || null,
      observations: form.observations || null,
    };

    if (mode === 'create') body.dums = [];

    setSaving(true);
    try {
      if (mode === 'create') {
        await api.post('/jobs', body);
        toast.success('Dossier créé ✓');
      } else {
        await api.put(`/jobs/${job.id}`, body);
        toast.success('Dossier mis à jour ✓');
      }
      onSaved();
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setFieldErrors(data.errors);
      else setFieldErrors({ _: data?.error || 'Une erreur est survenue.' });
    } finally {
      setSaving(false);
    }
  };

  const expedLabel = form.type === 'import' ? 'Expéditeur' : 'Exportateur';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 overflow-y-auto">
      <div ref={ref} className="bg-[#242424] rounded-2xl border border-[#333333] shadow-xl w-full max-w-3xl my-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#333333]">
          <h2 className="text-lg font-semibold text-[#FAFAFA]">
            {mode === 'create' ? 'Nouveau dossier' : `Modifier — ${job?.dossier_number}`}
          </h2>
          <button onClick={onClose} className="text-[#A1A1AA] hover:text-[#FAFAFA] text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">

          {/* Section 1: Type & Identification */}
          <div>
            <p className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider mb-3">Type &amp; Identification</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {['import', 'export'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => mode !== 'edit' && setType(t)}
                  disabled={mode === 'edit'}
                  className={`py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                    form.type === t
                      ? t === 'import'
                        ? 'border-blue-600 bg-blue-900/30 text-blue-300'
                        : 'border-amber-500 bg-amber-900/30 text-amber-300'
                      : 'border-[#333333] text-[#A1A1AA] hover:border-[#555] disabled:cursor-not-allowed'
                  }`}
                >
                  {t === 'import' ? '↓  Import' : '↑  Export'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>N° de dossier <span className="text-[#A1A1AA] font-normal">(laisser vide = auto)</span></label>
                <div className="flex gap-2">
                  <input type="text" value={form.dossier_number} onChange={set('dossier_number')}
                    placeholder="1241071" className={`${inputClass} flex-1`} />
                  <button type="button" onClick={fillAutoNumber}
                    className="px-3 py-2 text-xs bg-[#2A2A2A] border border-[#333333] rounded-lg text-zinc-300 hover:bg-[#333333] transition-colors whitespace-nowrap">
                    Remplir auto
                  </button>
                </div>
                {fieldErrors.dossier_number && <p className="text-xs text-red-400 mt-1">{fieldErrors.dossier_number}</p>}
              </div>
              <div>
                <label className={labelClass}>Reçu le</label>
                <input type="date" value={form.recu_le} onChange={set('recu_le')} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Section 2: Client & Personnel */}
          <div>
            <p className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider mb-3">Client &amp; Personnel</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Client <span className="text-red-400">*</span></label>
                <select value={form.client_id} onChange={set('client_id')} className={inputClass} required>
                  <option value="">— Sélectionner —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {fieldErrors.client_id && <p className="text-xs text-red-400 mt-1">{fieldErrors.client_id}</p>}
              </div>
              <div>
                <label className={labelClass}>Agent commis</label>
                <select value={form.commis_user_id} onChange={set('commis_user_id')} className={inputClass}>
                  <option value="">— Aucun —</option>
                  {logisticsUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Inspecteur</label>
                <input type="text" value={form.inspecteur} onChange={set('inspecteur')} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Section 3: Marchandise */}
          <div>
            <p className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider mb-3">Marchandise</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{expedLabel}</label>
                <input type="text" value={form.expediteur_exportateur} onChange={set('expediteur_exportateur')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Nombre colis / TC</label>
                <input type="text" value={form.nombre_colis_tc} onChange={set('nombre_colis_tc')} placeholder="ex: 1 TC, 5 colis" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Poids brut (kg)</label>
                <input type="number" step="0.01" value={form.poids_brut_kg} onChange={set('poids_brut_kg')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Nature de marchandise</label>
                <input type="text" value={form.nature_marchandise} onChange={set('nature_marchandise')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Bureau</label>
                <input type="text" value={form.bureau} onChange={set('bureau')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Compagnie de transport</label>
                <input type="text" value={form.compagnie_transport} onChange={set('compagnie_transport')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Date d'arrivée</label>
                <input type="date" value={form.arrival_date} onChange={set('arrival_date')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Dépôt de séquence</label>
                <input type="date" value={form.depot_sequence_date} onChange={set('depot_sequence_date')} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Section 4: Observations */}
          <div>
            <label className={labelClass}>Observations</label>
            <textarea value={form.observations} onChange={set('observations')} rows={4}
              className={`${inputClass} resize-none`} />
          </div>

          {fieldErrors._ && <p className="text-sm text-red-400">{fieldErrors._}</p>}

          <div className="flex gap-3 pt-1 border-t border-[#333333]">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-[#333333] text-sm font-medium text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
              {saving ? 'Enregistrement…' : mode === 'create' ? 'Créer le dossier' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
