import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

const ROLE_LABEL = { admin: 'Administrateur', accountant: 'Comptable', logistics: 'Agent logistique' };
const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrateur' },
  { value: 'accountant', label: 'Comptable' },
  { value: 'logistics', label: 'Agent logistique' },
];

const EMPTY_FORM = { name: '', role: 'admin', username: '', password: '', pin: '', active: 1 };

function Badge({ active }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#333333] text-[#A1A1AA]'
    }`}>
      {active ? 'Actif' : 'Inactif'}
    </span>
  );
}

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

const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] focus:border-transparent';
const labelClass = 'block text-sm font-medium text-zinc-300 mb-1';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const loadUsers = () => api.get('/users').then((r) => setUsers(r.data)).catch(() => {});
  useEffect(() => { loadUsers(); }, []);

  const openCreate = () => { setForm(EMPTY_FORM); setErrors({}); setModal({ mode: 'create' }); };
  const openEdit = (user) => {
    setForm({ name: user.name, role: user.role, username: user.username || '', password: '', pin: '', active: user.active });
    setErrors({});
    setModal({ mode: 'edit', user });
  };
  const closeModal = () => setModal(null);

  const field = (k) => (e) => {
    const val = e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value;
    setForm((f) => ({ ...f, [k]: val }));
    setErrors((er) => ({ ...er, [k]: undefined, _global: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Le nom est requis.';
    if (modal.mode === 'create') {
      if (['admin', 'accountant'].includes(form.role)) {
        if (!form.username.trim()) errs.username = "Le nom d'utilisateur est requis.";
        if (!form.password) errs.password = 'Le mot de passe est requis.';
      }
      if (form.role === 'logistics') {
        if (!/^\d{4}$/.test(form.pin)) errs.pin = 'Le PIN doit contenir exactement 4 chiffres.';
      }
    }
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        const body = { name: form.name, role: form.role };
        if (['admin', 'accountant'].includes(form.role)) {
          body.username = form.username;
          body.password = form.password;
        } else {
          body.pin = form.pin;
        }
        await api.post('/users', body);
        toast.success('Utilisateur créé.');
      } else {
        const body = { name: form.name, active: form.active };
        if (form.password) body.new_password = form.password;
        if (form.pin) body.new_pin = form.pin;
        await api.put(`/users/${modal.user.id}`, body);
        toast.success('Utilisateur mis à jour.');
      }
      closeModal();
      loadUsers();
    } catch (err) {
      const msg = err.response?.data?.error || 'Une erreur est survenue.';
      toast.error(msg);
      setErrors({ _global: msg });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user) => {
    const next = user.active ? 0 : 1;
    try {
      await api.put(`/users/${user.id}`, { active: next });
      toast.success(next ? 'Compte réactivé.' : 'Compte désactivé.');
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur.');
    }
  };

  const isEdit = modal?.mode === 'edit';
  const needsPassword = ['admin', 'accountant'].includes(form.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#FAFAFA]">Utilisateurs</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Nouvel utilisateur
        </button>
      </div>

      <div className="bg-[#242424] rounded-xl border border-[#333333] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#333333] bg-[#2A2A2A]">
              {['Nom', 'Rôle', 'Identifiant', 'Statut', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#A1A1AA] uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#333333]">
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[#A1A1AA] text-sm">Aucun utilisateur.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[#2A2A2A] transition-colors">
                <td className="px-4 py-3 font-medium text-[#FAFAFA]">{u.name}</td>
                <td className="px-4 py-3 text-zinc-300">{ROLE_LABEL[u.role]}</td>
                <td className="px-4 py-3 text-[#A1A1AA] font-mono text-xs">{u.username || 'PIN'}</td>
                <td className="px-4 py-3"><Badge active={u.active} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(u)} className="text-xs text-[#60A5FA] hover:underline font-medium">
                      Modifier
                    </button>
                    <button
                      onClick={() => toggleActive(u)}
                      className={`text-xs font-medium ${u.active ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                    >
                      {u.active ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={isEdit ? "Modifier l'utilisateur" : 'Nouvel utilisateur'} onClose={closeModal}>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nom complet</label>
              <input type="text" value={form.name} onChange={field('name')} className={inputClass} />
              {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
            </div>

            {!isEdit ? (
              <div>
                <label className={labelClass}>Rôle</label>
                <select value={form.role} onChange={field('role')} className={inputClass}>
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <span className={labelClass}>Rôle</span>
                <span className="text-sm text-[#A1A1AA]">{ROLE_LABEL[form.role]}</span>
              </div>
            )}

            {needsPassword && !isEdit && (
              <div>
                <label className={labelClass}>Nom d'utilisateur</label>
                <input type="text" value={form.username} onChange={field('username')} autoComplete="off" className={inputClass} />
                {errors.username && <p className="text-xs text-red-400 mt-1">{errors.username}</p>}
              </div>
            )}

            {needsPassword && (
              <div>
                <label className={labelClass}>
                  {isEdit ? 'Nouveau mot de passe (laisser vide pour conserver)' : 'Mot de passe'}
                </label>
                <input type="password" value={form.password} onChange={field('password')} autoComplete="new-password" className={inputClass} />
                {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
              </div>
            )}

            {form.role === 'logistics' && (
              <div>
                <label className={labelClass}>
                  {isEdit ? 'Nouveau PIN (laisser vide pour conserver)' : 'PIN à 4 chiffres'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.pin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                    field('pin')({ target: { value: v } });
                  }}
                  placeholder="••••"
                  className={`${inputClass} tracking-widest`}
                />
                {errors.pin && <p className="text-xs text-red-400 mt-1">{errors.pin}</p>}
              </div>
            )}

            {isEdit && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.active)}
                  onChange={field('active')}
                  className="rounded border-[#333333] bg-[#2A2A2A] focus:ring-[#3B5BDB]"
                />
                <span className="text-sm text-zinc-300">Compte actif</span>
              </label>
            )}

            {errors._global && <p className="text-sm text-red-400">{errors._global}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-2 border border-[#333333] text-sm font-medium text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
