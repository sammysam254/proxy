import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Wifi, Signal, Zap, Shield, Globe, ChevronRight,
  Server, Smartphone, CheckCircle, RefreshCw, Filter, Search
} from 'lucide-react';
import { getAvailableProxies, getPlans } from '../lib/supabase';
import SidebarLayout from '../components/SidebarLayout';
import PurchaseModal from '../components/PurchaseModal';
import ProxyTestModal from '../components/ProxyTestModal';
import { playClickSound } from '../lib/sound';

export default function ProxiesPage({ session }) {
  const [proxies, setProxies]     = useState([]);
  const [plans, setPlans]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selectedPlan, setSelectedPlan]   = useState(null);
  const [selectedProxy, setSelectedProxy] = useState(null);
  const [testingProxy, setTestingProxy]   = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'mobile' | 'residential'
  const [filterType, setFilterType]       = useState('all');
  const [searchQuery, setSearchQuery]     = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [proxiesRes, plansRes] = await Promise.all([
        getAvailableProxies(),
        getPlans(),
      ]);

      if (proxiesRes.data) setProxies(proxiesRes.data);
      if (plansRes.data) setPlans(plansRes.data);
    } catch (e) {
      toast.error('Failed to load proxy list.');
    } finally {
      setLoading(false);
    }
  }

  const isProxyDatacenter = (p) => {
    const m = p.modems;
    if (!m) return false;
    const dp = (m.device_path || '').toLowerCase();
    const lbl = (m.label || '').toLowerCase();
    const op = (m.operator || '').toLowerCase();
    return dp.includes('datacenter') || op.includes('datacenter') || lbl.includes('datacenter') || p.public_port >= 51000;
  };

  const isProxyWifi = (p) => {
    if (isProxyDatacenter(p)) return false;
    const m = p.modems;
    if (!m) return false;
    const dp = (m.device_path || '').toLowerCase();
    const lbl = (m.label || '').toLowerCase();
    const op = (m.operator || '').toLowerCase();
    const model = (m.model || '').toLowerCase();

    return dp.startsWith('wifi:') || 
           dp.includes('residential') || 
           lbl.includes('residential') || 
           lbl.includes('wi-fi') || 
           lbl.includes('wifi') || 
           op.includes('residential') || 
           op.includes('wi-fi') || 
           op.includes('wifi') || 
           op.includes('united states') ||
           op.includes('usa') ||
           model.includes('residential') ||
           m.is_wifi === true ||
           !m.is_android;
  };

  const onlineProxies = proxies.filter(p => p.active !== false && p.modems?.status === 'online');
  const dcCount       = onlineProxies.filter(p => isProxyDatacenter(p)).length;
  const resCount      = onlineProxies.filter(p => isProxyWifi(p)).length;
  const mobileCount   = onlineProxies.filter(p => !isProxyWifi(p) && !isProxyDatacenter(p)).length;

  const handleRentClick = (proxy) => {
    playClickSound();
    if (!session) {
      window.location.href = '/auth?tab=signup';
      return;
    }
    const isDc = isProxyDatacenter(proxy);
    const dcPlan = plans.find(p => p.name === 'Datacenter Monthly' || p.price_usd === 10) || plans[0];
    const defaultPlan = isDc ? dcPlan : (plans.find(p => p.name === 'Daily') || plans[0]);
    setSelectedProxy(proxy);
    setSelectedPlan(defaultPlan || null);
  };

  const filteredProxies = onlineProxies.filter(p => {
    const isDc = isProxyDatacenter(p);
    const isWifi = isProxyWifi(p);
    const subcategory = isDc ? 'datacenter' : (isWifi ? 'residential' : 'mobile');

    if (categoryFilter !== 'all' && subcategory !== categoryFilter) return false;

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
          {/* Header */}
          <div className="flex justify-between items-center mb-lg" style={{ flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', marginBottom: '4px' }}>
                Proxy Marketplace
              </h1>
              <p className="text-muted text-sm">
                Dedicated 4G/5G mobile SIM endpoints & residential Wi-Fi proxies ready for instant connection
              </p>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { playClickSound(); loadData(); }}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
              Refresh Status
            </button>
          </div>

          {/* Category Tabs */}
          <div className="scrollable-tabs" style={{
            marginBottom: '20px',
            background: 'var(--clr-surface)',
            padding: '6px',
            borderRadius: '12px',
            border: '1px solid var(--clr-border)',
            width: '100%',
            maxWidth: '100%',
          }}>
            <button
              onClick={() => { playClickSound(); setCategoryFilter('all'); }}
              className={`btn btn-sm ${categoryFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.85rem', padding: '6px 14px', flexShrink: 0 }}
            >
              All Proxies ({onlineProxies.length})
            </button>
            <button
              onClick={() => { playClickSound(); setCategoryFilter('residential'); }}
              className={`btn btn-sm ${categoryFilter === 'residential' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.85rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
            >
              <Wifi size={14} /> Residential ({resCount})
            </button>
            <button
              onClick={() => { playClickSound(); setCategoryFilter('datacenter'); }}
              className={`btn btn-sm ${categoryFilter === 'datacenter' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.85rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
            >
              <Server size={14} /> Datacenter $10/mo ({dcCount})
            </button>
            <button
              onClick={() => { playClickSound(); setCategoryFilter('mobile'); }}
              className={`btn btn-sm ${categoryFilter === 'mobile' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.85rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
            >
              <Smartphone size={14} /> Mobile ({mobileCount})
            </button>
          </div>

          {/* Search & Filter bar */}
          <div className="card mb-xl" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-3)' }} />
                <input
                  type="text"
                  placeholder="Search by carrier, network, or port..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="input"
                  style={{ paddingLeft: '38px', width: '100%' }}
                />
              </div>

              <div className="scrollable-tabs" style={{ display: 'flex', gap: '6px', padding: 0 }}>
                {['all', 'http', 'socks4', 'socks5'].map(t => (
                  <button
                    key={t}
                    onClick={() => { playClickSound(); setFilterType(t); }}
                    className={`btn btn-sm ${filterType === t ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px', flexShrink: 0 }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Proxy Grid */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div className="loader" style={{ margin: '0 auto 16px' }} />
              <div className="text-muted">Loading live proxy network...</div>
            </div>
          ) : filteredProxies.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
              <Wifi size={40} style={{ color: 'var(--clr-text-3)', margin: '0 auto 16px' }} />
              <h3 style={{ marginBottom: '6px' }}>No Proxies Found</h3>
              <p className="text-muted text-sm" style={{ maxWidth: '400px', margin: '0 auto 20px' }}>
                {categoryFilter !== 'all' 
                  ? `No live ${categoryFilter === 'residential' ? 'Residential (Wi-Fi)' : 'Mobile Dedicated'} proxies currently online.`
                  : 'Try adjusting your search query or protocol filter.'}
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSearchQuery(''); setFilterType('all'); setCategoryFilter('all'); }}>
                Reset Filters
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '16px' }}>
              {filteredProxies.map(p => {
                const modem = p.modems;
                const isOnline = modem?.status === 'online';
                const isWifi = isProxyWifi(p);

                const rawOp = modem?.operator || (isWifi ? 'Residential Wi-Fi' : 'Mobile 4G/5G LTE');
                const carrier = rawOp.replace(/[, \t\r\n]+$/, '').trim() || (isWifi ? 'Residential Wi-Fi' : 'Mobile 4G/5G LTE');
                const rawSerial = modem?.adb_serial || (modem?.device_path ? modem.device_path.replace(/^android:|^wifi:/, '') : '') || p.id.slice(0, 8);
                const serial = rawSerial.replace(/^android:|^wifi:/, '');

                const accentColor = isWifi ? '#06b6d4' : '#8b5cf6';
                const CardIcon    = isWifi ? Wifi : Smartphone;
                const subcategoryLabel = isWifi ? 'Residential (Wi-Fi)' : 'Mobile Dedicated';

                return (
                  <div
                    key={p.id}
                    className="card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      border: isOnline ? `1px solid ${accentColor}44` : '1px solid var(--clr-border)',
                      background: isOnline ? `linear-gradient(135deg, ${accentColor}0a 0%, rgba(59,130,246,0.04) 100%)` : 'var(--clr-surface)',
                    }}
                  >
                    {/* Header */}
                    <div className="flex justify-between items-center" style={{ marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                      <div className="flex items-center gap-sm">
                        <div style={{
                          width: 36, height: 36, borderRadius: 'var(--radius-md)',
                          background: `${accentColor}18`,
                          color: accentColor,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <CardIcon size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {isWifi ? (carrier.includes('USA') ? carrier : `USA Residential Proxy`) : carrier}
                            {isWifi && <span>🇺🇸</span>}
                          </div>
                          <div className="mono" style={{ fontSize: '0.75rem', color: accentColor }}>
                            {isWifi ? 'Location: United States 🇺🇸' : `Serial: #${serial}`}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span className="badge" style={{
                          background: `${accentColor}18`,
                          color: accentColor,
                          border: `1px solid ${accentColor}33`,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}>
                          <CardIcon size={10} /> {isWifi ? 'USA Residential' : subcategoryLabel}
                        </span>
                        <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`} style={{ fontSize: '0.7rem' }}>
                          <span className="dot" />
                          {isOnline ? 'Online' : 'Standby'}
                        </span>
                      </div>
                    </div>

                    {/* Specs / Details */}
                    <div style={{
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                      marginBottom: '16px',
                      fontSize: '0.8rem',
                    }}>
                      <div>
                        <div style={{ color: 'var(--clr-text-3)', fontSize: '0.7rem' }}>Protocol</div>
                        <div style={{ fontWeight: 700, color: 'var(--clr-accent)', textTransform: 'uppercase' }}>
                          {p.proxy_type}
                        </div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--clr-text-3)', fontSize: '0.7rem' }}>Location</div>
                        <div style={{ fontWeight: 600 }}>{isWifi ? 'United States 🇺🇸' : 'Dedicated 4G/5G'}</div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--clr-text-3)', fontSize: '0.7rem' }}>Speed</div>
                        <div style={{ fontWeight: 700, color: 'var(--clr-green)' }}>1 Gbps (Max Speed) ⚡</div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--clr-text-3)', fontSize: '0.7rem' }}>Public Port</div>
                        <div style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                          :{p.public_port}
                        </div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          playClickSound();
                          setTestingProxy(p);
                        }}
                        style={{
                          flex: '1',
                          padding: '10px 8px',
                          fontSize: '0.82rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                          border: '1px solid rgba(16,185,129,0.3)',
                          color: '#10b981',
                        }}
                        title="Test live connection & ISP response"
                      >
                        <Zap size={14} /> Test Live
                      </button>

                      <button
                        className="btn btn-primary"
                        onClick={() => handleRentClick(p)}
                        disabled={!isOnline}
                        style={{ flex: '2', padding: '10px 12px', fontSize: '0.88rem' }}
                      >
                        {isOnline ? (
                          <>Rent Proxy <ChevronRight size={15} /></>
                        ) : (
                          'Offline'
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Proxy Connection Test Modal */}
        {testingProxy && (
          <ProxyTestModal
            proxy={testingProxy}
            onClose={() => setTestingProxy(null)}
            onRent={(proxy) => {
              setTestingProxy(null);
              handleRentClick(proxy);
            }}
          />
        )}

        {/* Purchase Modal */}
        {selectedPlan && selectedProxy && (
          <PurchaseModal
            plan={selectedPlan}
            proxy={selectedProxy}
            proxies={proxies}
            onClose={() => { setSelectedPlan(null); setSelectedProxy(null); }}
            onSuccess={() => {
              setSelectedPlan(null);
              setSelectedProxy(null);
              window.location.href = '/dashboard';
            }}
          />
        )}
      </div>
    </SidebarLayout>
  );
}
