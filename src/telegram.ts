import { config } from "./config";
import type { Classification } from "./ai";
import type { FeedItem } from "./sources";

export function formatAlert(item: FeedItem, c: Classification): string {
  return [
    `🚨 Market Alert｜${c.severity}`,
    ``,
    `事件：`,
    c.title_zh,
    ``,
    `重點：`,
    c.summary_zh,
    ``,
    `點解重要：`,
    c.why_zh,
    ``,
    `可能市場影響：`,
    `• BTC: ${c.impact.BTC}`,
    `• ETH: ${c.impact.ETH}`,
    `• Gold: ${c.impact.Gold}`,
    `• Oil: ${c.impact.Oil}`,
    `• Nasdaq: ${c.impact.Nasdaq}`,
    `• DXY: ${c.impact.DXY}`,
    ``,
    `可信度：${c.confidence}`,
    `來源：${item.url}`,
  ].join("\n");
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
