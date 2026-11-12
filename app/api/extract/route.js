// Server-side route. Runs on Vercel's Node runtime, never in the browser.
// There is no Anthropic API key: the model call is paid for by this
// invocation's Vercel OIDC token, exchanged in lib/anthropic.js.

import { extractTasks, ExtractError } from "../../../lib/extractTasks";
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
    const tasks = await extractTasks(rawText, sourceHint, req);
    return Response.json({ tasks });
  } catch (e) {
    if (e instanceof ExtractError) {
      return Response.json({ error: e.message }, { status: e.code === "config" ? 500 : 502 });
    }
    console.error("extract failed", e);
    return Response.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
