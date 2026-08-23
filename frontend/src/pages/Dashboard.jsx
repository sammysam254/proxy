import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Copy, Check, RefreshCw, Wifi, Clock, Database, ChevronDown, ChevronUp, Activity, Smartphone, Server, Shield } from 'lucide-react';
import { getMySubscriptions, requestIpRotation, supabase } from '../lib/supabase';
import SidebarLayout from '../components/SidebarLayout';
import { playSuccessSound, playClickSound, playErrorSound } from '../lib/sound';

function CopyBtn({ value, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      playClickSound();
      toast.success(`Copied ${label}!`, { duration: 1500 });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      className={`copy-btn ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title={`Copy ${label}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{value}</span>
    </button>
  );
}

function calculateTimeLeft(targetDate) {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) {
    return { isExpired: true, text: 'Expired', fullText: 'Expired', days: 0, hours: 0, minutes: 0 };
  }

  const totalMinutes = Math.floor(diff / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  const fullParts = [];
  if (days > 0) fullParts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0 || days > 0) fullParts.push(`${hours} hr${hours !== 1 ? 's' : ''}`);
  fullParts.push(`${minutes} min${minutes !== 1 ? 's' : ''}`);

  return {
    isExpired: false,
    text: `${parts.join(' ')} remaining`,
    fullText: `${fullParts.join(', ')} remaining`,
    days,
    hours,
    minutes,
  };
}

function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(targetDate));

  useEffect(() => {
    if (!targetDate) return;
    setTimeLeft(calculateTimeLeft(targetDate));
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft(targetDate));
    }, 10000); // tick every 10 seconds
    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

function formatBandwidth(gbUsed, gbLimit) {
  const used = parseFloat(gbUsed || 0);
  let usedFormatted = '';

  if (used === 0) {
    usedFormatted = '0 MB';
  } else if (used < 0.001) {
    const kb = Math.max(1, Math.round(used * 1024 * 1024));
    usedFormatted = `${kb} KB`;
  } else if (used < 1.0) {
    const mb = (used * 1024).toFixed(1);
    usedFormatted = `${mb} MB`;
  } else {
    usedFormatted = `${used.toFixed(2)} GB`;
  }

  if (gbLimit) {
    return `${usedFormatted} / ${gbLimit} GB`;
  }
  return `${usedFormatted} used (Unlimited)`;
}

export function getProxyCategory(sub) {
  const modem = sub.proxies?.modems;
  const isWifi = modem?.device_path?.startsWith('wifi:') || 
                 modem?.operator?.includes('Wi-Fi') || 
                 modem?.label?.includes('Wi-Fi') ||
                 modem?.is_wifi;
  return isWifi ? 'residential' : 'mobile';
}

