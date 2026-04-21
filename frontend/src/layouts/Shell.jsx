import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import toast from 'react-hot-toast';

const ROLE_LABEL = { admin: 'Administrateur', accountant: 'Comptable', logistics: 'Agent logistique' };

function RedDot() {
  return <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-1.5 flex-shrink-0" />;
}

function NavItem({ to, label, showDot }) {
  return (
    <NavLink
      to={to}
      end={to === '/app'}
      className={({ isActive }) =>
        `flex items-center ${isActive
          ? 'pl-3 pr-4 py-2 rounded-md text-sm font-medium text-white bg-[#1E3A8A] border-l-4 border-[#F59E0B] transition-colors'
          : 'px-4 py-2 rounded-md text-sm text-zinc-300 hover:bg-[#242424] hover:text-white transition-colors'
        }`
      }
    >
      <span className="flex-1">{label}</span>
      {showDot && <RedDot />}
    </NavLink>
  );
}

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState({ pending: 0, redFlags: 0, receiptAlerts: 0, overdueInvoices: 0 });
  const pollRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const isAccountant = user?.role === 'accountant';

  async function fetchBadges() {
    if (!isAdmin && !isAccountant) return;
    try {
      const [disbR, invR] = await Promise.allSettled([
        api.get('/disbursements/stats'),
        api.get('/invoices/alerts'),
      ]);
      setBadges({
        pending: disbR.status === 'fulfilled' ? (disbR.value.data.pending_signature_count ?? 0) : 0,
        redFlags: disbR.status === 'fulfilled' ? (disbR.value.data.red_flag_count ?? 0) : 0,
        receiptAlerts: disbR.status === 'fulfilled' ? (disbR.value.data.receipt_alert_count ?? 0) : 0,
        overdueInvoices: invR.status === 'fulfilled' ? (invR.value.data.overdue?.count ?? 0) : 0,
      });
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchBadges();
    pollRef.current = setInterval(fetchBadges, 60_000);
    return () => clearInterval(pollRef.current);
  }, [user?.id]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
    toast.success('Déconnexion réussie');
  };

  const adminNav = [
    { to: '/app', label: 'Tableau de bord', dot: badges.pending > 0 },
    { to: '/app/dossiers', label: 'Dossiers' },
    { to: '/app/clients', label: 'Clients' },
    { to: '/app/decaissements', label: 'Décaissements', dot: badges.redFlags > 0 || badges.receiptAlerts > 0 },
    { to: '/app/factures', label: 'Factures', dot: badges.overdueInvoices > 0 },
    { to: '/app/utilisateurs', label: 'Utilisateurs' },
    { to: '/app/audit', label: "Journal d'audit" },
  ];
  const accountantNav = [
    { to: '/app', label: 'Tableau de bord' },
    { to: '/app/dossiers', label: 'Dossiers' },
    { to: '/app/clients', label: 'Clients' },
    { to: '/app/decaissements', label: 'Décaissements', dot: badges.redFlags > 0 || badges.receiptAlerts > 0 },
    { to: '/app/factures', label: 'Factures', dot: badges.overdueInvoices > 0 },
  ];
  const logisticsNav = [
    { to: '/app', label: 'Tableau de bord' },
    { to: '/app/dossiers', label: 'Dossiers' },
    { to: '/app/decaissements', label: 'Décaissements' },
  ];

  const navItems = user?.role === 'admin' ? adminNav
    : user?.role === 'accountant' ? accountantNav
    : logisticsNav;

  const sidebar = (
    <div className="flex flex-col h-full bg-[#141414] w-60">
      <div className="flex flex-col items-center px-5 py-5 border-b border-[#333333]">
        <img src="/logo.png" alt="BADR TRANSIT" className="h-16 w-auto mx-auto" />
        <p className="mt-2 text-xs text-[#A1A1AA] text-center">Transit, Transport &amp; Logistique</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => <NavItem key={item.to} to={item.to} label={item.label} showDot={!!item.dot} />)}
      </nav>
      <div className="px-4 py-4 border-t border-[#333333]">
        <div className="text-sm text-[#FAFAFA] font-medium truncate">{user?.name}</div>
        <div className="text-xs text-[#A1A1AA] mt-0.5">{ROLE_LABEL[user?.role]}</div>
        {['admin', 'accountant'].includes(user?.role) && (
          <NavLink
            to="/app/changer-mot-de-passe"
            className="block mt-2 text-xs text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            Changer le mot de passe
          </NavLink>
        )}
        <button
          onClick={handleLogout}
          className="mt-3 w-full text-left text-xs text-[#A1A1AA] hover:text-red-400 transition-colors"
        >
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#1A1A1A]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col flex-shrink-0">{sidebar}</aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 flex flex-col w-60 shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center px-4 py-3 bg-[#141414] border-b border-[#333333]">
          <button onClick={() => setMobileOpen(true)} className="text-zinc-300 mr-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <img src="/logo.png" alt="BADR TRANSIT" className="h-7 w-auto" />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
