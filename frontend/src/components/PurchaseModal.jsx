import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, CreditCard, Bitcoin, Wifi, ChevronRight, Lock, Zap, ShieldCheck } from 'lucide-react';
import { createOrder, supabase, simulateAdminSubscription, activateSubscription, isAdmin } from '../lib/supabase';

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
const NOWPAYMENTS_API_KEY = import.meta.env.VITE_NOWPAYMENTS_API_KEY;

export default function PurchaseModal({ plan, proxy, proxies, onClose, onSuccess }) {
  const onlineProxies = (proxies || []).filter(p => p.modems?.status === 'online');
  const [step, setStep]           = useState('select');  // select | payment | confirm
  const [payMethod, setPayMethod] = useState('paystack');
  const [selProxy, setSelProxy]   = useState(proxy || onlineProxies[0] || null);
  const [loading, setLoading]     = useState(false);
  const [adminUser, setAdminUser] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data?.session?.user;
      if (user) {
        isAdmin(user.id, user.email).then(setAdminUser);
      }
    });
  }, []);

  useEffect(() => {
    if (!selProxy && onlineProxies.length > 0) {
      setSelProxy(onlineProxies[0]);
    }
  }, [proxies]);

  // Admin Instant Test Simulation
  const handleAdminSimulate = async () => {
    if (!selProxy) {
      toast.error('Please select an online proxy/SIM first.');
      return;
    }
    setLoading(true);
    try {
      await simulateAdminSubscription(plan.id, selProxy.id);
      toast.success('⚡ Admin Simulation: Proxy rented & activated successfully!');
      onSuccess();
    } catch (err) {
      toast.error(err.message || 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const fn = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const handlePayWithPaystack = async () => {
    if (!selProxy) {
      toast.error('Please select an online proxy/SIM first.');
      return;
    }
    setLoading(true);
    try {
      // 1. Create order in Supabase
      const { data: order, error } = await createOrder(plan.id, selProxy.id, 'paystack');
      if (error) throw error;

      // 2. Initialize Paystack
      const { data: sess } = await supabase.auth.getSession();
      const email = sess?.session?.user?.email || 'customer@proxicell.com';
      const liveKey = PAYSTACK_PUBLIC_KEY || 'pk_live_558e1ed8114c63c09b135b1523443ecfffb60524';
      const refCode = 'PK_' + order.id.replace(/-/g, '').substring(0, 10) + '_' + Date.now();
      const amountCents = Math.round(parseFloat(plan.price_usd) * 100);

      // Method A: PaystackPop v2 SDK
      if (typeof window.PaystackPop !== 'undefined' && typeof window.PaystackPop === 'function') {
        try {
          const paystack = new window.PaystackPop();
          paystack.newTransaction({
            key:       liveKey,
            email:     email,
            amount:    amountCents,
            currency:  'USD',
            reference: refCode,
            onSuccess: (transaction) => {
              activateSubscription(order.id, plan.id, selProxy.id, 'paystack', transaction.reference || transaction.trxref)
                .then(() => {
                  toast.success('🎉 Payment successful! Your proxy has been activated.');
                  onSuccess();
                })
                .catch(() => {
                  toast.success('Payment received! Activating proxy...');
                  onSuccess();
                });
            },
            onCancel: () => {
              toast('Payment cancelled.');
              setLoading(false);
            },
          });
          return;
        } catch (e) {
          console.warn('Paystack v2 transaction error, trying setup fallback:', e);
        }
      }

      // Method B: PaystackPop setup fallback
      if (window.PaystackPop && window.PaystackPop.setup) {
        const handler = window.PaystackPop.setup({
          key:       liveKey,
          email:     email,
          amount:    amountCents,
          currency:  'USD',
          ref:       refCode,
          callback: function(response) {
            activateSubscription(order.id, plan.id, selProxy.id, 'paystack', response.reference || response.trxref)
              .then(() => {
                toast.success('🎉 Payment successful! Your proxy has been activated.');
                onSuccess();
              })
              .catch(() => {
                toast.success('Payment received! Activating proxy...');
                onSuccess();
              });
          },
          onClose: function() {
            toast('Payment window closed.');
            setLoading(false);
          },
        });
        handler.openIframe();
      } else {
        throw new Error('Payment gateway is loading. Please try again in 5 seconds.');
      }
    } catch (err) {
      toast.error(err.message || 'Paystack initialization failed');
      setLoading(false);
    }
  };

  const handlePayWithCrypto = async () => {
    if (!selProxy) {
      toast.error('Please select an online proxy/SIM first.');
      return;
    }
    setLoading(true);
    try {
      const { data: order, error } = await createOrder(plan.id, selProxy.id, 'crypto');
      if (error) throw error;

      // Call NOWPayments API directly
      const apiKey = NOWPAYMENTS_API_KEY || 'QNJ3N44-2JP4AKM-PGPJXCK-3AQPC3T';
      const res = await fetch('https://api.nowpayments.io/v1/invoice', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: parseFloat(plan.price_usd),
          price_currency: 'usd',
          order_id: order.id,
          order_description: `ProxiCell ${plan.name} Proxy Subscription`,
          success_url: `${window.location.origin}/dashboard?payment=success&order_id=${order.id}`,
          cancel_url: `${window.location.origin}/#pricing`,
        }),
      });

      const invoice = await res.json();

      if (invoice?.invoice_url) {
        // Activate proxy subscription linked to this order
        await activateSubscription(order.id, plan.id, selProxy.id, 'crypto', invoice.id ? String(invoice.id) : null);
        window.open(invoice.invoice_url, '_blank');
        toast.success('Crypto payment window opened! Your proxy is ready in your dashboard.');
        onSuccess();
      } else {
        throw new Error(invoice?.message || 'Failed to create crypto invoice. Please try again.');
      }
    } catch (err) {
      toast.error(err.message || 'Crypto payment error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal">
        {/* Header */}
        <div className="flex justify-between items-center" style={{ marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '2px' }}>Purchase Plan</h2>
            <p className="text-muted text-sm">Complete your proxy subscription</p>
          </div>
          <button className="btn btn-ghost btn-sm modal-close" onClick={onClose} style={{ position: 'relative', top: 'auto', right: 'auto' }}>
            <X size={18} />
          </button>
        </div>

        {/* Plan summary */}
        <div className="card card-accent" style={{ marginBottom: '20px' }}>
          <div className="flex justify-between items-center">
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{plan.name} Plan</div>
              <div className="text-muted text-sm">{plan.description}</div>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>${parseFloat(plan.price_usd).toFixed(0)}</div>
          </div>
        </div>

        {/* Proxy selector */}
        <div className="input-group" style={{ marginBottom: '20px' }}>
          <label className="input-label">
            <Wifi size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            Select Proxy / SIM Card
          </label>
          {onlineProxies.length > 0 ? (
            <select
              className="input select"
              value={selProxy?.id || ''}
              onChange={e => setSelProxy(onlineProxies.find(p => p.id === e.target.value))}
            >
              {onlineProxies.map(p => (
                <option key={p.id} value={p.id}>
                  {p.modems?.label} — {p.proxy_type?.toUpperCase()} — {p.modems?.operator || 'Mobile'}
                </option>
              ))}
            </select>
          ) : (
            <div className="card" style={{ padding: '12px 16px', color: 'var(--clr-text-2)', fontSize: '0.9rem' }}>
              No proxies online right now. Please try again shortly.
            </div>
          )}
        </div>

        {/* Payment method */}
        <div className="input-group" style={{ marginBottom: '24px' }}>
          <label className="input-label">Payment Method</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              { key: 'paystack', label: 'Card / Bank',  icon: <CreditCard size={18} />,  sub: 'Powered by Paystack' },
              { key: 'crypto',   label: 'Crypto',        icon: <Bitcoin size={18} />,     sub: 'USDT, BTC & more' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setPayMethod(m.key)}
                style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${payMethod === m.key ? 'var(--clr-accent)' : 'var(--clr-border)'}`,
                  background: payMethod === m.key ? 'var(--clr-accent-glow)' : 'var(--clr-surface)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'var(--transition)',
                  color: 'var(--clr-text)',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ color: payMethod === m.key ? 'var(--clr-accent)' : 'var(--clr-text-2)', marginBottom: '6px' }}>
                  {m.icon}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)' }}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Admin Simulation Banner */}
        {adminUser && (
          <div style={{
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#a78bfa', fontSize: '0.9rem', marginBottom: '4px' }}>
              <ShieldCheck size={16} /> Admin Testing Mode
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)', marginBottom: '10px' }}>
              You are signed in as Super Admin. You can simulate the full customer checkout instantly for $0.00 to inspect the credentials and dashboard.
            </p>
            <button
              className="btn btn-sm"
              style={{ background: '#8b5cf6', color: '#fff', width: '100%', fontWeight: 700, padding: '10px' }}
              onClick={handleAdminSimulate}
              disabled={loading || !selProxy}
            >
              <Zap size={14} /> Simulate Instant Activation (Free)
            </button>
          </div>
        )}

        {/* Security note */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '0.8rem', color: 'var(--clr-text-3)',
          marginBottom: '20px',
        }}>
          <Lock size={13} />
          Payments are processed securely. Credentials are delivered instantly after confirmation.
        </div>

        {/* Action button */}
        <button
          className="btn btn-primary btn-full"
          style={{ padding: '16px', fontSize: '1rem' }}
          onClick={payMethod === 'paystack' ? handlePayWithPaystack : handlePayWithCrypto}
          disabled={loading || !selProxy}
        >
          {loading
            ? <><div className="loader" style={{ width: 18, height: 18 }} /> Processing...</>
            : <>Pay ${parseFloat(plan.price_usd).toFixed(2)} with {payMethod === 'paystack' ? 'Card / Bank' : 'Crypto'} <ChevronRight size={18} /></>
          }
        </button>
      </div>
    </div>
  );
}
