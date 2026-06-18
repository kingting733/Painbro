// Cheap keyword gate that runs BEFORE we spend money on the AI.
// Only items containing at least one keyword are sent to the classifier.

export const KEYWORDS = [
  "bitcoin", "btc", "ethereum", "eth", "crypto", "tariff", "china", "trump",
  "fed", "powell", "rate", "inflation", "oil", "gold", "war", "iran", "israel",
  "russia", "ukraine", "sanctions", "sec", "cftc", "etf", "nvidia", "openai",
  "ai", "nasdaq", "dollar", "dxy",
];

// Word-boundary matching so short tokens like "ai", "eth", "war" don't match
// inside unrelated words (e.g. "email", "ethical", "warm", "rate" in "operate").
const PATTERNS = KEYWORDS.map(
  (kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
);

export function matchedKeywords(text: string): string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (let i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].test(text)) hits.push(KEYWORDS[i]);
  }
  return hits;
}

export function isMarketRelevant(text: string): boolean {
  return matchedKeywords(text).length > 0;
}
