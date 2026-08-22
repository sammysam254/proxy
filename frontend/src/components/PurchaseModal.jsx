import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { X, CreditCard, Bitcoin, Wifi, ChevronRight, Lock, Zap, ShieldCheck, AlertTriangle } from 'lucide-react';
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
  const [usdtNetwork, setUsdtNetwork]           = useState('BEP20'); // BEP20 (default lowest fee) | TRC20 | POLYGON | ERC20
  const [cryptoPayment, setCryptoPayment]       = useState(null); // { payment_id, pay_address, pay_amount, payment_status, actually_paid }
  const [pendingCryptoData, setPendingCryptoData] = useState(null);
  const [verifying, setVerifying]               = useState(false);
  const [partialPayment, setPartialPayment]     = useState(null); // { paid, remaining }

  const NETWORK_MAP = {
    BEP20:   { code: 'usdtbsc',   label: 'BEP20',   name: 'BNB Smart Chain', note: 'Fast & Low Fee' },
    TRC20:   { code: 'usdttrc20', label: 'TRC20',   name: 'Tron Network',    note: 'Lowest Fee' },
    POLYGON: { code: 'usdtmatic', label: 'Polygon', name: 'Polygon Network', note: 'Fast & Cheap' },
    ERC20:   { code: 'usdterc20', label: 'ERC20',   name: 'Ethereum',        note: 'High Gas' },
  };

  const createCryptoPayment = async (networkKey, orderId) => {
    const net = NETWORK_MAP[networkKey] || NETWORK_MAP.BEP20;
    const apiKey = NOWPAYMENTS_API_KEY || 'QNJ3N44-2JP4AKM-PGPJXCK-3AQPC3T';

    const res = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: parseFloat(plan.price_usd),
        price_currency: 'usd',
        pay_currency: net.code,
        order_id: orderId,
        order_description: `Vertex Proxies ${plan.name} Proxy Subscription`,
      }),
    });

    const data = await res.json();
    if (data && data.payment_id && data.pay_address) {
      setCryptoPayment(data);
      return data;
    } else {
      // Fallback if direct coin endpoint had minimal limit error
      const invRes = await fetch('https://api.nowpayments.io/v1/invoice', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_amount: parseFloat(plan.price_usd),
          price_currency: 'usd',
          order_id: orderId,
          order_description: `Vertex Proxies ${plan.name} Proxy Subscription`,
        }),
      });
      const invData = await invRes.json();
      return invData;
    }
  };

  const handlePayWithCrypto = async () => {
    if (!selProxy) {
      toast.error('Please select an online proxy/SIM first.');
      return;
    }
    setLoading(true);
    playClickSound();
    setPartialPayment(null);

    try {
      const { data: order, error } = await createOrder(plan.id, selProxy.id, 'crypto');
      if (error) throw error;

      setPendingCryptoData({
        orderId: order.id,
        planId:  plan.id,
        proxyId: selProxy.id,
      });

      await createCryptoPayment(usdtNetwork, order.id);
      setShowUsdtCheckout(true);
      playClickSound();
      toast.success('USDT payment gateway ready! Send funds to activate.');
    } catch (err) {
      playErrorSound();
      toast.error(err.message || 'Crypto payment error');
    } finally {
      setLoading(false);
    }
  };

  const handleNetworkSwitch = async (netKey) => {
    setUsdtNetwork(netKey);
    setPartialPayment(null);
    playClickSound();

    if (pendingCryptoData?.orderId) {
      setLoading(true);
      try {
        await createCryptoPayment(netKey, pendingCryptoData.orderId);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    }
  };

  const handleVerifyCryptoPayment = async () => {
    if (!pendingCryptoData) return;
    setVerifying(true);
    playClickSound();

    try {
      const apiKey = NOWPAYMENTS_API_KEY || 'QNJ3N44-2JP4AKM-PGPJXCK-3AQPC3T';
      const paymentId = cryptoPayment?.payment_id;

      if (!paymentId) {
        throw new Error('No active payment session found. Please try generating invoice again.');
      }

      // Check live status on blockchain via NOWPayments
      const res = await fetch(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
        headers: { 'x-api-key': apiKey },
      });
      const statusData = await res.json();

      const status = statusData?.payment_status?.toLowerCase();
      const actuallyPaid = parseFloat(statusData?.actually_paid || 0);
      const payAmount    = parseFloat(statusData?.pay_amount || plan.price_usd);

      // Case 1: Payment Confirmed / Completed
      if (['finished', 'confirmed', 'sending', 'completed'].includes(status)) {
        await activateSubscription(
          pendingCryptoData.orderId,
          pendingCryptoData.planId,
          pendingCryptoData.proxyId,
          'crypto',
          String(paymentId)
        );
        playSuccessSound();
        toast.success('🎉 Blockchain payment confirmed! Your proxy credentials are now active.');
        onSuccess();
        return;
      }

      // Case 2: Partial Payment Detected
      if (status === 'partially_paid' || (actuallyPaid > 0 && actuallyPaid < payAmount)) {
        const remaining = Math.max(0, payAmount - actuallyPaid).toFixed(4);
        setPartialPayment({
          paid: actuallyPaid,
          required: payAmount,
          remaining: remaining,
        });
        playErrorSound();
        toast.error(`⚠️ Partial payment detected: ${actuallyPaid} USDT paid. Please send the remaining ${remaining} USDT balance to activate.`, { duration: 6000 });
        return;
      }

      // Case 3: Still waiting for blockchain confirmation
      if (status === 'waiting') {
        playErrorSound();
        toast('⏳ Payment not detected on blockchain yet. Transactions take 1–3 minutes to confirm on-chain. Please retry after sending funds.', {
          icon: '⏳',
          duration: 5000,
        });
        return;
      }

      // Case 4: Expired or Failed
      if (status === 'expired' || status === 'failed') {
        playErrorSound();
        toast.error('❌ This payment session expired. Please choose a network to generate a new payment address.');
        await createCryptoPayment(usdtNetwork, pendingCryptoData.orderId);
        return;
      }

      toast(`Payment status: ${statusData?.payment_status || 'Checking'}. Please check back in a minute.`);
    } catch (err) {
      playErrorSound();
      toast.error('Verification check error: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(String(text));
    playClickSound();
    toast.success(`Copied ${label}!`, { duration: 1500 });
  };

  const currentAddress = cryptoPayment?.pay_address || '0x83B38c8Eb3686D32490e55728a3fFF70984950e1';
  const currentAmount  = cryptoPayment?.pay_amount
    ? parseFloat(cryptoPayment.pay_amount).toFixed(4)
    : parseFloat(plan.price_usd).toFixed(2);

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
                {Object.keys(NETWORK_MAP).map(key => {
                  const net = NETWORK_MAP[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleNetworkSwitch(key)}
                      className={`btn btn-sm ${usdtNetwork === key ? 'btn-primary' : 'btn-secondary'}`}
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
                  );
                })}
              </div>
            </div>

            {/* Partial payment alert */}
            {partialPayment && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
                  <AlertTriangle size={16} /> Partial Payment Detected
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--clr-text-2)', marginBottom: '10px', lineHeight: 1.4 }}>
                  You paid <strong>{partialPayment.paid} USDT</strong> out of <strong>{partialPayment.required} USDT</strong>.
                  <br />
                  Remaining balance to activate proxy: <strong style={{ color: '#f59e0b', fontSize: '0.95rem' }}>{partialPayment.remaining} USDT</strong>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(partialPayment.remaining, 'Remaining Balance')}
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', borderColor: '#f59e0b', color: '#f59e0b' }}
                >
                  Copy Remaining Balance ({partialPayment.remaining} USDT)
                </button>
              </div>
            )}

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
                USDT ({NETWORK_MAP[usdtNetwork]?.label || usdtNetwork})
              </div>
            </div>

            {/* Amount and Address Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              {/* Amount */}
              <div className="card" style={{ padding: '12px 14px', background: 'var(--clr-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--clr-text-3)' }}>Exact Amount to Send</div>
                  <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--clr-accent)' }}>
                    {currentAmount} USDT
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(currentAmount, 'Amount')}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 12px' }}
                >
                  Copy Amount
                </button>
              </div>

              {/* Address */}
              <div className="card" style={{ padding: '12px 14px', background: 'var(--clr-surface-2)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--clr-text-3)', marginBottom: '4px' }}>
                  USDT ({NETWORK_MAP[usdtNetwork]?.label || usdtNetwork}) Deposit Address
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
            <div className="flex gap-sm" style={{ marginBottom: '10px' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowUsdtCheckout(false);
                  setPendingCryptoData(null);
                  setPartialPayment(null);
                }}
                style={{ flex: 1 }}
              >
                ← Back
              </button>
              <button
                className={`btn btn-primary btn-sm ${verifying ? 'btn-loading' : ''}`}
                onClick={handleVerifyCryptoPayment}
                disabled={verifying || loading}
                style={{ flex: 2, padding: '12px' }}
              >
                {verifying ? (
                  <>
                    <div className="loader" style={{ width: 16, height: 16 }} />
                    Checking Blockchain...
                  </>
                ) : (
                  'I\'ve Sent the USDT (Verify Payment) →'
                )}
              </button>
            </div>
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
              <div className="flex justify-between items-center">
                <label className="input-label" style={{ margin: 0 }}>
                  <Wifi size={13} style={{ verticalAlign: 'middle', marginRight: '4px', color: 'var(--clr-accent)' }} />
                  Select Proxy / SIM Card
                </label>
                <span className="badge badge-online" style={{ fontSize: '0.7rem' }}>
                  {onlineProxies.length} Online Available
                </span>
              </div>
              {onlineProxies.length > 0 ? (
                <div>
                  <select
                    className="input select"
                    value={selProxy?.id || ''}
                    onChange={e => setSelProxy(onlineProxies.find(p => p.id === e.target.value))}
                    style={{
                      background: '#0d1322',
                      color: '#f8fafc',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      fontWeight: 600,
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.92rem',
                    }}
                  >
                    {onlineProxies.map(p => (
                      <option
                        key={p.id}
                        value={p.id}
                        style={{ background: '#0d1322', color: '#f8fafc', padding: '10px' }}
                      >
                        {p.modems?.label || 'Modem'} ({p.proxy_type?.toUpperCase()}) — {p.modems?.operator || 'Mobile SIM'}
                      </option>
                    ))}
                  </select>

                  {/* Selected Proxy Summary Tag */}
                  {selProxy && (
                    <div style={{
                      marginTop: '8px',
                      padding: '8px 12px',
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.78rem',
                    }}>
                      <span style={{ color: 'var(--clr-text-2)' }}>
                        Connected SIM: <strong style={{ color: '#fff' }}>{selProxy.modems?.label}</strong>
                      </span>
                      <span className="mono" style={{ color: 'var(--clr-accent)', fontWeight: 700 }}>
                        :{selProxy.public_port} ({selProxy.proxy_type?.toUpperCase()})
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card" style={{ padding: '14px 16px', color: 'var(--clr-text-2)', fontSize: '0.9rem', background: '#0d1322' }}>
                  No proxies online right now. Please connect USB modems or Android phones.
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


