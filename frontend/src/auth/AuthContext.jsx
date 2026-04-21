import { createContext, useContext, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const handlingExpiry = useRef(false);

  const refresh = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  useEffect(() => {
    function handleSessionExpired() {
      if (handlingExpiry.current) return;
      handlingExpiry.current = true;
      setUser(null);
      toast.error('Session expirée, reconnexion nécessaire');
      // Reset flag after navigation settles so future expirations are caught
      setTimeout(() => { handlingExpiry.current = false; }, 3000);
    }
    window.addEventListener('session:expired', handleSessionExpired);
    return () => window.removeEventListener('session:expired', handleSessionExpired);
  }, []);

  const login = async (method, creds) => {
    const res = await api.post('/auth/login', { method, ...creds });
    setUser(res.data.user);
    return res.data;
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
