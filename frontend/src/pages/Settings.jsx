import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Settings as SettingsIcon, User, Lock, Volume2, Bell,
  Shield, Check, LogOut, Key, Save
} from 'lucide-react';
import { supabase, signOut } from '../lib/supabase';
import SidebarLayout from '../components/SidebarLayout';
import { playSuccessSound, playClickSound, playErrorSound } from '../lib/sound';

export default function Settings({ session }) {
  const user = session?.user;
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('vertex_sound_enabled') !== 'false';
  });

  const [refreshInterval, setRefreshInterval] = useState(() => {
    return localStorage.getItem('vertex_refresh_rate') || '10';
  });

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    playClickSound();

    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });
      if (error) throw error;

      await supabase.from('customers').upsert({
        id: user.id,
        email: user.email,
        full_name: fullName,
      });

      playSuccessSound();
      toast.success('Profile details updated successfully!');
    } catch (err) {
      playErrorSound();
      toast.error('Failed to update profile: ' + err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      playErrorSound();
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      playErrorSound();
      toast.error('Passwords do not match.');
      return;
    }

    setPwLoading(true);
    playClickSound();

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      playSuccessSound();
      toast.success('Password changed successfully!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      playErrorSound();
      toast.error('Password update failed: ' + err.message);
    } finally {
      setPwLoading(false);
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('vertex_sound_enabled', String(next));
    if (next) playSuccessSound();
    toast.success(`Sound effects ${next ? 'enabled' : 'disabled'}.`);
  };

  const handleRefreshChange = (rate) => {
    setRefreshInterval(rate);
    localStorage.setItem('vertex_refresh_rate', rate);
    playClickSound();
    toast.success(`Dashboard auto-refresh set to ${rate}s.`);
  };

  return (
    <SidebarLayout session={session} adminMode={false}>
      <div style={{ padding: '32px 0', minHeight: '85vh' }}>
        <div className="container-sm">
          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', marginBottom: '4px' }}>
              Account Settings
            </h1>
            <p className="text-muted text-sm">
              Manage your profile, security credentials, and dashboard preferences
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* 1. Profile Information */}
            <div className="card">
              <div className="flex items-center gap-sm mb-md">
                <User size={18} color="var(--clr-accent)" />
                <h3 style={{ fontSize: '1.15rem' }}>Profile Information</h3>
              </div>

              <form onSubmit={handleUpdateProfile}>
                <div className="input-group" style={{ marginBottom: '16px' }}>
                  <label className="input-label">Email Address</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="input"
                    style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--clr-text-2)', cursor: 'not-allowed' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--clr-text-3)', marginTop: '4px' }}>
                    Email cannot be changed directly for security.
                  </span>
                </div>

                <div className="input-group" style={{ marginBottom: '20px' }}>
                  <label className="input-label">Full Name / Organization</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Enter your name"
                    className="input"
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={profileLoading}
                >
                  <Save size={14} />
                  {profileLoading ? 'Saving...' : 'Save Profile'}
                </button>
              </form>
            </div>

            {/* 2. Security & Password */}
            <div className="card">
              <div className="flex items-center gap-sm mb-md">
                <Lock size={18} color="var(--clr-green)" />
                <h3 style={{ fontSize: '1.15rem' }}>Security & Password</h3>
              </div>

              <form onSubmit={handleChangePassword}>
                <div className="input-group" style={{ marginBottom: '16px' }}>
                  <label className="input-label">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="input"
                  />
                </div>

                <div className="input-group" style={{ marginBottom: '20px' }}>
                  <label className="input-label">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="input"
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-secondary btn-sm"
                  disabled={pwLoading || !newPassword}
                >
                  <Key size={14} />
                  {pwLoading ? 'Updating Password...' : 'Update Password'}
                </button>
              </form>
            </div>

            {/* 3. Audio & Dashboard Preferences */}
            <div className="card">
              <div className="flex items-center gap-sm mb-md">
                <Volume2 size={18} color="#f59e0b" />
                <h3 style={{ fontSize: '1.15rem' }}>Preferences</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Sound Effects Toggle */}
                <div className="flex justify-between items-center" style={{ paddingBottom: '16px', borderBottom: '1px solid var(--clr-border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>UI Sound Effects</div>
                    <div className="text-muted text-xs">Audio feedback for copy, IP rotation, and checkout</div>
                  </div>
                  <button
                    onClick={handleToggleSound}
                    className={`btn btn-sm ${soundEnabled ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {soundEnabled ? 'Enabled 🔊' : 'Muted 🔇'}
                  </button>
                </div>

                {/* Dashboard Polling Rate */}
                <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Live Bandwidth Sync Frequency</div>
                    <div className="text-muted text-xs">How frequently the dashboard polls for new byte usage</div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {['5', '10', '15', '30'].map(sec => (
                      <button
                        key={sec}
                        onClick={() => handleRefreshChange(sec)}
                        className={`btn btn-sm ${refreshInterval === sec ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Session & Sign Out */}
            <div className="card" style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.03)' }}>
              <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--clr-red)', fontSize: '0.95rem' }}>
                    Account Session
                  </div>
                  <div className="text-muted text-xs">
                    Signed in as {user?.email}
                  </div>
                </div>

                <button
                  onClick={async () => {
                    playClickSound();
                    await signOut();
                    window.location.href = '/';
                  }}
                  className="btn btn-danger btn-sm"
                >
                  <LogOut size={14} />
                  Sign Out of Vertex Proxies
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
