"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Inbox, Sun, Loader2, CheckCircle2, Plus, Sparkles, Mail,
  MessageCircle, Send, Keyboard, ChevronDown, ChevronRight,
  CalendarDays, GripVertical, Trash2, Moon, Scale, ArrowUpRight, LayoutGrid
} from "lucide-react";
import { supabase, TASKS_TABLE } from "../lib/supabaseClient";

/* ============================================================
   BARAKAH BOARD — standalone task triage & Kanban module
   ------------------------------------------------------------
   Persistence: if NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are set,
   tasks read/write through Supabase (synced across every device
   you open this PWA on). If unset, falls back to local in-memory
   demo mode — useful for testing the shell before wiring the DB.

   Ingestion: extraction calls POST /api/extract (server route,
   holds the Anthropic key). n8n webhooks will later write
   directly into the same Supabase table from Gmail/WhatsApp/
   Telegram — this component doesn't need to know about that,
   it just reads whatever is in barakah_tasks.
   ============================================================ */

const T = {
  teal: "#0E4744", tealDeep: "#082E2C", gold: "#C9A227", goldSoft: "#E4C96B",
  sand: "#F4EDDC", sandDeep: "#EAE0C8", green: "#5C7A4A", clay: "#A8552F",
  ink: "#1B2A28", mute: "#6B7A74",
};

const CATEGORIES = {
  fard:   { label: "Fard",   ar: "فرض",  desc: "Non-negotiable obligation", color: T.clay,  rank: 0 },
  amanah: { label: "Amanah", ar: "أمانة", desc: "Trust owed to others",      color: T.teal,  rank: 1 },
  nafl:   { label: "Nafl",   ar: "نفل",  desc: "Voluntary growth",          color: T.green, rank: 2 },
  dunya:  { label: "Dunya",  ar: "دنيا", desc: "Admin & maintenance",       color: T.mute,  rank: 3 },
};

const SALAH_BLOCKS = [
  { id: "fajr",    label: "Fajr",    hint: "Deep work — the blessed hours" },
  { id: "dhuhr",   label: "Dhuhr",   hint: "Midday execution" },
  { id: "asr",     label: "Asr",     hint: "Afternoon push" },
  { id: "maghrib", label: "Maghrib", hint: "Family & community" },
  { id: "isha",    label: "Isha",    hint: "Review & light tasks" },
];

const COLUMNS = [
  { id: "inbox", label: "Inbox", sub: "Triage with niyyah", icon: Inbox },
  { id: "today", label: "Today", sub: "Anchored to salah",  icon: Sun },
  { id: "doing", label: "In progress", sub: "One thing, with ihsan", icon: Loader2 },
  { id: "done",  label: "Done", sub: "Alhamdulillah", icon: CheckCircle2 },
];

