import Parser from "rss-parser";

export interface FeedSource {
  name: string;
  url: string;
}

export interface FeedItem {
  guid: string; // stable id: RSS guid, or link as fallback
  source: string;
  url: string;
  title: string;
  content: string; // title + snippet, used for keyword filter and AI
  publishedAt: Date | null;
}

// MVP sources. Add more entries here (see README "Adding more RSS sources").
export const SOURCES: FeedSource[] = [
  { name: "Trump Truth Social", url: "https://trumpstruth.org/feed" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
];

const parser = new Parser({
  timeout: 15000,
  headers: {
    // A real-ish UA reduces the chance of being blocked from a datacenter IP.
    "User-Agent":
      "Mozilla/5.0 (compatible; PainbroMarketAlert/0.1; +https://github.com/kingting733/painbro)",
  },
});

export interface FetchResult {
  source: string;
  ok: boolean;
  items: FeedItem[];
  error?: string;
}

/** Fetch a single feed. Never throws — failures are returned as ok:false. */
export async function fetchSource(source: FeedSource): Promise<FetchResult> {
  try {
    const feed = await parser.parseURL(source.url);
    const items: FeedItem[] = (feed.items ?? []).map((item) => {
      const url = item.link ?? item.guid ?? "";
      const guid = (item.guid ?? item.link ?? url ?? "").trim();
      const title = (item.title ?? "").trim();
      const snippet = (item.contentSnippet ?? item.content ?? "").trim();
      const publishedAt = item.isoDate ? new Date(item.isoDate) : null;
      return {
        guid,
        source: source.name,
        url,
        title,
        content: `${title}\n${snippet}`.trim(),
        publishedAt,
      };
    });
    return { source: source.name, ok: true, items: items.filter((i) => i.guid) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { source: source.name, ok: false, items: [], error: message };
  }
}
