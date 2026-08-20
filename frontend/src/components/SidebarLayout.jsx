import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Wifi, LayoutDashboard, Shield, LogOut, ChevronLeft,
  ChevronRight, Home, Menu, X, Server, Users,
  DollarSign, Settings, Smartphone, Activity
} from 'lucide-react';
import { signOut, isAdmin } from '../lib/supabase';

const CUSTOMER_NAV = [
  { to: '/',          icon: <Home size={18} />,            label: 'Home / Store' },
  { to: '/proxies',   icon: <Server size={18} />,          label: 'Proxies' },
  { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'My Proxies' },
  { to: '/settings',  icon: <Settings size={18} />,        label: 'Settings' },
];

const GUEST_NAV = [
  { to: '/',          icon: <Home size={18} />,            label: 'Home / Store' },
  { to: '/proxies',   icon: <Server size={18} />,          label: 'Proxies' },
  { to: '/auth',      icon: <Users size={18} />,           label: 'Sign In / Register' },
];

const ADMIN_NAV = [
  { to: '/admin',              icon: <Activity size={18} />,   label: 'Overview' },
  { to: '/admin/modems',       icon: <Wifi size={18} />,       label: 'Modems' },
  { to: '/admin/android',      icon: <Smartphone size={18} />, label: 'Android Devices' },
  { to: '/admin/subscriptions',icon: <Users size={18} />,      label: 'Subscriptions' },
  { to: '/admin/revenue',      icon: <DollarSign size={18} />, label: 'Revenue' },
];

