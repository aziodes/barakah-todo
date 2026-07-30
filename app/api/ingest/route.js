import { extractTasks } from "../../../lib/extractTasks";
import { adminDb, TASKS_COLLECTION } from "../../../lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

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

  // Insert into Firestore via the Admin SDK, which bypasses firestore.rules —
  // this route authenticates with N8N_SHARED_SECRET instead of a user session.
  if (!adminDb) {
    return Response.json(
      { status: "error", message: "Firebase Admin not configured — set FIREBASE_SERVICE_ACCOUNT" },
      { status: 500 }
    );
  }

  // received_at arrives as an ISO string from n8n; null when absent.
  const toTimestamp = (v) => {
    if (!v) return null;
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : Timestamp.fromMillis(ms);
  };

  const docs = tasks.map((t) => ({
    id: uid(),
    title: t.title,
    note: t.note || "",
    category: t.category,
    scope: t.scope,
    salahBlock: t.salahBlock || null,
    status: "inbox",
    source: source || "n8n",
    sender: sender || null,
    receivedAt: toTimestamp(received_at),
    externalId: external_id || null,
    createdAt: Timestamp.now(),
  }));

  try {
    const batch = adminDb.batch();
    docs.forEach((d) => {
      const { id, ...fields } = d;
      batch.set(adminDb.collection(TASKS_COLLECTION).doc(id), fields);
    });
    await batch.commit();
  } catch (e) {
    return Response.json({ status: "error", message: e.message }, { status: 500 });
  }

  return Response.json({ status: "ok", tasks_created: docs.length, tasks: docs });
}
