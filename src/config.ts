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
  openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
};