export default function SidebarLayout({ session, children, adminMode = false }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminUser, setAdminUser] = useState(false);

  useEffect(() => {
    if (session?.user?.id) {
      isAdmin(session.user.id, session.user.email).then(setAdminUser);
    }
  }, [session]);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const navItems = adminMode ? ADMIN_NAV : (session ? CUSTOMER_NAV : GUEST_NAV);
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const SidebarContent = ({ isMobileDrawer = false }) => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '20px 0',
    }}>
      {/* Logo */}
      <div style={{
        padding: (collapsed && !isMobileDrawer) ? '0 12px 20px' : '0 20px 20px',
        borderBottom: '1px solid var(--clr-border)',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: (collapsed && !isMobileDrawer) ? 'center' : 'space-between',
      }}>
        {(!collapsed || isMobileDrawer) && (
          <Link to="/" onClick={() => setMobileOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div className="logo-icon"><img src="/logo.jpg" alt="Vertex Proxies Logo" className="logo-img" /></div>
            <span className="text-gradient" style={{ fontWeight: 800, fontSize: '1.15rem' }}>Vertex Proxies</span>
          </Link>
        )}
        {(collapsed && !isMobileDrawer) && (
          <div className="logo-icon"><img src="/logo.jpg" alt="Vertex Proxies Logo" className="logo-img" /></div>
        )}
        {isMobileDrawer && (
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
        )}
      </div>

      {/* Section label */}
      {(!collapsed || isMobileDrawer) && (
        <div style={{
          padding: '0 20px 8px',
          fontSize: '0.68rem',
          fontWeight: 700,
          color: 'var(--clr-text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          {adminMode ? 'Admin Panel' : (session ? 'My Account' : 'Navigation')}
        </div>
      )}

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '0 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {navItems.map(({ to, icon, label }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              title={(collapsed && !isMobileDrawer) ? label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: (collapsed && !isMobileDrawer) ? 0 : '10px',
                justifyContent: (collapsed && !isMobileDrawer) ? 'center' : 'flex-start',
                padding: (collapsed && !isMobileDrawer) ? '10px' : '10px 12px',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--clr-text)' : 'var(--clr-text-2)',
                background: active ? 'var(--clr-surface-2)' : 'transparent',
                border: `1px solid ${active ? 'var(--clr-border-2)' : 'transparent'}`,
                transition: 'var(--transition)',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!active) e.currentTarget.style.background = 'var(--clr-surface)';
              }}
              onMouseLeave={e => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
            >
              {/* Active indicator */}
              {active && (
                <div style={{
                  position: 'absolute',
                  left: 0, top: '50%',
                  transform: 'translateY(-50%)',
                  width: 3, height: '60%',
                  background: 'var(--grad-accent)',
                  borderRadius: '0 3px 3px 0',
                }} />
              )}
              <span style={{ color: active ? 'var(--clr-accent)' : 'inherit', flexShrink: 0 }}>
                {icon}
              </span>
              {(!collapsed || isMobileDrawer) && <span>{label}</span>}
            </Link>
          );
        })}

        {/* Admin Switch Link */}
        {adminUser && !adminMode && (
          <>
            <div style={{ height: '1px', background: 'var(--clr-border)', margin: '10px 2px' }} />
            <Link
              to="/admin"
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'flex', alignItems: 'center',
                gap: (collapsed && !isMobileDrawer) ? 0 : '10px',
                justifyContent: (collapsed && !isMobileDrawer) ? 'center' : 'flex-start',
                padding: (collapsed && !isMobileDrawer) ? '10px' : '10px 12px',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontSize: '0.9rem',
                color: 'var(--clr-accent)',
                background: 'rgba(139,92,246,0.1)',
                border: '1px solid rgba(139,92,246,0.2)',
                transition: 'var(--transition)',
              }}
            >
              <Shield size={18} style={{ flexShrink: 0 }} />
              {(!collapsed || isMobileDrawer) && <span style={{ fontWeight: 600 }}>Admin Panel</span>}
            </Link>
          </>
        )}

        {adminMode && (
          <>
            <div style={{ height: '1px', background: 'var(--clr-border)', margin: '10px 2px' }} />
            <Link
              to="/dashboard"
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'flex', alignItems: 'center',
                gap: (collapsed && !isMobileDrawer) ? 0 : '10px',
                justifyContent: (collapsed && !isMobileDrawer) ? 'center' : 'flex-start',
                padding: (collapsed && !isMobileDrawer) ? '10px' : '10px 12px',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontSize: '0.9rem',
                color: 'var(--clr-text-2)',
                transition: 'var(--transition)',
              }}
            >
              <LayoutDashboard size={18} style={{ flexShrink: 0 }} />
              {(!collapsed || isMobileDrawer) && <span>Customer View</span>}
            </Link>
          </>
        )}
      </nav>

      {/* User + Sign out / Sign in */}
      <div style={{
        padding: (collapsed && !isMobileDrawer) ? '12px 10px 0' : '12px 10px 0',
        borderTop: '1px solid var(--clr-border)',
        marginTop: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {session ? (
          <>
            {(!collapsed || isMobileDrawer) && (
              <div style={{
                padding: '10px 12px',
                background: 'var(--clr-surface)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
              }}>
                <div style={{ color: 'var(--clr-text-3)', marginBottom: '2px', fontSize: '0.7rem' }}>Signed in as</div>
                <div style={{
                  color: 'var(--clr-text)',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}>
                  {session?.user?.email}
                </div>
              </div>
            )}
            <button
              onClick={handleSignOut}
              title="Sign Out"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: (collapsed && !isMobileDrawer) ? 0 : '8px',
                justifyContent: (collapsed && !isMobileDrawer) ? 'center' : 'flex-start',
                padding: (collapsed && !isMobileDrawer) ? '10px' : '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--clr-text-2)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                width: '100%',
                transition: 'var(--transition)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = 'var(--clr-red)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--clr-text-2)'; }}
            >
              <LogOut size={18} style={{ flexShrink: 0 }} />
              {(!collapsed || isMobileDrawer) && <span>Sign Out</span>}
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Link
              to="/auth"
              onClick={() => setMobileOpen(false)}
              className="btn btn-secondary btn-sm"
              style={{ width: '100%', padding: '8px', fontSize: '0.85rem' }}
            >
              {(!collapsed || isMobileDrawer) ? 'Sign In' : <LogOut size={16} />}
            </Link>
            {(!collapsed || isMobileDrawer) && (
              <Link
                to="/auth?tab=signup"
                onClick={() => setMobileOpen(false)}
                className="btn btn-primary btn-sm"
                style={{ width: '100%', padding: '8px', fontSize: '0.85rem' }}
              >
                Get Started
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const SIDEBAR_WIDTH      = collapsed ? 64 : 240;
  const SIDEBAR_WIDTH_PX   = `${SIDEBAR_WIDTH}px`;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>

      {/* ── Desktop Sidebar ─────────────────────────── */}
      <aside style={{
        width: SIDEBAR_WIDTH_PX,
        flexShrink: 0,
        background: 'var(--clr-bg-2)',
        borderRight: '1px solid var(--clr-border)',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}>
        <SidebarContent isMobileDrawer={false} />
      </aside>

      {/* ── Collapse Toggle Button (Desktop Only) ───── */}
      <button
        id="desktop-collapse-btn"
        onClick={() => setCollapsed(c => !c)}
        style={{
          position: 'fixed',
          top: '28px',
          left: `calc(${SIDEBAR_WIDTH_PX} - 12px)`,
          width: 24, height: 24,
          borderRadius: '50%',
          background: 'var(--clr-bg-2)',
          border: '1px solid var(--clr-border-2)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--clr-text-2)',
          zIndex: 51,
          transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: 'var(--shadow-sm)',
        }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>

      {/* ── Mobile overlay ──────────────────────────── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 48,
          }}
        />
      )}

      {/* ── Mobile sidebar drawer ───────────────────── */}
      <aside style={{
        position: 'fixed',
        top: 0, left: mobileOpen ? 0 : '-280px',
        bottom: 0, width: '260px',
        background: 'var(--clr-bg-2)',
        borderRight: '1px solid var(--clr-border)',
        transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 49,
        display: 'none',
        flexDirection: 'column',
        overflowY: 'auto',
        boxShadow: mobileOpen ? 'var(--shadow-lg)' : 'none',
      }} id="mobile-sidebar">
        <SidebarContent isMobileDrawer={true} />
      </aside>

      {/* ── Mobile menu toggle button ───────────────── */}
      <button
        onClick={() => setMobileOpen(o => !o)}
        aria-label="Toggle navigation menu"
        style={{
          position: 'fixed',
          top: '16px', left: '16px',
          width: 40, height: 40,
          borderRadius: '10px',
          background: 'var(--clr-bg-2)',
          border: '1px solid var(--clr-border)',
          cursor: 'pointer',
          display: 'none',
          alignItems: 'center', justifyContent: 'center',
          color: 'var(--clr-text)',
          zIndex: 52,
          boxShadow: 'var(--shadow-md)',
        }}
        id="mobile-menu-btn"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* ── Main content ────────────────────────────── */}
      <main style={{
        flex: 1,
        marginLeft: SIDEBAR_WIDTH_PX,
        transition: 'margin-left 0.25s cubic-bezier(0.4,0,0.2,1)',
        minWidth: 0,
        minHeight: '100vh',
        background: 'var(--clr-bg)',
      }}>
        {children}
      </main>

      <style>{`
        @media (max-width: 768px) {
          #mobile-sidebar       { display: flex !important; }
          #mobile-menu-btn      { display: flex !important; }
          #desktop-collapse-btn { display: none !important; }
          aside:first-of-type   { display: none !important; }
          main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
