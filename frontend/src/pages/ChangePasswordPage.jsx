import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api';

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.new_password !== form.confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast.success('Mot de passe modifié ✓');
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] focus:border-transparent';

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold text-[#FAFAFA] mb-6">Changer le mot de passe</h1>
      <div className="bg-[#242424] rounded-xl border border-[#333333] p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { key: 'current_password', label: 'Mot de passe actuel', auto: 'current-password' },
            { key: 'new_password', label: 'Nouveau mot de passe', auto: 'new-password' },
            { key: 'confirm', label: 'Confirmer le nouveau mot de passe', auto: 'new-password' },
          ].map(({ key, label, auto }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-zinc-300 mb-1">{label}</label>
              <input
                type="password"
                value={form[key]}
                onChange={update(key)}
                autoComplete={auto}
                className={inputClass}
                required
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 py-2.5 border border-[#333333] text-sm font-medium text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
      <p className="mt-4 text-xs text-[#A1A1AA]">Au moins 8 caractères, une lettre et un chiffre.</p>
    </div>
  );
}
