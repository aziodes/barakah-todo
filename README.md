# Barakah Board — PWA

A standalone Next.js app wrapping the Barakah Board Kanban module so it
runs as a real, installable app — open it from your phone's home screen
without going through Claude.

Backend is **Firebase** (Cloud Firestore + Email/Password Auth). It was
migrated off Supabase in July 2026; the one-shot migration script has since
been removed along with the Supabase project.

## 1. Firebase project

Already created:

| Thing | Value |
|---|---|
| Project ID | `barakah-todo` |
| Display name | Barakah Board |
| Web app ID | `1:794537641944:web:e9fae2293a3c7c52bed4ad` |
| Firestore location | `us-central1` (permanent) |
| Collection | `barakah_tasks` |
| Console | https://console.firebase.google.com/project/barakah-todo |

### One-time console steps

These need a human in the Firebase console — the CLI can't do them on a
fresh project without broader OAuth scopes.

1. **Enable the Firestore API**, then the database can be created:
   https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=barakah-todo
   ```bash
   firebase firestore:databases:create "(default)" --location=us-central1 --project barakah-todo
   ```
2. **Enable Email/Password sign-in**:
   Authentication → Sign-in method → Email/Password → Enable.
3. **Create your user** (Authentication → Users → Add user). Use the same
   address as `BARAKAH_OWNER_EMAIL` below, or the rules will lock you out.
4. **Optional hardening:** Authentication → Settings → User actions →
   uncheck **Enable create (sign-up)**. Rules already reject any address
   other than the owner's, so this only stops junk accounts existing.
5. **Deploy the security rules:**
   ```bash
   firebase deploy --only firestore:rules --project barakah-todo
   ```
6. **Service account** for the server routes: Project Settings → Service
   accounts → Generate new private key. Paste the whole JSON as the
   `FIREBASE_SERVICE_ACCOUNT` env var (see below).

## 2. Environment variables

Set these in Vercel (**Project Settings → Environment Variables**).

| Variable | Value / where it comes from |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase console → Project Settings → your web app, or `firebase apps:sdkconfig WEB <appId>` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `barakah-todo.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `barakah-todo` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `barakah-todo.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `794537641944` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:794537641944:web:e9fae2293a3c7c52bed4ad` |
| `FIREBASE_SERVICE_ACCOUNT` | The full service-account JSON, one line. Server-only — never prefix with `NEXT_PUBLIC_`. |
| `BARAKAH_OWNER_EMAIL` | Your sign-in address. Must match the address hardcoded in `firestore.rules`. |
| `ANTHROPIC_FEDERATION_RULE_ID` | `fdrl_01MoL3RSLg3SHaysXDLAZnjd` (rule `barakah-todo-production`) |
| `ANTHROPIC_ORGANIZATION_ID` | `8bb03e31-9b7a-4d0d-944f-7c88015c7bb9` (same as mandala-app) |
| `ANTHROPIC_SERVICE_ACCOUNT_ID` | `svac_01WyYKNhjFNAWA2EoZpkLeiN` (service account `barakah-todo`) |
| `ANTHROPIC_WORKSPACE_ID` | `wrkspc_013NPaCc6qamjsWwfJ2Gfgpf` (Default workspace) |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-4-6` |
| `N8N_SHARED_SECRET` | shared secret for `/api/ingest` (n8n + iOS Shortcut) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token, for webhook replies |
| `TELEGRAM_WEBHOOK_SECRET` | secret verifying inbound Telegram webhook calls |

The `NEXT_PUBLIC_FIREBASE_*` values are **not secrets** — Firebase web
config is designed to ship in the client bundle. Access control lives in
`firestore.rules`, which only answers to the owner's email.

Note that `vercel env pull` writes **empty values** for any var added via
`vercel env add` — those are stored write-only and can't be read back. Only
dashboard-added vars decrypt. Check values are non-empty before trusting a
local build, or it will silently fall into demo mode.

Without the `NEXT_PUBLIC_FIREBASE_*` vars the app runs in local demo mode
(a banner says so) rather than crashing, and without the federation IDs the
extract tool returns a clear error.

## 3. Auth model

