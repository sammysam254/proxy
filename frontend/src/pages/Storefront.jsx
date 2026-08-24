import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Wifi, Globe, Shield, Zap, ChevronRight, Check,
  Server, Activity, Lock, RefreshCw, Smartphone,
  Phone, Mail, MessageCircle, ExternalLink, MapPin
} from 'lucide-react';
import { getPlans, getAvailableProxies } from '../lib/supabase';
import PurchaseModal from '../components/PurchaseModal';
import SidebarLayout from '../components/SidebarLayout';

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
    'USA Residential & Real IPs',
    'Max 1 Gbps High-Speed Bandwidth',
    'Username + password auth',
    'Works in all proxy tools & browsers',
    'Instant IP rotation available',
    'Works worldwide with 99.9% uptime',
  ];

  const PROXY_TYPES = [
    { name: 'HTTP/HTTPS', desc: 'Standard web browsing, compatible with all browsers', color: '#10b981' },
    { name: 'SOCKS4',     desc: 'Lightweight protocol for TCP connections', color: '#3b82f6' },
    { name: 'SOCKS5',     desc: 'Full UDP/TCP support, best for streaming, scraping & gaming', color: '#8b5cf6' },
  ];

  return (
    <SidebarLayout session={session} adminMode={false}>
      <div style={{ width: '100%', overflowX: 'hidden' }}>
        {/* ─── Hero ─────────────────────────────────────────────────── */}
        <section className="hero">
          <div className="container">
            {/* Live stats badge */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <div className="badge badge-online" style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
                <span className="dot" />
                {stats.online} USA residential proxies online at max speed
              </div>
            </div>

            <h1 className="hero-title">
              USA Residential Proxies.<br />
              <span className="text-gradient">Max 1 Gbps Line Speed.</span>
            </h1>

            <p className="hero-subtitle">
              Route your traffic through high-speed USA residential networks.
              HTTP, SOCKS4, and SOCKS5 proxies — globally accessible,
              lightning fast, impossible to detect as datacenter IPs.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="#pricing" className="btn btn-primary btn-xl">
                View Pricing <ChevronRight size={18} />
              </a>
              {!session ? (
                <Link to="/auth" className="btn btn-secondary btn-xl">
                  Sign In
                </Link>
              ) : (
                <Link to="/dashboard" className="btn btn-secondary btn-xl">
                  Go to Dashboard
                </Link>
              )}
            </div>

            {/* Live stats row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '20px',
              maxWidth: '700px',
              margin: '40px auto 0',
            }}>
              {[
                { val: stats.total,              label: 'Total Proxies' },
                { val: stats.online,             label: 'Live Now' },
                { val: stats.types.length || 3,  label: 'Proxy Types' },
                { val: '4G/5G',                  label: 'Network Type' },
              ].map(({ val, label }) => (
                <div key={label} className="card" style={{ padding: '16px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--clr-text)' }}>
                    {val}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-2)', marginTop: '2px', fontWeight: 500 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Proxy Types ──────────────────────────────────────────── */}
        <section style={{ padding: '50px 0' }}>
          <div className="container">
            <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', marginBottom: '8px' }}>
              All Proxy Types Included
            </h2>
            <p style={{ textAlign: 'center', color: 'var(--clr-text-2)', marginBottom: '36px', fontSize: '0.95rem' }}>
              Every plan includes HTTP, SOCKS4, and SOCKS5 endpoints
            </p>

            <div className="grid grid-3" style={{ gap: '20px' }}>
              {PROXY_TYPES.map(pt => (
                <div key={pt.name} className="card" style={{ padding: '24px' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 'var(--radius-md)',
                    background: `${pt.color}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '16px', color: pt.color,
                  }}>
                    <Server size={22} />
                  </div>
                  <h3 style={{ marginBottom: '8px', fontSize: '1.2rem' }}>{pt.name}</h3>
                  <p className="text-muted text-sm">{pt.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Features ─────────────────────────────────────────────── */}
        <section style={{ padding: '60px 0', background: 'var(--clr-bg-2)' }}>
          <div className="container">
            <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', marginBottom: '8px' }}>
              Why Vertext Mobile Proxies?
            </h2>
            <p style={{ textAlign: 'center', color: 'var(--clr-text-2)', marginBottom: '40px', fontSize: '0.95rem' }}>
              Built on real 4G/5G mobile carriers with dedicated hardware
            </p>

            <div className="grid grid-3" style={{ gap: '20px' }}>
              {[
                {
                  icon: <Zap size={24} color="#8b5cf6" />,
                  title: 'Ultra High-Speed Residential Wi-Fi',
                  desc: 'Genuine residential USA Wi-Fi nodes delivering true 100% clean IP reputation for bypass, streaming, and anti-detect browsing.',
                },
                {
                  icon: <Shield size={24} color="#3b82f6" />,
                  title: 'Real Hardware ISP Exit Nodes',
                  desc: 'Every proxy is backed by an actual residential Wi-Fi connection and genuine ISP hardware — not simulated or datacenter IPs.',
                },
                {
                  icon: <RefreshCw size={24} color="#10b981" />,
                  title: 'Instant IP Rotation',
                  desc: 'Trigger airplane mode on the SIM modem to receive a fresh, clean mobile IP from the carrier in seconds.',
                },
                {
                  icon: <Lock size={24} color="#8b5cf6" />,
                  title: 'Zero Detection Risk',
                  desc: 'Websites and anti-bot systems see regular mobile phone traffic. Perfect for web automation, scraping, and social media.',
                },
                {
                  icon: <Globe size={24} color="#f59e0b" />,
                  title: 'Global Access',
                  desc: 'Connect from anywhere in the world. Traffic routes directly through your assigned mobile proxy port.',
                },
                {
                  icon: <Activity size={24} color="#06b6d4" />,
                  title: 'Real-Time Bandwidth Stats',
                  desc: 'Track exact byte consumption live down to the megabyte with automatic accounting and renewal alerts.',
                },
              ].map(f => (
                <div key={f.title} className="card" style={{ padding: '24px' }}>
                  <div style={{ marginBottom: '14px' }}>{f.icon}</div>
                  <h3 style={{ marginBottom: '8px', fontSize: '1.1rem' }}>{f.title}</h3>
                  <p className="text-muted text-sm">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Pricing ──────────────────────────────────────────────── */}
        <section id="pricing" style={{ padding: '70px 0' }}>
          <div className="container">
            <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', marginBottom: '8px' }}>
              Simple, Transparent Pricing
            </h2>
            <p style={{ textAlign: 'center', color: 'var(--clr-text-2)', marginBottom: '44px', fontSize: '0.95rem' }}>
              Choose the plan that fits your workflow. Instant provisioning upon payment.
            </p>

            <div className="grid grid-4" style={{ gap: '20px' }}>
              {plans.map(plan => {
                const isFeatured = plan.name === 'Weekly' || plan.name === 'Monthly';
                return (
                  <div
                    key={plan.id}
                    className={`pricing-card ${isFeatured ? 'featured' : ''}`}
                    style={{ display: 'flex', flexDirection: 'column' }}
                  >
                    <div style={{ color: 'var(--clr-accent)', marginBottom: '8px' }}>
                      {PLAN_ICONS[plan.name] || <Shield size={24} />}
                    </div>

                    <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>{plan.name}</div>
                    <p className="text-muted text-sm" style={{ minHeight: '36px' }}>{plan.description}</p>

                    <div style={{ margin: '14px 0' }}>
                      <span className="price-amount">${parseFloat(plan.price_usd).toFixed(0)}</span>
                      <span className="price-unit">
                        {plan.duration_days ? ` / ${plan.duration_days}d` : ' / GB'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', flex: 1 }}>
                      {FEATURES.map(f => (
                        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                          <Check size={14} color="var(--clr-green)" style={{ flexShrink: 0 }} />
                          <span>{f}</span>
                        </div>
                      ))}
                      {plan.gb_limit && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                          <Check size={14} color="var(--clr-green)" style={{ flexShrink: 0 }} />
                          <span><strong>{plan.gb_limit} GB</strong> data included</span>
                        </div>
                      )}
                    </div>

                    <button
                      className={`btn ${isFeatured ? 'btn-primary' : 'btn-secondary'} btn-full`}
                      onClick={() => handleSelectPlan(plan)}
                      style={{ padding: '12px' }}
                    >
                      Get Started <ChevronRight size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── CTA ──────────────────────────────────────────────────── */}
        <section style={{
          padding: '70px 0',
          background: 'var(--grad-hero)',
          textAlign: 'center',
          borderTop: '1px solid var(--clr-border)',
        }}>
          <div className="container-sm">
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', marginBottom: '16px' }}>
              Ready to Upgrade Your Proxy Setup?
            </h2>
            <p className="hero-subtitle" style={{ marginBottom: '32px' }}>
              Get started with undetectable mobile IPs powered by real SIM hardware.
            </p>
            <Link to="/auth?tab=signup" className="btn btn-primary btn-xl">
              Create Free Account <ChevronRight size={20} />
            </Link>
          </div>
        </section>

        {/* ─── Professional Footer ────────────────────────────────────────────── */}
        <footer style={{
          borderTop: '1px solid var(--clr-border)',
          background: 'var(--clr-bg-2)',
          paddingTop: '60px',
          paddingBottom: '30px',
          color: 'var(--clr-text-2)',
          fontSize: '0.9rem',
        }}>
          <div className="container">
            {/* Top Footer Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '40px',
              marginBottom: '50px',
            }}>
              {/* Col 1: Brand & About */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="logo-icon"><img src="/logo.jpg" alt="Vertext Proxies Logo" className="logo-img" /></div>
                  <span className="text-gradient" style={{ fontWeight: 800, fontSize: '1.25rem' }}>Vertext Proxies</span>
                </div>
                <p style={{ color: 'var(--clr-text-3)', lineHeight: 1.6, fontSize: '0.875rem', margin: 0 }}>
                  High-speed, enterprise-grade USA Residential & 4G/5G Mobile Proxies powered by real hardware Wi-Fi and SIM cards. 100% clean IP reputation with zero detection.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{ display: 'inline-flex', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                  <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>All Systems Operational (99.9% SLA)</span>
                </div>
              </div>

              {/* Col 2: Direct Contact & Support */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ color: 'var(--clr-text)', fontSize: '1rem', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Contact & Support
                </h4>
                
                {/* Phone Call */}
                <a
                  href="tel:+254706499848"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: 'var(--clr-text)',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#3b82f6'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--clr-text)'}
                >
                  <div style={{ padding: '6px', background: 'rgba(59, 130, 246, 0.12)', borderRadius: '6px', color: '#3b82f6' }}>
                    <Phone size={16} />
                  </div>
                  <span>+254 706 499 848 (Call)</span>
                </a>

                {/* WhatsApp */}
                <a
                  href="https://wa.me/254706499848?text=Hello%20Vertext%20Proxies%2C%20I%20would%20like%20to%20inquire%20about%20your%20proxy%20services."
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#25D366',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  <div style={{ padding: '6px', background: 'rgba(37, 211, 102, 0.12)', borderRadius: '6px', color: '#25D366' }}>
                    <MessageCircle size={16} />
                  </div>
                  <span>Chat on WhatsApp (24/7)</span>
                </a>

                {/* Email */}
                <a
                  href="mailto:sammyseth260@gmail.com"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: 'var(--clr-text)',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#8b5cf6'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--clr-text)'}
                >
                  <div style={{ padding: '6px', background: 'rgba(139, 92, 246, 0.12)', borderRadius: '6px', color: '#8b5cf6' }}>
                    <Mail size={16} />
                  </div>
                  <span>sammyseth260@gmail.com</span>
                </a>

                {/* Location */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--clr-text-3)', fontSize: '0.85rem' }}>
                  <div style={{ padding: '6px', background: 'var(--clr-surface)', borderRadius: '6px' }}>
                    <MapPin size={16} />
                  </div>
                  <span>USA Residential & Global Exit Nodes</span>
                </div>
              </div>

              {/* Col 3: Proxy Products & Solutions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ color: 'var(--clr-text)', fontSize: '1rem', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Proxy Network
                </h4>
                <div style={{ color: 'var(--clr-text-3)', fontSize: '0.875rem' }}>• USA Residential Wi-Fi Proxies</div>
                <div style={{ color: 'var(--clr-text-3)', fontSize: '0.875rem' }}>• 4G/5G Rotating Mobile SIM Proxies</div>
                <div style={{ color: 'var(--clr-text-3)', fontSize: '0.875rem' }}>• Dual SOCKS5 & HTTP/HTTPS Protocols</div>
                <div style={{ color: 'var(--clr-text-3)', fontSize: '0.875rem' }}>• Uncapped 1 Gbps+ Kernel Throughput</div>
                <div style={{ color: 'var(--clr-text-3)', fontSize: '0.875rem' }}>• Real-Time Byte & Quota Tracking</div>
              </div>

              {/* Col 4: Quick Navigation & Account */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ color: 'var(--clr-text)', fontSize: '1rem', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Navigation
                </h4>
                <Link to="/" style={{ color: 'var(--clr-text-3)', textDecoration: 'none', transition: 'color 0.2s' }}>Home Store</Link>
                <Link to="/proxies" style={{ color: 'var(--clr-text-3)', textDecoration: 'none', transition: 'color 0.2s' }}>Available Proxies</Link>
                <Link to="/dashboard" style={{ color: 'var(--clr-text-3)', textDecoration: 'none', transition: 'color 0.2s' }}>Client Dashboard</Link>
                <Link to="/auth" style={{ color: 'var(--clr-text-3)', textDecoration: 'none', transition: 'color 0.2s' }}>Sign In / Register</Link>
                <Link to="/settings" style={{ color: 'var(--clr-text-3)', textDecoration: 'none', transition: 'color 0.2s' }}>Account Settings</Link>
              </div>
            </div>

            {/* Bottom Divider & Legal Bar */}
            <div style={{
              borderTop: '1px solid var(--clr-border)',
              paddingTop: '24px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              color: 'var(--clr-text-3)',
              fontSize: '0.825rem',
            }}>
              <div>
                © {new Date().getFullYear()} <strong style={{ color: 'var(--clr-text)' }}>Vertext Proxies</strong>. All rights reserved. Real mobile & residential proxy network.
              </div>
              <div style={{ display: 'flex', gap: '20px' }}>
                <span>Privacy Policy</span>
                <span>•</span>
                <span>Terms of Service</span>
                <span>•</span>
                <span>Anti-Abuse Policy</span>
              </div>
            </div>
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
      </div>
    </SidebarLayout>
  );
}
