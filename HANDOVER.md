# Barakah Board — Handover

State for the next seat. Read this before README.md. State travels through
GitHub, never through the folder.

## Current state (2026-11-13)

- Next.js 15 App Router PWA on Vercel (project `barakah-todo`, team
  `aziodes-projects`), Firebase Auth + Firestore backend.
- **Claude is called keylessly** (Workload Identity Federation). There is no
  `ANTHROPIC_API_KEY` anywhere: deleted from all Vercel environments, revoked in
  the Console, and removed from local `.env.local`. Setup and IDs: README §
  Anthropic (keyless).
- All three capture routes call Claude through `lib/extractTasks.js` →
  `lib/anthropic.js`, and all were verified live on 2026-11-13:
  `POST /api/extract` 200 (app) and `POST /api/telegram` 200 (bot replied).
  `/api/ingest` (n8n, iOS Shortcut) uses the same path but was not exercised.
- `npm audit --omit=dev`: no high or critical advisories. 8 moderates remain.
- Telegram webhook is registered at
  `https://barakah-todo.vercel.app/api/telegram` with the webhook secret.

## What changed 2026-11-13

**Keyless Claude (`3647844`, deployed).** `lib/anthropic.js` is a port of
mandala-app's `api/_anthropic.ts`: it takes the invocation's Vercel OIDC token
(`x-vercel-oidc-token` header), re-issues it at `https://oidc.vercel.com/~token`
for `aud: https://api.anthropic.com` with a fresh `jti`, and lets
`@anthropic-ai/sdk` (0.115) exchange it for a short-lived token. The client
passes `apiKey: null` so a stray key can never win. `extractTasks(message,
sourceHint, req)` now needs the request, and throws `ExtractError` with a
`code` (`config` 500; `auth`, `upstream`, `parse` 502). Raw `fetch` with
`x-api-key` is gone.

Console: reused mandala's issuer `vercel-aziodes-projects`; new service
account `barakah-todo` (`svac_01WyYKNhjFNAWA2EoZpkLeiN`, Developer role,
Default workspace); new rule `barakah-todo-production`
(`fdrl_01MoL3RSLg3SHaysXDLAZnjd`): pattern match on the production `sub` plus
exact claim conditions on `project_id` and `owner_id`. The four
`ANTHROPIC_*` IDs are set in Vercel **Production only**.

**Audit advisories (`3647844`).** `next` 15.5.22 → 15.5.29 (critical: RCE in
image optimizer, cache poisoning, DoS). `sharp` override → `^0.35.5`. New
override `@grpc/grpc-js` `^1.14.5`: even firebase 13.3.0 pins grpc `~1.9.0`,
so no firebase upgrade fixes it, and the browser build doesn't use grpc.
In-range fixes for busboy, nanoid, source-map-js, fast-xml-parser,
browserslist and friends.

**Telegram revived (`dba08a9` documents it).** The bot's webhook URL was found
**empty**, which is why Telegram captures had been silent since 2026-06-25.
Re-registered with `setWebhook` (URL + `secret_token`). Root cause unknown;
likely something else claimed the bot (an n8n Telegram trigger clears the
webhook when deactivated).

## Known issues / TODO

1. **8 moderate advisories** via `firebase-admin` 13 → `google-gax` → `uuid`
   < 11.1.1. The fix is `firebase-admin` 14.5.1, a major that needs Node ≥ 22.
   The uuid bug needs a caller-supplied buffer to v3/v5/v6; Google's libraries
   use plain `v4()`, so it is likely not reachable. Do it with a real test of
   `/api/ingest`, `/api/telegram` and `verifyRequest`.
2. **Preview deployments and `next dev` cannot reach Claude.** The federation
   rule admits production only. Add a development rule if local extraction is
   ever needed.
3. **`/api/ingest` not exercised since the keyless switch.** Send one item from
   the n8n Gmail flow or the iOS Shortcut to confirm.
4. **Model** is still `claude-sonnet-4-6` (env `ANTHROPIC_MODEL` overrides).
   Untouched on purpose; a newer model is a separate, measured change.
5. Next.js warns about multiple lockfiles (`~/package-lock.json` is picked as
   the workspace root). Harmless; silence with `outputFileTracingRoot` if it
   ever matters.

## Next step

Exercise `/api/ingest` once (item 3). Then decide on the `firebase-admin` 14
upgrade (item 1).

## Lessons → principles

- **Keyless pattern is reusable across the team's Vercel apps.** One issuer per
  Vercel team; one service account + one rule per app, pinned by `project_id`
  and `owner_id` claims. The Console's pattern-match mode with claim conditions
  does the same job as a CEL expression.
- **A silent integration is checked at its source first.** "Bot doesn't reply"
  plus "no request in the logs" means the provider isn't delivering:
  `getWebhookInfo` answered it in one call.
- **`npm audit fix --omit=dev` prunes devDependencies from `node_modules`.**
  Run `npm install` afterwards, or use plain `npm audit fix`, before building.
- **An unfixable transitive pin calls for an override, not a downgrade.**
  npm suggested `firebase@9.14.0` for the grpc advisory; an override on
  `@grpc/grpc-js` was the right fix.
