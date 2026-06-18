// Server-side route. Runs on Vercel's Node runtime, never in the
// browser — this is the only place ANTHROPIC_API_KEY is read, so
// the key is never exposed to anyone opening the PWA.

import { extractTasks } from "../../../lib/extractTasks";

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

  try {
    const tasks = await extractTasks(rawText, sourceHint);
    return Response.json({ tasks });
  } catch (e) {
    if (e.message.startsWith("Anthropic API error")) {
      return Response.json({ error: e.message }, { status: 502 });
    }
    if (e.message === "Server is missing ANTHROPIC_API_KEY") {
      return Response.json(
        { error: "Server is missing ANTHROPIC_API_KEY — set it in Vercel project settings." },
        { status: 500 }
      );
    }
    return Response.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
