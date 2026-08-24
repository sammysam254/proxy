import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signOut } from '../lib/supabase';
import { Wifi, LogOut, LayoutDashboard, Shield, Menu, X, Server } from 'lucide-react';

export default function Navbar({ session }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';

  // Close mobile menu on page navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Hide on sidebar-layout pages (dashboard + admin)
  const hiddenPaths = ['/dashboard', '/admin'];
  if (hiddenPaths.some(p => location.pathname.startsWith(p))) return null;

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  return (
    <>
      <nav className="navbar">
        <div className="container navbar-inner">
          {/* Logo */}
          <Link to="/" className="logo">
            <div className="logo-icon">
              <img src="/logo.jpg" alt="Vertex Proxies Logo" className="logo-img" />
            </div>
            <span className="text-gradient">Vertex Proxies</span>
          </Link>

          {/* Desktop Nav Links */}
          <ul className="nav-links desktop-only">
            <li><Link to="/" className={isActive('/')}>Home</Link></li>
            <li><Link to="/proxies" className={isActive('/proxies')}>Proxies</Link></li>
            {session && (
              <li><Link to="/dashboard" className={isActive('/dashboard')}>My Proxies</Link></li>
            )}
          </ul>

          {/* Desktop Right side */}
          <div className="flex items-center gap-sm desktop-only">
            {session ? (
              <>
                <Link to="/dashboard" className="btn btn-ghost btn-sm">
                  <LayoutDashboard size={15} />
                  Dashboard
                </Link>
                <Link to="/admin" className="btn btn-ghost btn-sm">
                  <Shield size={15} />
                </Link>
                <button onClick={handleSignOut} className="btn btn-secondary btn-sm">
                  <LogOut size={14} />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link to="/auth" className="btn btn-secondary btn-sm">Sign In</Link>
                <Link to="/auth?tab=signup" className="btn btn-primary btn-sm">Get Started</Link>
              </>
            )}
          </div>

          {/* Mobile Hamburger Toggle Button */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="mobile-only-btn"
            aria-label="Toggle navigation menu"
            style={{
              background: 'var(--clr-surface)',
              border: '1px solid var(--clr-border)',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              color: 'var(--clr-text)',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 99,
          }}
        />
      )}

      {/* Mobile Drawer */}
      <div style={{
        position: 'fixed',
        top: 0, right: mobileOpen ? 0 : '-100%',
        bottom: 0, width: '280px',
        maxWidth: '85vw',
        background: 'var(--clr-bg-2)',
        borderLeft: '1px solid var(--clr-border)',
        boxShadow: mobileOpen ? 'var(--shadow-lg)' : 'none',
        zIndex: 100,
        transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="logo-icon"><img src="/logo.jpg" alt="Logo" className="logo-img" /></div>
            <span className="text-gradient" style={{ fontWeight: 800 }}>Vertex Proxies</span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            style={{
              background: 'var(--clr-surface)',
              border: '1px solid var(--clr-border)',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--clr-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <Link to="/" onClick={() => setMobileOpen(false)} style={{ padding: '12px 14px', borderRadius: '8px', textDecoration: 'none', color: 'var(--clr-text)', fontWeight: 500, background: location.pathname === '/' ? 'var(--clr-surface-2)' : 'transparent' }}>Home</Link>
          <Link to="/proxies" onClick={() => setMobileOpen(false)} style={{ padding: '12px 14px', borderRadius: '8px', textDecoration: 'none', color: 'var(--clr-text)', fontWeight: 500, background: location.pathname === '/proxies' ? 'var(--clr-surface-2)' : 'transparent' }}>Proxies</Link>
          {session && (
            <Link to="/dashboard" onClick={() => setMobileOpen(false)} style={{ padding: '12px 14px', borderRadius: '8px', textDecoration: 'none', color: 'var(--clr-text)', fontWeight: 500, background: location.pathname === '/dashboard' ? 'var(--clr-surface-2)' : 'transparent' }}>My Proxies</Link>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--clr-border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {session ? (
            <>
              <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Dashboard</Link>
              <button onClick={handleSignOut} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                <LogOut size={16} /> Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/auth" onClick={() => setMobileOpen(false)} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>Sign In</Link>
              <Link to="/auth?tab=signup" onClick={() => setMobileOpen(false)} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Get Started</Link>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .desktop-only { display: none !important; }
          .mobile-only-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
}
