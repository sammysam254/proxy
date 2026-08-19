import { Link, useLocation } from 'react-router-dom';
import { signOut } from '../lib/supabase';
import { Wifi, LogOut, LayoutDashboard, Shield } from 'lucide-react';

export default function Navbar({ session }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';

  // Hide on sidebar-layout pages (dashboard + admin)
  const hiddenPaths = ['/dashboard', '/admin'];
  if (hiddenPaths.some(p => location.pathname.startsWith(p))) return null;

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        {/* Logo */}
        <Link to="/" className="logo">
          <div className="logo-icon">
            <Wifi size={18} color="#fff" />
          </div>
          <span className="text-gradient">ProxiCell</span>
        </Link>

        {/* Nav Links */}
        <ul className="nav-links">
          <li><Link to="/" className={isActive('/')}>Home</Link></li>
          {session && (
            <li><Link to="/dashboard" className={isActive('/dashboard')}>My Proxies</Link></li>
          )}
        </ul>

        {/* Right side */}
        <div className="flex items-center gap-sm">
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
      </div>
    </nav>
  );
}
