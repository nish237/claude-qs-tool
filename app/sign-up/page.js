'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
  </svg>
);

const providerBtn = {
  width: '100%', padding: '12px 16px', border: '1.5px solid #e2e8f0',
  borderRadius: 10, background: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  fontSize: 14, fontWeight: 600, color: '#1a1a2e',
};

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [busyEmail, setBusyEmail] = useState(false);

  const handleGoogle = async () => {
    setError('');
    setBusyGoogle(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (authError) { setError(authError.message); setBusyGoogle(false); }
    } catch (err) {
      setError(err.message || 'Could not start Google sign-up.');
      setBusyGoogle(false);
    }
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setBusyEmail(true);
    try {
      const supabase = createClient();
      // signInWithOtp creates the account automatically the first time an
      // address signs in — there is no separate "sign up" call in Supabase.
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (authError) { setError(authError.message); setBusyEmail(false); return; }
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send the sign-up link.');
    } finally {
      setBusyEmail(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1b3e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, background: '#0d1b3e', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#f59e0b', margin: '0 auto 12px' }}>SU</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0d1b3e', marginBottom: 4 }}>Create your Scale Up account</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>Save takeoffs and sync across devices</p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📬</div>
            <div style={{ fontWeight: 700, color: '#0d1b3e', fontSize: 15, marginBottom: 6 }}>Check your email</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
              We sent a link to <strong style={{ color: '#1a1a2e' }}>{email}</strong>.
              Open it on this device to finish creating your account.
            </div>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{ background: 'none', border: 'none', color: '#0d1b3e', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
              Use a different email address
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              <button style={{ ...providerBtn, opacity: busyGoogle ? 0.6 : 1 }} onClick={handleGoogle} disabled={busyGoogle}>
                <GoogleIcon /> {busyGoogle ? 'Redirecting…' : 'Sign up with Google'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 18px' }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>

            <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
              <input
                type="email" required placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)}
                className="qs-input"
                style={{ width: '100%' }}
              />
              <button type="submit" className="qs-btn qs-btn-primary" disabled={busyEmail} style={{ width: '100%' }}>
                {busyEmail ? 'Sending…' : '📧 Sign up with email'}
              </button>
            </form>

            {error && (
              <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12.5, color: '#991b1b', marginBottom: 16, lineHeight: 1.5 }}>
                ⚠ {error}
              </div>
            )}

            <div style={{ textAlign: 'center', fontSize: 11.5, color: '#94a3b8', marginBottom: 20, lineHeight: 1.6 }}>
              No password to remember — we email you a secure one-click link.
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: sent ? 24 : 0 }}>
          <button onClick={() => router.push('/sign-in')}
            style={{ flex: 1, padding: '10px', border: '1.5px solid #0d1b3e', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#0d1b3e', fontWeight: 700 }}>
            Sign in instead
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
