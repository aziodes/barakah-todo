import { extractTasks } from "../../../lib/extractTasks";
import { adminDb, TASKS_COLLECTION } from "../../../lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function stripQuotes(val) {
  return typeof val === "string" ? val.replace(/^["'\s]+|["'\s]+$/g, "") : val;
}

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function POST(req) {
  // Verify it's from Telegram via secret token header
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  const expected = stripQuotes(process.env.TELEGRAM_WEBHOOK_SECRET);
  if (!secret || !expected || secret !== expected) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const msg = body?.message;
  if (!msg?.text) {
    // Non-text updates (stickers, photos, etc.) — acknowledge and ignore
    return Response.json({ ok: true });
  }

  const chatId = msg.chat.id;
  const sender = msg.from?.username || msg.from?.first_name || String(chatId);

  let tasks;
  try {
    tasks = await extractTasks(msg.text, "telegram");
  } catch (e) {
    await sendTelegramMessage(chatId, "Something went wrong extracting tasks. Try again.");
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }

  if (tasks.length === 0) {
    await sendTelegramMessage(chatId, "No actionable tasks found in that message.");
    return Response.json({ ok: true });
  }

  if (!adminDb) {
    await sendTelegramMessage(chatId, "Database not configured.");
    return Response.json({ ok: false }, { status: 500 });
  }

  // Admin SDK writes bypass firestore.rules — this route is authenticated by
  // the Telegram secret-token header instead of a user session.
  const rows = tasks.map((t) => ({
    id: uid(),
    title: t.title,
    note: t.note || "",
    category: t.category,
    scope: t.scope,
    salahBlock: t.salahBlock || null,
    status: "inbox",
    source: "telegram",
    sender,
    receivedAt: Timestamp.fromMillis(msg.date * 1000),
    externalId: `tg-${msg.message_id}`,
    createdAt: Timestamp.now(),
  }));

  try {
    const batch = adminDb.batch();
    rows.forEach((r) => {
      const { id, ...fields } = r;
      batch.set(adminDb.collection(TASKS_COLLECTION).doc(id), fields);
    });
    await batch.commit();
  } catch (e) {
    await sendTelegramMessage(chatId, "Failed to save tasks. Try again.");
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }

  await sendTelegramMessage(
    chatId,
    `${tasks.length} task${tasks.length > 1 ? "s" : ""} added to your Barakah Board.`
  );
  return Response.json({ ok: true });
}
