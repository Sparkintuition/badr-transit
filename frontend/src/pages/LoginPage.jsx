import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import api from '../api';

function PinKeypad({ value, onChange }) {
  const press = (d) => { if (value.length < 4) onChange(value + d); };
  const back = () => onChange(value.slice(0, -1));
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-4 py-3">
        {[0,1,2,3].map((i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-colors ${
              i < value.length ? 'bg-[#F59E0B] border-[#F59E0B]' : 'border-[#555555]'
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, idx) => {
          if (k === '') return <div key={idx} />;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => k === '⌫' ? back() : press(k)}
              className="h-14 rounded-xl text-lg font-medium bg-[#2A2A2A] hover:bg-[#333333] active:bg-[#3D3D3D] text-[#FAFAFA] transition-colors select-none"
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [tab, setTab] = useState('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [logisticsUsers, setLogisticsUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { if (user) navigate('/app', { replace: true }); }, [user]);

  useEffect(() => {
    if (tab === 'pin') {
      api.get('/auth/logistics-users').then((r) => {
        setLogisticsUsers(r.data);
        if (r.data.length > 0) setSelectedUserId(String(r.data[0].id));
      }).catch(() => {});
    }
  }, [tab]);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login('password', { username, password });
      navigate('/app', { replace: true });
    } catch (err) {
      if (err.response?.status === 429) setError('Trop de tentatives. Réessayez dans quelques minutes.');
      else if (!err.response) setError('Impossible de contacter le serveur. Vérifiez que le backend est démarré.');
      else setError(err.response.data?.error || 'Identifiants incorrects.');
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (currentPin) => {
    if (!selectedUserId) return;
    setError('');
    setLoading(true);
    try {
      await login('pin', { user_id: parseInt(selectedUserId, 10), pin: currentPin });
      navigate('/app', { replace: true });
    } catch (err) {
      if (err.response?.status === 429) setError('Trop de tentatives. Réessayez dans quelques minutes.');
      else setError(err.response?.data?.error || 'Identifiants incorrects.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (newPin) => {
    setPin(newPin);
    setError('');
    if (newPin.length === 4) handlePinLogin(newPin);
  };

  const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] focus:border-transparent';

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="BADR TRANSIT" className="h-24 w-auto mx-auto mb-4" />
          <p className="text-[#A1A1AA] text-sm">Système de gestion</p>
        </div>

        <div className="bg-[#242424] rounded-2xl border border-[#333333] overflow-hidden">
          <div className="flex border-b border-[#333333]">
            {[
              { id: 'password', label: 'Personnel administratif' },
              { id: 'pin', label: 'Déclarant' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setError(''); setPin(''); }}
                className={`flex-1 py-3 text-xs font-medium transition-colors border-b-2 ${
                  tab === t.id
                    ? 'text-white border-[#F59E0B]'
                    : 'text-zinc-400 border-transparent hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Nom d'utilisateur</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Mot de passe</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className={inputClass}
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Connexion…' : 'Se connecter'}
                </button>
              </form>
            )}

            {tab === 'pin' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Votre nom</label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => { setSelectedUserId(e.target.value); setPin(''); setError(''); }}
                    className={inputClass}
                  >
                    {logisticsUsers.length === 0 && <option value="">Aucun agent disponible</option>}
                    {logisticsUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-center text-[#A1A1AA]">Entrez votre PIN à 4 chiffres</p>
                <PinKeypad value={pin} onChange={handlePinChange} />
                {error && <p className="text-sm text-red-400 text-center">{error}</p>}
                {loading && <p className="text-sm text-[#A1A1AA] text-center">Connexion…</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
