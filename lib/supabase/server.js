// Supabase client for the SERVER (Server Components, Route Handlers,
// Server Actions).
//
// A fresh client is created per request — never share one across requests,
// or you risk leaking one user's session to another.
import { cookies } from 'next/headers';
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
 * Create a request-scoped Supabase client bound to the Next.js cookie store.
 *
 * Async so that callers write `await createClient()`. In Next.js 14 cookies()
 * is synchronous, but awaiting a non-promise is harmless and keeps this
 * forward-compatible with Next.js 15 where cookies() returns a promise.
 */
export async function createClient() {
  if (!hasSupabaseEnv()) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see .env.local.example), ' +
        'then restart the app.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server Components are not allowed to set cookies — Next.js throws
        // here. That is expected and safe to swallow: the middleware
        // (lib/supabase/middleware.js) refreshes the session on every request
        // and writes the refreshed cookies to the response instead.
        //
        // In Route Handlers and Server Actions this DOES succeed, which is why
        // we still implement it rather than omitting setAll entirely.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — ignore.
        }
      },
    },
  });
}
