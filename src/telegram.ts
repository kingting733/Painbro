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

/** Sends a plain-text message to the configured chat. Throws on failure. */
export async function sendTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }
}
