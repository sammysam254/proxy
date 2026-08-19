import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Copy, Check, RefreshCw, Wifi, Clock, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { getMySubscriptions, requestIpRotation } from '../lib/supabase';
import SidebarLayout from '../components/SidebarLayout';

function CopyBtn({ value, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
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

  const handleRotate = async () => {
    setRotating(true);
    try {
      await requestIpRotation(sub.id);
      toast.success('IP rotation requested! New IP will be active in ~30 seconds.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRotating(false);
    }
  };

  const proxyCreds = [
    {
      type: 'HTTP/HTTPS',
      host: proxy?.vps_host,
      port: proxy?.public_port,
      note: 'Use in browser proxy settings',
      chipClass: 'http',
    },
  ];

  const vpsHost = proxy?.vps_host || 'N/A';
  const port    = proxy?.public_port || 'N/A';

  return (
    <div className={`card card-accent ${isExpired ? 'expired-card' : ''}`} style={{ opacity: isExpired ? 0.6 : 1 }}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-md">
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(59,130,246,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Wifi size={20} color="var(--clr-accent)" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {modem?.label || 'Proxy Connection'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>
              {modem?.operator || 'Mobile Carrier'} · {modem?.ip_address || 'IP loading...'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-sm">
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
          {sub.gb_limit ? (
            <span>{(sub.gb_used || 0).toFixed(2)} / {sub.gb_limit} GB</span>
          ) : (
            <span>{(sub.gb_used || 0).toFixed(2)} GB used (Unlimited)</span>
          )}
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
            className="btn btn-secondary btn-sm"
            onClick={handleRotate}
            disabled={rotating}
          >
            <RefreshCw size={14} className={rotating ? 'spinning' : ''} />
            Rotate IP
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ session }) {
  const [subs, setSubs]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubs();
  }, []);

  async function loadSubs() {
    setLoading(true);
    const { data, error } = await getMySubscriptions();
    if (!error) setSubs(data || []);
    setLoading(false);
  }

  const active  = subs.filter(s => s.status === 'active');
  const expired = subs.filter(s => s.status !== 'active');

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
        <div className="flex justify-between items-center mb-xl">
          <div>
            <h1 style={{ fontSize: '2rem', marginBottom: '4px' }}>My Proxies</h1>
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
            { label: 'Total Purchased', value: subs.length,   sub: 'all time' },
            { label: 'Expired',         value: expired.length, sub: 'past plans' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Active subs */}
        {active.length > 0 && (
          <div className="mb-xl">
            <h2 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>Active Connections</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {active.map(s => <ProxyCredCard key={s.id} sub={s} />)}
            </div>
          </div>
        )}

        {/* Expired subs */}
        {expired.length > 0 && (
          <div>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '16px', color: 'var(--clr-text-2)' }}>
              Past Subscriptions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {expired.map(s => <ProxyCredCard key={s.id} sub={s} />)}
            </div>
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