- Sign-in is Firebase Email/Password, handled by `components/AuthGate.jsx`.
  The old `SITE_PASSWORD` cookie middleware, `/login` page and
  `/api/login` route are gone.
- The page shell is public but holds no data. Real protection is
  `firestore.rules`: only the owner's address can read or write
  `barakah_tasks`.
- `/api/extract` spends Anthropic credits, so it verifies the caller's
  Firebase ID token — it used to rely on the middleware for that.
- `/api/ingest` and `/api/telegram` are machine-to-machine. They keep
  their own shared secrets and write through the Admin SDK, which bypasses
  Firestore rules by design.

## Anthropic (keyless)

There is **no Anthropic API key**. `lib/anthropic.js` uses Workload Identity
Federation, ported from mandala-app's `api/_anthropic.ts`:

1. Each Vercel Function invocation carries a Vercel-signed OIDC token in the
   `x-vercel-oidc-token` header. All three Claude callers (`/api/extract`,
   `/api/ingest`, `/api/telegram`) pass their `req` to `extractTasks` for it.
2. That token is addressed to `https://vercel.com/aziodes-projects`, so it is
   re-issued by `https://oidc.vercel.com/~token` for
   `aud: https://api.anthropic.com` with a **fresh `jti`** each time (the
   issuer has JTI replay protection on — never cache the re-issued token).
3. The SDK exchanges it at Anthropic's `/v1/oauth/token` and caches the
   short-lived access token per warm instance.

Console setup (Settings → Workload identity), reusing mandala-app's issuer
`vercel-aziodes-projects` (`https://oidc.vercel.com/aziodes-projects`, max
token lifetime 2 hours):

- Rule `barakah-todo-production` (`fdrl_01MoL3RSLg3SHaysXDLAZnjd`, created
  2026-11-13): pattern match on subject
  `owner:aziodes-projects:project:barakah-todo:environment:production`, plus
  exact claim conditions `project_id = prj_zm3cLpHC440OW8spA1Jf1jt87wX7` and
  `owner_id = team_Rw961VpZwmqar6PTxMVqV5Ys` (names can be reused; IDs can't).
  Audience blank (= `https://api.anthropic.com`), Default workspace,
  `workspace:developer`. **Renaming the Vercel project changes `sub`** and
  breaks it.
- Service account `barakah-todo` (`svac_01WyYKNhjFNAWA2EoZpkLeiN`), Developer
  role, Default workspace, so spend is attributed separately from Mandala.
- None of these IDs is a secret. They are set in Vercel **Production** only.

Gotchas:

- **Never set `ANTHROPIC_API_KEY` in Vercel.** The client passes
  `apiKey: null`, but delete the variable anyway so nothing else picks it up.
- A refused exchange is a bare `401` in the logs. The reason is only in the
  Console's Workload identity → authentication history.
- Preview deployments and `next dev` won't reach the model: the rule admits
  production only. For local testing, `vercel env pull` gives a 12-hour
  development token, which the rule rejects unless you add a development rule.

## 4. Install it on your devices

- **iPhone / iPad (Safari):** open the URL → Share → **Add to Home Screen**.
- **MacBook Air (Safari or Chrome):** open the URL → Share/menu →
  **Add to Dock** (Safari) or the install icon in the address bar (Chrome).

## Capture channels

1. **Gmail** — "Barakah" label → n8n workflow → `/api/ingest`
2. **Telegram** — direct webhook at `/api/telegram`
   - The bot's webhook must point at
     `https://barakah-todo.vercel.app/api/telegram` with `secret_token` =
     `TELEGRAM_WEBHOOK_SECRET`. It was found **empty** on 2026-11-13 (the bot
     had been silent since 2026-06-25) and re-registered. If the bot goes quiet,
     check `getWebhookInfo` first. Anything else that claims this bot (an n8n
     Telegram trigger, `getUpdates` polling) replaces or clears the webhook.
3. **WhatsApp** → iOS Shortcut "Add to Barakah Board" → `/api/ingest`

All three write into the same `barakah_tasks` collection, so the board
picks them up live via `onSnapshot`.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in the values above
npm run dev
```