function ProxyCredCard({ sub }) {
  const [expanded, setExpanded] = useState(false);
  const [rotating, setRotating] = useState(false);

  const proxy = sub.proxies;
  const modem = proxy?.modems;
  const plan  = sub.plans;

  const isExpired = sub.status === 'expired';
  const isActive  = sub.status === 'active';

  const countdown = useCountdown(sub.expires_at);

  const gbPercent = sub.gb_limit
    ? Math.min(100, (sub.gb_used / sub.gb_limit) * 100)
    : null;

  const category = getProxyCategory(sub);
  const isResidential = category === 'residential';
  const CategoryIcon = isResidential ? Wifi : Smartphone;
  const categoryAccent = isResidential ? '#06b6d4' : '#8b5cf6';
  const categoryLabel = isResidential ? 'Residential (Wi-Fi)' : 'Mobile (Dedicated)';

  const handleRotate = async () => {
    setRotating(true);
    playClickSound();
    try {
      await requestIpRotation(sub.id);
      playSuccessSound();
      toast.success('🔄 IP rotation requested! New IP will be assigned in ~15-30 seconds.');
    } catch (e) {
      playErrorSound();
      toast.error('Rotation failed: ' + e.message);
    } finally {
      setTimeout(() => setRotating(false), 3000);
    }
  };

  const vpsHost = proxy?.vps_host || 'N/A';
  const port    = proxy?.public_port || 'N/A';

  return (
    <div className={`card card-accent ${isExpired ? 'expired-card' : ''}`} style={{
      opacity: isExpired ? 0.6 : 1,
      borderLeft: `4px solid ${categoryAccent}`,
    }}>
      {/* Header */}
      <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="flex items-center gap-md">
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${categoryAccent}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CategoryIcon size={20} color={categoryAccent} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isResidential ? 'USA Residential Proxy' : ((modem?.operator || 'Mobile 4G/5G LTE').replace(/[, \t\r\n]+$/, '').trim())}
              {isResidential && <span style={{ fontSize: '0.9rem' }}>🇺🇸</span>}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>
              <span className="mono" style={{ color: categoryAccent, fontWeight: 600 }}>
                {isResidential ? `Location: USA 🇺🇸 · IP: ${modem?.ip_address || vpsHost}` : `Serial: #${(modem?.adb_serial || (modem?.device_path ? modem.device_path.replace(/^android:|^wifi:/, '') : '') || sub.id.slice(0, 8)).replace(/^android:|^wifi:/, '')} · ${modem?.ip_address || 'Live Proxy IP'}`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-sm" style={{ flexWrap: 'wrap' }}>
          <span className="badge" style={{
            background: `${categoryAccent}18`,
            color: categoryAccent,
            border: `1px solid ${categoryAccent}33`,
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <CategoryIcon size={11} /> {categoryLabel}
          </span>
          <span className={`badge badge-${isActive ? 'online' : 'offline'}`}>
            <span className="dot" />
            {sub.status}
          </span>
          <span className="badge badge-blue">{plan?.name}</span>
        </div>
      </div>

      {/* Plan info & Time Remaining */}
      <div className="flex gap-md wrap items-center" style={{ marginTop: '8px' }}>
        {countdown && (
          <div className="flex items-center gap-sm text-sm" style={{
            color: countdown.isExpired ? 'var(--clr-danger, #ef4444)' : 'var(--clr-accent, #3b82f6)',
            background: 'rgba(59, 130, 246, 0.08)',
            padding: '4px 10px',
            borderRadius: '6px',
            fontWeight: 500
          }}>
            <Clock size={14} />
            <span>{countdown.fullText}</span>
          </div>
        )}
        <div className="flex items-center gap-sm text-sm text-muted" style={{
          background: 'rgba(255, 255, 255, 0.04)',
          padding: '4px 10px',
          borderRadius: '6px',
        }}>
          <Database size={14} />
          <span>{formatBandwidth(sub.gb_used, sub.gb_limit)}</span>
        </div>
      </div>

      {/* GB progress */}
      {gbPercent !== null && (
        <div>
          <div className="progress">
            <div
              className={`progress-bar ${gbPercent > 80 ? 'danger' : ''}`}
              style={{ width: `${gbPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Credentials (expandable) */}
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="btn btn-ghost btn-sm"
          style={{ padding: '6px 0' }}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {expanded ? 'Hide' : 'Show'} Connection Details
        </button>

        {expanded && (
          <div style={{
            marginTop: '16px',
            background: 'var(--clr-surface)',
            border: '1px solid var(--clr-border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Connection Details
            </div>

            {[
              { label: 'Category',      value: isResidential ? 'Residential Proxy (Wi-Fi)' : 'Mobile Proxy (Dedicated 4G/5G SIM)' },
              { label: 'Host / IP',     value: vpsHost },
              { label: 'Port',          value: String(port) },
              { label: 'Username',      value: sub.proxy_username },
              { label: 'Password',      value: sub.proxy_password },
              { label: 'Proxy Type',    value: proxy?.proxy_type?.toUpperCase() || 'SOCKS5' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center" style={{ gap: '12px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)', flexShrink: 0 }}>{label}</span>
                <CopyBtn value={value} label={label} />
              </div>
            ))}

            <div className="divider" style={{ margin: '4px 0' }} />

            {/* Full connection string */}
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)', marginBottom: '6px' }}>
                SOCKS5 connection string
              </div>
              <CopyBtn
                value={`socks5://${sub.proxy_username}:${sub.proxy_password}@${vpsHost}:${port}`}
                label="SOCKS5 string"
              />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)', marginBottom: '6px' }}>
                HTTP connection string
              </div>
              <CopyBtn
                value={`http://${sub.proxy_username}:${sub.proxy_password}@${vpsHost}:${port}`}
                label="HTTP string"
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {isActive && (
        <div className="flex gap-sm">
          <button
            className={`btn btn-secondary btn-sm ${rotating ? 'btn-loading' : ''}`}
            onClick={handleRotate}
            disabled={rotating}
          >
            <RefreshCw size={14} className={rotating ? 'spin-icon' : ''} />
            <span>{rotating ? 'Rotating IP...' : 'Rotate IP'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ session }) {
  const [subs, setSubs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [liveUpdate, setLiveUpdate] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'mobile' | 'residential'
  const channelRef = useRef(null);

  useEffect(() => {
    loadSubs(true);

    // ── Supabase Realtime: instant bandwidth updates ──────────────────
    const userId = session?.user?.id;
    if (userId) {
      channelRef.current = supabase
        .channel(`dashboard-subs-${userId}`)
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'subscriptions',
            filter: `customer_id=eq.${userId}`,
          },
          (payload) => {
            // Flash the live indicator
            setLiveUpdate(true);
            setTimeout(() => setLiveUpdate(false), 1200);

            // Merge the updated row into existing state without full reload
            setSubs(prev => prev.map(s =>
              s.id === payload.new.id ? { ...s, ...payload.new } : s
            ));
          }
        )
        .subscribe();
    }

    // ── 5-second polling fallback ─────────────────────────────────────
    const poll = setInterval(() => loadSubs(false), 5000);

    return () => {
      clearInterval(poll);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [session]);

  async function loadSubs(showLoader = true) {
    if (showLoader) setLoading(true);
    const { data, error } = await getMySubscriptions();
    if (!error) setSubs(data || []);
    if (showLoader) setLoading(false);
  }

  const active  = subs.filter(s => s.status === 'active');
  const expired = subs.filter(s => s.status !== 'active');

  const filteredActive = active.filter(s => {
    if (categoryFilter === 'all') return true;
    return getProxyCategory(s) === categoryFilter;
  });

  const filteredExpired = expired.filter(s => {
    if (categoryFilter === 'all') return true;
    return getProxyCategory(s) === categoryFilter;
  });

  const mobileCount = subs.filter(s => getProxyCategory(s) === 'mobile').length;
  const resCount    = subs.filter(s => getProxyCategory(s) === 'residential').length;

  if (loading) return (
    <div className="loading-screen">
      <div className="loader" />
      <span>Loading your proxies...</span>
    </div>
  );

  return (
    <SidebarLayout session={session} adminMode={false}>
    <main style={{ padding: '40px 0', minHeight: '80vh' }}>
      <div className="container">
        {/* Header */}
        <div className="flex justify-between items-center mb-xl" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <h1 style={{ fontSize: '2rem', margin: 0 }}>My Proxies</h1>
              <div title="Live traffic data — updates in real-time" style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '3px 10px', borderRadius: '20px',
                background: liveUpdate ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.08)',
                border: `1px solid ${liveUpdate ? 'rgba(16, 185, 129, 0.6)' : 'rgba(16, 185, 129, 0.2)'}`,
                transition: 'all 0.3s ease',
              }}>
                <Activity size={11} color={liveUpdate ? '#10b981' : '#6ee7b7'} style={{ transition: 'color 0.3s' }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: liveUpdate ? '#10b981' : '#6ee7b7', transition: 'color 0.3s' }}>
                  {liveUpdate ? 'LIVE' : 'REALTIME'}
                </span>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#10b981',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              </div>
            </div>
            <p className="text-muted">{session?.user?.email}</p>
          </div>
          <a href="/#pricing" className="btn btn-primary">
            + Get More Proxies
          </a>
        </div>

        {/* Stats */}
        <div className="stats-grid mb-xl">
          {[
            { label: 'Active Proxies',  value: active.length, sub: 'currently running' },
            { label: 'Mobile Proxies',  value: mobileCount,   sub: 'dedicated cellular' },
            { label: 'Residential',     value: resCount,      sub: 'routed via Wi-Fi' },
            { label: 'Total Purchased', value: subs.length,   sub: 'all time' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Subcategories Filter Bar */}
        {subs.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '28px',
            background: 'var(--clr-surface)',
            padding: '6px',
            borderRadius: '12px',
            border: '1px solid var(--clr-border)',
            width: 'fit-content',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={() => { playClickSound(); setCategoryFilter('all'); }}
              className={`btn btn-sm ${categoryFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              All Proxies ({subs.length})
            </button>
            <button
              onClick={() => { playClickSound(); setCategoryFilter('mobile'); }}
              className={`btn btn-sm ${categoryFilter === 'mobile' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.85rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Smartphone size={14} /> Mobile Proxies Dedicated ({mobileCount})
            </button>
            <button
              onClick={() => { playClickSound(); setCategoryFilter('residential'); }}
              className={`btn btn-sm ${categoryFilter === 'residential' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.85rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Wifi size={14} /> Residential Proxies ({resCount})
            </button>
          </div>
        )}

        {/* Active subs */}
        {filteredActive.length > 0 && (
          <div className="mb-xl">
            <h2 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>
              Active Connections
              <span className="text-muted" style={{ fontSize: '0.9rem', fontWeight: 400, marginLeft: '8px' }}>
                ({filteredActive.length})
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredActive.map(s => <ProxyCredCard key={s.id} sub={s} />)}
            </div>
          </div>
        )}

        {/* Expired subs */}
        {filteredExpired.length > 0 && (
          <div>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '16px', color: 'var(--clr-text-2)' }}>
              Past Subscriptions
              <span className="text-muted" style={{ fontSize: '0.9rem', fontWeight: 400, marginLeft: '8px' }}>
                ({filteredExpired.length})
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredExpired.map(s => <ProxyCredCard key={s.id} sub={s} />)}
            </div>
          </div>
        )}

        {/* Empty filter state */}
        {subs.length > 0 && filteredActive.length === 0 && filteredExpired.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '6px' }}>No proxies in this subcategory</h3>
            <p className="text-muted text-sm" style={{ marginBottom: '16px' }}>
              You do not have any active or past {categoryFilter === 'residential' ? 'Residential (Wi-Fi)' : 'Mobile Dedicated'} subscriptions.
            </p>
            <button className="btn btn-secondary btn-sm" onClick={() => setCategoryFilter('all')}>
              Show All Proxies
            </button>
          </div>
        )}

        {/* Empty state */}
        {subs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20,
              background: 'var(--clr-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <Wifi size={28} color="var(--clr-text-3)" />
            </div>
            <h3 style={{ marginBottom: '8px' }}>No proxies yet</h3>
            <p className="text-muted" style={{ marginBottom: '24px' }}>
              Purchase a plan to get your first proxy credentials.
            </p>
            <a href="/#pricing" className="btn btn-primary">Browse Plans</a>
          </div>
        )}
      </div>
    </main>
    </SidebarLayout>
  );
}
