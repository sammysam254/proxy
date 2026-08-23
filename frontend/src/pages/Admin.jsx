import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Wifi, Users, DollarSign, Activity, RefreshCw, Power,
  Server, Signal, Database, Shield, ChevronDown,
  Smartphone, Battery, Usb, Globe, TrendingUp, Plus, Edit2, Trash2, Check, X, Lock, AlertTriangle
} from 'lucide-react';
import {
  getAdminModems, getAdminStats, getAllAdminPlans, savePlan, deletePlan,
  getAllAdminProxies, updateProxyActiveStatus, deleteProxy, revokeSubscription,
  supabase, isAdmin
} from '../lib/supabase';
import SidebarLayout from '../components/SidebarLayout';
import { playClickSound, playSuccessSound, playErrorSound } from '../lib/sound';

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

// ─── Device Card ─────────────────────────────────────────────────────────────
function DeviceCard({ device, onRotate, type = 'modem' }) {
  const [rotating, setRotating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const proxies   = device.proxies || [];
  const isOnline  = device.status === 'online';
  const dataMB    = ((device.data_used_bytes || 0) / (1024 ** 2)).toFixed(1);
  const isAndroid = type === 'android' || device.is_android;
  const isWifi    = type === 'wifi' || device.device_path?.startsWith('wifi:') || device.label?.startsWith('Wi-Fi') || device.operator?.startsWith('Wi-Fi');

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

  const StatusIcon = isAndroid ? Smartphone : (isWifi ? Wifi : Server);
  const accentColor = isAndroid ? '#8b5cf6' : (isWifi ? '#06b6d4' : (isOnline ? '#10b981' : '#ef4444'));

  return (
    <div className="card" style={{
      border: `1px solid ${isOnline ? (isAndroid ? 'rgba(139,92,246,0.25)' : isWifi ? 'rgba(6,182,212,0.25)' : 'rgba(16,185,129,0.2)') : 'var(--clr-border)'}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
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
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {device.operator || (isAndroid ? 'Mobile Carrier' : isWifi ? 'Wi-Fi Network' : 'Cellular SIM')}
            </div>
            <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>
              Serial: #{device.adb_serial || device.device_path || device.id?.slice(0, 8)}
              {device.interface && ` · ${device.interface}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-sm">
          {isAndroid ? (
            <span className="badge badge-purple">
              <Smartphone size={10} /> Android
            </span>
          ) : isWifi ? (
            <span className="badge badge-blue" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4' }}>
              <Wifi size={10} /> Wi-Fi
            </span>
          ) : (
            <span className="badge badge-blue">
              <Server size={10} /> Modem
            </span>
          )}
          <span className={`badge badge-${isOnline ? 'online' : 'offline'}`}>
            <span className="dot" />
            {device.status}
          </span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isAndroid ? 'repeat(4,1fr)' : 'repeat(3,1fr)',
        gap: '8px',
        marginTop: '14px',
        marginBottom: '14px',
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

      {isAndroid && device.model && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {device.model && <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{device.model}</span>}
          {device.android_version && <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>Android {device.android_version}</span>}
          {device.adb_serial && <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--clr-text-3)' }}>ADB: {device.adb_serial}</span>}
        </div>
      )}

      {proxies.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
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

// ─── Overview Panel ───────────────────────────────────────────────────────────
function Overview({ stats, modems, onRotate, onRefresh }) {
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

      <h2 style={{ fontSize: '1.2rem', marginBottom: '14px' }}>Active Devices Online</h2>
      <div className="grid-auto">
        {modems.filter(m => m.status === 'online').map(m => (
          <DeviceCard key={m.id} device={m} onRotate={onRotate} type={m.is_android ? 'android' : 'modem'} />
        ))}
        {modems.filter(m => m.status === 'online').length === 0 && (
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px' }}>
            <p className="text-muted">No devices currently online. Connect USB modems or Android phones.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── USB Modems Panel ─────────────────────────────────────────────────────────
function ModemsPanel({ modems, onRotate, onRefresh }) {
  const [showAll, setShowAll] = useState(false);
  const usbModems = modems.filter(m => !m.is_android);
  const displayedModems = showAll ? usbModems : usbModems.filter(m => m.status === 'online');

  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>
            USB Modems
            <span className="badge badge-blue" style={{ marginLeft: '10px', verticalAlign: 'middle' }}>
              {displayedModems.length} {showAll ? 'total' : 'online'}
            </span>
          </h1>
          <p className="text-muted">Physical USB modems with SIM cards (live active connections)</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', background: 'var(--clr-surface)', padding: '4px', borderRadius: '8px', border: '1px solid var(--clr-border)' }}>
            <button
              className={`btn btn-sm ${!showAll ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowAll(false)}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            >
              ● Online Only
            </button>
            <button
              className={`btn btn-sm ${showAll ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowAll(true)}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            >
              All History
            </button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {displayedModems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
          <Wifi size={40} color="var(--clr-text-3)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ marginBottom: '8px' }}>No USB Modems Online</h3>
          <p className="text-muted">Plug in USB modems with SIM cards on your local machine and verify the modem manager is running.</p>
        </div>
      ) : (
        <div className="grid-auto">
          {displayedModems.map(m => (
            <DeviceCard key={m.id} device={m} onRotate={onRotate} type="modem" />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Android Devices Panel ────────────────────────────────────────────────────
function AndroidPanel({ modems, onRotate, onRefresh }) {
  const [showAll, setShowAll] = useState(false);
  const androidDevs = modems.filter(m => m.is_android);
  const displayedDevs = showAll ? androidDevs : androidDevs.filter(m => m.status === 'online');

  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>
            Android Devices
            <span className="badge badge-purple" style={{ marginLeft: '10px', verticalAlign: 'middle' }}>
              {displayedDevs.length} {showAll ? 'total' : 'online'}
            </span>
          </h1>
          <p className="text-muted">Android phones via USB tethering + ADB (live active devices)</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', background: 'var(--clr-surface)', padding: '4px', borderRadius: '8px', border: '1px solid var(--clr-border)' }}>
            <button
              className={`btn btn-sm ${!showAll ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowAll(false)}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            >
              ● Online Only
            </button>
            <button
              className={`btn btn-sm ${showAll ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowAll(true)}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            >
              All History
            </button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="card" style={{
        marginBottom: '24px',
        background: 'rgba(139,92,246,0.06)',
        border: '1px solid rgba(139,92,246,0.2)',
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <Smartphone size={20} color="var(--clr-accent-2)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>How to connect Android devices</div>
            <ol style={{ color: 'var(--clr-text-2)', fontSize: '0.875rem', paddingLeft: '18px', lineHeight: 2 }}>
              <li>Enable <strong>USB Debugging</strong> on your phone (Developer Options)</li>
              <li>Enable <strong>USB Tethering</strong> (Settings → Hotspot & Tethering)</li>
              <li>Connect phone via USB cable to your machine</li>
              <li>The modem manager automatically detects and binds it within 30 seconds</li>
            </ol>
          </div>
        </div>
      </div>

      {displayedDevs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
          <Smartphone size={40} color="var(--clr-text-3)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ marginBottom: '8px' }}>No Android Devices Online</h3>
          <p className="text-muted">Connect Android phones with USB Debugging and USB Tethering enabled.</p>
        </div>
      ) : (
        <div className="grid-auto">
          {displayedDevs.map(d => (
            <DeviceCard key={d.id} device={d} onRotate={onRotate} type="android" />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Marketplace Proxies Control Panel ─────────────────────────────────────────
function MarketplacePanel() {
  const [proxies, setProxies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProxies(); }, []);

  async function loadProxies() {
    setLoading(true);
    const { data } = await getAllAdminProxies();
    setProxies(data || []);
    setLoading(false);
  }

  const toggleProxyStatus = async (proxy) => {
    playClickSound();
    const newStatus = !proxy.active;
    try {
      await updateProxyActiveStatus(proxy.id, newStatus);
      setProxies(prev => prev.map(p => p.id === proxy.id ? { ...p, active: newStatus } : p));
      playSuccessSound();
      toast.success(newStatus ? 'Proxy activated on marketplace' : 'Proxy removed from marketplace');
    } catch (e) {
      playErrorSound();
      toast.error('Failed to update proxy status: ' + e.message);
    }
  };

  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>Marketplace Proxies</h1>
          <p className="text-muted">Control which proxy endpoints are visible and available for customer rental</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadProxies} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin-icon' : ''} /> Refresh
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Carrier & Proxy Serial</th>
                <th>Protocol</th>
                <th>Public Port</th>
                <th>Local Port</th>
                <th>Device Status</th>
                <th>Marketplace Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proxies.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.modems?.operator || 'Mobile Carrier'}</div>
                    <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--clr-accent)' }}>
                      Serial: #{p.modems?.adb_serial || p.modems?.device_path || p.id?.slice(0, 8)}
                    </div>
                  </td>
                  <td>
                    <span className={`proxy-chip ${p.proxy_type}`}>{p.proxy_type?.toUpperCase()}</span>
                  </td>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--clr-accent)' }}>
                    {p.vps_host}:{p.public_port}
                  </td>
                  <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--clr-text-3)' }}>
                    :{p.local_port}
                  </td>
                  <td>
                    <span className={`badge badge-${p.modems?.status === 'online' ? 'online' : 'offline'}`}>
                      <span className="dot" />
                      {p.modems?.status || 'offline'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${p.active ? 'online' : 'offline'}`}>
                      {p.active ? 'Listed (Active)' : 'Delisted (Hidden)'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${p.active ? 'btn-danger' : 'btn-primary'}`}
                      onClick={() => toggleProxyStatus(p)}
                      style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                    >
                      {p.active ? 'Remove from Store' : 'List in Store'}
                    </button>
                  </td>
                </tr>
              ))}
              {proxies.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--clr-text-3)', padding: '40px' }}>
                    {loading ? 'Loading proxies...' : 'No proxies found.'}
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

// ─── Plans & Rental Pricing Panel ─────────────────────────────────────────────
function PlansPanel() {
  const [plans, setPlans]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editingPlan, setEditingPlan] = useState(null); // null | plan object
  const [isNew, setIsNew]           = useState(false);

  useEffect(() => { loadPlans(); }, []);

  async function loadPlans() {
    setLoading(true);
    const { data } = await getAllAdminPlans();
    setPlans(data || []);
    setLoading(false);
  }

  const handleOpenEdit = (plan) => {
    setIsNew(false);
    setEditingPlan({ ...plan });
  };

  const handleOpenNew = () => {
    setIsNew(true);
    setEditingPlan({
      name: '',
      price_usd: 10,
      duration_days: 1,
      gb_limit: null,
      description: '',
      is_active: true,
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    playClickSound();
    try {
      const { data, error } = await savePlan(editingPlan);
      if (error) throw error;
      playSuccessSound();
      toast.success(isNew ? 'Plan created successfully!' : 'Plan updated successfully!');
      setEditingPlan(null);
      loadPlans();
    } catch (err) {
      playErrorSound();
      toast.error('Failed to save plan: ' + err.message);
    }
  };

  const handleDelete = async (planId) => {
    if (!window.confirm('Are you sure you want to remove this pricing plan?')) return;
    playClickSound();
    try {
      const { error } = await deletePlan(planId);
      if (error) throw error;
      playSuccessSound();
      toast.success('Plan deleted.');
      loadPlans();
    } catch (err) {
      playErrorSound();
      toast.error('Failed to delete plan: ' + err.message);
    }
  };

  const handleToggleActive = async (plan) => {
    playClickSound();
    try {
      await savePlan({ ...plan, is_active: !plan.is_active });
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: !p.is_active } : p));
      toast.success(`Plan ${!plan.is_active ? 'activated' : 'deactivated'}.`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>Plans & Rental Pricing</h1>
          <p className="text-muted">Manage time-based (Daily, Weekly, Monthly) and data-based (Pay Per GB) rental rates</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-primary btn-sm" onClick={handleOpenNew}>
            <Plus size={16} /> Add New Plan
          </button>
          <button className="btn btn-secondary btn-sm" onClick={loadPlans} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {plans.map(p => {
          const isTimeBased = !!p.duration_days;
          return (
            <div key={p.id} className="card" style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              border: `1px solid ${p.is_active ? 'rgba(59, 130, 246, 0.3)' : 'var(--clr-border)'}`,
              opacity: p.is_active ? 1 : 0.65,
            }}>
              <div>
                <div className="flex justify-between items-center" style={{ marginBottom: '10px' }}>
                  <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>
                    {isTimeBased ? `${p.duration_days} Day${p.duration_days > 1 ? 's' : ''} Time-Based` : 'Data (GB-Based)'}
                  </span>
                  <span className={`badge badge-${p.is_active ? 'online' : 'offline'}`}>
                    {p.is_active ? 'Active in Store' : 'Disabled'}
                  </span>
                </div>

                <div style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: '4px' }}>
                  {p.name}
                </div>
                <div style={{ color: 'var(--clr-text-2)', fontSize: '0.85rem', marginBottom: '16px', minHeight: '38px' }}>
                  {p.description || 'No description set'}
                </div>

                <div style={{
                  background: 'var(--clr-surface)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline'
                }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>Rental Price</span>
                  <div>
                    <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--clr-accent)' }}>
                      ${parseFloat(p.price_usd).toFixed(2)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)', marginLeft: '4px' }}>
                      {isTimeBased ? `/ ${p.duration_days}d` : '/ GB'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-sm" style={{ borderTop: '1px solid var(--clr-border)', paddingTop: '12px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleOpenEdit(p)}
                  style={{ flex: 1 }}
                >
                  <Edit2 size={13} /> Edit Rate
                </button>
                <button
                  className={`btn btn-sm ${p.is_active ? 'btn-ghost' : 'btn-secondary'}`}
                  onClick={() => handleToggleActive(p)}
                  title={p.is_active ? 'Deactivate plan' : 'Activate plan'}
                >
                  {p.is_active ? 'Disable' : 'Enable'}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(p.id)}
                  title="Delete Plan"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / New Plan Modal */}
      {editingPlan && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setEditingPlan(null); }}>
          <div className="modal" style={{ maxWidth: '480px', width: '92%' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>
                {isNew ? 'Create New Pricing Plan' : `Edit ${editingPlan.name} Plan`}
              </h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingPlan(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="input-group">
                <label className="input-label">Plan Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily, Weekly, Custom 5GB"
                  value={editingPlan.name}
                  onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                  className="input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="input-group">
                  <label className="input-label">Price ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    required
                    placeholder="10.00"
                    value={editingPlan.price_usd}
                    onChange={e => setEditingPlan({ ...editingPlan, price_usd: e.target.value })}
                    className="input"
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Duration (Days)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Leave empty for GB-based"
                    value={editingPlan.duration_days || ''}
                    onChange={e => setEditingPlan({ ...editingPlan, duration_days: e.target.value ? parseInt(e.target.value) : null })}
                    className="input"
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Data Limit (GB)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Leave empty for Unlimited Time-based"
                  value={editingPlan.gb_limit || ''}
                  onChange={e => setEditingPlan({ ...editingPlan, gb_limit: e.target.value ? parseFloat(e.target.value) : null })}
                  className="input"
                />
              </div>

              <div className="input-group">
                <label className="input-label">Description / Feature Note</label>
                <input
                  type="text"
                  placeholder="e.g. Unlimited data for 1 day with full IP rotation"
                  value={editingPlan.description || ''}
                  onChange={e => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  className="input"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={editingPlan.is_active}
                  onChange={e => setEditingPlan({ ...editingPlan, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--clr-accent)' }}
                />
                <label htmlFor="isActiveCheck" style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                  Active and purchasable in customer store
                </label>
              </div>

              <div className="flex gap-sm" style={{ marginTop: '16px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingPlan(null)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subscriptions Panel (with Credential Revocation) ─────────────────────────
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
    playClickSound();
    await supabase.from('subscriptions').update({ status: 'active' }).eq('id', id);
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status: 'active' } : s));
    playSuccessSound();
    toast.success('Subscription activated.');
  };

  const handleRevoke = async (sub) => {
    const confirm = window.confirm(`⚠️ Revoke credentials for ${sub.customers?.email || 'User'} (${sub.proxy_username})?\n\nThis will immediately disconnect the user and prevent any further proxy usage.`);
    if (!confirm) return;

    playClickSound();
    try {
      await revokeSubscription(sub.id);
      setSubs(prev => prev.map(s => s.id === sub.id ? { ...s, status: 'revoked' } : s));
      playSuccessSound();
      toast.success(`🔒 Credentials revoked for ${sub.proxy_username}. Proxy connection blocked.`);
    } catch (e) {
      playErrorSound();
      toast.error('Revocation failed: ' + e.message);
    }
  };

  const filtered = filter === 'all' ? subs : subs.filter(s => s.status === filter);

  return (
    <div style={{ padding: '36px' }}>
      <div className="flex justify-between items-center mb-xl" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>Customer Subscriptions</h1>
          <p className="text-muted">{subs.length} total subscriptions · Manage access & revoke credentials</p>
        </div>
        <div className="flex gap-sm">
          {['all','active','pending','revoked','expired'].map(f => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
              style={{ textTransform: 'capitalize' }}
            >
              {f}
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
                <th>Proxy Endpoint</th>
                <th>Credentials</th>
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
                        <span className={`proxy-chip ${s.proxies.proxy_type}`}>{s.proxies.proxy_type?.toUpperCase()}</span>
                        {' '}
                        <span className="mono text-muted">{s.proxies.vps_host}:{s.proxies.public_port}</span>
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    <div className="mono" style={{ color: 'var(--clr-text)' }}>{s.proxy_username}</div>
                    <div className="mono text-muted" style={{ fontSize: '0.7rem' }}>{s.proxy_password}</div>
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
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {s.status === 'pending' && (
                        <button className="btn btn-primary btn-sm" onClick={() => markActive(s.id)}>
                          <Power size={12} /> Activate
                        </button>
                      )}
                      {s.status === 'active' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRevoke(s)}
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        >
                          <Lock size={12} /> Revoke Access
                        </button>
                      )}
                      {s.status === 'revoked' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--clr-red)', fontWeight: 600 }}>
                            Revoked
                          </span>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => markActive(s.id)}
                            style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                            title="Restore access"
                          >
                            <Power size={11} /> Restore
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--clr-text-3)', padding: '40px' }}>
                    {loading ? 'Loading...' : 'No subscriptions found.'}
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

// ─── Revenue Panel ────────────────────────────────────────────────────────────
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
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>Revenue & Payments</h1>
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

// ─── Main Admin Component ─────────────────────────────────────────────────────
export default function Admin({ session }) {
  const [modems, setModems]       = useState([]);
  const [stats, setStats]         = useState({});
  const [loading, setLoading]     = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => { checkAdmin(); }, [session]);

  async function checkAdmin() {
    const admin = await isAdmin(session?.user?.id, session?.user?.email);
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
        <Route path="marketplace"     element={<MarketplacePanel />} />
        <Route path="plans"           element={<PlansPanel />} />
        <Route path="subscriptions"   element={<SubscriptionsPanel />} />
        <Route path="revenue"         element={<RevenuePanel />} />
        <Route path="*"               element={<Navigate to="/admin" />} />
      </Routes>
    </SidebarLayout>
  );
}
