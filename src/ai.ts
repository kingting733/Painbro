import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import type { FeedItem } from "./sources";

export type Severity = "WATCH" | "MEDIUM" | "HIGH";
export type Confidence = "Low" | "Medium" | "High";

export interface Classification {
  post: boolean;
  topic: string;
  severity: Severity;
  confidence: Confidence;
  // Per-asset impact score, integer -5..+5.
  //  +5 = extreme bullish (極端利好) ... +1 = slightly bullish
  //   0 = neutral (中性, hidden in the alert)
  //  -1 = slightly bearish ... -5 = extreme bearish (極端利淡)
  impact: {
    BTC: number;
    ETH: number;
    Gold: number;
    Oil: number;
    Nasdaq: number;
    DXY: number;
  };
  // Cantonese / Traditional Chinese fields used directly in the Telegram alert.
  title_zh: string; // one-line Cantonese headline
  summary_zh: string; // 2-3 sentence summary
  why_zh: string; // why traders should care
}

const client = new OpenAI({
  apiKey: config.openaiKey,
  baseURL: config.openaiBaseUrl, // undefined => OpenAI default; set for DeepSeek etc.
});

// The analyst instructions live in prompt.md at the repo root so you can edit
// them in GitHub's web editor without touching code. Loaded once at startup.
const SYSTEM_PROMPT = readFileSync(
  fileURLToPath(new URL("../prompt.md", import.meta.url)),
  "utf8",
).trim();

function jsonSchemaHint(): string {
  return `請只回覆以下 JSON 結構（severity 同 confidence 用指定英文字，文字欄位用繁體中文/廣東話）：
{
  "post": true 或 false,
  "topic": "簡短分類，例如：貨幣政策 / 地緣政治 / 加密監管",
  "severity": "WATCH" 或 "MEDIUM" 或 "HIGH",
  "confidence": "Low" 或 "Medium" 或 "High",
  "title_zh": "一句廣東話標題",
  "summary_zh": "2-3 句廣東話摘要",
  "why_zh": "解釋點解交易者要關注",
  "impact": {
    "BTC": 整數, "ETH": 整數, "Gold": 整數,
    "Oil": 整數, "Nasdaq": 整數, "DXY": 整數
  }
}

impact 每一項係 -5 到 +5 嘅整數，代表呢單新聞對該資產嘅方向同強度：
  +5 = 極端利好，+1 = 輕微利好，0 = 中性/無影響，-1 = 輕微利淡，-5 = 極端利淡。
無明顯影響就寫 0。`;
}

export async function classify(item: FeedItem): Promise<Classification> {
  const userContent = `來源：${item.source}
連結：${item.url}

新聞內容：
${item.content}

${jsonSchemaHint()}`;

  const completion = await client.chat.completions.create({
    model: config.openaiModel,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Partial<Classification>;

  // Normalize / guard against missing fields so downstream code is safe.
  return {
    post: parsed.post === true,
    topic: parsed.topic ?? "未分類",
    severity: normalizeSeverity(parsed.severity),
    confidence: normalizeConfidence(parsed.confidence),
    title_zh: parsed.title_zh ?? item.title,
    summary_zh: parsed.summary_zh ?? "",
    why_zh: parsed.why_zh ?? "",
    impact: {
      BTC: normalizeScore(parsed.impact?.BTC),
      ETH: normalizeScore(parsed.impact?.ETH),
      Gold: normalizeScore(parsed.impact?.Gold),
      Oil: normalizeScore(parsed.impact?.Oil),
      Nasdaq: normalizeScore(parsed.impact?.Nasdaq),
      DXY: normalizeScore(parsed.impact?.DXY),
    },
  };
}

// Coerce the AI's per-asset value into an integer clamped to -5..+5.
// Anything unparseable becomes 0 (neutral), so a bad value just hides the line.
function normalizeScore(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-5, Math.min(5, n));
}

function normalizeSeverity(value: unknown): Severity {
  const v = String(value ?? "").toUpperCase();
  if (v === "HIGH" || v === "MEDIUM" || v === "WATCH") return v;
  return "WATCH";
}

function normalizeConfidence(value: unknown): Confidence {
  const v = String(value ?? "").toLowerCase();
  if (v === "high") return "High";
  if (v === "medium") return "Medium";
  return "Low";
}
