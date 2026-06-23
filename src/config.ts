function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  telegramChatId: required("TELEGRAM_CHAT_ID"),
  openaiKey: required("OPENAI_API_KEY"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseKey: required("SUPABASE_SERVICE_KEY"),

  maxAgeHours: num("MAX_AGE_HOURS", 2),
  maxAiCalls: num("MAX_AI_CALLS", 10),

  // One-off check: set FORCE_TEST_ALERT=true to send a single canned alert to
  // Telegram and exit, bypassing feeds/keyword/AI. Use it to confirm the
  // Telegram path works, then clear the variable.
  forceTestAlert: (process.env.FORCE_TEST_ALERT ?? "").trim().toLowerCase() === "true",
  openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  // Optional: point at any OpenAI-compatible API (e.g. DeepSeek).
  // Leave unset for OpenAI. For DeepSeek: https://api.deepseek.com
  openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
};
