# Painbro — Cloud Market Intelligence Telegram Alerts

A scheduled **cloud** worker (no local running) that:

1. Runs every ~15 minutes via **GitHub Actions** cron.
2. Reads RSS feeds (Trump Truth Social + CoinDesk to start).
3. De-duplicates items by GUID/URL (state stored in **Supabase / Postgres**).
4. Applies a cheap **keyword filter** before spending money on AI.
5. Sends market-relevant items to **OpenAI (`gpt-4o-mini`)** for classification.
6. If the AI returns `post=true`, sends a **Cantonese Telegram alert**.
7. If `post=false`, it's logged but not posted.

Everything runs in the cloud. You never run this on your own machine.

---

## How it works (one run)

```
fetch feeds → dedup vs Supabase → first-run? seed & exit
            → freshness window → keyword gate → AI classify (capped)
            → post=true? send Telegram → mark seen → write run log
```

- **First run** seeds existing items as "seen" and posts nothing (prevents a flood).
- **Freshness window** (`MAX_AGE_HOURS`, default 2h) ignores old items if a feed replays history.
- **AI cap** (`MAX_AI_CALLS`, default 10/run) protects you from cost spikes.
- A dead feed never crashes the run — failures are logged per-source.

---

## One-time setup

You'll do these once. **Do not paste any keys into code or commits** — they go in GitHub Actions secrets only.

### 1. Create the Telegram bot + test channel
1. In Telegram, message **@BotFather** → `/newbot` → follow prompts → copy the **bot token**.
2. Create a **private channel** (your test channel).
3. Add your bot to the channel as an **admin** (so it can post).
4. Get the channel's **chat ID**:
   - Post any message in the channel.
   - Open: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find `"chat":{"id":-100xxxxxxxxxx ...}` — that negative number is your `TELEGRAM_CHAT_ID`.

### 2. Create the Supabase database
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. In **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **`service_role` secret** → `SUPABASE_SERVICE_KEY` (keep this secret)

### 3. Get an OpenAI API key
- From the OpenAI dashboard, create a key → `OPENAI_API_KEY`.

### 4. Activate the GitHub Actions workflow

The automated tooling can't write to `.github/workflows/` (the access token
lacks `workflow` scope), so the workflow ships at the repo root as
[`cron-workflow.yml`](cron-workflow.yml). Activate it once via the web UI:

1. On GitHub, click **Add file → Create new file**.
2. Name it exactly: `.github/workflows/cron.yml`
3. Paste the entire contents of `cron-workflow.yml` into it.
4. Commit to the `claude/quirky-dirac-3qwsuv` branch.

(After this, `cron-workflow.yml` at the root is just a reference copy — you can
delete it or leave it.)

### 5. Add the secrets to GitHub
In **this repo → Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret name             | Value                                  |
| ----------------------- | -------------------------------------- |
| `TELEGRAM_BOT_TOKEN`    | from BotFather                         |
| `TELEGRAM_CHAT_ID`      | your private channel id (e.g. `-100…`) |
| `OPENAI_API_KEY`        | OpenAI key                             |
| `SUPABASE_URL`          | Supabase project URL                   |
| `SUPABASE_SERVICE_KEY`  | Supabase `service_role` key            |

> Optional tuning lives under the same page → **Variables** tab (not secrets):
> `MAX_AGE_HOURS`, `MAX_AI_CALLS`, `OPENAI_MODEL`. Defaults are fine to start.

---

## First test (manual run)

1. Go to the repo **Actions** tab.
2. Pick **market-alert-cron** → **Run workflow** (this is `workflow_dispatch`).
3. The **first** run seeds the DB and posts nothing — that's expected.
4. Run it **again** manually. New market-relevant items will now produce Telegram alerts in your test channel.
5. Check the run log: open the Actions run to see console output, or query `run_logs` in Supabase.

After it works manually, the schedule (`*/15 * * * *`) takes over automatically.

> Note: GitHub may delay or skip scheduled runs under load, so "every 15 min" is approximate. Workflows also auto-disable after 60 days of zero repo activity.

---

## Alert format

```
🚨 Market Alert｜[SEVERITY]

事件：
[一句廣東話標題]

重點：
[2-3 句廣東話摘要]

點解重要：
[點解交易者要關注]

可能市場影響：
• BTC: …
• ETH: …
• Gold: …
• Oil: …
• Nasdaq: …
• DXY: …

可信度：[CONFIDENCE]
來源：[source link]
```

---

## Adding more RSS sources

Edit [`src/sources.ts`](src/sources.ts) → add to the `SOURCES` array:

```ts
export const SOURCES: FeedSource[] = [
  { name: "Trump Truth Social", url: "https://trumpstruth.org/feed" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  // { name: "Reuters Business", url: "https://…/rss" },
];
```

Commit and push — the next scheduled run uses them. New feeds get seeded on their
first appearance only if the DB is empty; otherwise new items flow through the
normal pipeline (so adding a noisy feed can mean more alerts — tune `MAX_AGE_HOURS`
/ keywords if needed).

---

## Project layout

```
.github/workflows/cron.yml   GitHub Actions schedule + secrets wiring
supabase/schema.sql          Run once in Supabase SQL editor
src/
  index.ts                   Orchestrates one run, then exits
  sources.ts                 RSS feed list + fetch/parse (per-source error isolation)
  filter.ts                  Keyword gate (word-boundary matching)
  ai.ts                      OpenAI classification -> structured JSON
  telegram.ts                Alert formatting + send
  db.ts                      Supabase: dedup, seed, mark-seen, run logs
  config.ts                  Env var loading + validation
.env.example                 Documents required env vars (values live in Actions secrets)
```

## Cost & limits notes

- **Public repo → unlimited free GitHub Actions minutes.**
- OpenAI cost is bounded by `MAX_AI_CALLS` per run and the keyword pre-filter.
- Supabase free tier is fine; the 15-min cron keeps the project from pausing.
- The Trump Truth Social feed is an unofficial third-party endpoint and may
  intermittently fail from datacenter IPs — runs tolerate this and log it.
