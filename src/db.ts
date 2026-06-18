import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import type { FeedItem } from "./sources";

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false },
});

/** True on the very first run (empty table) — used to seed without spamming. */
export async function isFirstRun(): Promise<boolean> {
  const { count, error } = await supabase
    .from("seen_items")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`isFirstRun failed: ${error.message}`);
  return (count ?? 0) === 0;
}

/** Returns the subset of guids that already exist in seen_items. */
export async function getSeenGuids(guids: string[]): Promise<Set<string>> {
  if (guids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("seen_items")
    .select("guid")
    .in("guid", guids);
  if (error) throw new Error(`getSeenGuids failed: ${error.message}`);
  return new Set((data ?? []).map((row) => row.guid as string));
}

/** Records an item as processed. Upsert on guid keeps it idempotent. */
export async function markSeen(item: FeedItem, posted: boolean): Promise<void> {
  const { error } = await supabase.from("seen_items").upsert(
    {
      guid: item.guid,
      source: item.source,
      url: item.url,
      title: item.title,
      posted,
    },
    { onConflict: "guid" },
  );
  if (error) throw new Error(`markSeen failed: ${error.message}`);
}

/** Bulk seed many items as seen (posted=false) on the first run. */
export async function seedSeen(items: FeedItem[]): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map((item) => ({
    guid: item.guid,
    source: item.source,
    url: item.url,
    title: item.title,
    posted: false,
  }));
  const { error } = await supabase
    .from("seen_items")
    .upsert(rows, { onConflict: "guid" });
  if (error) throw new Error(`seedSeen failed: ${error.message}`);
}

export interface RunLog {
  seed_mode: boolean;
  sources_ok: number;
  sources_failed: number;
  new_items: number;
  keyword_passed: number;
  ai_called: number;
  posted: number;
  notes?: string;
}

export async function writeRunLog(log: RunLog): Promise<void> {
  const { error } = await supabase
    .from("run_logs")
    .insert({ ...log, finished_at: new Date().toISOString() });
  // A failed log write should not fail the whole run.
  if (error) console.error(`writeRunLog failed: ${error.message}`);
}
