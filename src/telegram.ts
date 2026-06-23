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

export function formatAlert(item: FeedItem, c: Classification): string {
  const values: Record<string, string> = {
    severity: c.severity,
    title: c.title_zh,
    summary: c.summary_zh,
    why: c.why_zh,
    btc: c.impact.BTC,
    eth: c.impact.ETH,
    gold: c.impact.Gold,
    oil: c.impact.Oil,
    nasdaq: c.impact.Nasdaq,
    dxy: c.impact.DXY,
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
