import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import type { Classification } from "./ai";
import type { FeedItem } from "./sources";

// The message layout lives in alert-template.txt at the repo root so you can
// restyle it in GitHub's web editor without touching code. Loaded once at startup.
const TEMPLATE = readFileSync(
  fileURLToPath(new URL("../alert-template.txt", import.meta.url)),
  "utf8",
);

// Topic routing config (routing.json at the repo root). Decides which Telegram
// forum topic(s) each alert goes to, based on which assets it affects.
interface RoutingTopic {
  name: string;
  assets: string[];
  topic_id: number;
}
interface Routing {
  topics: RoutingTopic[];
  fallback_topic_id: number;
}
const ROUTING = JSON.parse(
  readFileSync(fileURLToPath(new URL("../routing.json", import.meta.url)), "utf8"),
) as Routing;

// Decide which topic thread id(s) an alert goes to. A topic matches if ANY of
// its assets has a non-neutral score. An item can match several topics, so it
// gets posted to each (duplicates are fine by design). If nothing matches, the
// fallback topic is used. topic_id 0 means "no specific topic" (send to the
// chat normally) — and all 0s collapse to a single send, so an unconfigured
// routing.json behaves exactly like the old single-channel setup.
function resolveThreadIds(impact: Classification["impact"]): number[] {
  const scores = impact as unknown as Record<string, number>;
  const matched: number[] = [];
  for (const t of ROUTING.topics ?? []) {
    if (t.assets.some((a) => (scores[a] ?? 0) !== 0)) {
      matched.push(t.topic_id ?? 0);
    }
  }
  const ids = matched.length ? matched : [ROUTING.fallback_topic_id ?? 0];
  return [...new Set(ids)];
}

// Emoji used for the impact scale. 🔺 = bullish (利好), 🔻 = bearish (利淡).
// Want different glyphs? Change these two lines.
const UP = "🔺";
const DOWN = "🔻";

// Build the per-asset impact block: one line per asset whose score isn't 0,
// rendered as N up/down emoji. Neutral (0) assets are omitted entirely.
function renderImpact(impact: Classification["impact"]): string {
  const assets: Array<[keyof Classification["impact"], string]> = [
    ["BTC", "BTC"],
    ["ETH", "ETH"],
    ["Gold", "Gold"],
    ["Oil", "Oil"],
    ["Nasdaq", "Nasdaq"],
    ["DXY", "DXY"],
  ];
  const lines: string[] = [];
  for (const [key, label] of assets) {
    const score = impact[key];
    if (!score) continue; // hide neutral (0) assets
    const emoji = score > 0 ? UP.repeat(score) : DOWN.repeat(-score);
    lines.push(`• ${label}: ${emoji}`);
  }
  return lines.length ? lines.join("\n") : "• 各市場暫無明顯影響";
}

export function formatAlert(item: FeedItem, c: Classification): string {
  const values: Record<string, string> = {
    severity: c.severity,
    title: c.title_zh,
    summary: c.summary_zh,
    why: c.why_zh,
    impact: renderImpact(c.impact),
    confidence: c.confidence,
    source_url: item.url,
  };
  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (match, key) => values[key] ?? match);
}

/**
 * Format an alert and send it to every topic it's relevant to (by impact).
 * Returns the number of topics it was posted to.
 */
export async function sendAlert(item: FeedItem, c: Classification): Promise<number> {
  const text = formatAlert(item, c);
  const threads = resolveThreadIds(c.impact);
  for (const threadId of threads) {
    await sendTelegram(text, threadId);
  }
  return threads.length;
}

/**
 * Sends a plain-text message to the configured chat. Throws on failure.
 * If messageThreadId > 0, posts into that Telegram forum topic.
 */
export async function sendTelegram(text: string, messageThreadId = 0): Promise<void> {
  const url = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: config.telegramChatId,
    text,
    disable_web_page_preview: false,
  };
  if (messageThreadId > 0) body.message_thread_id = messageThreadId;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed (${res.status}): ${errBody}`);
  }
}