const SOURCE_META = {
  manual:   { icon: Keyboard,      label: "Typed" },
  email:    { icon: Mail,          label: "Email" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp" },
  telegram: { icon: Send,          label: "Telegram" },
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const rowToTask = (r) => ({
  id: r.id, title: r.title, note: r.note || "", source: r.source,
  category: r.category, scope: r.scope, salahBlock: r.salah_block,
  status: r.status, createdAt: new Date(r.created_at).getTime(),
});
const taskToRow = (t) => ({
  id: t.id, title: t.title, note: t.note || "", source: t.source,
  category: t.category, scope: t.scope, salah_block: t.salahBlock,
  status: t.status, created_at: new Date(t.createdAt).toISOString(),
});

async function extractTasksFromText(rawText, sourceHint) {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText, sourceHint }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Extraction failed");
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  return tasks.map((t) => ({
    id: uid(),
    title: String(t.title || "Untitled task").slice(0, 140),
    note: t.note ? String(t.note).slice(0, 240) : "",
    source: sourceHint,
    category: CATEGORIES[t.category] ? t.category : "dunya",
    scope: t.scope === "today" ? "today" : "week",
    salahBlock: SALAH_BLOCKS.some((b) => b.id === t.salahBlock) ? t.salahBlock : null,
    status: "inbox",
    createdAt: Date.now(),
  }));
}

const SEED = [
  { id: uid(), title: "Send NUMA committee the venue confirmation", note: "Promised Br. Imran by Friday", source: "whatsapp", category: "amanah", scope: "today", salahBlock: "dhuhr", status: "today", createdAt: Date.now() - 86400000 },
  { id: uid(), title: "Finish Fusion 360 bracket revision for client", source: "email", category: "fard", scope: "today", salahBlock: "fajr", status: "doing", createdAt: Date.now() - 7200000 },
  { id: uid(), title: "Read 10 pages — tafsir study", source: "manual", category: "nafl", scope: "today", salahBlock: "isha", status: "today", createdAt: Date.now() - 3600000 },
  { id: uid(), title: "Renew domain & check KDP dashboard", source: "manual", category: "dunya", scope: "week", salahBlock: null, status: "inbox", createdAt: Date.now() - 1800000 },
];

// ============================================================
//  CARD
// ============================================================
function TaskCard({ task, onUpdate, onDelete, onDragStart, isInbox }) {
  const [open, setOpen] = useState(false);
  const cat = CATEGORIES[task.category];
  const Src = SOURCE_META[task.source]?.icon || Keyboard;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      className="group rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
      style={{ borderColor: "#E2DAC6", borderLeft: `3px solid ${cat.color}` }}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <GripVertical size={14} className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
          <div className="min-w-0 flex-1">
            <p className={`text-sm leading-snug ${task.status === "done" ? "line-through opacity-50" : ""}`} style={{ color: T.ink }}>
              {task.title}
            </p>
            {task.note && (
              <p className="mt-1 text-xs leading-snug" style={{ color: T.mute }}>{task.note}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: cat.color + "1A", color: cat.color }}
                title={cat.desc}
              >
                {cat.label} <span className="font-normal" style={{ fontFamily: "'Amiri', serif" }}>{cat.ar}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: T.mute }}>
                <Src size={11} /> {SOURCE_META[task.source]?.label}
              </span>
              {task.scope === "week" && task.status !== "done" && (
                <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: T.mute }}>
                  <CalendarDays size={11} /> this week
                </span>
              )}
              {task.salahBlock && task.status !== "done" && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: T.sandDeep, color: T.tealDeep }}>
                  {SALAH_BLOCKS.find((b) => b.id === task.salahBlock)?.label}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Edit task"
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        {open && (
          <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "#EFE8D4" }}>
            <div className="flex flex-wrap gap-1">
              {Object.entries(CATEGORIES).map(([key, c]) => (
                <button
                  key={key}
                  onClick={() => onUpdate(task.id, { category: key })}
                  className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide border transition-colors"
                  style={
                    task.category === key
                      ? { background: c.color, color: "#fff", borderColor: c.color }
                      : { background: "transparent", color: c.color, borderColor: c.color + "55" }
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => onUpdate(task.id, { scope: "today" })}
                className="rounded px-2 py-1 text-[10px] border"
                style={task.scope === "today" ? { background: T.teal, color: "#fff", borderColor: T.teal } : { color: T.teal, borderColor: T.teal + "55" }}
              >
                Today
              </button>
              <button
                onClick={() => onUpdate(task.id, { scope: "week", salahBlock: null })}
                className="rounded px-2 py-1 text-[10px] border"
                style={task.scope === "week" ? { background: T.teal, color: "#fff", borderColor: T.teal } : { color: T.teal, borderColor: T.teal + "55" }}
              >
                This week
              </button>
            </div>
            {task.scope === "today" && (
              <div className="flex flex-wrap gap-1">
                {SALAH_BLOCKS.map((b) => (
                  <button
                    key={b.id}
                    title={b.hint}
                    onClick={() => onUpdate(task.id, { salahBlock: task.salahBlock === b.id ? null : b.id })}
                    className="rounded px-2 py-1 text-[10px] border"
                    style={
                      task.salahBlock === b.id
                        ? { background: T.gold, color: T.tealDeep, borderColor: T.gold, fontWeight: 600 }
                        : { color: T.mute, borderColor: "#DDD3BA" }
                    }
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              {isInbox ? (
                <button
                  onClick={() => onUpdate(task.id, { status: "today", scope: task.scope })}
                  className="rounded px-2.5 py-1 text-[11px] font-medium text-white"
                  style={{ background: T.teal }}
                >
                  Accept → board
                </button>
              ) : <span />}
              <button onClick={() => onDelete(task.id)} className="rounded p-1 hover:bg-red-50" aria-label="Delete task">
                <Trash2 size={13} style={{ color: T.clay }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  CAPTURE PANEL
// ============================================================
function CapturePanel({ onAddTasks }) {
  const [mode, setMode] = useState("quick");
  const [quick, setQuick] = useState("");
  const [raw, setRaw] = useState("");
  const [sourceHint, setSourceHint] = useState("email");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState(null);

  const addQuick = () => {
    const title = quick.trim();
    if (!title) return;
    onAddTasks([{
      id: uid(), title, note: "", source: "manual", category: "dunya",
      scope: "today", salahBlock: null, status: "inbox", createdAt: Date.now(),
    }]);
    setQuick("");
  };

  const runExtract = async () => {
    if (!raw.trim()) return;
    setBusy(true); setErr(""); setDrafts(null);
    try {
      const tasks = await extractTasksFromText(raw, sourceHint);
      if (tasks.length === 0) setErr("No actionable tasks found in that text.");
      else setDrafts(tasks);
    } catch (e) {
      setErr(e.message || "Extraction failed — try again or add the task manually.");
    } finally { setBusy(false); }
  };

  const acceptDrafts = () => {
    onAddTasks(drafts);
    setDrafts(null); setRaw("");
  };

  return (
    <div className="rounded-xl border" style={{ background: "#FFFDF7", borderColor: "#E2DAC6" }}>
      <div className="flex border-b" style={{ borderColor: "#EFE8D4" }}>
        {[{ id: "quick", label: "Quick add" }, { id: "extract", label: "Extract from message" }].map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors"
            style={mode === t.id ? { color: T.tealDeep, boxShadow: `inset 0 -2px 0 ${T.gold}` } : { color: T.mute }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "quick" && (
        <div className="flex gap-2 p-3">
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addQuick()}
            placeholder="What needs doing? It lands in Inbox for triage…"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
            style={{ borderColor: "#DDD3BA", background: "#fff", color: T.ink }}
          />
          <button onClick={addQuick} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white" style={{ background: T.teal }}>
            <Plus size={15} /> Add
          </button>
        </div>
      )}

      {mode === "extract" && (
        <div className="space-y-2.5 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: T.mute }}>Source:</span>
            {["email", "whatsapp", "telegram", "manual"].map((s) => {
              const I = SOURCE_META[s].icon;
              return (
                <button
                  key={s}
                  onClick={() => setSourceHint(s)}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]"
                  style={sourceHint === s ? { background: T.tealDeep, color: T.goldSoft, borderColor: T.tealDeep } : { color: T.mute, borderColor: "#DDD3BA" }}
                >
                  <I size={12} /> {SOURCE_META[s].label}
                </button>
              );
            })}
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={4}
            placeholder="Paste an email, WhatsApp or Telegram message — tasks are extracted and classified by niyyah, ready for your triage."
            className="w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
            style={{ borderColor: "#DDD3BA", background: "#fff", color: T.ink }}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={runExtract}
              disabled={busy || !raw.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: T.teal }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {busy ? "Extracting…" : "Extract tasks"}
            </button>
            {err && <span className="text-xs" style={{ color: T.clay }}>{err}</span>}
          </div>

          {drafts && (
            <div className="rounded-lg border p-3" style={{ borderColor: T.gold + "66", background: T.sand }}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: T.tealDeep }}>
                {drafts.length} task{drafts.length > 1 ? "s" : ""} found — review before accepting
              </p>
              <ul className="space-y-1.5">
                {drafts.map((d) => (
                  <li key={d.id} className="flex items-start gap-2 text-sm" style={{ color: T.ink }}>
                    <span className="mt-1 h-2 w-2 shrink-0 rotate-45" style={{ background: CATEGORIES[d.category].color }} />
                    <span>
                      {d.title}
                      <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: CATEGORIES[d.category].color }}>
                        {CATEGORIES[d.category].label} · {d.scope}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button onClick={acceptDrafts} className="rounded px-3 py-1.5 text-xs font-medium text-white" style={{ background: T.green }}>
                  Accept into Inbox
                </button>
                <button onClick={() => setDrafts(null)} className="rounded border px-3 py-1.5 text-xs" style={{ color: T.mute, borderColor: "#DDD3BA" }}>
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
//  WEEKLY REVIEW
// ============================================================
function WeeklyReview({ tasks, onUpdate, onDelete }) {
  const weekOpen = tasks.filter((t) => t.scope === "week" && t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const openByCat = Object.keys(CATEGORIES).map((key) => ({
    key, ...CATEGORIES[key], items: weekOpen.filter((t) => t.category === key),
  }));
  const doneByCat = Object.keys(CATEGORIES).map((key) => ({
    key, ...CATEGORIES[key], count: done.filter((t) => t.category === key).length,
  }));
  const totalDone = done.length;
  const totalAll = totalDone + tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4" style={{ background: T.tealDeep, borderColor: T.tealDeep }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: T.gold }}>
              Muhasabah <span style={{ fontFamily: "'Amiri', serif" }} className="ml-1 normal-case tracking-normal">محاسبة</span>
            </p>
            <p className="mt-1 text-sm" style={{ color: T.sand }}>
              Weekly accounting — what was completed, what carries over, and where the niyyah balance sits.
            </p>
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <p className="text-2xl font-semibold" style={{ color: T.goldSoft }}>{totalDone}</p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "#A9C2BD" }}>completed</p>
            </div>
            <div>
              <p className="text-2xl font-semibold" style={{ color: T.sand }}>{weekOpen.length}</p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "#A9C2BD" }}>carrying over</p>
            </div>
          </div>
        </div>
        {totalAll > 0 && (
          <div className="mt-3">
            <div className="flex h-2 overflow-hidden rounded-full" style={{ background: "#0F3B38" }}>
              {doneByCat.map((c) =>
                c.count ? (
                  <div key={c.key} style={{ width: `${(c.count / totalAll) * 100}%`, background: c.key === "dunya" ? "#8FA09A" : c.color }} title={`${c.label}: ${c.count} done`} />
                ) : null
              )}
            </div>
            <p className="mt-1.5 text-[10px]" style={{ color: "#A9C2BD" }}>
              Completed work by intention — a week heavy in Dunya and light in Fard is a signal, not a failure.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {openByCat.map((c) => (
          <section key={c.key} className="rounded-xl border" style={{ background: "#FAF6EA", borderColor: "#E2DAC6", borderTop: `3px solid ${c.color}` }}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: "#EFE8D4" }}>
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold" style={{ color: c.color }}>{c.label}</h2>
                <span className="text-xs" style={{ fontFamily: "'Amiri', serif", color: c.color }}>{c.ar}</span>
                <span className="text-[10px]" style={{ color: T.mute }}>{c.desc}</span>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: T.sandDeep, color: T.tealDeep }}>
                {c.items.length}
              </span>
            </div>
            <div className="space-y-2 p-2.5">
              {c.items.length === 0 && (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs" style={{ borderColor: "#D7CCAE", color: T.mute }}>
                  Nothing carrying over here.
                </p>
              )}
              {c.items.map((t) => {
                const Src = SOURCE_META[t.source]?.icon || Keyboard;
                return (
                  <div key={t.id} className="group flex items-start gap-2 rounded-lg border bg-white p-2.5" style={{ borderColor: "#E2DAC6" }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug" style={{ color: T.ink }}>{t.title}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px]" style={{ color: T.mute }}>
                        <Src size={10} /> {SOURCE_META[t.source]?.label} · in {t.status === "inbox" ? "Inbox" : t.status === "doing" ? "In progress" : "backlog"}
                      </p>
                    </div>
                    <button
                      onClick={() => onUpdate(t.id, { scope: "today", status: "today" })}
                      className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-white"
                      style={{ background: T.teal }}
                      title="Move into Today"
                    >
                      <ArrowUpRight size={12} /> Today
                    </button>
                    <button onClick={() => onDelete(t.id)} className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-opacity" aria-label="Delete task">
                      <Trash2 size={13} style={{ color: T.clay }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function EmptyHint({ text }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-center text-xs" style={{ borderColor: "#D7CCAE", color: T.mute }}>
      {text}
    </div>
  );
}

// ============================================================
//  BOARD (default export — this is the page)
// ============================================================
export default function BarakahBoard({ onTasksChange }) {
  const [tasks, setTasks] = useState(supabase ? [] : SEED);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [view, setView] = useState("board");
  const [dragOver, setDragOver] = useState(null);
  const dragId = useRef(null);

  // Initial load from Supabase, if configured.
  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setLoading(false); return; }
      const { data, error } = await supabase
        .from(TASKS_TABLE)
        .select("*")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        console.error("Supabase load failed:", error.message);
      } else if (data) {
        setTasks(data.map(rowToTask));
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const notifyParent = (next) => { onTasksChange && onTasksChange(next); };

  const addTasks = useCallback(async (newTasks) => {
    setTasks((prev) => { const next = [...newTasks, ...prev]; notifyParent(next); return next; });
    if (supabase) {
      const { error } = await supabase.from(TASKS_TABLE).insert(newTasks.map(taskToRow));
      if (error) console.error("Supabase insert failed:", error.message);
    }
  }, []);

  const updateTask = useCallback(async (id, patch) => {
    setTasks((prev) => { const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t)); notifyParent(next); return next; });
    if (supabase) {
      const row = {};
      if ("title" in patch) row.title = patch.title;
      if ("note" in patch) row.note = patch.note;
      if ("category" in patch) row.category = patch.category;
      if ("scope" in patch) row.scope = patch.scope;
      if ("salahBlock" in patch) row.salah_block = patch.salahBlock;
      if ("status" in patch) row.status = patch.status;
      const { error } = await supabase.from(TASKS_TABLE).update(row).eq("id", id);
      if (error) console.error("Supabase update failed:", error.message);
    }
  }, []);

  const deleteTask = useCallback(async (id) => {
    setTasks((prev) => { const next = prev.filter((t) => t.id !== id); notifyParent(next); return next; });
    if (supabase) {
      const { error } = await supabase.from(TASKS_TABLE).delete().eq("id", id);
      if (error) console.error("Supabase delete failed:", error.message);
    }
  }, []);

  const onDragStart = (e, id) => { dragId.current = id; e.dataTransfer.effectAllowed = "move"; };
  const onDropCol = (colId) => {
    const id = dragId.current;
    if (!id) return;
    updateTask(id, { status: colId, ...(colId === "today" ? { scope: "today" } : {}) });
    dragId.current = null;
    setDragOver(null);
  };

  const byRank = (a, b) => CATEGORIES[a.category].rank - CATEGORIES[b.category].rank || a.createdAt - b.createdAt;

  const cols = useMemo(() => {
    const m = { inbox: [], today: [], doing: [], done: [] };
    tasks.forEach((t) => m[t.status]?.push(t));
    Object.values(m).forEach((arr) => arr.sort(byRank));
    return m;
  }, [tasks]);

  const fardOpen = tasks.filter((t) => t.category === "fard" && t.status !== "done").length;
  const doneToday = cols.done.length;

  const todayGrouped = useMemo(() => {
    const groups = SALAH_BLOCKS.map((b) => ({ ...b, items: cols.today.filter((t) => t.salahBlock === b.id) }));
    const unanchored = cols.today.filter((t) => !t.salahBlock);
    return { groups, unanchored };
  }, [cols.today]);

  return (
    <div className="min-h-screen w-full" style={{ background: T.sand, fontFamily: "'Albert Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Amiri:wght@400;700&display=swap');
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: #D7CCAE; border-radius: 4px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <header className="px-5 pt-5 pb-4" style={{ background: T.tealDeep }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: T.gold }}>
              Aziodes · productivity module
            </p>
            <h1 className="mt-1 text-2xl" style={{ fontFamily: "'Fraunces', serif", color: T.sand, fontWeight: 650 }}>
              Barakah Board
              <span className="ml-3 text-lg align-middle" style={{ fontFamily: "'Amiri', serif", color: T.goldSoft }}>بركة</span>
            </h1>
            <p className="mt-1 text-xs" style={{ color: "#A9C2BD" }}>
              Capture from anywhere · triage with niyyah · anchor the day to salah
            </p>
          </div>
          <div className="flex items-end gap-5">
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-xl font-semibold" style={{ color: fardOpen ? T.goldSoft : T.sand }}>{fardOpen}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "#A9C2BD" }}>fard open</p>
              </div>
              <div>
                <p className="text-xl font-semibold" style={{ color: T.sand }}>{doneToday}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "#A9C2BD" }}>completed</p>
              </div>
            </div>
            <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "#2A5B57" }}>
              <button onClick={() => setView("board")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium" style={view === "board" ? { background: T.gold, color: T.tealDeep } : { color: "#A9C2BD" }}>
                <LayoutGrid size={13} /> Board
              </button>
              <button onClick={() => setView("review")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium" style={view === "review" ? { background: T.gold, color: T.tealDeep } : { color: "#A9C2BD" }}>
                <Scale size={13} /> Weekly review
              </button>
            </div>
          </div>
        </div>
      </header>

      {!supabase && (
        <div className="mx-auto max-w-7xl px-4 pt-3">
          <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: T.gold, background: "#FFF8E6", color: T.tealDeep }}>
            Running in local demo mode — tasks reset on reload and won't sync across devices. Add Supabase keys in Vercel env vars to enable real persistence (see README).
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: T.mute }}>
            <Loader2 size={16} className="animate-spin" /> Loading your board…
          </div>
        ) : (
          <>
            <CapturePanel onAddTasks={addTasks} />

            {view === "review" && <WeeklyReview tasks={tasks} onUpdate={updateTask} onDelete={deleteTask} />}

            <div className={view === "board" ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" : "hidden"}>
              {COLUMNS.map((col) => {
                const Icon = col.icon;
                const items = cols[col.id];
                return (
                  <section
                    key={col.id}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
                    onDragLeave={() => setDragOver((d) => (d === col.id ? null : d))}
                    onDrop={() => onDropCol(col.id)}
                    className="flex min-h-[200px] flex-col rounded-xl border transition-colors"
                    style={{ background: dragOver === col.id ? "#FBF6E8" : "#FAF6EA", borderColor: dragOver === col.id ? T.gold : "#E2DAC6" }}
                  >
                    <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "#EFE8D4" }}>
                      <div className="flex items-center gap-2">
                        <Icon size={15} style={{ color: T.teal }} />
                        <div>
                          <h2 className="text-sm font-semibold" style={{ color: T.tealDeep }}>{col.label}</h2>
                          <p className="text-[10px]" style={{ color: T.mute }}>{col.sub}</p>
                        </div>
                      </div>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: T.sandDeep, color: T.tealDeep }}>{items.length}</span>
                    </div>

                    <div className="flex-1 space-y-2 overflow-y-auto p-2.5" style={{ maxHeight: "60vh" }}>
                      {col.id === "today" ? (
                        <>
                          {todayGrouped.groups.map((g) =>
                            g.items.length ? (
                              <div key={g.id}>
                                <div className="mb-1.5 flex items-center gap-2 px-1">
                                  <span className="h-px flex-1" style={{ background: T.gold + "55" }} />
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: T.gold }} title={g.hint}>{g.label}</span>
                                  <span className="h-px flex-1" style={{ background: T.gold + "55" }} />
                                </div>
                                <div className="space-y-2">
                                  {g.items.map((t) => <TaskCard key={t.id} task={t} onUpdate={updateTask} onDelete={deleteTask} onDragStart={onDragStart} />)}
                                </div>
                              </div>
                            ) : null
                          )}
                          {todayGrouped.unanchored.length > 0 && (
                            <div>
                              <p className="mb-1.5 px-1 text-[10px] uppercase tracking-[0.15em]" style={{ color: T.mute }}>Unanchored — assign a salah block</p>
                              <div className="space-y-2">
                                {todayGrouped.unanchored.map((t) => <TaskCard key={t.id} task={t} onUpdate={updateTask} onDelete={deleteTask} onDragStart={onDragStart} />)}
                              </div>
                            </div>
                          )}
                          {cols.today.length === 0 && <EmptyHint text="Drag tasks here, then anchor each to a salah block." />}
                        </>
                      ) : (
                        <>
                          {items.map((t) => (
                            <TaskCard key={t.id} task={t} isInbox={col.id === "inbox"} onUpdate={updateTask} onDelete={deleteTask} onDragStart={onDragStart} />
                          ))}
                          {items.length === 0 && (
                            <EmptyHint text={
                              col.id === "inbox" ? "Captured tasks land here. Expand a card to set its niyyah." :
                              col.id === "doing" ? "Pull one task at a time — do it with ihsan." :
                              "Completed work gathers here. Alhamdulillah."
                            } />
                          )}
                        </>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
              <p className="text-[11px]" style={{ color: T.mute }}>
                Triage order: <span style={{ color: T.clay }}>Fard</span> → <span style={{ color: T.teal }}>Amanah</span> → <span style={{ color: T.green }}>Nafl</span> → <span style={{ color: T.mute }}>Dunya</span>. WIP discipline: keep "In progress" to one or two cards.
              </p>
              <p className="inline-flex items-center gap-1 text-[11px]" style={{ color: T.mute }}>
                <Moon size={12} /> {supabase ? "Synced via Supabase" : "Local demo mode"}
              </p>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
