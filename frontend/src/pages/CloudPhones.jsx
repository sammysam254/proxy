import { useState, useEffect, useRef } from 'react';
import {
  Smartphone, Wifi, RotateCw, Play, Square, RefreshCw,
  Plus, Settings, Shield, ExternalLink, Download, Upload,
  Volume2, VolumeX, Camera, Copy, Check, Power, ArrowLeft,
  ChevronRight, Circle, Layers, Compass, MessageSquare,
  Globe, Share2, Sparkles, Terminal
} from 'lucide-react';
import { supabase, requestIpRotation } from '../lib/supabase';

const DEFAULT_PHONES = [
  {
    id: 'cp-samsung-s23-01',
    name: 'Samsung Galaxy S23 (TikTok #1)',
    brand: 'Samsung',
    model: 'Galaxy S23 Ultra',
    android_version: 'Android 13.0',
    imei: '358921094821049',
    android_id: 'a89c294fb82019e1',
    mac_address: '4A:EB:90:95:62:7A',
    status: 'running',
    vps_engine: 'Oracle Cloud Ampere (ARM64)',
    battery_level: 94,
    installed_apps: ['TikTok', 'Instagram', 'WhatsApp', 'Chrome', 'Telegram'],
    proxy: {
      host: '64.227.3.211',
      port: 41000,
      exit_ip: '217.199.144.98',
      carrier: 'Safaricom 4G LTE',
      country: 'Kenya 🇰🇪',
    }
  },
  {
    id: 'cp-pixel-8-02',
    name: 'Google Pixel 8 (WhatsApp Marketing)',
    brand: 'Google',
    model: 'Pixel 8 Pro',
    android_version: 'Android 14.0',
    imei: '354891028391024',
    android_id: 'f72019482019482b',
    mac_address: '5E:12:88:AC:33:91',
    status: 'running',
    vps_engine: 'Oracle Cloud Ampere (ARM64)',
    battery_level: 88,
    installed_apps: ['WhatsApp Business', 'Chrome', 'Facebook', 'Gmail'],
    proxy: {
      host: '64.227.3.211',
      port: 41000,
      exit_ip: '217.199.144.98',
      carrier: 'Safaricom 4G LTE',
      country: 'Kenya 🇰🇪',
    }
  }
];

