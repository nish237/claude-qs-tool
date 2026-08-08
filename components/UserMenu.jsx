'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Compact signed-in-user control for the dark navy header.
export default function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    let supabase;
    try {
      supabase = createClient();
    } catch {
      setLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setEmail(data?.user?.email || '');
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email || '');
    });

    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      router.push('/sign-in');
      router.refresh();
    }
  };

  if (loading || !email) return null;

  const initial = email.charAt(0).toUpperCase();
  const shortEmail = email.length > 22 ? `${email.slice(0, 19)}…` : email;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20, padding: '4px 10px 4px 4px', cursor: 'pointer',
        }}
        title={email}
      >
        <div style={{
          width: 26, height: 26, borderRadius: '50%', background: '#f59e0b',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 12, color: '#0d1b3e', flexShrink: 0,
        }}>{initial}</div>
        <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 600 }}>{shortEmail}</span>
      </button>

      {open && (
        <div className="fade-in" style={{
          position: 'absolute', top: '110%', right: 0, minWidth: 220,
          background: '#fff', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          padding: 10, zIndex: 300,
        }}>
          <div style={{ padding: '6px 8px 10px', borderBottom: '1px solid #f1f5f9', marginBottom: 6 }}>
            <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Signed in as</div>
            <div style={{ fontSize: 12.5, color: '#0d1b3e', fontWeight: 600, wordBreak: 'break-all' }}>{email}</div>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 8px', border: 'none',
              background: 'transparent', borderRadius: 6, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: '#dc2626',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            ⎋ Sign out
          </button>
        </div>
      )}
    </div>
  );
}
