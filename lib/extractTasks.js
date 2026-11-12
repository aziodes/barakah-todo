import Anthropic from "@anthropic-ai/sdk";
import { anthropicFor, federationConfig, oidcTokenFrom } from "./anthropic";

const SYSTEM_PROMPT = `You are a task-extraction engine inside a Muslim professional's personal productivity dashboard. Extract actionable tasks from the message below (it may be an email, WhatsApp or Telegram message, or loose notes).

Classify each task:
- category: "fard" (hard obligation/deadline/promise), "amanah" (commitment owed to another person or the community), "nafl" (voluntary growth, learning, optional good), "dunya" (admin, errands, maintenance)
- scope: "today" if clearly urgent/today, otherwise "week"
- salahBlock: suggest one of "fajr" (deep focused work), "dhuhr", "asr", "maghrib" (family/community), "isha" (light/review) — or null if scope is "week"

Respond ONLY with a JSON array, no markdown fences, no prose:
[{"title": "...", "note": "...", "category": "...", "scope": "...", "salahBlock": "..." | null}]

If there are no actionable tasks, respond with [].`;

/**
 * Thrown for every way extraction can fail. `code` lets routes pick a status
 * without string-matching: "config" (server misconfigured, 500), "auth"
 * (could not obtain a model token, 502), "upstream" (the model call failed,
 * 502), "parse" (the model answered with something that is not a task list, 502).
 */
export class ExtractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExtractError";
    this.code = code;
  }
}

/**
 * `req` is the incoming route request: its `x-vercel-oidc-token` header is what
 * pays for the model call (lib/anthropic.js). There is no API key.
 */
export async function extractTasks(message, sourceHint = "manual", req) {
  const federation = federationConfig();
  if (!federation) {
    throw new ExtractError("config", "Server is missing Anthropic federation config");
  }
  const oidcToken = oidcTokenFrom(req);
  if (!oidcToken) {
    throw new ExtractError("config", "Server has no Vercel OIDC token");
  }

  const prompt = `${SYSTEM_PROMPT}

Message source: ${sourceHint}
Message:
"""
${message}
"""`;

  const client = anthropicFor(federation, oidcToken);

  let data;
  try {
    data = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      // A rejected token exchange also lands here as a bare 401; the reason is
      // only in the Console's Workload identity -> authentication history.
      console.error("Anthropic API error", e.status, e.requestID, e.message);
      throw new ExtractError("upstream", `Anthropic API error (${e.status ?? "network"})`);
    }
    if (e instanceof Anthropic.AnthropicError) {
      // Vercel re-issue or token exchange failed before any model call.
      console.error("Anthropic federation failed:", e.message);
      throw new ExtractError("auth", "Could not authenticate to the model");
    }
    throw e;
  }

  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .replace(/```json|```/g, "")
    .trim();

  let tasks;
  try {
    tasks = JSON.parse(text);
  } catch {
    throw new ExtractError("parse", "Model returned invalid JSON");
  }
  if (!Array.isArray(tasks)) throw new ExtractError("parse", "Unexpected response shape from Anthropic");
  return tasks;
}
