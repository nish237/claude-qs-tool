'use client';

import { useRouter } from 'next/navigation';

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

export default function SignInPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', background: '#0d1b3e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, background: '#0d1b3e', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#f59e0b', margin: '0 auto 12px' }}>SU</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0d1b3e', marginBottom: 4 }}>Sign in to Scale Up</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>Access your projects from any device</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <button style={providerBtn}><GoogleIcon /> Continue with Google</button>
          <button style={providerBtn}>📧 Continue with Email</button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginBottom: 20, lineHeight: 1.6 }}>
          Authentication is coming soon — projects currently save to your browser.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/')}
            style={{ flex: 1, padding: '10px', border: 'none', background: '#f1f5f9', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
            ← Back to Scale Up
          </button>
          <button onClick={() => router.push('/sign-up')}
            style={{ flex: 1, padding: '10px', border: '1.5px solid #0d1b3e', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#0d1b3e', fontWeight: 700 }}>
            Create account
          </button>
        </div>
      </div>
    </div>
  );
}
