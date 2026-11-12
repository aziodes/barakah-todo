/**
 * The Anthropic client for task extraction, authenticated by Workload Identity
 * Federation — there is no API key.
 *
 * Every Vercel Function invocation carries a Vercel-signed OIDC token in the
 * `x-vercel-oidc-token` header (2-hour TTL in production). It is addressed to
 * Vercel, so it is first re-issued by Vercel for Anthropic's audience with a
 * fresh `jti` (reissueForAnthropic). The SDK then exchanges that at Anthropic's
 * `/v1/oauth/token` for a short-lived access token bound to the `barakah-todo`
 * service account, and caches it until shortly before it expires.
 *
 * Ported from mandala-app's api/_anthropic.ts, which has the full history of
 * why each step is here. Trust is configured in the Claude Console; see
 * README § Anthropic (keyless).
 */
import Anthropic from "@anthropic-ai/sdk";
import { oidcFederationProvider } from "@anthropic-ai/sdk/lib/credentials/oidc-federation";

/**
 * Reads the federation IDs from the environment. These are identifiers, not
 * secrets: a leaked rule ID is useless without a Vercel-signed token whose
 * claims match the rule. Returns null when any required one is missing, so the
 * caller can fail clearly instead of on the first model call.
 */
export function federationConfig(env = process.env) {
  const federationRuleId = env.ANTHROPIC_FEDERATION_RULE_ID;
  const organizationId = env.ANTHROPIC_ORGANIZATION_ID;
  const serviceAccountId = env.ANTHROPIC_SERVICE_ACCOUNT_ID;
  if (!federationRuleId || !organizationId || !serviceAccountId) return null;
  return {
    federationRuleId,
    organizationId,
    serviceAccountId,
    workspaceId: env.ANTHROPIC_WORKSPACE_ID || undefined,
  };
}

/**
 * The OIDC token for this invocation: the request header in a deployed
 * Function, `VERCEL_OIDC_TOKEN` locally after `vercel env pull`.
 */
export function oidcTokenFrom(req, env = process.env) {
  return req?.headers?.get("x-vercel-oidc-token") || env.VERCEL_OIDC_TOKEN || null;
}

/**
 * The audience Anthropic's federation issuer requires. Vercel's own token is
 * addressed to `https://vercel.com/<team>`, which Anthropic rejects.
 */
export const ANTHROPIC_AUDIENCE = "https://api.anthropic.com";

/**
 * Asks Vercel to re-issue its OIDC token addressed to Anthropic, with a fresh
 * `jti` every time. The issuer enforces single-use `jti`s (replay protection),
 * so a re-issued token must never be presented twice — nothing here caches it;
 * the SDK caches the Anthropic token it is exchanged for.
 *
 * This is the endpoint `@vercel/oidc`'s `exchangeVercelOidcToken()` calls, done
 * by hand to avoid pulling Vercel CLI dependencies in for one POST.
 *
 * Throws AnthropicError so callers handle it alongside the SDK's own errors.
 */
export async function reissueForAnthropic(vercelToken) {
  let res;
  try {
    res = await fetch("https://oidc.vercel.com/~token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        token: vercelToken,
        aud: ANTHROPIC_AUDIENCE,
        jti: crypto.randomUUID(),
      }),
    });
  } catch (e) {
    throw new Anthropic.AnthropicError(`Could not reach Vercel to re-issue the OIDC token: ${e}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Anthropic.AnthropicError(
      `Vercel refused to re-issue the OIDC token (${res.status}): ${detail.slice(0, 200)}`
    );
  }
  const data = await res.json().catch(() => null);
  if (typeof data?.token !== "string" || !data.token) {
    throw new Anthropic.AnthropicError("Vercel re-issue response carried no token");
  }
  return data.token;
}

/**
 * The latest token seen by this instance. The client — and with it the cached
 * Anthropic access token — outlives a single request, so the exchange reads
 * the newest Vercel token rather than the one present when the client was
 * built. Every token here is for the same project and environment, so a
 * concurrent request overwriting it is harmless.
 */
let latestOidcToken = null;
let cached = null;

/**
 * One client per instance, so the exchanged token is reused across warm
 * invocations instead of costing two extra round trips on every extraction.
 */
export function anthropicFor(config, oidcToken) {
  latestOidcToken = oidcToken;
  const key = JSON.stringify(config);
  if (cached?.key === key) return cached.client;

  const baseURL = "https://api.anthropic.com";
  const client = new Anthropic({
    // Explicit nulls, not omissions: the SDK defaults `apiKey` to
    // process.env.ANTHROPIC_API_KEY, and an API key outranks `credentials`.
    // A stale key left in the Vercel environment would silently win.
    apiKey: null,
    authToken: null,
    baseURL,
    credentials: oidcFederationProvider({
      identityTokenProvider: () => {
        if (!latestOidcToken) throw new Anthropic.AnthropicError("No Vercel OIDC token");
        return reissueForAnthropic(latestOidcToken);
      },
      ...config,
      baseURL,
      fetch: (input, init) => fetch(input, init),
    }),
  });
  cached = { key, client };
  return client;
}
