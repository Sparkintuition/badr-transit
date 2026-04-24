import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatMADShort } from '../utils/money';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEADLINE_PRESETS = [
  { label: 'Immédiat (0 j)', value: 0 },
  { label: '15 jours', value: 15 },
  { label: '30 jours', value: 30 },
  { label: '45 jours', value: 45 },
  { label: '60 jours', value: 60 },
  { label: '90 jours', value: 90 },
  { label: 'Autre…', value: 'custom' },
];

const PRESET_VALUES = DEADLINE_PRESETS.filter((p) => p.value !== 'custom').map((p) => p.value);

function formatDeadline(days) {
  if (days === 0) return 'Immédiat';
  return `${days} jours`;
}

function getPresetForDays(days) {
  return PRESET_VALUES.includes(days) ? days : 'custom';
}

const EMPTY_FORM = {
  name: '',
  ice: '',
  address: '',
  contact_person: '',
  email: '',
  phone: '',
  deadlinePreset: 30,
  deadlineCustom: '',
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputClass =
  'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] focus:border-transparent';
const labelClass = 'block text-sm font-medium text-zinc-300 mb-1';

// ─── Badge components ─────────────────────────────────────────────────────────

function StatusBadge({ active }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#333333] text-[#A1A1AA]'
    }`}>
      {active ? 'Actif' : 'Inactif'}
    </span>
  );
}

// ─── ClientFormModal ──────────────────────────────────────────────────────────

function ClientFormModal({ mode, client, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (mode === 'edit' && client) {
      return {
        name: client.name ?? '',
        ice: client.ice ?? '',
        address: client.address ?? '',
        contact_person: client.contact_person ?? '',
        email: client.email ?? '',
        phone: client.phone ?? '',
        deadlinePreset: getPresetForDays(client.payment_deadline_days),
        deadlineCustom: getPresetForDays(client.payment_deadline_days) === 'custom'
          ? String(client.payment_deadline_days)
          : '',
      };
    }
    return EMPTY_FORM;
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setFieldErrors((err) => ({ ...err, [k]: undefined, _: undefined }));
  };

  const getDeadlineDays = () => {
    if (form.deadlinePreset === 'custom') {
      const v = parseInt(form.deadlineCustom, 10);
      return isNaN(v) ? null : v;
    }
    return Number(form.deadlinePreset);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});

    const days = getDeadlineDays();
    if (days === null || days < 0 || days > 180) {
      setFieldErrors({ deadlineCustom: 'Valeur entre 0 et 180 jours' });
      return;
    }

    const body = {
      name: form.name,
      ice: form.ice,
      address: form.address,
      contact_person: form.contact_person,
      email: form.email,
      phone: form.phone,
      payment_deadline_days: days,
    };

    setSaving(true);
    try {
      if (mode === 'create') {
        await api.post('/clients', body);
        toast.success('Client enregistré ✓');
      } else {
        await api.put(`/clients/${client.id}`, body);
        toast.success('Client mis à jour ✓');
      }
      onSaved();
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        setFieldErrors(data.errors);
      } else {
        setFieldErrors({ _: data?.error || 'Une erreur est survenue.' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 overflow-y-auto">
      <div ref={ref} className="bg-[#242424] rounded-2xl border border-[#333333] shadow-xl w-full max-w-lg p-6 my-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[#FAFAFA]">
            {mode === 'create' ? 'Nouveau client' : 'Modifier le client'}
          </h2>
          <button onClick={onClose} className="text-[#A1A1AA] hover:text-[#FAFAFA] text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom */}
          <div>
            <label className={labelClass}>Nom (Raison sociale) <span className="text-red-400">*</span></label>
            <input type="text" value={form.name} onChange={set('name')} className={inputClass} required />
            {fieldErrors.name && <p className="text-xs text-red-400 mt-1">{fieldErrors.name}</p>}
          </div>

          {/* ICE */}
          <div>
            <label className={labelClass}>ICE</label>
            <input
              type="text"
              value={form.ice}
              onChange={set('ice')}
              placeholder="000000000000000"
              maxLength={15}
              className={`${inputClass} font-mono tracking-wider`}
            />
            <p className="text-xs text-[#A1A1AA] mt-0.5">15 chiffres — laisser vide si inconnu</p>
            {fieldErrors.ice && <p className="text-xs text-red-400 mt-1">{fieldErrors.ice}</p>}
          </div>

          {/* Délai de paiement */}
          <div>
            <label className={labelClass}>Délai de paiement <span className="text-red-400">*</span></label>
            <select
              value={form.deadlinePreset}
              onChange={(e) => {
                const v = e.target.value === 'custom' ? 'custom' : Number(e.target.value);
                setForm((f) => ({ ...f, deadlinePreset: v, deadlineCustom: '' }));
                setFieldErrors((err) => ({ ...err, deadlineCustom: undefined }));
              }}
              className={inputClass}
            >
              {DEADLINE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {form.deadlinePreset === 'custom' && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={180}
                  value={form.deadlineCustom}
                  onChange={set('deadlineCustom')}
                  placeholder="Ex: 75"
                  className={`${inputClass} w-32`}
                />
                <span className="text-sm text-[#A1A1AA]">jours</span>
              </div>
            )}
            {fieldErrors.deadlineCustom && <p className="text-xs text-red-400 mt-1">{fieldErrors.deadlineCustom}</p>}
            {fieldErrors.payment_deadline_days && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.payment_deadline_days}</p>
            )}
          </div>

          {/* Personne à contacter */}
          <div>
            <label className={labelClass}>Personne à contacter</label>
            <input type="text" value={form.contact_person} onChange={set('contact_person')} className={inputClass} />
          </div>

          {/* Email */}
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={form.email} onChange={set('email')} className={inputClass} />
            {fieldErrors.email && <p className="text-xs text-red-400 mt-1">{fieldErrors.email}</p>}
          </div>

          {/* Téléphone */}
          <div>
            <label className={labelClass}>Téléphone</label>
            <input type="text" value={form.phone} onChange={set('phone')} className={inputClass} />
          </div>

          {/* Adresse */}
          <div>
            <label className={labelClass}>Adresse</label>
            <textarea
              value={form.address}
              onChange={set('address')}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {fieldErrors._ && <p className="text-sm text-red-400">{fieldErrors._}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-[#333333] text-sm font-medium text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving
                ? 'Enregistrement…'
                : mode === 'create' ? 'Enregistrer' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const { user } = useAuth();
  const canEdit = ['admin', 'accountant'].includes(user?.role);
  const isAdmin = user?.role === 'admin';

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [modal, setModal] = useState(null); // null | { mode: 'create' | 'edit', client? }
  const [confirm, setConfirm] = useState(null); // null | { title, description, confirmLabel, variant, onConfirm }

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadClients = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (includeInactive) params.set('include_inactive', '1');
    api.get(`/clients?${params}`)
      .then((r) => setClients(r.data))
      .catch(() => toast.error('Impossible de charger les clients.'))
      .finally(() => setLoading(false));
  }, [debouncedSearch, includeInactive]);

  useEffect(() => { loadClients(); }, [loadClients]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleToggleActive = (client) => {
    const nextActive = !client.active;
    setConfirm({
      title: nextActive ? 'Réactiver ce client ?' : 'Désactiver ce client ?',
      description: nextActive
        ? `"${client.name}" sera à nouveau actif.`
        : `"${client.name}" ne pourra plus être sélectionné dans les nouveaux dossiers.`,
      confirmLabel: nextActive ? 'Réactiver' : 'Désactiver',
      variant: nextActive ? 'default' : 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.patch(`/clients/${client.id}/status`, { active: nextActive });
          toast.success(nextActive ? 'Client réactivé.' : 'Client désactivé.');
          loadClients();
        } catch (err) {
          toast.error(err.response?.data?.error || 'Erreur.');
        }
      },
    });
  };

  const handleDelete = (client) => {
    setConfirm({
      title: 'Supprimer ce client ?',
      description: `Cette action est irréversible. "${client.name}" sera définitivement supprimé.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.delete(`/clients/${client.id}`);
          toast.success('Client supprimé.');
          loadClients();
        } catch (err) {
          toast.error(err.response?.data?.error || 'Erreur.');
        }
      },
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasSearch = debouncedSearch.trim() !== '';
  const isEmpty = !loading && clients.length === 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">Clients</h1>
          <p className="text-sm text-[#A1A1AA] mt-1">Gérez vos clients et leurs conditions de paiement</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            + Nouveau client
          </button>
        )}
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou ICE…"
          className={`${inputClass} sm:max-w-sm`}
        />
        <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300 select-none">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-[#333333] bg-[#2A2A2A] focus:ring-[#3B5BDB]"
          />
          Inclure les clients inactifs
        </label>
      </div>

      {/* Table */}
      <div className="bg-[#242424] rounded-xl border border-[#333333] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#333333] bg-[#2A2A2A]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide">Nom</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide">ICE</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide">Délai paiement</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide">Dossiers</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide">Impayés</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide">En retard</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide">Statut</th>
              {canEdit && (
                <th className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#333333]">
            {loading && (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="px-4 py-10 text-center text-[#A1A1AA] text-sm">
                  Chargement…
                </td>
              </tr>
            )}

            {!loading && isEmpty && (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="px-4 py-16 text-center">
                  <p className="text-[#A1A1AA] text-sm">
                    {hasSearch
                      ? 'Aucun client ne correspond à votre recherche.'
                      : 'Aucun client enregistré. Commencez par ajouter votre premier client.'}
                  </p>
                  {!hasSearch && canEdit && (
                    <button
                      onClick={() => setModal({ mode: 'create' })}
                      className="mt-4 px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      + Ajouter un client
                    </button>
                  )}
                </td>
              </tr>
            )}

            {!loading && clients.map((c) => {
              const canDelete = isAdmin && c.jobs_count === 0 && c.unpaid_invoices_count === 0;
              const deleteBlocked = isAdmin && !canDelete;

              return (
                <tr key={c.id} className="hover:bg-[#2A2A2A] transition-colors">
                  {/* Nom */}
                  <td className="px-4 py-3">
                    <Link to={`/app/clients/${c.id}`} className="font-medium text-[#60A5FA] hover:underline">
                      {c.name}
                    </Link>
                    {c.contact_person && (
                      <div className="text-xs text-[#A1A1AA] mt-0.5">{c.contact_person}</div>
                    )}
                  </td>

                  {/* ICE */}
                  <td className="px-4 py-3 font-mono text-xs text-[#A1A1AA]">
                    {c.ice || <span className="not-italic">—</span>}
                  </td>

                  {/* Délai */}
                  <td className="px-4 py-3 text-zinc-300 text-sm">
                    {formatDeadline(c.payment_deadline_days)}
                  </td>

                  {/* Dossiers */}
                  <td className="px-4 py-3 text-sm">
                    {c.jobs_count > 0
                      ? <span className="text-zinc-300">{c.jobs_count}</span>
                      : <span className="text-[#A1A1AA]">—</span>}
                  </td>

                  {/* Impayés */}
                  <td className="px-4 py-3">
                    {c.unpaid_invoices_count > 0 ? (
                      <div>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
                          {c.unpaid_invoices_count}
                        </span>
                        <div className="text-xs text-red-400 mt-0.5">
                          {formatMADShort(c.total_unpaid_cents)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[#A1A1AA]">—</span>
                    )}
                  </td>

                  {/* En retard */}
                  <td className="px-4 py-3">
                    {c.count_overdue > 0 ? (
                      <div>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
                          {c.count_overdue}
                        </span>
                        <div className="text-xs text-red-400 mt-0.5">{formatMADShort(c.total_overdue_cents)}</div>
                      </div>
                    ) : <span className="text-[#A1A1AA]">—</span>}
                  </td>

                  {/* Statut */}
                  <td className="px-4 py-3">
                    <StatusBadge active={c.active} />
                  </td>

                  {/* Actions */}
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => setModal({ mode: 'edit', client: c })}
                          className="text-xs text-[#60A5FA] hover:underline font-medium"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleToggleActive(c)}
                          className={`text-xs font-medium ${
                            c.active ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'
                          }`}
                        >
                          {c.active ? 'Désactiver' : 'Réactiver'}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => !deleteBlocked && handleDelete(c)}
                            disabled={deleteBlocked}
                            title={deleteBlocked ? 'Ce client a des dossiers ou factures' : undefined}
                            className={`text-xs font-medium transition-colors ${
                              deleteBlocked
                                ? 'text-[#555555] cursor-not-allowed'
                                : 'text-red-400 hover:text-red-300'
                            }`}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {modal && (
        <ClientFormModal
          mode={modal.mode}
          client={modal.client}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadClients(); }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
