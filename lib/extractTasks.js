const SYSTEM_PROMPT = `You are a task-extraction engine inside a Muslim professional's personal productivity dashboard. Extract actionable tasks from the message below (it may be an email, WhatsApp or Telegram message, or loose notes).

Classify each task:
- category: "fard" (hard obligation/deadline/promise), "amanah" (commitment owed to another person or the community), "nafl" (voluntary growth, learning, optional good), "dunya" (admin, errands, maintenance)
- scope: "today" if clearly urgent/today, otherwise "week"
- salahBlock: suggest one of "fajr" (deep focused work), "dhuhr", "asr", "maghrib" (family/community), "isha" (light/review) — or null if scope is "week"

Respond ONLY with a JSON array, no markdown fences, no prose:
[{"title": "...", "note": "...", "category": "...", "scope": "...", "salahBlock": "..." | null}]

If there are no actionable tasks, respond with [].`;

export async function extractTasks(message, sourceHint = "manual") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Server is missing ANTHROPIC_API_KEY");
  }

  const prompt = `${SYSTEM_PROMPT}

Message source: ${sourceHint}
Message:
"""
${message}
"""`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic API error: ${detail}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .replace(/```json|```/g, "")
    .trim();

  const tasks = JSON.parse(text);
  if (!Array.isArray(tasks)) throw new Error("Unexpected response shape from Anthropic");
  return tasks;
}
