# Barakah Board — PWA

A standalone Next.js app wrapping the Barakah Board Kanban module so it
runs as a real, installable app — open it from your phone's home screen
without going through Claude.

This package is built and verified (`npm run build` passes). What's left
are a handful of one-time steps in your own accounts, since I can't reach
Vercel, Supabase, or your n8n instance directly.

## 1. Database — Supabase

In your Supabase project's SQL editor (reuse the Istiqamah project, or
spin up a fresh free one for testing — your call), run:

```sql
create table barakah_tasks (
  id text primary key,
  title text not null,
  note text default '',
  source text not null default 'manual',
  category text not null default 'dunya',
  scope text not null default 'today',
  salah_block text,
  status text not null default 'inbox',
  created_at timestamptz not null default now()
);

alter table barakah_tasks enable row level security;

-- Single-user personal app for now: allow all access via the anon key.
-- Tighten this with real auth before anyone besides you can reach the URL.
create policy "allow all for now"
  on barakah_tasks for all
  using (true)
  with check (true);
```

Then grab **Project Settings → API**: the Project URL and the `anon` public key.

## 2. Environment variables

Copy `.env.local.example` to `.env.local` for local testing, or set these
directly in Vercel (**Project Settings → Environment Variables**):

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys (separate from your Claude Pro subscription — this is pay-per-token billing) |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-4-6`; try `claude-haiku-4-5-20251001` for a cheaper/faster extraction step |

**Cost note:** the "Extract from message" tool now calls the Anthropic API
directly using your own key, billed separately from Claude Pro. For a
single-user inbox-triage tool this is genuinely small (each extraction is
one short call), but if you want to keep it at zero marginal cost,
swap the `/api/extract` route to call your local Ollama instance instead
— happy to do that swap as a follow-up if you'd rather route it that way.

You can deploy and test the board *before* setting any of this — without
Supabase keys it runs in local demo mode (a banner says so), and without
an Anthropic key the extract tool will return a clear error instead of
crashing.

## 3. Deploy to Vercel

```bash
cd barakah-board-pwa
git init
git add .
git commit -m "Barakah Board PWA"
```

Push to a GitHub repo (e.g. under your `@aziodes` account), then in Vercel:
**Add New → Project → import the repo → it auto-detects Next.js → add the
environment variables above → Deploy.**

You'll get a `*.vercel.app` URL. That's the address that "works from
anywhere."

**Security note:** with no auth yet, anyone with that URL can use the
board. For a personal tool this is a minor risk since the URL isn't
public anywhere, but if that bothers you, turn on **Vercel → Project →
Settings → Deployment Protection → Password Protection** (free on Hobby)
until proper auth is built later.

## 4. Install it on your devices

Once deployed:

- **iPhone / iPad (Safari):** open the URL → Share → **Add to Home Screen**.
- **MacBook Air (Safari or Chrome):** open the URL → Share/menu →
  **Add to Dock** (Safari) or the install icon in the address bar (Chrome).

It'll open full-screen with its own icon, no browser chrome, no Claude
chat in the loop — exactly the "open anywhere during the day" version
you were after.

## What's still ahead

This ships the board itself as a real app with real persistence. The
n8n webhook ingestion (Gmail/WhatsApp/Telegram → this same
`barakah_tasks` table) is the next layer on top — same database, so
nothing here needs to change when that's wired up later.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in the values above
npm run dev
```
