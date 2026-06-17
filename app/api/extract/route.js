// Server-side route. Runs on Vercel's Node runtime, never in the
// browser — this is the only place ANTHROPIC_API_KEY is read, so
// the key is never exposed to anyone opening the PWA.

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { rawText, sourceHint } = body || {};
  if (!rawText || typeof rawText !== "string") {
    return Response.json({ error: "rawText is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY — set it in Vercel project settings." },
      { status: 500 }
    );
  }

  const prompt = `You are a task-extraction engine inside a Muslim professional's personal productivity dashboard. Extract actionable tasks from the message below (it may be an email, WhatsApp or Telegram message, or loose notes).

Classify each task:
- category: "fard" (hard obligation/deadline/promise), "amanah" (commitment owed to another person or the community), "nafl" (voluntary growth, learning, optional good), "dunya" (admin, errands, maintenance)
- scope: "today" if clearly urgent/today, otherwise "week"
- salahBlock: suggest one of "fajr" (deep focused work), "dhuhr", "asr", "maghrib" (family/community), "isha" (light/review) — or null if scope is "week"

Respond ONLY with a JSON array, no markdown fences, no prose:
[{"title": "...", "note": "...", "category": "...", "scope": "...", "salahBlock": "..." | null}]

If there are no actionable tasks, respond with [].

Message source: ${sourceHint || "manual"}
Message:
"""
${rawText}
"""`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Swap to "claude-haiku-4-5-20251001" if you want this
        // lightweight extraction step to run cheaper/faster.
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return Response.json({ error: "Anthropic API error", detail }, { status: 502 });
    }

    const data = await res.json();
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
      return Response.json({ error: "Could not parse extraction result", raw: text }, { status: 502 });
    }

    if (!Array.isArray(tasks)) {
      return Response.json({ error: "Unexpected response shape" }, { status: 502 });
    }

    return Response.json({ tasks });
  } catch (e) {
    return Response.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
