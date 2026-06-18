import { NextResponse } from "next/server";

const PASSWORD = process.env.SITE_PASSWORD;
const COOKIE = "barakah_auth";

export function middleware(req) {
  // No password set — site is open (dev mode fallback)
  if (!PASSWORD) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Allow the login page, its API route, and the n8n ingest endpoint through
  if (pathname === "/login" || pathname === "/api/login" || pathname === "/api/ingest") return NextResponse.next();

  // Check auth cookie
  const cookie = req.cookies.get(COOKIE);
  if (cookie?.value === PASSWORD) return NextResponse.next();

  // Redirect to login, preserving the intended destination
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest).*)"],
};
