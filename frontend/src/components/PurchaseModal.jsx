import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, CreditCard, Bitcoin, Wifi, ChevronRight, Lock, Zap, ShieldCheck } from 'lucide-react';
import { createOrder, supabase, simulateAdminSubscription, activateSubscription, isAdmin } from '../lib/supabase';
import { playSuccessSound, playClickSound, playErrorSound } from '../lib/sound';

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
    playClickSound();
    try {
      await simulateAdminSubscription(plan.id, selProxy.id);
      playSuccessSound();
      toast.success('⚡ Admin Simulation: Proxy rented & activated successfully!');
      onSuccess();
    } catch (err) {
      playErrorSound();
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

      // 2. Initialize Paystack in KES (1 USD = 133 KES)
      const { data: sess } = await supabase.auth.getSession();
      const email = sess?.session?.user?.email || 'customer@proxicell.com';
      const liveKey = PAYSTACK_PUBLIC_KEY || 'pk_live_558e1ed8114c63c09b135b1523443ecfffb60524';
      const refCode = 'PK_' + order.id.replace(/-/g, '').substring(0, 10) + '_' + Date.now();
      
      const usdAmount = parseFloat(plan.price_usd);
      const kesAmount = Math.round(usdAmount * 133);
      const amountSubunits = kesAmount * 100; // Paystack takes subunits (cents)

      // Method A: PaystackPop v2 SDK
      if (typeof window.PaystackPop !== 'undefined' && typeof window.PaystackPop === 'function') {
        try {
          const paystack = new window.PaystackPop();
          paystack.newTransaction({
            key:       liveKey,
            email:     email,
            amount:    amountSubunits,
            currency:  'KES',
            reference: refCode,
            onSuccess: (transaction) => {
              activateSubscription(order.id, plan.id, selProxy.id, 'paystack', transaction.reference || transaction.trxref)
                .then(() => {
                  playSuccessSound();
                  toast.success('🎉 Payment successful! Your proxy has been activated.');
                  onSuccess();
                })
                .catch(() => {
                  playSuccessSound();
                  toast.success('Payment received! Activating proxy...');
                  onSuccess();
                });
            },
            onCancel: () => {
              playClickSound();
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
          amount:    amountSubunits,
          currency:  'KES',
          ref:       refCode,
          callback: function(response) {
            activateSubscription(order.id, plan.id, selProxy.id, 'paystack', response.reference || response.trxref)
              .then(() => {
                playSuccessSound();
                toast.success('🎉 Payment successful! Your proxy has been activated.');
                onSuccess();
              })
              .catch(() => {
                playSuccessSound();
                toast.success('Payment received! Activating proxy...');
                onSuccess();
              });
          },
          onClose: function() {
            playClickSound();
            toast('Payment window closed.');
            setLoading(false);
          },
        });
        handler.openIframe();
      } else {
        throw new Error('Payment gateway is loading. Please try again in 5 seconds.');
      }
    } catch (err) {
      playErrorSound();
      toast.error(err.message || 'Paystack initialization failed');
      setLoading(false);
    }
  };

  const [showUsdtCheckout, setShowUsdtCheckout] = useState(false);
  const [usdtNetwork, setUsdtNetwork]           = useState('TRC20'); // TRC20 | BEP20 | ERC20 | POLYGON
  const [cryptoInvoiceUrl, setCryptoInvoiceUrl] = useState(null);
  const [pendingCryptoData, setPendingCryptoData] = useState(null);

  const USDT_ADDRESSES = {
    TRC20:   'TWMc4qXkGe57U6x87pY4F6Q2mN8K3sB9jA',
    BEP20:   '0x83B38c8Eb3686D32490e55728a3fFF70984950e1',
    ERC20:   '0x83B38c8Eb3686D32490e55728a3fFF70984950e1',
    POLYGON: '0x83B38c8Eb3686D32490e55728a3fFF70984950e1',
  };

  const handlePayWithCrypto = async () => {
    if (!selProxy) {
      toast.error('Please select an online proxy/SIM first.');
      return;
    }
    setLoading(true);
    playClickSound();
    try {
      const { data: order, error } = await createOrder(plan.id, selProxy.id, 'crypto');
      if (error) throw error;

      // Save pending order details
      setPendingCryptoData({
        orderId:   order.id,
        planId:    plan.id,
        proxyId:   selProxy.id,
      });

      // Also create NOWPayments invoice in background
      const apiKey = NOWPAYMENTS_API_KEY || 'QNJ3N44-2JP4AKM-PGPJXCK-3AQPC3T';
      fetch('https://api.nowpayments.io/v1/invoice', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: parseFloat(plan.price_usd),
          price_currency: 'usd',
          order_id: order.id,
          order_description: `Vertex Proxies ${plan.name} Proxy Subscription`,
          success_url: `${window.location.origin}/dashboard?payment=success&order_id=${order.id}`,
          cancel_url: `${window.location.origin}/#pricing`,
        }),
      }).then(r => r.json()).then(inv => {
        if (inv?.invoice_url) setCryptoInvoiceUrl(inv.invoice_url);
      }).catch(() => {});

      setShowUsdtCheckout(true);
      playClickSound();
      toast.success('USDT payment ready! Select your preferred network.');
    } catch (err) {
      playErrorSound();
      toast.error(err.message || 'Crypto payment error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCryptoPayment = async () => {
    if (!pendingCryptoData) return;
    setLoading(true);
    playClickSound();
    try {
      await activateSubscription(
        pendingCryptoData.orderId,
        pendingCryptoData.planId,
        pendingCryptoData.proxyId,
        'crypto',
        `USDT_${usdtNetwork}_${Date.now()}`
      );
      playSuccessSound();
      toast.success('🎉 Payment confirmed! Your proxy credentials are now active.');
      onSuccess();
    } catch (err) {
      playErrorSound();
      toast.error('Could not activate proxy: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    playClickSound();
    toast.success(`Copied ${label}!`, { duration: 1500 });
  };

  const currentAddress = USDT_ADDRESSES[usdtNetwork] || USDT_ADDRESSES.TRC20;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(currentAddress)}`;

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: showUsdtCheckout ? '520px' : '480px', width: '92%' }}>
        {/* Header */}
        <div className="flex justify-between items-center" style={{ marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '1.45rem', marginBottom: '2px' }}>
              {showUsdtCheckout ? 'Pay with USDT' : 'Purchase Plan'}
            </h2>
            <p className="text-muted text-sm">
              {showUsdtCheckout ? 'Select network, scan QR or copy address' : 'Complete your proxy subscription'}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm modal-close" onClick={onClose} style={{ position: 'relative', top: 'auto', right: 'auto' }}>
            <X size={18} />
          </button>
        </div>

        {showUsdtCheckout ? (
          <div>
            {/* USDT Network Selector */}
            <div style={{ marginBottom: '16px' }}>
              <label className="input-label" style={{ marginBottom: '8px' }}>Select USDT Network</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {[
                  { key: 'TRC20', label: 'TRC20', note: 'Tron (Lowest Fee)' },
                  { key: 'BEP20', label: 'BEP20', note: 'BSC' },
                  { key: 'ERC20', label: 'ERC20', note: 'Ethereum' },
                  { key: 'POLYGON', label: 'Polygon', note: 'MATIC' },
                ].map(net => (
                  <button
                    key={net.key}
                    type="button"
                    onClick={() => { playClickSound(); setUsdtNetwork(net.key); }}
                    className={`btn btn-sm ${usdtNetwork === net.key ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      padding: '8px 4px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      flexDirection: 'column',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    {net.label}
                  </button>
                ))}
              </div>
            </div>

            {/* High-Contrast QR Code Card */}
            <div style={{
              background: '#ffffff',
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              textAlign: 'center',
              marginBottom: '16px',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <img
                src={qrUrl}
                alt="USDT Deposit QR"
                style={{
                  width: '180px',
                  height: '180px',
                  display: 'block',
                  borderRadius: '8px',
                }}
              />
              <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '0.85rem', marginTop: '6px' }}>
                USDT ({usdtNetwork})
              </div>
            </div>

            {/* Amount and Address Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              {/* Amount */}
              <div className="card" style={{ padding: '12px 14px', background: 'var(--clr-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--clr-text-3)' }}>Exact Amount to Send</div>
                  <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--clr-accent)' }}>
                    {parseFloat(plan.price_usd).toFixed(2)} USDT
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(parseFloat(plan.price_usd).toFixed(2), 'Amount')}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 12px' }}
                >
                  Copy Amount
                </button>
              </div>

              {/* Address */}
              <div className="card" style={{ padding: '12px 14px', background: 'var(--clr-surface-2)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--clr-text-3)', marginBottom: '4px' }}>
                  USDT ({usdtNetwork}) Deposit Address
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.78rem',
                    color: 'var(--clr-text)',
                    wordBreak: 'break-all',
                    flex: 1,
                    background: 'rgba(0,0,0,0.3)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    {currentAddress}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(currentAddress, 'USDT Address')}
                    className="btn btn-primary btn-sm"
                    style={{ padding: '8px 12px', flexShrink: 0 }}
                  >
                    Copy Address
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-sm" style={{ marginBottom: cryptoInvoiceUrl ? '10px' : '0' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowUsdtCheckout(false);
                  setPendingCryptoData(null);
                }}
                style={{ flex: 1 }}
              >
                ← Back
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleConfirmCryptoPayment}
                disabled={loading}
                style={{ flex: 2, padding: '12px' }}
              >
                {loading ? 'Activating Proxy...' : 'I\'ve Sent the USDT →'}
              </button>
            </div>

            {cryptoInvoiceUrl && (
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <a
                  href={cryptoInvoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)', textDecoration: 'underline' }}
                >
                  Open NOWPayments Gateway Page ↗
                </a>
              </div>
            )}
          </div>
        ) : (

          <>
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
                  { key: 'paystack', label: 'Card / M-Pesa',  icon: <CreditCard size={18} />,  sub: `KES ${(Math.round(parseFloat(plan.price_usd) * 133)).toLocaleString()} (Paystack)` },
                  { key: 'crypto',   label: 'USDT Crypto',   icon: <Bitcoin size={18} />,     sub: `USDT (TRC20, BEP20, ERC20)` },
                ].map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => { playClickSound(); setPayMethod(m.key); }}
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
                  type="button"
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
              Secure instant checkout. Your mobile proxy is provisioned automatically upon payment.
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
                : payMethod === 'paystack'
                  ? <>Pay KES {(Math.round(parseFloat(plan.price_usd) * 133)).toLocaleString()} ($${parseFloat(plan.price_usd).toFixed(0)}) with Card / M-Pesa <ChevronRight size={18} /></>
                  : <>Pay ${parseFloat(plan.price_usd).toFixed(2)} with USDT <ChevronRight size={18} /></>
              }
            </button>
          </>
        )}
      </div>
    </div>
  );
}


