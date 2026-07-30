// Server-side route. Runs on Vercel's Node runtime, never in the
// browser — this is the only place ANTHROPIC_API_KEY is read, so
// the key is never exposed to anyone opening the PWA.

import { extractTasks } from "../../../lib/extractTasks";
import { verifyRequest, isOwner } from "../../../lib/firebaseAdmin";

export async function POST(req) {
  // This route spends Anthropic credits, so it must not be open to the world.
  // The old SITE_PASSWORD middleware used to shield it; now that sign-in is
  // Firebase, the route verifies the caller's ID token itself.
  const decoded = await verifyRequest(req);
  if (!decoded || !isOwner(decoded)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

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
