import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/signup", "/auth/callback"];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  // Static + Next internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.SUPABASE_URL(), env.SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: do not put logic between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname) && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  return response;
}
