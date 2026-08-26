import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Server, Zap, Shield, Globe, ChevronRight, CheckCircle,
  RefreshCw, Filter, Search, Copy, Check, Activity, Lock, Cpu
} from 'lucide-react';
import { getAvailableDatacenterProxies, getPlans } from '../lib/supabase';
import SidebarLayout from '../components/SidebarLayout';
import PurchaseModal from '../components/PurchaseModal';
import { playClickSound, playSuccessSound } from '../lib/sound';

export default function DatacenterProxiesPage({ session }) {
  const [proxies, setProxies]         = useState([]);
  const [plans, setPlans]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selectedPlan, setSelectedPlan]   = useState(null);
  const [selectedProxy, setSelectedProxy] = useState(null);
  const [filterType, setFilterType]   = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPort, setCopiedPort]   = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [proxiesRes, plansRes] = await Promise.all([
        getAvailableDatacenterProxies(),
        getPlans(),
      ]);

      if (proxiesRes.data) {
        setProxies(proxiesRes.data);
      }

      if (plansRes.data) {
        setPlans(plansRes.data);
      }
    } catch (e) {
      toast.error('Failed to load datacenter proxy list.');
    } finally {
      setLoading(false);
    }
  }

  // Get the dedicated $10 USD/mo Datacenter Plan
  const datacenterPlan = plans.find(p => p.name === 'Datacenter Monthly' || (p.price_usd === 10 && p.duration_days === 30)) || {
    name: 'Datacenter Monthly',
    price_usd: 10.00,
    duration_days: 30,
    gb_limit: null,
    description: 'Dedicated High-Speed DigitalOcean Datacenter Proxy (10 USD / Month, 99.99% SLA, 10 Gbps Port, Unlimited Bandwidth)'
  };

  const handleRentClick = (proxy) => {
    playClickSound();
    if (!session) {
      window.location.href = '/auth?tab=signup';
      return;
    }
    setSelectedProxy(proxy);
    setSelectedPlan(datacenterPlan);
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedPort(key);
    playSuccessSound();
    toast.success(`Copied: ${text}`);
    setTimeout(() => setCopiedPort(null), 2000);
  };

  const filteredProxies = proxies.filter(p => {
    const matchesSearch = !searchQuery || 
      (p.modems?.label && p.modems.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.modems?.operator && p.modems.operator.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.proxy_type && p.proxy_type.toLowerCase().includes(searchQuery.toLowerCase())) ||
      String(p.public_port).includes(searchQuery);

    const matchesType = filterType === 'all' || p.proxy_type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <SidebarLayout session={session} adminMode={false}>
      <div style={{ padding: '32px 0', minHeight: '85vh' }}>
        <div className="container">
          
          {/* Header Banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(139,92,246,0.08) 100%)',
            border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: '20px',
            padding: '32px',
            marginBottom: '32px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ maxWidth: '650px' }}>
                <div className="badge badge-blue" style={{ marginBottom: '12px', padding: '6px 14px' }}>
                  <Server size={14} /> Tier-1 DigitalOcean Datacenter Network
                </div>
                <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', marginBottom: '8px', letterSpacing: '-0.02em' }}>
                  USA Datacenter Proxies
                </h1>
                <p style={{ color: 'var(--clr-text-2)', fontSize: '0.98rem', lineHeight: '1.6' }}>
                  Blazing-fast 10 Gbps unmetered bandwidth on static USA datacenter infrastructure.
                  Ideal for high-throughput tasks, scraping, automation, and streaming with 99.99% guaranteed SLA uptime.
                </p>

                <div style={{ display: 'flex', gap: '16px', marginTop: '20px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                    <CheckCircle size={16} color="#10b981" /> 10 Gbps Uncapped Port Speed
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                    <CheckCircle size={16} color="#10b981" /> Dedicated Port Range (51001 - 53010)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                    <CheckCircle size={16} color="#10b981" /> Static Dedicated IP (104.131.118.5)
                  </div>
                </div>
              </div>

              {/* $10 Plan Highlight Card */}
              <div className="card" style={{
                background: 'var(--clr-bg-2)',
                border: '2px solid var(--clr-accent)',
                borderRadius: '16px',
                padding: '24px',
                minWidth: '260px',
                textAlign: 'center',
                boxShadow: '0 8px 30px rgba(139,92,246,0.15)',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Flat Monthly Rate
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--clr-text)', margin: '8px 0' }}>
                  $10 <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--clr-text-2)' }}>/ month</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--clr-text-2)', marginBottom: '16px' }}>
                  Unlimited GB Data · 30 Days Access
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '10px', fontSize: '0.95rem' }}
                  onClick={() => {
                    const firstOnline = proxies.find(p => p.modems?.status === 'online') || proxies[0];
                    if (firstOnline) handleRentClick(firstOnline);
                    else {
                      if (!session) window.location.href = '/auth?tab=signup';
                      else toast.error('No datacenter proxies online right now.');
                    }
                  }}
                >
                  Rent Datacenter Proxy <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Search & Protocol Filter Row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['all', 'http', 'socks4', 'socks5'].map(t => (
                <button
                  key={t}
                  onClick={() => { playClickSound(); setFilterType(t); }}
                  className={`btn btn-sm ${filterType === t ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.85rem', textTransform: 'uppercase' }}
                >
                  {t === 'all' ? 'All Protocols' : t}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-3)' }} />
                <input
                  type="text"
                  placeholder="Search port / node..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    borderRadius: '10px',
                    background: 'var(--clr-surface)',
                    border: '1px solid var(--clr-border)',
                    color: 'var(--clr-text)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { playClickSound(); loadData(); }}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'spin-icon' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* Proxies Grid */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--clr-text-2)' }}>
              <RefreshCw size={32} className="spin-icon" style={{ margin: '0 auto 16px', display: 'block', color: 'var(--clr-accent)' }} />
              Loading DigitalOcean Datacenter Proxies...
            </div>
          ) : filteredProxies.length === 0 ? (
            <div className="card" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <Server size={48} style={{ margin: '0 auto 16px', color: 'var(--clr-text-3)', opacity: 0.6 }} />
              <h3>No Datacenter Proxies Found</h3>
              <p style={{ color: 'var(--clr-text-2)', maxWidth: '450px', margin: '8px auto 20px', fontSize: '0.9rem' }}>
                All 10 Datacenter proxy slots are configured on DigitalOcean VPS (104.131.118.5). Check back shortly or sync with server.
              </p>
              <button className="btn btn-primary btn-sm" onClick={loadData}>
                <RefreshCw size={14} /> Refresh List
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '20px',
            }}>
              {filteredProxies.map((p) => {
                const isOnline = p.active !== false;
                const host = p.vps_host || '104.131.118.5';
                const port = p.public_port;
                const endpoint = `${host}:${port}`;
                const isCopied = copiedPort === p.id;

                return (
                  <div
                    key={p.id}
                    className="card"
                    style={{
                      border: '1px solid rgba(59,130,246,0.2)',
                      background: 'var(--clr-surface)',
                      borderRadius: '16px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />

                    {/* Top Row: Label & Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 10,
                          background: 'rgba(59,130,246,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#3b82f6',
                        }}>
                          <Server size={20} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)' }}>
                            {p.modems?.label || `Datacenter Slot (Port ${port})`}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-2)' }}>
                            {p.modems?.operator || 'DigitalOcean Datacenter 🇺🇸'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`} style={{ fontSize: '0.75rem' }}>
                          <span className="dot" /> {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                          {p.proxy_type?.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Endpoint Box */}
                    <div style={{
                      background: 'var(--clr-bg-2)',
                      border: '1px solid var(--clr-border)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                    }}>
                      <div>
                        <span style={{ color: 'var(--clr-text-3)', fontSize: '0.75rem' }}>Endpoint: </span>
                        <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{endpoint}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(endpoint, p.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '4px 8px', height: 'auto' }}
                        title="Copy endpoint"
                      >
                        {isCopied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                      </button>
                    </div>

                    {/* Specs / Meta Details */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      fontSize: '0.78rem',
                      color: 'var(--clr-text-2)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Zap size={13} color="#eab308" /> 10 Gbps Port Speed
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Shield size={13} color="#10b981" /> 99.99% SLA Uptime
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Globe size={13} color="#3b82f6" /> USA Static IPv4
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Lock size={13} color="#8b5cf6" /> User + Pass Auth
                      </div>
                    </div>

                    {/* Action button */}
                    <button
                      onClick={() => handleRentClick(p)}
                      className="btn btn-primary"
                      style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '0.9rem',
                        marginTop: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      disabled={!isOnline}
                    >
                      Rent for $10 / mo <ChevronRight size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      {/* Purchase Modal */}
      {selectedPlan && selectedProxy && (
        <PurchaseModal
          plan={selectedPlan}
          proxy={selectedProxy}
          onClose={() => { setSelectedPlan(null); setSelectedProxy(null); }}
          onSuccess={() => {
            setSelectedPlan(null);
            setSelectedProxy(null);
            loadData();
          }}
        />
      )}
    </SidebarLayout>
  );
}
