import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Wifi, Users, DollarSign, Activity, RefreshCw, Power,
  Server, Signal, Database, Shield, ChevronDown,
  Smartphone, Battery, Usb, Globe, TrendingUp
} from 'lucide-react';
import { getAdminModems, getAdminStats, supabase, isAdmin } from '../lib/supabase';
import SidebarLayout from '../components/SidebarLayout';

// ─── Signal bars ──────────────────────────────────────────────────────────────
function SignalBars({ strength }) {
  const filled = Math.ceil(((strength || 0) / 100) * 4);
  return (
    <div className="signal-bars">
      {[1,2,3,4].map(i => (
        <div key={i} className={`signal-bar ${i <= filled ? 'active' : ''}`} />
      ))}
    </div>
  );
}

// ─── Device Card (used for both modems and Android phones) ───────────────────
function DeviceCard({ device, onRotate, type = 'modem' }) {
  const [rotating, setRotating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const proxies   = device.proxies || [];
  const isOnline  = device.status === 'online';
  const dataMB    = ((device.data_used_bytes || 0) / (1024 ** 2)).toFixed(1);
  const isAndroid = type === 'android';

  const handleRotate = async () => {
    setRotating(true);
    try {
      await onRotate(device.id);
      toast.success(`Rotating IP for ${device.label}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRotating(false);
    }
  };

  const StatusIcon = isAndroid ? Smartphone : Wifi;
  const accentColor = isAndroid ? '#8b5cf6' : (isOnline ? '#10b981' : '#ef4444');

  return (
    <div className="card" style={{
      border: `1px solid ${isOnline ? (isAndroid ? 'rgba(139,92,246,0.25)' : 'rgba(16,185,129,0.2)') : 'var(--clr-border)'}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: accentColor,
      }} />

      <div className="flex justify-between items-center" style={{ marginTop: '4px' }}>
        <div className="flex items-center gap-md">
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${accentColor}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <StatusIcon size={20} color={accentColor} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{device.label}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>
              {device.operator || (isAndroid ? 'Android Phone' : 'Unknown Carrier')}
              {device.interface && ` · ${device.interface}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-sm">
          {isAndroid && (
            <span className="badge badge-purple">
              <Smartphone size={10} /> Android
            </span>
          )}
          <span className={`badge badge-${isOnline ? 'online' : 'offline'}`}>
            <span className="dot" />
            {device.status}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isAndroid ? 'repeat(4,1fr)' : 'repeat(3,1fr)',
        gap: '8px',
      }}>
        {[
          { icon: <Activity size={12} />,  label: 'IP',      value: device.ip_address || '—' },
          { icon: <Signal size={12} />,    label: 'Signal',  value: <SignalBars strength={device.signal || 0} /> },
          { icon: <Database size={12} />,  label: 'Data',    value: `${dataMB} MB` },
          ...(isAndroid ? [{ icon: <Battery size={12} />, label: 'Battery', value: device.battery ? `${device.battery}%` : '—' }] : []),
        ].map(({ icon, label, value }) => (
          <div key={label} style={{
            background: 'var(--clr-surface)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--clr-text-2)', marginBottom: '4px', fontSize: '0.65rem' }}>
              {icon} {label}
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Android info */}
      {isAndroid && device.model && (
        <div style={{
          display: 'flex', gap: '8px', flexWrap: 'wrap',
        }}>
          {device.model && <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{device.model}</span>}
          {device.android_version && <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>Android {device.android_version}</span>}
          {device.adb_serial && <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--clr-text-3)' }}>ADB: {device.adb_serial}</span>}
        </div>
      )}

      {/* Proxy ports */}
      {proxies.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 0' }}
          >
            <Server size={13} />
            {proxies.length} proxy port{proxies.length !== 1 ? 's' : ''}
            <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </button>

          {expanded && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {proxies.map(p => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px',
                  background: 'var(--clr-surface)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                }}>
                  <span className={`proxy-chip ${p.proxy_type}`}>{p.proxy_type}</span>
                  <span className="mono text-muted">{p.vps_host}:{p.public_port}</span>
                  <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--clr-text-3)' }}>
                    :{p.local_port}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-sm">
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRotate}
          disabled={rotating || !isOnline}
        >
          <RefreshCw size={13} />
          Rotate IP
        </button>
        {isAndroid && isOnline && (
          <span className="flex items-center gap-sm text-sm" style={{ color: 'var(--clr-text-3)' }}>
            <Usb size={13} /> USB Tethering Active
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Overview panel ───────────────────────────────────────────────────────────
function Overview({ stats, modems, onRotate, onRefresh }) {
  const usbModems  = modems.filter(m => !m.is_android);
  const androidDev = modems.filter(m => m.is_android);

  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>Admin Overview</h1>
          <p className="text-muted">ProxiCell system status</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="stats-grid mb-xl">
        {[
          { label: 'Total Revenue',    value: `$${(stats.totalRevenue || 0).toFixed(2)}`, icon: <DollarSign size={18} />, color: '#10b981' },
          { label: 'Active Subs',      value: stats.activeSubs    || 0, icon: <Users size={18} />,       color: '#3b82f6' },
          { label: 'Online Modems',    value: stats.onlineModems  || 0, icon: <Wifi size={18} />,        color: '#8b5cf6' },
          { label: 'Android Devices',  value: androidDev.filter(d => d.status === 'online').length, icon: <Smartphone size={18} />, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: s.color }}>
              {s.icon}
              <span className="stat-label" style={{ margin: 0 }}>{s.label}</span>
            </div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Quick device list */}
      <h2 style={{ fontSize: '1.2rem', marginBottom: '14px' }}>All Active Devices</h2>
      <div className="grid-auto">
        {modems.filter(m => m.status === 'online').map(m => (
          <DeviceCard key={m.id} device={m} onRotate={onRotate} type={m.is_android ? 'android' : 'modem'} />
        ))}
        {modems.filter(m => m.status === 'online').length === 0 && (
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px' }}>
            <p className="text-muted">No devices online. Plug in USB modems or Android phones.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modems panel ─────────────────────────────────────────────────────────────
function ModemsPanel({ modems, onRotate, onRefresh }) {
  const usbModems = modems.filter(m => !m.is_android);
  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>
            USB Modems
            <span className="badge badge-blue" style={{ marginLeft: '10px', verticalAlign: 'middle' }}>
              {usbModems.length}
            </span>
          </h1>
          <p className="text-muted">Physical USB modems with SIM cards</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {usbModems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
          <Wifi size={40} color="var(--clr-text-3)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ marginBottom: '8px' }}>No USB Modems Detected</h3>
          <p className="text-muted">Plug in USB modems with SIM cards on your local machine and ensure the modem manager is running.</p>
          <div style={{ marginTop: '20px', background: 'var(--clr-surface)', borderRadius: 'var(--radius-md)', padding: '14px', fontFamily: 'monospace', fontSize: '0.8rem', textAlign: 'left' }}>
            journalctl -u proxicell-manager -f
          </div>
        </div>
      ) : (
        <div className="grid-auto">
          {usbModems.map(m => (
            <DeviceCard key={m.id} device={m} onRotate={onRotate} type="modem" />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Android Devices panel ────────────────────────────────────────────────────
function AndroidPanel({ modems, onRotate, onRefresh }) {
  const androidDevs = modems.filter(m => m.is_android);
  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>
            Android Devices
            <span className="badge badge-purple" style={{ marginLeft: '10px', verticalAlign: 'middle' }}>
              {androidDevs.length}
            </span>
          </h1>
          <p className="text-muted">Android phones via USB tethering + ADB</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Setup guide */}
      <div className="card" style={{
        marginBottom: '24px',
        background: 'rgba(139,92,246,0.06)',
        border: '1px solid rgba(139,92,246,0.2)',
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <Smartphone size={20} color="var(--clr-accent-2)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>How to add an Android device</div>
            <ol style={{ color: 'var(--clr-text-2)', fontSize: '0.875rem', paddingLeft: '18px', lineHeight: 2 }}>
              <li>Enable <strong>USB Debugging</strong> on your phone (Developer Options)</li>
              <li>Enable <strong>USB Tethering</strong> (Settings → Hotspot & Tethering)</li>
              <li>Connect phone via USB cable to your local machine</li>
              <li>Accept the ADB authorization prompt on the phone</li>
              <li>The modem manager will detect it automatically within 30 seconds</li>
            </ol>
          </div>
        </div>
      </div>

      {androidDevs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
          <Smartphone size={40} color="var(--clr-text-3)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ marginBottom: '8px' }}>No Android Devices Detected</h3>
          <p className="text-muted">Connect Android phones with USB Debugging and USB Tethering enabled.</p>
        </div>
      ) : (
        <div className="grid-auto">
          {androidDevs.map(d => (
            <DeviceCard key={d.id} device={d} onRotate={onRotate} type="android" />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subscriptions panel ──────────────────────────────────────────────────────
function SubscriptionsPanel() {
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all');

  useEffect(() => { loadSubs(); }, []);

  async function loadSubs() {
    setLoading(true);
    const { data } = await supabase
      .from('subscriptions')
      .select(`*, customers(email), plans(name), proxies(proxy_type,public_port,vps_host,modems(label,is_android))`)
      .order('created_at', { ascending: false })
      .limit(100);
    setSubs(data || []);
    setLoading(false);
  }

  const markActive = async (id) => {
    await supabase.from('subscriptions').update({ status: 'active' }).eq('id', id);
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status: 'active' } : s));
    toast.success('Subscription activated');
  };

  const filtered = filter === 'all' ? subs : subs.filter(s => s.status === filter);

  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>Subscriptions</h1>
          <p className="text-muted">{subs.length} total</p>
        </div>
        <div className="flex gap-sm">
          {['all','active','pending','expired'].map(f => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Plan</th>
                <th>Proxy</th>
                <th>Device</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontSize: '0.85rem' }}>{s.customers?.email || '—'}</td>
                  <td><span className="badge badge-blue">{s.plans?.name}</span></td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {s.proxies ? (
                      <>
                        <span className={`proxy-chip ${s.proxies.proxy_type}`}>{s.proxies.proxy_type}</span>
                        {' '}
                        <span className="text-muted">{s.proxies.vps_host}:{s.proxies.public_port}</span>
                      </>
                    ) : '—'}
                  </td>
                  <td>
                    {s.proxies?.modems?.is_android
                      ? <span className="badge badge-purple"><Smartphone size={10} /> Android</span>
                      : <span className="badge badge-blue"><Wifi size={10} /> Modem</span>
                    }
                  </td>
                  <td>
                    <span className={`badge badge-${s.status === 'active' ? 'online' : s.status === 'pending' ? 'pending' : 'offline'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>
                    {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : 'GB-based'}
                  </td>
                  <td>
                    {s.status === 'pending' && (
                      <button className="btn btn-primary btn-sm" onClick={() => markActive(s.id)}>
                        <Power size={12} /> Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--clr-text-3)', padding: '40px' }}>
                    {loading ? 'Loading...' : 'No subscriptions found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Revenue panel ────────────────────────────────────────────────────────────
function RevenuePanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, customers(email), plans(name)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => { setOrders(data || []); setLoading(false); });
  }, []);

  const paid    = orders.filter(o => o.payment_status === 'paid');
  const pending = orders.filter(o => o.payment_status === 'pending');
  const revenue = paid.reduce((a, o) => a + parseFloat(o.amount_usd), 0);

  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>Revenue</h1>
          <p className="text-muted">Payment history and analytics</p>
        </div>
      </div>

      <div className="stats-grid mb-xl">
        {[
          { label: 'Total Revenue',  value: `$${revenue.toFixed(2)}`, color: '#10b981' },
          { label: 'Paid Orders',    value: paid.length,              color: '#3b82f6' },
          { label: 'Pending Orders', value: pending.length,           color: '#f59e0b' },
          { label: 'Avg Order',      value: paid.length ? `$${(revenue/paid.length).toFixed(2)}` : '$0', color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{o.customers?.email || '—'}</td>
                  <td><span className="badge badge-blue">{o.plans?.name}</span></td>
                  <td style={{ fontWeight: 700, color: 'var(--clr-green)' }}>${parseFloat(o.amount_usd).toFixed(2)}</td>
                  <td style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>{o.payment_method}</td>
                  <td>
                    <span className={`badge badge-${o.payment_status === 'paid' ? 'online' : 'pending'}`}>
                      {o.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--clr-text-3)', padding: '40px' }}>
                    {loading ? 'Loading...' : 'No orders yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin component ─────────────────────────────────────────────────────
export default function Admin({ session }) {
  const [modems, setModems]       = useState([]);
  const [stats, setStats]         = useState({});
  const [loading, setLoading]     = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { checkAdmin(); }, [session]);

  async function checkAdmin() {
    const admin = await isAdmin(session.user.id);
    if (!admin) { setAuthorized(false); setLoading(false); return; }
    setAuthorized(true);
    loadData();
  }

  async function loadData() {
    setLoading(true);
    const [modemsRes, statsRes] = await Promise.all([
      getAdminModems(),
      getAdminStats().catch(() => ({})),
    ]);
    if (modemsRes.data) setModems(modemsRes.data);
    setStats(statsRes || {});
    setLoading(false);
  }

  const handleRotate = async (modemId) => {
    await supabase.functions.invoke('rotate-ip', { body: { modemId } });
  };

  if (loading) return (
    <SidebarLayout session={session} adminMode>
      <div className="loading-screen"><div className="loader" /><span>Loading admin panel...</span></div>
    </SidebarLayout>
  );

  if (!authorized) return (
    <SidebarLayout session={session} adminMode={false}>
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <Shield size={48} color="var(--clr-red)" style={{ margin: '0 auto 16px' }} />
        <h2>Access Denied</h2>
        <p className="text-muted mt-md">You do not have admin privileges.</p>
      </div>
    </SidebarLayout>
  );

  const props = { modems, stats, onRotate: handleRotate, onRefresh: loadData };

  return (
    <SidebarLayout session={session} adminMode={true}>
      <Routes>
        <Route index                  element={<Overview {...props} />} />
        <Route path="modems"          element={<ModemsPanel {...props} />} />
        <Route path="android"         element={<AndroidPanel {...props} />} />
        <Route path="subscriptions"   element={<SubscriptionsPanel />} />
        <Route path="revenue"         element={<RevenuePanel />} />
        <Route path="*"               element={<Navigate to="/admin" />} />
      </Routes>
    </SidebarLayout>
  );
}
