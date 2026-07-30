# Barakah Board — PWA

A standalone Next.js app wrapping the Barakah Board Kanban module so it
runs as a real, installable app — open it from your phone's home screen
without going through Claude.

Backend is **Firebase** (Cloud Firestore + Email/Password Auth). It was
migrated off Supabase; see `scripts/migrate-supabase-to-firestore.mjs` for
the one-shot data move.

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
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyAwSp_8J50frX91Iurgd07IfII4lwInytU` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `barakah-todo.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `barakah-todo` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `barakah-todo.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `794537641944` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:794537641944:web:e9fae2293a3c7c52bed4ad` |
| `FIREBASE_SERVICE_ACCOUNT` | The full service-account JSON, one line. Server-only — never prefix with `NEXT_PUBLIC_`. |
| `BARAKAH_OWNER_EMAIL` | Your sign-in address. Must match the address hardcoded in `firestore.rules`. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys (pay-per-token, separate from Claude Pro) |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-4-6` |
| `N8N_SHARED_SECRET` | shared secret for `/api/ingest` (n8n + iOS Shortcut) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token, for webhook replies |
| `TELEGRAM_WEBHOOK_SECRET` | secret verifying inbound Telegram webhook calls |

The `NEXT_PUBLIC_FIREBASE_*` values are **not secrets** — Firebase web
config is designed to ship in the client bundle. Access control lives in
`firestore.rules`, which only answers to the owner's email.

**Now removed:** `SITE_PASSWORD` and `NEXT_PUBLIC_SUPABASE_*`. Delete them
from Vercel once the Firebase board is verified working.

Without the `NEXT_PUBLIC_FIREBASE_*` vars the app runs in local demo mode
(a banner says so) rather than crashing, and without an Anthropic key the
extract tool returns a clear error.

## 3. Migrating the data

One-shot, idempotent (writes under the same document ids, so a second run
overwrites rather than duplicating). Nothing is deleted from Supabase.

```bash
SUPABASE_URL='https://vdixqbvgshrvdwrhaeiv.supabase.co' \
SUPABASE_ANON_KEY='<anon key>' \
FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" \
npm run migrate:firestore -- --dry-run
```

Drop `--dry-run` to write for real. Keep the Supabase project intact until
the Firebase board is confirmed good.

## 4. Auth model

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

## 5. Install it on your devices

- **iPhone / iPad (Safari):** open the URL → Share → **Add to Home Screen**.
- **MacBook Air (Safari or Chrome):** open the URL → Share/menu →
  **Add to Dock** (Safari) or the install icon in the address bar (Chrome).

## Capture channels

1. **Gmail** — "Barakah" label → n8n workflow → `/api/ingest`
2. **Telegram** — direct webhook at `/api/telegram`
3. **WhatsApp** → iOS Shortcut "Add to Barakah Board" → `/api/ingest`

All three write into the same `barakah_tasks` collection, so the board
picks them up live via `onSnapshot`.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in the values above
npm run dev
```
