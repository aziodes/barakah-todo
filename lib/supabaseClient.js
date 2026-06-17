import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// If env vars are missing OR malformed (extra quotes, missing https://,
// stray whitespace from a copy-paste, etc.), `supabase` becomes null and
// BarakahBoard falls back to local-only demo mode instead of crashing
// the entire build/page. Check the Vercel function logs for the warning
// below if sync isn't working — it'll tell you the value is bad.
let client = null;
if (url && key) {
  try {
    client = createClient(url, key);
  } catch (e) {
    console.error(
      "Supabase client failed to initialize — check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel env vars:",
      e.message
    );
  }
}

export const supabase = client;
export const TASKS_TABLE = "barakah_tasks";

