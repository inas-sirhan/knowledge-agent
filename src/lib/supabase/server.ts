import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.SUPABASE_URL(), env.SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. Middleware handles refresh.
        }
      },
    },
  });
}

export function createAdminClient() {
  // Service-role client bypasses RLS. Use only in server-only code paths
  // where the user has already been authenticated and authorised.
  return createPlainClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
