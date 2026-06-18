import OpenAI from "openai";
import { config } from "./config";
import type { FeedItem } from "./sources";

export type Severity = "WATCH" | "MEDIUM" | "HIGH";
export type Confidence = "Low" | "Medium" | "High";

export interface Classification {
  post: boolean;
  topic: string;
  severity: Severity;
  confidence: Confidence;
  impact: {
    BTC: string;
    ETH: string;
    Gold: string;
    Oil: string;
    Nasdaq: string;
    DXY: string;
  };
  // Cantonese / Traditional Chinese fields used directly in the Telegram alert.
  title_zh: string; // one-line Cantonese headline
  summary_zh: string; // 2-3 sentence summary
  why_zh: string; // why traders should care
}

const client = new OpenAI({ apiKey: config.openaiKey });

const SYSTEM_PROMPT = `你是一個專業的金融市場分析師，專門判斷新聞對市場嘅即時影響。
你會收到一則新聞（標題 + 摘要）。請判斷佢對交易者係咪重要，並用繁體中文 / 廣東話分析。

只有當新聞對以下市場有明確、可操作嘅潛在影響時，先設 post=true：
BTC、ETH、黃金、原油、納斯達克、美元指數(DXY)。
純粹娛樂、體育、與市場無關嘅政治口水、舊聞重post，一律 post=false。

severity 定義：
- WATCH：值得留意但短期影響細
- MEDIUM：可能引起明顯波動
- HIGH：重大、可能引起急劇市場反應

confidence 係你對「呢單嘢真係會影響市場」嘅信心：Low / Medium / High。

market impact 每一項用一句簡短廣東話描述方向同理由（例如「利好，避險情緒升溫」「中性偏淡」），如果無明顯影響就寫「中性」。

你必須只輸出 JSON，唔好有任何其他文字。`;

function jsonSchemaHint(): string {
  return `請只回覆以下 JSON 結構（值用繁體中文/廣東話，severity 同 confidence 用指定英文字）：
{
  "post": true 或 false,
  "topic": "簡短分類，例如：貨幣政策 / 地緣政治 / 加密監管",
  "severity": "WATCH" 或 "MEDIUM" 或 "HIGH",
  "confidence": "Low" 或 "Medium" 或 "High",
  "title_zh": "一句廣東話標題",
  "summary_zh": "2-3 句廣東話摘要",
  "why_zh": "解釋點解交易者要關注",
  "impact": {
    "BTC": "...", "ETH": "...", "Gold": "...",
    "Oil": "...", "Nasdaq": "...", "DXY": "..."
  }
}`;
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
      BTC: parsed.impact?.BTC ?? "中性",
      ETH: parsed.impact?.ETH ?? "中性",
      Gold: parsed.impact?.Gold ?? "中性",
      Oil: parsed.impact?.Oil ?? "中性",
      Nasdaq: parsed.impact?.Nasdaq ?? "中性",
      DXY: parsed.impact?.DXY ?? "中性",
    },
  };
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
