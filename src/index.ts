import { config } from "./config";
import { SOURCES, fetchSource, type FeedItem } from "./sources";
import { isMarketRelevant } from "./filter";
import { classify } from "./ai";
import { formatAlert, sendTelegram } from "./telegram";
import {
  isFirstRun,
  getSeenGuids,
  markSeen,
  seedSeen,
  writeRunLog,
} from "./db";

async function main(): Promise<void> {
  const startedAt = Date.now();
  let sourcesOk = 0;
  let sourcesFailed = 0;
  const failNotes: string[] = [];

  // 1. Fetch every source (failures are isolated, never fatal).
  const allItems: FeedItem[] = [];
  const results = await Promise.all(SOURCES.map(fetchSource));
  for (const r of results) {
    if (r.ok) {
      sourcesOk++;
      allItems.push(...r.items);
    } else {
      sourcesFailed++;
      failNotes.push(`${r.source}: ${r.error}`);
      console.error(`[source-error] ${r.source}: ${r.error}`);
    }
  }

  // 2. De-duplicate against what we've already seen.
  const guids = [...new Set(allItems.map((i) => i.guid))];
  const seen = await getSeenGuids(guids);
  // Keep first occurrence of each new guid.
  const newByGuid = new Map<string, FeedItem>();
  for (const item of allItems) {
    if (!seen.has(item.guid) && !newByGuid.has(item.guid)) {
      newByGuid.set(item.guid, item);
    }
  }
  const newItems = [...newByGuid.values()];

  // 3. First-run seed: remember current items, post nothing (no flood).
  if (await isFirstRun()) {
    await seedSeen(newItems);
    console.log(`[seed] first run — seeded ${newItems.length} items, no alerts sent.`);
    await writeRunLog({
      seed_mode: true,
      sources_ok: sourcesOk,
      sources_failed: sourcesFailed,
      new_items: newItems.length,
      keyword_passed: 0,
      ai_called: 0,
      posted: 0,
      notes: failNotes.join(" | ") || undefined,
    });
    return;
  }

  // 4. Freshness window: ignore (but mark seen) anything too old.
  const maxAgeMs = config.maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();
  const isFresh = (item: FeedItem) =>
    item.publishedAt === null || now - item.publishedAt.getTime() <= maxAgeMs;

  // Process oldest first so alert order matches chronology.
  newItems.sort((a, b) => {
    const ta = a.publishedAt?.getTime() ?? 0;
    const tb = b.publishedAt?.getTime() ?? 0;
    return ta - tb;
  });

  let keywordPassed = 0;
  let aiCalled = 0;
  let posted = 0;

  for (const item of newItems) {
    if (!isFresh(item)) {
      await markSeen(item, false);
      continue;
    }

    // 5. Cheap keyword gate before paying for AI.
    if (!isMarketRelevant(item.content)) {
      await markSeen(item, false);
      continue;
    }
    keywordPassed++;

    // Cost guard: stop calling AI past the cap; leave remaining for next run.
    if (aiCalled >= config.maxAiCalls) {
      console.log(`[cap] hit MAX_AI_CALLS=${config.maxAiCalls}; deferring rest to next run.`);
      break;
    }

    // 6. AI classification.
    let shouldPost = false;
    try {
      aiCalled++;
      const result = await classify(item);
      if (result.post) {
        await sendTelegram(formatAlert(item, result));
        shouldPost = true;
        posted++;
        console.log(`[posted] ${result.severity} — ${item.title}`);
      } else {
        console.log(`[skip] post=false — ${item.title}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ai/telegram-error] ${item.title}: ${message}`);
      // Don't mark seen on failure, so a transient error retries next run.
      continue;
    }

    await markSeen(item, shouldPost);
  }

  await writeRunLog({
    seed_mode: false,
    sources_ok: sourcesOk,
    sources_failed: sourcesFailed,
    new_items: newItems.length,
    keyword_passed: keywordPassed,
    ai_called: aiCalled,
    posted,
    notes: failNotes.join(" | ") || undefined,
  });

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[done] ${secs}s | sources ok:${sourcesOk} fail:${sourcesFailed} | new:${newItems.length} keyword:${keywordPassed} ai:${aiCalled} posted:${posted}`,
  );
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
