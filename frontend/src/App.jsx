import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import useAuthStore from './store/authStore';

// Layout
import Layout from './components/common/Layout';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FahrzeugeListPage from './pages/FahrzeugeListPage';
import FahrzeugDetailPage from './pages/FahrzeugDetailPage';
import FahrzeugNeuPage from './pages/FahrzeugNeuPage';
import LogistikPage from './pages/LogistikPage';
import LeadsPage from './pages/LeadsPage';
import LeadDetailPage from './pages/LeadDetailPage';
import KundenPage from './pages/KundenPage';
import KundeDetailPage from './pages/KundeDetailPage';
import ProvisionPage from './pages/ProvisionPage';
import NutzerPage from './pages/NutzerPage';
import AdminPage from './pages/AdminPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});

function PrivateRoute({ children, permission, role }) {
  const { user, hasPermission, hasRole } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) {
    return <div className="p-8 text-center text-red-600">Keine Berechtigung</div>;
  }
  if (role && !hasRole(role)) {
    return <div className="p-8 text-center text-red-600">Keine Berechtigung</div>;
  }
  return children;
}

export default function App() {
  const { user, refreshUser } = useAuthStore();

  useEffect(() => {
    if (user) refreshUser();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="fahrzeuge" element={<FahrzeugeListPage />} />
            <Route path="fahrzeuge/neu" element={
              <PrivateRoute permission="perm_fahrzeug_anlegen">
                <FahrzeugNeuPage />
              </PrivateRoute>
            } />
            <Route path="fahrzeuge/:id" element={<FahrzeugDetailPage />} />
            <Route path="logistik" element={<LogistikPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="leads/:id" element={<LeadDetailPage />} />
            <Route path="kunden" element={<KundenPage />} />
            <Route path="kunden/:id" element={<KundeDetailPage />} />
            <Route path="provisionen" element={
              <PrivateRoute permission="perm_provision_sehen">
                <ProvisionPage />
              </PrivateRoute>
            } />
            <Route path="nutzer" element={
              <PrivateRoute permission="perm_admin">
                <NutzerPage />
              </PrivateRoute>
            } />
            <Route path="admin" element={
              <PrivateRoute permission="perm_admin">
                <AdminPage />
              </PrivateRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
