import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Wifi, LayoutDashboard, Shield, LogOut, ChevronLeft,
  ChevronRight, Home, Menu, X, Server, Users,
  DollarSign, Settings, Smartphone, Activity
} from 'lucide-react';
import { signOut, isAdmin } from '../lib/supabase';

const CUSTOMER_NAV = [
  { to: '/dashboard',          icon: <LayoutDashboard size={18} />, label: 'My Proxies' },
  { to: '/dashboard/settings', icon: <Settings size={18} />,        label: 'Settings' },
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
      isAdmin(session.user.id).then(setAdminUser);
    }
  }, [session]);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const navItems = adminMode ? ADMIN_NAV : CUSTOMER_NAV;
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const SidebarContent = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '20px 0',
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '0 12px 20px' : '0 20px 20px',
        borderBottom: '1px solid var(--clr-border)',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
      }}>
        {!collapsed && (
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div className="logo-icon"><Wifi size={16} color="#fff" /></div>
            <span className="text-gradient" style={{ fontWeight: 800, fontSize: '1.1rem' }}>ProxiCell</span>
          </Link>
        )}
        {collapsed && (
          <div className="logo-icon"><Wifi size={16} color="#fff" /></div>
        )}
      </div>

      {/* Section label */}
      {!collapsed && (
        <div style={{
          padding: '0 20px 8px',
          fontSize: '0.68rem',
          fontWeight: 700,
          color: 'var(--clr-text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          {adminMode ? 'Admin Panel' : 'My Account'}
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
              title={collapsed ? label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : '10px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '10px' : '10px 12px',
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
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {/* Divider + cross-links */}
        <div style={{ height: '1px', background: 'var(--clr-border)', margin: '10px 2px' }} />

        <Link
          to="/"
          style={{
            display: 'flex', alignItems: 'center',
            gap: collapsed ? 0 : '10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px' : '10px 12px',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            color: 'var(--clr-text-2)',
            transition: 'var(--transition)',
          }}
        >
          <Home size={18} style={{ flexShrink: 0 }} />
          {!collapsed && <span>Storefront</span>}
        </Link>

        {adminUser && !adminMode && (
          <Link
            to="/admin"
            style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : '10px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '10px' : '10px 12px',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              color: 'var(--clr-text-2)',
              transition: 'var(--transition)',
            }}
          >
            <Shield size={18} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Admin Panel</span>}
          </Link>
        )}

        {adminMode && (
          <Link
            to="/dashboard"
            style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : '10px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '10px' : '10px 12px',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              color: 'var(--clr-text-2)',
              transition: 'var(--transition)',
            }}
          >
            <LayoutDashboard size={18} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Customer View</span>}
          </Link>
        )}
      </nav>

      {/* User + Sign out */}
      <div style={{
        padding: collapsed ? '12px 10px 0' : '12px 10px 0',
        borderTop: '1px solid var(--clr-border)',
        marginTop: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {!collapsed && (
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
            gap: collapsed ? 0 : '8px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '10px' : '10px 12px',
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
          {!collapsed && <span>Sign Out</span>}
        </button>
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
        <SidebarContent />
      </aside>

      {/* ── Collapse Toggle Button ───────────────────── */}
      <button
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

      {/* ── Mobile sidebar ──────────────────────────── */}
      <aside style={{
        position: 'fixed',
        top: 0, left: mobileOpen ? 0 : '-260px',
        bottom: 0, width: '240px',
        background: 'var(--clr-bg-2)',
        borderRight: '1px solid var(--clr-border)',
        transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 49,
        display: 'none', // shown via CSS media query below
        flexDirection: 'column',
        overflowY: 'auto',
      }} id="mobile-sidebar">
        <SidebarContent />
      </aside>

      {/* ── Mobile menu button ──────────────────────── */}
      <button
        onClick={() => setMobileOpen(o => !o)}
        style={{
          position: 'fixed',
          top: '16px', left: '16px',
          width: 38, height: 38,
          borderRadius: '10px',
          background: 'var(--clr-bg-2)',
          border: '1px solid var(--clr-border)',
          cursor: 'pointer',
          display: 'none', // shown via CSS media query
          alignItems: 'center', justifyContent: 'center',
          color: 'var(--clr-text)',
          zIndex: 52,
        }}
        id="mobile-menu-btn"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
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
          #mobile-sidebar   { display: flex !important; }
          #mobile-menu-btn  { display: flex !important; }
          /* On mobile, collapse the desktop sidebar completely */
          aside:first-of-type { display: none !important; }
          main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
