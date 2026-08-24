import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { supabase } from './lib/supabase';
import Storefront from './pages/Storefront';
import ProxiesPage from './pages/ProxiesPage';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import AuthPage from './pages/AuthPage';
import './index.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loader" />
        <span>Loading Vertext Proxies...</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            fontSize: '0.9rem',
          },
        }}
      />
      <Routes>
        <Route path="/"                   element={<Storefront session={session} />} />
        <Route path="/proxies"            element={<ProxiesPage session={session} />} />
        <Route path="/auth"               element={session ? <Navigate to="/dashboard" /> : <AuthPage />} />
        <Route path="/dashboard"          element={session ? <Dashboard session={session} /> : <Navigate to="/auth" />} />
        <Route path="/dashboard/settings" element={session ? <Settings session={session} /> : <Navigate to="/auth" />} />
        <Route path="/settings"           element={session ? <Settings session={session} /> : <Navigate to="/auth" />} />
        <Route path="/admin/*"            element={session ? <Admin session={session} /> : <Navigate to="/auth" />} />
        <Route path="*"                   element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
