'use client';

import { useRouter } from 'next/navigation';

export default function AuthCodeErrorPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', background: '#0d1b3e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>⚠</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0d1b3e', marginBottom: 8 }}>That sign-in link didn't work</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
          It may have expired or already been used. Sign-in links are only valid
          for one click — request a new one and try again.
        </p>
        <button
          onClick={() => router.push('/sign-in')}
          className="qs-btn qs-btn-primary"
          style={{ width: '100%' }}
        >
          ← Back to sign in
        </button>
      </div>
    </div>
  );
}
