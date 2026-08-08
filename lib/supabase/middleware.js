// Supabase session refresh for Next.js middleware.
//
// Runs on every matched request. Its job is to (a) refresh an expiring auth
// token and write the new cookies onto the outgoing response, and (b) tell the
// caller who the user is so the root middleware.js can enforce sign-in.
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True when both Supabase environment variables are present.
 */
export function hasSupabaseEnv() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Refresh the Supabase session for this request.
 *
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<{ response: NextResponse, user: object|null }>}
 *
 * IMPORTANT: the caller must use the returned `response` (or copy its cookies
 * onto whatever response it sends instead). It carries the refreshed session
 * cookies — dropping it logs the user out on the next request.
 */
export async function updateSession(request) {
  // Start with a pass-through response. This gets REPLACED inside setAll when
  // Supabase rotates the token, which is why it is `let` and not `const`.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // 1. Update the request cookies so anything rendered downstream in
        //    this same request sees the NEW token, not the stale one.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        // 2. Rebuild the response from the updated request, then write the
        //    cookies onto it so they reach the browser as Set-Cookie.
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        // 3. @supabase/ssr v0.12+ passes cache-control headers alongside the
        //    cookies. These must be applied, otherwise a CDN or reverse proxy
        //    (Vercel Edge, Cloudflare, CloudFront) can cache a response that
        //    carries auth cookies and serve one user's session to another.
        for (const [key, value] of Object.entries(headers || {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Use getUser(), NOT getSession(). getSession() only decodes the cookie and
  // trusts whatever it finds — a cookie can be forged. getUser() revalidates
  // the token against the Supabase auth server, so it is the only safe basis
  // for an access-control decision.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    // Network hiccup reaching the auth server — treat as signed out rather
    // than throwing a 500 over the whole site.
    user = null;
  }

  return { response, user };
}
