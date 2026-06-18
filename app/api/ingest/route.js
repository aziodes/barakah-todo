import { extractTasks } from "../../../lib/extractTasks";
import { supabase, TASKS_TABLE } from "../../../lib/supabaseClient";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function stripQuotes(val) {
  return typeof val === "string" ? val.replace(/^["'\s]+|["'\s]+$/g, "") : val;
}

export async function POST(req) {
  // Auth
  const secret = req.headers.get("x-barakah-secret");
  const expected = stripQuotes(process.env.N8N_SHARED_SECRET);
  if (!secret || !expected || secret !== expected) {
    return Response.json({ status: "error", message: "unauthorized" }, { status: 401 });
  }

  // Parse body
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ status: "error", message: "Invalid JSON body" }, { status: 400 });
  }

  const { message, source, sender, received_at, external_id } = body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return Response.json({ status: "error", message: "message is required" }, { status: 400 });
  }

  // Extract tasks via shared helper
  let tasks;
  try {
    tasks = await extractTasks(message, source || "n8n");
  } catch (e) {
    return Response.json({ status: "error", message: e.message }, { status: 500 });
  }

  if (tasks.length === 0) {
    return Response.json({ status: "ok", tasks_created: 0, tasks: [] });
  }

  // Insert into Supabase
  if (!supabase) {
    return Response.json({ status: "error", message: "Supabase not configured" }, { status: 500 });
  }

  const rows = tasks.map((t) => ({
    id: uid(),
    title: t.title,
    note: t.note || null,
    category: t.category,
    scope: t.scope,
    salah_block: t.salahBlock || null,
    status: "inbox",
    source: source || "n8n",
    sender: sender || null,
    received_at: received_at || null,
    external_id: external_id || null,
  }));

  const { data: inserted, error } = await supabase.from(TASKS_TABLE).insert(rows).select();
  if (error) {
    return Response.json({ status: "error", message: error.message }, { status: 500 });
  }

  return Response.json({ status: "ok", tasks_created: inserted.length, tasks: inserted });
}
