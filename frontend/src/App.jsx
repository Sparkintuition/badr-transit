import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Shell from './layouts/Shell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ClientsPage from './pages/ClientsPage';
import JobsListPage from './pages/JobsListPage';
import JobDetailPage from './pages/JobDetailPage';
import PlaceholderPage from './pages/PlaceholderPage';
import DisbursementsListPage from './pages/DisbursementsListPage';
import InvoicesListPage from './pages/InvoicesListPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import CreateInvoicePage from './pages/CreateInvoicePage';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/app/*"
            element={
              <ProtectedRoute>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="utilisateurs" element={
              <ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>
            } />
            <Route path="changer-mot-de-passe" element={
              <ProtectedRoute roles={['admin', 'accountant']}><ChangePasswordPage /></ProtectedRoute>
            } />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="dossiers" element={<JobsListPage />} />
            <Route path="dossiers/:id" element={<JobDetailPage />} />
            <Route path="decaissements" element={<DisbursementsListPage />} />
            <Route path="factures" element={<InvoicesListPage />} />
            <Route path="factures/nouveau" element={
              <ProtectedRoute roles={['admin', 'accountant']}><CreateInvoicePage /></ProtectedRoute>
            } />
            <Route path="factures/:id" element={<InvoiceDetailPage />} />
            <Route path="audit" element={
              <ProtectedRoute roles={['admin']}><PlaceholderPage title="Journal d'audit" /></ProtectedRoute>
            } />
            <Route path="*" element={
              <div className="py-16 text-center text-[#A1A1AA]">Page introuvable (404)</div>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