export default function CloudPhones({ session }) {
  const [phones, setPhones] = useState(DEFAULT_PHONES);
  const [activeModalPhone, setActiveModalPhone] = useState(null);
  const [rotatingId, setRotatingId] = useState(null);
  const [activeApp, setActiveApp] = useState(null);
  const [copied, setCopied] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('home'); // 'home' | 'app'
  const [screenBrightness, setScreenBrightness] = useState(100);
  const [volume, setVolume] = useState(80);
  const [newPhoneModal, setNewPhoneModal] = useState(false);
  const [newPhoneData, setNewPhoneData] = useState({
    name: 'My Cloud Phone #3',
    brand: 'Samsung',
    model: 'Galaxy S23',
    android_version: 'Android 13.0',
  });

  // Handle IP Rotation directly on Cloud Phone
  const handleRotateProxy = async (phone) => {
    setRotatingId(phone.id);
    try {
      // Find modem to rotate
      const { data: modems } = await supabase.from('modems').select('id').eq('status', 'online').limit(1);
      if (modems && modems[0]) {
        await supabase.from('modems').update({ rotate_requested_at: new Date().toISOString() }).eq('id', modems[0].id);
      }
      setTimeout(() => {
        setRotatingId(null);
        // Refresh IP visual
        setPhones(prev => prev.map(p => {
          if (p.id === phone.id && p.proxy) {
            const randOctet = Math.floor(Math.random() * 200) + 10;
            return {
              ...p,
              proxy: { ...p.proxy, exit_ip: `217.199.144.${randOctet}` }
            };
          }
          return p;
        }));
      }, 3500);
    } catch (e) {
      setRotatingId(null);
    }
  };

  const handleLaunchApp = (appName) => {
    setActiveApp(appName);
    setCurrentScreen('app');
  };

  const handleGoHome = () => {
    setCurrentScreen('home');
    setActiveApp(null);
  };

  const handleAddPhone = () => {
    const newEntry = {
      id: `cp-${Date.now()}`,
      name: newPhoneData.name,
      brand: newPhoneData.brand,
      model: newPhoneData.model,
      android_version: newPhoneData.android_version,
      imei: `35${Math.floor(1000000000000 + Math.random() * 9000000000000)}`,
      android_id: Math.random().toString(16).substring(2, 18),
      mac_address: '4A:' + Array.from({length: 5}, () => Math.floor(Math.random()*256).toString(16).padStart(2,'0').toUpperCase()).join(':'),
      status: 'running',
      vps_engine: 'Oracle Cloud Ampere (ARM64)',
      battery_level: 100,
      installed_apps: ['TikTok', 'WhatsApp', 'Instagram', 'Chrome'],
      proxy: {
        host: '64.227.3.211',
        port: 41000,
        exit_ip: '217.199.144.98',
        carrier: 'Safaricom 4G LTE',
        country: 'Kenya 🇰🇪',
      }
    };
    setPhones([newEntry, ...phones]);
    setNewPhoneModal(false);
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-accent)' }}>
              <Smartphone size={22} />
            </div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0 }}>Cloud Phones</h1>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--clr-green)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              Oracle Engine Active
            </span>
          </div>
          <p style={{ color: 'var(--clr-text-2)', fontSize: '0.92rem', margin: 0 }}>
            Run virtual Android devices in the cloud, pre-routed through your 4G mobile proxies with genuine anti-detect fingerprints.
          </p>
        </div>

        <button
          onClick={() => setNewPhoneModal(true)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', fontWeight: 600 }}
        >
          <Plus size={18} />
          Provision Cloud Phone
        </button>
      </div>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: '14px', padding: '18px 20px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>Total Cloud Phones</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--clr-text)' }}>{phones.length} Instances</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--clr-green)', marginTop: '4px' }}>● 100% Operational</div>
        </div>

        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: '14px', padding: '18px 20px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>Bound Mobile SIM Proxies</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--clr-accent)' }}>64.227.3.211:41000</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)', marginTop: '4px' }}>🇰🇪 Safaricom 4G LTE (217.199.144.98)</div>
        </div>

        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: '14px', padding: '18px 20px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>Virtualization Engine</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-text)' }}>Oracle Cloud ARM64</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)', marginTop: '4px' }}>ReDroid 13.0 + Hardware Canvas</div>
        </div>
      </div>

      {/* Cloud Phones Grid */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px' }}>Active Instances</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
        {phones.map((phone) => (
          <div
            key={phone.id}
            style={{
              background: 'var(--clr-surface)',
              border: '1px solid var(--clr-border)',
              borderRadius: '16px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-sm)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
          >
            {/* Card Header */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 4px' }}>{phone.name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>
                  <span>{phone.model}</span>
                  <span>•</span>
                  <span>{phone.android_version}</span>
                </div>
              </div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', borderRadius: '20px',
                fontSize: '0.75rem', fontWeight: 700,
                background: 'rgba(16, 185, 129, 0.12)', color: 'var(--clr-green)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                {phone.status.toUpperCase()}
              </span>
            </div>

            {/* Device Info & Specs */}
            <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* Bound Proxy Pill */}
              <div style={{ background: 'var(--clr-surface-2)', border: '1px solid var(--clr-border-2)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--clr-accent)' }}>
                    <Wifi size={14} />
                    <span>Proxy: {phone.proxy?.host}:{phone.proxy?.port}</span>
                  </div>
                  <button
                    onClick={() => handleRotateProxy(phone)}
                    disabled={rotatingId === phone.id}
                    title="Rotate SIM IP for this Cloud Phone"
                    style={{
                      background: 'var(--clr-surface)',
                      border: '1px solid var(--clr-border)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--clr-text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <RefreshCw size={12} className={rotatingId === phone.id ? 'spin' : ''} />
                    {rotatingId === phone.id ? 'Rotating...' : 'Rotate IP'}
                  </button>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--clr-text-2)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Exit IP: <strong style={{ color: 'var(--clr-text)' }}>{phone.proxy?.exit_ip}</strong></span>
                  <span>{phone.proxy?.country}</span>
                </div>
              </div>

              {/* Hardware Fingerprints */}
              <div style={{ fontSize: '0.78rem', color: 'var(--clr-text-3)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div>IMEI: <span style={{ color: 'var(--clr-text-2)', fontFamily: 'monospace' }}>{phone.imei.slice(0, 8)}...</span></div>
                <div>Android ID: <span style={{ color: 'var(--clr-text-2)', fontFamily: 'monospace' }}>{phone.android_id.slice(0, 8)}...</span></div>
                <div>MAC: <span style={{ color: 'var(--clr-text-2)', fontFamily: 'monospace' }}>{phone.mac_address}</span></div>
                <div>Battery: <span style={{ color: 'var(--clr-text-2)' }}>{phone.battery_level}%</span></div>
              </div>

              {/* Installed Apps */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-text-3)', textTransform: 'uppercase', marginBottom: '6px' }}>Installed Apps</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {phone.installed_apps.map(app => (
                    <span key={app} style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', background: 'var(--clr-surface-2)', border: '1px solid var(--clr-border)', color: 'var(--clr-text-2)' }}>
                      {app}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)', display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setActiveModalPhone(phone); setCurrentScreen('home'); }}
                className="btn btn-primary btn-sm"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, padding: '10px' }}
              >
                <Smartphone size={16} />
                Launch Screen Player
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ─── IN-BROWSER INTERACTIVE CLOUD PHONE PLAYER MODAL ─── */}
      {activeModalPhone && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: 'var(--clr-bg-2)',
            border: '1px solid var(--clr-border-2)',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '1000px',
            height: '92vh',
            display: 'flex',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}>
            
            {/* Phone Screen Mockup (Left/Center) */}
            <div style={{
              flex: '1.2',
              background: '#0a0a0f',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
              borderRight: '1px solid var(--clr-border)',
              position: 'relative',
            }}>
              
              {/* Smartphone Outer Bezel Frame */}
              <div style={{
                width: '320px',
                height: '640px',
                background: '#121216',
                borderRadius: '40px',
                border: '4px solid #2d2d38',
                boxShadow: '0 0 0 2px #181820, 0 20px 40px rgba(0,0,0,0.8)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
              }}>
                
                {/* Punch-hole Camera */}
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#000',
                  border: '1px solid #1a1a24',
                  zIndex: 20,
                }} />

                {/* Status Bar */}
                <div style={{
                  height: '28px',
                  padding: '0 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: '#fff',
                  background: 'rgba(0,0,0,0.4)',
                  zIndex: 10,
                }}>
                  <span>12:45</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.65rem', background: '#3b82f6', padding: '1px 4px', borderRadius: '3px' }}>4G</span>
                    <Wifi size={11} />
                    <span>{activeModalPhone.battery_level}%</span>
                  </div>
                </div>

                {/* Active Screen Canvas View */}
                <div style={{
                  flex: 1,
                  background: currentScreen === 'home' 
                    ? 'radial-gradient(circle at 50% 20%, #1e1b4b 0%, #09090b 100%)' 
                    : '#0f172a',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '16px',
                  position: 'relative',
                  overflowY: 'auto',
                }}>

                  {/* Home Screen View */}
                  {currentScreen === 'home' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      
                      {/* Clock Widget */}
                      <div style={{ textAlign: 'center', marginTop: '30px', marginBottom: '30px' }}>
                        <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>12:45</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Thursday, August 20</div>
                        
                        {/* Proxy IP Tag on Phone Home Screen */}
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          marginTop: '10px', padding: '4px 10px', borderRadius: '14px',
                          background: 'rgba(139, 92, 246, 0.25)', border: '1px solid rgba(139, 92, 246, 0.4)',
                          color: '#c4b5fd', fontSize: '0.7rem', fontWeight: 600
                        }}>
                          <Wifi size={10} />
                          <span>Proxy IP: {activeModalPhone.proxy?.exit_ip}</span>
                        </div>
                      </div>

                      {/* App Icons Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginTop: 'auto', marginBottom: '20px' }}>
                        {[
                          { name: 'TikTok', color: '#000', border: '#ff0050', icon: <Sparkles size={20} color="#ff0050" /> },
                          { name: 'Instagram', color: '#e1306c', border: '#e1306c', icon: <Camera size={20} color="#fff" /> },
                          { name: 'WhatsApp', color: '#25d366', border: '#25d366', icon: <MessageSquare size={20} color="#fff" /> },
                          { name: 'Chrome', color: '#3b82f6', border: '#3b82f6', icon: <Globe size={20} color="#fff" /> },
                          { name: 'Telegram', color: '#0088cc', border: '#0088cc', icon: <Share2 size={20} color="#fff" /> },
                          { name: 'Settings', color: '#64748b', border: '#64748b', icon: <Settings size={20} color="#fff" /> },
                        ].map((app) => (
                          <div
                            key={app.name}
                            onClick={() => handleLaunchApp(app.name)}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                              cursor: 'pointer', transition: 'transform 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            <div style={{
                              width: '46px', height: '46px', borderRadius: '12px',
                              background: app.color, border: `1px solid ${app.border}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
                            }}>
                              {app.icon}
                            </div>
                            <span style={{ fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 500 }}>{app.name}</span>
                          </div>
                        ))}
                      </div>

                      {/* Dock */}
                      <div style={{
                        background: 'rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: '20px',
                        padding: '10px 12px',
                        display: 'flex',
                        justifyContent: 'space-around',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}>
                        <div onClick={() => handleLaunchApp('Chrome')} style={{ cursor: 'pointer', width: '38px', height: '38px', borderRadius: '10px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Globe size={18} color="#fff" />
                        </div>
                        <div onClick={() => handleLaunchApp('WhatsApp')} style={{ cursor: 'pointer', width: '38px', height: '38px', borderRadius: '10px', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <MessageSquare size={18} color="#fff" />
                        </div>
                        <div onClick={() => handleLaunchApp('TikTok')} style={{ cursor: 'pointer', width: '38px', height: '38px', borderRadius: '10px', background: '#000', border: '1px solid #ff0050', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Sparkles size={18} color="#ff0050" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* App Screen View */}
                  {currentScreen === 'app' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button onClick={handleGoHome} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px' }}>
                            <ArrowLeft size={16} />
                          </button>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{activeApp}</span>
                        </div>
                        <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: '#10b981', color: '#fff' }}>Protected</span>
                      </div>

                      {/* App Mock Content */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px' }}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '16px', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', color: 'var(--clr-accent)' }}>
                          <Smartphone size={28} />
                        </div>
                        <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>{activeApp} is Running</h4>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 16px' }}>
                          All network requests from {activeApp} are securely routed through your 4G SIM proxy ({activeModalPhone.proxy?.exit_ip}).
                        </p>
                        <div style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                          🛡️ Anti-Detect Fingerprint Active
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* Android Navigation Bar (Back, Home, Recents) */}
                <div style={{
                  height: '40px',
                  background: '#09090b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  borderTop: '1px solid #1a1a24',
                }}>
                  <button onClick={handleGoHome} title="Back" style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px' }}>
                    <ArrowLeft size={16} />
                  </button>
                  <button onClick={handleGoHome} title="Home" style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '6px' }}>
                    <Circle size={14} />
                  </button>
                  <button onClick={() => setCurrentScreen('home')} title="Recent Apps" style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px' }}>
                    <Layers size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Cloud Phone Controls & Details Panel (Right) */}
            <div style={{
              flex: '1',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              background: 'var(--clr-bg-2)',
            }}>
              
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800 }}>{activeModalPhone.name}</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>{activeModalPhone.model} • {activeModalPhone.android_version}</div>
                </div>
                <button
                  onClick={() => setActiveModalPhone(null)}
                  style={{
                    background: 'var(--clr-surface)',
                    border: '1px solid var(--clr-border)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: 'var(--clr-text)',
                    fontWeight: 600,
                  }}
                >
                  Close Player
                </button>
              </div>

              {/* Bound Proxy & Quick IP Rotation */}
              <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text-3)', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Mobile SIM Proxy Connection
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-accent)' }}>{activeModalPhone.proxy?.host}:{activeModalPhone.proxy?.port}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-2)' }}>Exit IP: <strong style={{ color: 'var(--clr-green)' }}>{activeModalPhone.proxy?.exit_ip}</strong> ({activeModalPhone.proxy?.carrier})</div>
                  </div>
                </div>

                <button
                  onClick={() => handleRotateProxy(activeModalPhone)}
                  disabled={rotatingId === activeModalPhone.id}
                  className="btn btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, padding: '10px' }}
                >
                  <RefreshCw size={15} className={rotatingId === activeModalPhone.id ? 'spin' : ''} />
                  {rotatingId === activeModalPhone.id ? 'Rotating Mobile IP...' : 'Rotate SIM IP Now'}
                </button>
              </div>

              {/* Hardware & Touchpad Quick Controls */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text-3)', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Quick Controls
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <button onClick={handleGoHome} className="btn btn-secondary btn-sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 6px', gap: '4px' }}>
                    <Circle size={16} />
                    <span style={{ fontSize: '0.75rem' }}>Home</span>
                  </button>
                  <button onClick={() => {}} className="btn btn-secondary btn-sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 6px', gap: '4px' }}>
                    <Camera size={16} />
                    <span style={{ fontSize: '0.75rem' }}>Screenshot</span>
                  </button>
                  <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="btn btn-secondary btn-sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 6px', gap: '4px' }}>
                    {copied ? <Check size={16} color="var(--clr-green)" /> : <Copy size={16} />}
                    <span style={{ fontSize: '0.75rem' }}>{copied ? 'Copied' : 'Clipboard'}</span>
                  </button>
                </div>
              </div>

              {/* Drag & Drop APK Installer */}
              <div style={{
                border: '2px dashed var(--clr-border-2)',
                borderRadius: '14px',
                padding: '20px',
                textAlign: 'center',
                background: 'rgba(139, 92, 246, 0.03)',
                marginTop: 'auto',
              }}>
                <Upload size={24} color="var(--clr-accent)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--clr-text)', marginBottom: '4px' }}>Install Android APK</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)' }}>Drag & drop .apk file here or click to browse</div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ─── PROVISION NEW CLOUD PHONE MODAL ─── */}
      {newPhoneModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: 'var(--clr-surface)',
            border: '1px solid var(--clr-border)',
            borderRadius: '20px',
            padding: '28px',
            width: '100%',
            maxWidth: '480px',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.3rem', fontWeight: 800 }}>Provision New Cloud Phone</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--clr-text-2)', marginBottom: '6px' }}>Phone Instance Name</label>
                <input
                  type="text"
                  value={newPhoneData.name}
                  onChange={e => setNewPhoneData({ ...newPhoneData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)', color: 'var(--clr-text)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--clr-text-2)', marginBottom: '6px' }}>Brand / Device Model</label>
                <select
                  value={newPhoneData.model}
                  onChange={e => setNewPhoneData({ ...newPhoneData, model: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)', color: 'var(--clr-text)' }}
                >
                  <option value="Galaxy S23">Samsung Galaxy S23 (Flagship)</option>
                  <option value="Galaxy A54">Samsung Galaxy A54 (Midrange)</option>
                  <option value="Pixel 8 Pro">Google Pixel 8 Pro (Pure Android)</option>
                  <option value="Xiaomi 13">Xiaomi 13 (MIUI)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--clr-text-2)', marginBottom: '6px' }}>Android OS Version</label>
                <select
                  value={newPhoneData.android_version}
                  onChange={e => setNewPhoneData({ ...newPhoneData, android_version: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)', color: 'var(--clr-text)' }}
                >
                  <option value="Android 13.0">Android 13.0 (Tiramisu)</option>
                  <option value="Android 12.0">Android 12.0 (Snow Cone)</option>
                  <option value="Android 11.0">Android 11.0 (Red Velvet)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--clr-text-2)', marginBottom: '6px' }}>Auto-Bind Mobile SIM Proxy</label>
                <select
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)', color: 'var(--clr-text)' }}
                >
                  <option value="proxy-1">64.227.3.211:41000 — Safaricom 4G LTE (Kenya 🇰🇪)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setNewPhoneModal(false)}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '10px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddPhone}
                className="btn btn-primary"
                style={{ flex: 1, padding: '10px', fontWeight: 600 }}
              >
                Deploy Instance
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
