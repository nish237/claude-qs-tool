// Supabase client for the BROWSER (Client Components).
//
// Uses @supabase/ssr's createBrowserClient so that the session is persisted in
// cookies rather than localStorage — that is what lets the Next.js middleware
// and Server Components see the same logged-in user.
//
// Cookie reading/writing is handled automatically via document.cookie, so we
// deliberately do not pass a custom `cookies` option here.
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True when both Supabase environment variables are present.
 * Lets the UI show a friendly "not configured yet" message instead of crashing
 * when someone has not filled in .env.local (see .env.local.example).
 */
export function hasSupabaseEnv() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Create a Supabase client for use in the browser.
 * createBrowserClient is a singleton by default, so calling this on every
 * render is cheap — it returns the same underlying client.
 */
export function createClient() {
  if (!hasSupabaseEnv()) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see .env.local.example), ' +
        'then restart the app.'
    );
  }

  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
