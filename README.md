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

### 3. Get an AI API key

**Option A — OpenAI:** create a key → `OPENAI_API_KEY` (default; uses `gpt-4o-mini`).

**Option B — DeepSeek (cheaper, OpenAI-compatible — good for testing):**
1. Create a key at the DeepSeek platform → use it as `OPENAI_API_KEY`.
2. Add a repo **Variable** (Settings → Secrets and variables → Actions → **Variables** tab):
   - `OPENAI_BASE_URL` = `https://api.deepseek.com`
   - `OPENAI_MODEL` = `deepseek-v4-pro` (or `deepseek-v4-flash` for a cheaper/faster tier —
     `deepseek-chat` still works but is a legacy alias being phased out)

No code changes needed — the worker uses the OpenAI SDK pointed at DeepSeek's
endpoint. Switch back to OpenAI later by clearing `OPENAI_BASE_URL` and setting
`OPENAI_MODEL` back to `gpt-4o-mini`.

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

### Confirming it actually works (two ways)

A successful run with **no Telegram message is normal** — it just means nothing
new passed the keyword/AI gates. To tell the difference between "working but
quiet" and "broken":

1. **Read the run log.** Every run prints a final summary line, e.g.
   `[done] 2.5s | sources ok:2 fail:0 | new:0 keyword:0 ai:0 posted:0`.
   - `ai:0` → the AI was never called (nothing new/relevant) — silence is expected.
   - `ai:N posted:0` → AI ran but judged nothing alert-worthy.
   - `posted:N` → it sent N alerts.
   The same counts are stored in the `run_logs` table in Supabase.

2. **Force a one-off test alert.** Add a repo **Variable** (Settings → Secrets
   and variables → Actions → **Variables** tab) `FORCE_TEST_ALERT` = `true`,
   then **Run workflow**. It skips feeds/keyword/AI and sends one canned sample
   alert straight to your Telegram channel, so you can confirm the bot, channel,
   and formatting are correct. **Delete the `FORCE_TEST_ALERT` variable (or set
   it to anything other than `true`) afterwards** so normal runs resume.

---

## Changing the schedule, and turning it on/off

### Change how often it runs

Edit `.github/workflows/cron.yml` directly on GitHub (pencil icon → edit →
**Commit changes**) and change the `cron:` line. The file has examples in a
comment right above it:

```yaml
schedule:
  - cron: "*/15 * * * *"   # every 15 minutes — change this line
```

Common values (all times UTC, GitHub's clock):

| Cadence | Cron expression |
|---|---|
| Every 15 min (current) | `*/15 * * * *` |
| Every 30 min | `*/30 * * * *` |
| Every hour | `0 * * * *` |
| Every 2 hours | `0 */2 * * *` |
| Twice a day (08:00 & 20:00 UTC) | `0 8,20 * * *` |

[`cron-workflow.yml`](cron-workflow.yml) at the repo root mirrors the live file
with the same examples — handy as a reference, but **the real schedule only
takes effect from `.github/workflows/cron.yml`** (I can't write to that path
myself — see note below — so this is a manual edit).

### Turn it off / on

No code change needed — GitHub Actions has a built-in switch:
1. Go to **Actions** tab → click **market-alert-cron** in the left sidebar.
2. Top-right **"…"** menu → **Disable workflow**.
3. To resume, same menu → **Enable workflow**.

While disabled, neither the schedule nor manual **Run workflow** will fire —
it's fully paused. No secrets, data, or history are affected; re-enabling picks
up right where the schedule left off.

> Why I can't push `.github/workflows/cron.yml` myself: the GitHub access
> token this assistant uses lacks the `workflow` OAuth scope, which GitHub
> requires for *any* write to that specific folder. Every other file in this
> repo I can edit and push directly.

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

## Editing the AI prompt and RSS sources (no code)

The two things you'll tweak most often live in plain files at the repo root, so
you can edit them straight in GitHub's web editor (pencil icon → edit → **Commit
changes**). The next run picks them up automatically — no code, no redeploy.

### Adjust the AI prompt → [`prompt.md`](prompt.md)

This whole file IS the analyst's system prompt (sent verbatim to the AI). Edit
the wording to change how it judges importance, tone, severity, etc.

> Keep the last line — `你必須只輸出 JSON…` — and don't describe a different JSON
> shape; the code parses a fixed structure. Change the *judgement/wording*, not
> the output format.

### Review / manage RSS sources → [`sources.json`](sources.json)

A simple list — open it to see every source at a glance. Add or remove entries:

```json
[
  { "name": "Trump Truth Social", "url": "https://trumpstruth.org/feed" },
  { "name": "CoinDesk", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { "name": "Reuters Business", "url": "https://…/rss" }
]
```

Mind the JSON: each entry needs `name` and `url`, items separated by commas, no
trailing comma after the last one. New feeds flow through the normal pipeline
(so a noisy feed can mean more alerts — tune `MAX_AGE_HOURS` / keywords if needed).

---

## Project layout

```
.github/workflows/cron.yml   GitHub Actions schedule + secrets wiring
supabase/schema.sql          Run once in Supabase SQL editor
prompt.md                    The AI system prompt (edit this to tune judgement)
sources.json                 The RSS feed list (edit this to add/remove sources)
src/
  index.ts                   Orchestrates one run, then exits
  sources.ts                 Loads sources.json + fetch/parse (per-source error isolation)
  filter.ts                  Keyword gate (word-boundary matching)
  ai.ts                      Loads prompt.md + OpenAI classification -> structured JSON
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
