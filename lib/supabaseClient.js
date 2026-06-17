import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// If env vars aren't set yet, `supabase` is null and BarakahBoard
// quietly falls back to local-only (in-memory) demo mode instead
// of crashing. This lets you deploy the shell before the database
// is wired up.
export const supabase = url && key ? createClient(url, key) : null;

export const TASKS_TABLE = "barakah_tasks";
