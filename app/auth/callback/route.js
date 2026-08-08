// Handles the redirect back from Supabase after a magic-link click or a
// completed Google OAuth flow, exchanges the one-time code for a real
// session, and sends the user on to wherever they originally wanted to go.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Behind a load balancer / reverse proxy (as on Vercel), `origin` can be
      // the internal address rather than the public one. x-forwarded-host is
      // the real host the browser used, so prefer it when present.
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');

      if (forwardedHost && !isLocal) {
        const proto = request.headers.get('x-forwarded-proto') || 'https';
        return NextResponse.redirect(`${proto}://${forwardedHost}${next}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
