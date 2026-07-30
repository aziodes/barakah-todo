#!/usr/bin/env node
/**
 * One-shot migration: Supabase `barakah_tasks` -> Firestore `barakah_tasks`.
 *
 * Reads every row from Postgres and writes it to Firestore under the SAME
 * document id, so the migration is idempotent — running it twice overwrites
 * rather than duplicating. Field names move from snake_case to the camelCase
 * the app now uses, and both timestamps become Firestore Timestamps.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   FIREBASE_SERVICE_ACCOUNT="$(cat serviceAccount.json)" \
 *   node scripts/migrate-supabase-to-firestore.mjs [--dry-run]
 *
 * Reads only from Supabase; nothing is deleted there. Keep the Supabase project
 * intact until the Firebase board is verified.
 */

import { createClient } from "@supabase/supabase-js";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const DRY_RUN = process.argv.includes("--dry-run");
const COLLECTION = "barakah_tasks";

function need(name) {
  const v = (process.env[name] || "").trim().replace(/^["']|["']$/g, "");
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const supabase = createClient(need("SUPABASE_URL"), need("SUPABASE_ANON_KEY"));

// Firebase creds are only needed for a real run, so a --dry-run works with
// nothing but the Supabase pair — useful for checking what would move before
// the service-account key exists.
function connectFirestore() {
  const serviceAccount = JSON.parse(need("FIREBASE_SERVICE_ACCOUNT"));
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }
  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  return getFirestore();
}

const toTimestamp = (v) => {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : Timestamp.fromMillis(ms);
};

const rowToDoc = (r) => ({
  title: r.title,
  note: r.note || "",
  source: r.source,
  category: r.category,
  scope: r.scope,
  salahBlock: r.salah_block ?? null,
  status: r.status,
  sender: r.sender ?? null,
  receivedAt: toTimestamp(r.received_at),
  externalId: r.external_id ?? null,
  createdAt: toTimestamp(r.created_at) ?? Timestamp.now(),
});

async function main() {
  const { data: rows, error } = await supabase
    .from(COLLECTION)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase read failed:", error.message);
    process.exit(1);
  }
  if (!rows?.length) {
    console.log("No rows found in Supabase — nothing to migrate.");
    return;
  }

  console.log(`Read ${rows.length} row(s) from Supabase.`);

  if (DRY_RUN) {
    for (const r of rows) {
      console.log(`  [dry-run] ${r.id}  ${r.status.padEnd(6)}  ${r.title}`);
    }
    console.log("\nDry run — nothing written. Drop --dry-run to migrate.");
    return;
  }

  const db = connectFirestore();

  // Firestore batches cap at 500 writes; chunk defensively even though the
  // current dataset is tiny.
  const CHUNK = 400;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const r of slice) {
      batch.set(db.collection(COLLECTION).doc(r.id), rowToDoc(r));
    }
    await batch.commit();
    written += slice.length;
    console.log(`  wrote ${written}/${rows.length}`);
  }

  const snap = await db.collection(COLLECTION).count().get();
  console.log(`\nDone. Firestore ${COLLECTION} now holds ${snap.data().count} document(s).`);
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
