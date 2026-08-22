import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Wifi, Signal, Zap, Shield, Globe, ChevronRight,
  Server, Smartphone, CheckCircle, RefreshCw, Filter, Search
} from 'lucide-react';
import { getAvailableProxies, getPlans } from '../lib/supabase';
import SidebarLayout from '../components/SidebarLayout';
import PurchaseModal from '../components/PurchaseModal';
import { playClickSound } from '../lib/sound';

export default function ProxiesPage({ session }) {
  const [proxies, setProxies]     = useState([]);
  const [plans, setPlans]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selectedPlan, setSelectedPlan]   = useState(null);
  const [selectedProxy, setSelectedProxy] = useState(null);
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

  const handleRentClick = (proxy) => {
    playClickSound();
    if (!session) {
      window.location.href = '/auth?tab=signup';
      return;
    }
    // Default to the first plan (e.g. Daily or Pay Per GB)
    const defaultPlan = plans.find(p => p.name === 'Daily') || plans[0];
    setSelectedProxy(proxy);
    setSelectedPlan(defaultPlan || null);
  };

  const filteredProxies = proxies.filter(p => {
    const modem = p.modems;
    if (modem?.status !== 'online') return false;

    const matchesSearch = !searchQuery || 
      (modem?.label && modem.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (modem?.operator && modem.operator.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.proxy_type && p.proxy_type.toLowerCase().includes(searchQuery.toLowerCase()));

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
                Available Mobile Proxies
              </h1>
              <p className="text-muted text-sm">
                Dedicated 4G/5G mobile SIM card endpoints ready for instant rent & connection
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

          {/* Search & Filter bar */}
          <div className="card mb-xl" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-text-3)' }} />
                <input
                  type="text"
                  placeholder="Search by carrier, device model, or type..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="input"
                  style={{ paddingLeft: '38px', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['all', 'http', 'socks4', 'socks5'].map(t => (
                  <button
                    key={t}
                    onClick={() => { playClickSound(); setFilterType(t); }}
                    className={`btn btn-sm ${filterType === t ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700 }}
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
              <div className="text-muted">Loading live mobile hardware...</div>
            </div>
          ) : filteredProxies.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '50px 20px' }}>
              <Wifi size={40} style={{ color: 'var(--clr-text-3)', margin: '0 auto 16px' }} />
              <h3 style={{ marginBottom: '6px' }}>No Proxies Found</h3>
              <p className="text-muted text-sm" style={{ maxWidth: '400px', margin: '0 auto 20px' }}>
                Try adjusting your search query or protocol filter.
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSearchQuery(''); setFilterType('all'); }}>
                Reset Filters
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {filteredProxies.map(p => {
                const modem = p.modems;
                const isOnline = modem?.status === 'online';

                return (
                  <div
                    key={p.id}
                    className="card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      border: isOnline ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--clr-border)',
                      background: isOnline ? 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(59,130,246,0.04) 100%)' : 'var(--clr-surface)',
                    }}
                  >
                    {/* Header */}
                    <div className="flex justify-between items-center" style={{ marginBottom: '14px' }}>
                      <div className="flex items-center gap-sm">
                        <div style={{
                          width: 36, height: 36, borderRadius: 'var(--radius-md)',
                          background: 'rgba(59,130,246,0.15)',
                          color: 'var(--clr-accent)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Wifi size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                            {modem?.operator || 'Mobile 4G/5G LTE'}
                          </div>
                          <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--clr-text-2)' }}>
                            Serial: #{modem?.adb_serial || modem?.device_path || p.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>

                      <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`} style={{ fontSize: '0.75rem' }}>
                        <span className="dot" />
                        {isOnline ? 'Online' : 'Standby'}
                      </span>
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
                        <div style={{ color: 'var(--clr-text-3)', fontSize: '0.7rem' }}>Network Type</div>
                        <div style={{ fontWeight: 600 }}>4G LTE / 5G</div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--clr-text-3)', fontSize: '0.7rem' }}>IP Rotation</div>
                        <div style={{ fontWeight: 600, color: 'var(--clr-green)' }}>Supported ⚡</div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--clr-text-3)', fontSize: '0.7rem' }}>Public Port</div>
                        <div style={{ fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                          :{p.public_port}
                        </div>
                      </div>
                    </div>

                    {/* Rent Action */}
                    <div style={{ marginTop: 'auto' }}>
                      <button
                        className="btn btn-primary btn-full"
                        onClick={() => handleRentClick(p)}
                        disabled={!isOnline}
                        style={{ padding: '12px' }}
                      >
                        {isOnline ? (
                          <>Rent This Proxy <ChevronRight size={16} /></>
                        ) : (
                          'Currently Offline'
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
