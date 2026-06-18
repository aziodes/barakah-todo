import { NextResponse } from "next/server";

const PASSWORD = (process.env.SITE_PASSWORD || "").trim().replace(/^["']|["']$/g, "");
const COOKIE = "barakah_auth";
// 30-day cookie
const MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(req) {
  const { password } = await req.json();

  if (!PASSWORD || password !== PASSWORD) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, PASSWORD, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: MAX_AGE,
    path: "/",
  });
  return res;
}
