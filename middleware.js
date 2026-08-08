// Scale Up — route protection.
//
// Sign-in is REQUIRED. An unauthenticated visitor cannot reach the analyser
// (/) or the projects list (/projects); they are bounced to /sign-in with the
// page they wanted preserved in ?next= so they land back there afterwards.
import { NextResponse } from 'next/server';
import { updateSession, hasSupabaseEnv } from '@/lib/supabase/middleware';

// Paths reachable while signed out. Everything else needs a session.
// '/auth' covers the OAuth / magic-link callback routes.
const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/auth'];

/**
 * A path is public if it matches a public entry exactly or sits beneath it.
 * The explicit '/' check stops '/sign-in-something' from being treated as
 * public just because it shares a prefix.
 */
function isPublicPath(pathname) {
  return PUBLIC_PATHS.some(
    (base) => pathname === base || pathname.startsWith(base + '/')
  );
}

/**
 * Move the refreshed session cookies from the updateSession response onto the
 * response we are actually sending. Without this the rotated token is thrown
 * away and the user gets logged out on the next request.
 */
function carryCookies(target, source) {
  if (source) {
    for (const cookie of source.cookies.getAll()) {
      target.cookies.set(cookie);
    }
  }
  // A redirect/401 that depends on who is asking (and may carry auth cookies)
  // must never be cached by a CDN or shared proxy.
  target.headers.set('Cache-Control', 'private, no-store');
  return target;
}

/**
 * Build the "you need to sign in" response.
 * API routes get JSON — redirecting a fetch() POST would hand the caller an
 * HTML page and surface as a confusing parse error in the UI.
 */
function requireSignIn(request, sessionResponse) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    const json = NextResponse.json(
      { error: 'You need to sign in to do that.' },
      { status: 401 }
    );
    return carryCookies(json, sessionResponse);
  }

  const url = request.nextUrl.clone();
  url.pathname = '/sign-in';
  url.search = '';
  // Remember where they were headed, including any query string.
  url.searchParams.set('next', pathname + search);

  return carryCookies(NextResponse.redirect(url), sessionResponse);
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  // Supabase not configured yet (.env.local missing/incomplete). Fail closed:
  // let the public pages render so /sign-in can explain the problem, but do
  // not hand out access to the protected app.
  if (!hasSupabaseEnv()) {
    console.error(
      '[Scale Up] Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.local.example).'
    );
    return isPublic ? NextResponse.next() : requireSignIn(request, null);
  }

  // Refresh the session first, on every matched request, so the token is
  // rotated even while the user sits on a public page.
  const { response, user } = await updateSession(request);

  if (!user && !isPublic) {
    return requireSignIn(request, response);
  }

  // Signed in (or on a public page) — return the SAME response object the
  // Supabase client wrote its cookies to.
  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except:
     *   - _next/static  (build output)
     *   - _next/image   (image optimiser)
     *   - favicon.ico
     *   - static asset file extensions
     *
     * NOTE: /api is deliberately NOT excluded. /api/analyse-drawing calls the
     * Anthropic API and costs money per request, so it must stay behind auth.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
