import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { signIn, signUp } from '../lib/supabase';
import { Wifi, Eye, EyeOff, Loader2 } from 'lucide-react';
import { playSuccessSound, playClickSound, playErrorSound } from '../lib/sound';

export default function AuthPage() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const [tab, setTab] = useState(params.get('tab') === 'signup' ? 'signup' : 'signin');

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    playClickSound();

    try {
      if (tab === 'signin') {
        const { error } = await signIn(email, password);
        if (error) throw error;
        playSuccessSound();
        toast.success('Welcome back!');
        navigate('/dashboard');
      } else {
        if (!name.trim()) throw new Error('Please enter your name.');
        const { error } = await signUp(email, password, name);
        if (error) throw error;
        playSuccessSound();
        toast.success('Account created! Welcome to ProxiCell.');
        navigate('/dashboard');
      }
    } catch (err) {
      playErrorSound();
      toast.error(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 16px',
      position: 'relative',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'fixed',
        top: '20%', left: '50%',
        transform: 'translateX(-50%)',
        width: '600px', height: '400px',
        background: 'radial-gradient(ellipse, rgba(59,130,246,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'var(--clr-bg-2)',
        border: '1px solid var(--clr-border-2)',
        borderRadius: 'var(--radius-xl)',
        padding: '40px 36px',
        position: 'relative',
      }}>
        {/* Logo */}
        <div className="flex items-center gap-sm" style={{ marginBottom: '32px', justifyContent: 'center' }}>
          <div className="logo-icon"><Wifi size={18} color="#fff" /></div>
          <span className="text-gradient" style={{ fontSize: '1.3rem', fontWeight: 800 }}>Vertex Proxies</span>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          background: 'var(--clr-surface)',
          borderRadius: 'var(--radius-md)',
          padding: '4px', gap: '4px',
          marginBottom: '28px',
        }}>
          {[
            { key: 'signin', label: 'Sign In' },
            { key: 'signup', label: 'Sign Up' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px',
                borderRadius: 'calc(var(--radius-md) - 4px)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: '0.9rem',
                transition: 'var(--transition)',
                background: tab === t.key ? 'var(--clr-surface-2)' : 'transparent',
                color: tab === t.key ? 'var(--clr-text)' : 'var(--clr-text-2)',
                boxShadow: tab === t.key ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tab === 'signup' && (
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input
                className="input"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Email Address</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ paddingRight: '44px' }}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute', right: '12px', top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--clr-text-3)',
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            style={{ marginTop: '8px', padding: '14px' }}
            disabled={loading}
          >
            {loading
              ? <><div className="loader" style={{ width: 18, height: 18 }} /> Processing...</>
              : tab === 'signin' ? 'Sign In' : 'Create Account'
            }
          </button>
        </form>

        <p style={{ textAlign: 'center', color: 'var(--clr-text-3)', fontSize: '0.85rem', marginTop: '20px' }}>
          {tab === 'signin'
            ? "Don't have an account? "
            : 'Already have an account? '
          }
          <button
            onClick={() => setTab(tab === 'signin' ? 'signup' : 'signin')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-accent)', fontWeight: 600 }}
          >
            {tab === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
