import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Wifi, Globe, Shield, Zap, ChevronRight, Check,
  Server, Activity, Lock, RefreshCw
} from 'lucide-react';
import { getPlans, getAvailableProxies } from '../lib/supabase';
import PurchaseModal from '../components/PurchaseModal';

export default function Storefront({ session }) {
  const [plans, setPlans] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [stats, setStats] = useState({ total: 0, online: 0, types: [] });
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedProxy, setSelectedProxy] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [plansRes, proxiesRes] = await Promise.all([
      getPlans(),
      getAvailableProxies(),
    ]);

    if (plansRes.data) setPlans(plansRes.data);

    if (proxiesRes.data) {
      setProxies(proxiesRes.data);
      const online = proxiesRes.data.filter(p => p.modems?.status === 'online').length;
      setStats({
        total:  proxiesRes.data.length,
        online,
        types:  [...new Set(proxiesRes.data.map(p => p.proxy_type))],
      });
    }
  }

  const handleSelectPlan = (plan) => {
    if (!session) {
      window.location.href = '/auth?tab=signup';
      return;
    }
    setSelectedPlan(plan);
    // Pre-select first online proxy
    const onlineProxy = proxies.find(p => p.modems?.status === 'online');
    setSelectedProxy(onlineProxy || proxies[0] || null);
  };

  const PLAN_ICONS = {
    'Pay Per GB': <Activity size={24} />,
    'Daily':      <Zap size={24} />,
    'Weekly':     <Shield size={24} />,
    'Monthly':    <Globe size={24} />,
  };

  const FEATURES = [
    'HTTP, SOCKS4 & SOCKS5 support',
    'Real SIM card IPs (mobile)',
    'Username + password auth',
    'Works in all proxy tools & browsers',
    'IP rotation available',
    'Works worldwide',
  ];

  const PROXY_TYPES = [
    { name: 'HTTP/HTTPS', desc: 'Standard web browsing, compatible with all browsers', color: '#10b981' },
    { name: 'SOCKS4',     desc: 'Lightweight protocol for TCP connections', color: '#3b82f6' },
    { name: 'SOCKS5',     desc: 'Full UDP support, best for streaming & gaming', color: '#8b5cf6' },
  ];

  return (
    <main>
      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="container">
          {/* Live stats badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <div className="badge badge-online" style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
              <span className="dot" />
              {stats.online} proxies online right now
            </div>
          </div>

          <h1 className="hero-title">
            Real SIM Card Proxies.<br />
            <span className="text-gradient">True Mobile IPs.</span>
          </h1>

          <p className="hero-subtitle">
            Route your traffic through real 4G/5G SIM cards.
            HTTP, SOCKS4, and SOCKS5 proxies — globally accessible,
            impossible to detect as datacenter IPs.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#pricing" className="btn btn-primary btn-xl">
              View Pricing <ChevronRight size={18} />
            </a>
            {!session && (
              <Link to="/auth" className="btn btn-secondary btn-xl">
                Sign In
              </Link>
            )}
          </div>

          {/* Live stats row */}
          <div style={{
            display: 'flex', gap: '40px', justifyContent: 'center',
            marginTop: '48px', flexWrap: 'wrap',
          }}>
            {[
              { val: stats.total,              label: 'Total Proxies' },
              { val: stats.online,             label: 'Live Now' },
              { val: stats.types.length || 3,  label: 'Proxy Types' },
              { val: '4G/5G',                  label: 'Network Type' },
            ].map(({ val, label }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
                  {val}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)', marginTop: '2px' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Proxy Types ──────────────────────────────────────────── */}
      <section style={{ padding: '60px 0' }}>
        <div className="container">
          <h2 style={{ textAlign: 'center', fontSize: '2rem', marginBottom: '8px' }}>
            All Proxy Types Included
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--clr-text-2)', marginBottom: '40px' }}>
            Every plan includes HTTP, SOCKS4, and SOCKS5 endpoints
          </p>

          <div className="grid-3">
            {PROXY_TYPES.map(pt => (
              <div key={pt.name} className="card" style={{ textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: `${pt.color}20`, margin: '0 auto 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 700, color: pt.color,
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  {pt.name.split('/')[0][0]}
                </div>
                <h3 style={{ marginBottom: '8px' }}>{pt.name}</h3>
                <p style={{ color: 'var(--clr-text-2)', fontSize: '0.9rem' }}>{pt.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ──────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '60px 0 80px' }}>
        <div className="container">
          <h2 style={{ textAlign: 'center', fontSize: '2rem', marginBottom: '8px' }}>
            Simple, Transparent Pricing
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--clr-text-2)', marginBottom: '48px' }}>
            Pay per GB or choose a time-based plan. No hidden fees.
          </p>

          <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {plans.map((plan, i) => (
              <div
                key={plan.id}
                className={`pricing-card ${plan.name === 'Monthly' ? 'featured' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--clr-accent)' }}>
                  {PLAN_ICONS[plan.name] || <Wifi size={24} />}
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{plan.name}</span>
                </div>

                <div>
                  <span className="price-amount">
                    ${parseFloat(plan.price_usd).toFixed(0)}
                  </span>
                  <span className="price-unit">
                    {plan.gb_limit ? ` / ${plan.gb_limit}GB` : plan.duration_days === 1 ? '/day' : plan.duration_days === 7 ? '/week' : '/month'}
                  </span>
                </div>

                <p style={{ color: 'var(--clr-text-2)', fontSize: '0.9rem' }}>
                  {plan.description}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {FEATURES.slice(0, 4).map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--clr-text-2)' }}>
                      <Check size={14} color="var(--clr-green)" style={{ flexShrink: 0 }} />
                      {f}
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-primary btn-full"
                  onClick={() => handleSelectPlan(plan)}
                >
                  Get Started
                  <ChevronRight size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────────── */}
      <section style={{ padding: '60px 0', borderTop: '1px solid var(--clr-border)' }}>
        <div className="container">
          <div className="grid-2" style={{ gap: '60px', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '2.2rem', marginBottom: '16px' }}>
                Why Mobile Proxies?
              </h2>
              <p style={{ color: 'var(--clr-text-2)', marginBottom: '28px' }}>
                Unlike datacenter proxies, real SIM card IPs come from mobile carrier
                networks. They're trusted by every website and bypass most anti-bot systems.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {FEATURES.map(f => (
                  <div key={f} className="flex items-center gap-sm">
                    <div style={{
                      width: 24, height: 24, borderRadius: 8,
                      background: 'rgba(16,185,129,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Check size={13} color="var(--clr-green)" />
                    </div>
                    <span style={{ fontSize: '0.95rem' }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { icon: <Server size={22} />, title: 'Real Hardware',     desc: 'Physical USB modems with real SIM cards — not virtual or shared IPs.' },
                { icon: <Lock size={22} />,   title: 'Authenticated',     desc: 'Each subscription gets unique username + password credentials.' },
                { icon: <RefreshCw size={22} />, title: 'IP Rotation',    desc: 'Request a new IP by reconnecting the modem. Once per hour.' },
                { icon: <Globe size={22} />,  title: 'Works Everywhere',  desc: 'Compatible with every browser, proxy tool, and automation framework.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="card" style={{ flexDirection: 'row', gap: '16px', padding: '16px', display: 'flex', alignItems: 'flex-start' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(59,130,246,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--clr-accent)', flexShrink: 0,
                  }}>{icon}</div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{title}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--clr-text-2)' }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 0', textAlign: 'center' }}>
        <div className="container-sm">
          <h2 style={{ fontSize: '2.5rem', marginBottom: '16px' }}>
            Ready to get started?
          </h2>
          <p style={{ color: 'var(--clr-text-2)', marginBottom: '32px', fontSize: '1.1rem' }}>
            Create an account in seconds and get your first proxy running.
          </p>
          <Link to="/auth?tab=signup" className="btn btn-primary btn-xl">
            Create Free Account <ChevronRight size={20} />
          </Link>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--clr-border)',
        padding: '32px 0',
        textAlign: 'center',
        color: 'var(--clr-text-3)',
        fontSize: '0.875rem',
      }}>
        <div className="container">
          <div className="flex items-center justify-center gap-md" style={{ marginBottom: '16px' }}>
            <div className="logo-icon"><Wifi size={16} color="#fff" /></div>
            <span className="text-gradient" style={{ fontWeight: 700 }}>ProxiCell</span>
          </div>
          <p>© {new Date().getFullYear()} ProxiCell. Real mobile proxies for professionals.</p>
        </div>
      </footer>

      {/* ─── Purchase Modal ───────────────────────────────────────── */}
      {selectedPlan && (
        <PurchaseModal
          plan={selectedPlan}
          proxy={selectedProxy}
          proxies={proxies}
          onClose={() => setSelectedPlan(null)}
          onSuccess={() => { setSelectedPlan(null); window.location.href = '/dashboard'; }}
        />
      )}
    </main>
  );
}
