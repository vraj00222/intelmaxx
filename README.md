# IntelMaxxing — Career Intel, Noir Style

> Palantir Gotham, but for your career. Four AI agents deploy in parallel, scrape off-LinkedIn signals, and return a ranked hit-list with a voice briefing. Built solo at Citrus Hack XI — "Operation: Innovation".

**Live:** https://intelmaxxing.tech

---

## What it does

You describe a mission ("AI infra startup, seed/series A, remote, founding engineer"). Five agents deploy in parallel:

| Codename | Beat | Source |
| --- | --- | --- |
| **FOXHOUND** | Funding intel — who just raised, likely hiring in 0–6 months | Hacker News (Algolia) + startups.gallery enrichment |
| **WIRETAP** | Hiring signals — explicit posts + who's-hiring comments | HN "Ask HN: Who is hiring?" (monthly thread), Show HN, RemoteOK |
| **GHOSTNET** | Open-source backdoors — active repos with good-first-issues | GitHub search + issues + CONTRIBUTING.md |
| **PROFILER** | Cross-references, scores, writes the briefing, flags red flags | Reddit culture / red-flag intel |
| **DOSSIER** | Ranked LIKELY-HIRING card per company: people + Reddit chatter + cold email | yc-oss batch mirror · startups.gallery · funding pool · signals pool |

The output is a detective evidence board with case files, red-string connections, a dedicated **LIKELY HIRING** section up top, and four layers of ElevenLabs voice:

- **10–15 sec spy hook** — punchy mission-level sell, one Gen-Z phrase, noir delivery
- **Full 3-paragraph debrief** — case-log style, agent-by-agent narration
- **Per-company MOAT briefing** — ▶ play button on each likely-to-hire card, 15–20 sec pitch tailored to *that* company (funding detail → role gap → concrete action)
- **⚠ VOICE WARNING** — on every top target where Reddit surfaced ghost-interview / layoffs / rescinded-offer posts

---

## The moat

Everyone else aggregates LinkedIn jobs. We surface signals LinkedIn cannot see:

- **HN Who-is-hiring** comments — direct founder/CTO posts in the current monthly thread
- **Show HN launches** — companies actively building (= likely hiring), 45-day window
- **RemoteOK jobs** — remote-first board, 45-day cutoff
- **Fresh funding rounds** — 30-day cutoff on HN funding stories
- **startups.gallery** — hand-curated early-stage index (now a first-class dossier source, not just enrichment)
- **yc-oss batch mirror** — last 4 YC batches pulled live (`isHiring` flag surfaced)
- **GitHub activity** — only repos pushed within the last 30 days
- **Reddit chatter** — three buckets per company (positive mentions · red flags · hiring buzz) across r/cscareerquestions, r/recruitinghell, r/ycombinator, r/startups, r/ExperiencedDevs
- **Giants blocklist** — megacorps (Google, Meta, Stripe, Laravel, OpenAI, etc.) are hard-rejected even when they slip into funding news. The point is off-grid, not ubiquitous.

If a lead is on LinkedIn, we're late. Everything surfaced here is off-grid and fresh.

---

## Data sources — full list

Every external system the pipeline talks to, grouped by layer. All modules live in `src/lib/datasources/`.

| Module | Upstream | Used for |
| --- | --- | --- |
| `hackernews.ts` | `hn.algolia.com/api/v1/search_by_date` | Funding stories (FOXHOUND), Show HN launches (WIRETAP), who-is-hiring thread walker (WIRETAP) |
| `github.ts` | `api.github.com` (Octokit, optional `GITHUB_TOKEN`) | Repo search, `good first issue` count, CONTRIBUTING detection (GHOSTNET) |
| `remoteok.ts` | `remoteok.com/api` | Remote-first job board (WIRETAP) |
| `startupsgallery.ts` | `startups.gallery/sitemap.xml` | Curated early-stage index (DOSSIER diversity source + FOXHOUND enrichment) |
| `yc.ts` | `yc-oss.github.io/api/batches/<season>-<year>.json` | Last 4 YC batches with `isHiring` flag (DOSSIER) |
| `reddit.ts` | `reddit.com/search.json` | Per-company chatter split into positive / red flags / hiring buzz (PROFILER + DOSSIER) |
| `people.ts` | DuckDuckGo HTML search (pattern fallback) | CEO/CTO X + LinkedIn URLs, email-pattern generation (DOSSIER) |
| `search.ts` | DuckDuckGo HTML (15-min in-memory cache) | Generic web lookups used by `people.ts` |

External services consumed outside the datasource layer:

- **Gemma 4** via Novita (`google/gemma-4-31b-it`) or local Ollama (`gemma4:e2b`) — parseMission, every agent, cold-email drafting, voice scripts
- **ElevenLabs** — voice synthesis for spy hook + full debrief + per-company MOAT briefings + red-flag warnings

---

## Recency guarantees

| Stream | Cutoff |
| --- | --- |
| HN funding stories | ≤ 30 days (Algolia `numericFilters` + belt-and-braces client filter) |
| Show HN launches | ≤ 45 days |
| RemoteOK jobs | ≤ 45 days (epoch filter) |
| GitHub repos | `pushed:>` last 30 days + post-filter on `pushed_at` |
| Who-is-hiring comments | Current month's thread only (Algolia `/search_by_date` with title filter) |
| YC batches | Last 4 batches (W26 · F25 · S25 · W25 as of this push) |
| Reddit chatter | `t=year`; only posts with score > 1 |

Stale leads are dropped, not re-ranked.

---

## LIKELY HIRING dossier pipeline

After FOXHOUND / WIRETAP / GHOSTNET / PROFILER, a fifth agent (`src/lib/agents/dossier.ts`) builds the marquee output: **one ranked card per target company** with people intel, Reddit chatter, and a copy-paste cold email.

**Candidate pool** (deduped by name, giants rejected up-front):
1. FOXHOUND funding events flagged `likely_to_hire` (recent + stage-appropriate)
2. `yc.ts` — last 4 YC batches, industry/keyword scored, `isHiring` flag boosted
3. `startupsgallery.ts::searchStartupsGallery` — keyword-matched gallery refs (curated = young signal)
4. WIRETAP hiring signals (back-pocket when funding + YC under-supply)

**Gate** (`src/lib/agents/gating.ts::decideGates`) — skip expensive lookups when they can't yield signal:
- `is_likely_hiring`: age ≤ 8 yrs, headcount ≤ 100, AND (funded ≤ 1 yr OR YC in last 4 batches OR on startups.gallery)
- Megacorp blocklist: Google/Meta/Stripe/Laravel/OpenAI/Anthropic/Palantir/… rejected regardless of other signals
- `do_reddit`: skipped if age < 1 yr (no chatter yet) or mission type is `research`
- `do_people_lookup`: skipped if no company name or mission is `oss_contrib`
- `do_email_pattern`: requires a domain
- `do_cold_email`: requires both people + email patterns

**Diversity rule** (`dossier.ts::diversifyPick`): YC slots capped at 2 of 4; at least 1 non-YC seed when the pool has one. Prevents the 4-YC-dossiers result.

**Per-company enrichment** (parallel, each bounded by a timeout):
- `people.ts::findPeople` — DDG search for CEO/CTO X + LinkedIn + engineer LinkedIn URLs, pattern-email fallback (`first@`, `first.last@`, `hello@`, `founders@`)
- `reddit.ts::findCompanyChatter` — one API sweep split into positive / red-flags / hiring-buzz
- Gemma cold email draft with prefilled `mailto:` subject + body, copy buttons on each email pattern

**Output**: `LikelyHiringDossier[]` rendered by `LikelyHiringBoard.tsx`.

---

## Architecture

```
┌──────────────────────── Next.js 16 (Turbopack, App Router) ────────────────────────┐
│                                                                                    │
│  src/components/WarRoom.tsx  ── provider toggle, case input, agent panel, board   │
│                                                                                    │
│  POST /api/investigate  ── orchestrator.parseMission                                │
│                           → [FOXHOUND, WIRETAP, GHOSTNET] in parallel               │
│                           → [PROFILER, DOSSIER] in parallel under shared budget     │
│                                                                                    │
│  GET  /api/provider     ── { default, ollama_available, novita_available, *_model } │
│  POST /api/briefing     ── ElevenLabs TTS for voice hook / full debrief             │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Gemma 4 — two-provider design

Every agent runs through `gemmaComplete` / `gemmaJSON`, which resolves provider in this order:

1. Per-request `{ provider: "novita" | "ollama" }` (threaded from the API)
2. `GEMMA_PROVIDER` env var
3. Default: `novita`

| Provider | Model | When |
| --- | --- | --- |
| **Novita (cloud)** | `google/gemma-4-31b-it` — the largest Gemma 4 instruct | Production default |
| **Ollama (local)** | `gemma4:e2b` (set `OLLAMA_MODEL` to override) | Local dev via `npm run dev:ollama` |

The UI toggle (`ProviderToggle.tsx`) polls `/api/provider` on mount and **auto-greys Ollama in production** since `localhost:11434` isn't reachable from Vercel functions. User selection is persisted to `localStorage`. The toggle also shows the exact model id in parentheses so there's no mystery about what you're talking to.

### Data source layer

`src/lib/datasources/` — each source is a stateless module with one or two exported functions:

- `hackernews.ts` — Algolia search with `sinceDays` recency + current-month who-is-hiring thread walker
- `github.ts` — repo search, good-first-issue count, CONTRIBUTING detection; optional `GITHUB_TOKEN`
- `remoteok.ts` — public JSON API (`remoteok.com/api`), keyword filter, 45-day `sinceDays` cutoff
- `startupsgallery.ts` — sitemap.xml scrape → `/companies/<slug>` index, 10-min in-memory cache, keyword-match via `searchStartupsGallery`
- `yc.ts` — yc-oss per-batch JSON mirror for the last 4 batches, industry/keyword scored
- `reddit.ts` — public `/search.json` with UA; `findCompanyChatter` splits one sweep into positive / red-flag / hiring-buzz
- `people.ts` — CEO/CTO X + LinkedIn discovery via DDG HTML (graceful fallback to pattern emails when DDG serves the anomaly modal)
- `search.ts` — DuckDuckGo HTML helper with 15-min in-memory cache

### Agents

Each agent in `src/lib/agents/` is a single function that:

1. Pulls raw evidence from one or more data sources.
2. Condenses it (titles, dates, URLs) so the model input stays small.
3. Hands off to Gemma 4 with a tight system prompt → structured JSON.
4. Post-enriches (e.g., `funding.ts` tags `likely_to_hire` + startups.gallery matches).

`matcher.ts` (PROFILER) does three extra things beyond ranking:
1. Runs `findCultureRedFlags(company)` in parallel on every top target and attaches Reddit evidence to the dossier.
2. Emits `moat_briefings[]` — one tailored voice-ready pitch per likely-to-hire funder (prompted specifically for that company; falls back to a deterministic template if the model skips any entry).
3. Emits the short `intel_briefing_voice` hook + the long `intel_briefing_text` debrief.

`dossier.ts` (DOSSIER) runs alongside PROFILER and builds the LIKELY HIRING cards — see the dedicated section above. Summary: pool candidates from funding/YC/gallery/signals → gate → diversify-pick → parallel people + Reddit + Gemma cold-email per company.

### Voice layer (ElevenLabs)

`src/lib/elevenlabs.ts` wraps the ElevenLabs SDK with a noir-tuned voice preset (voice id `JBFqnCBsd6RMkjVDRZzb` — "George"; stability 0.38, similarity 0.85, style 0.78 for thicker delivery). `/api/briefing` takes `{ text }` and streams back `audio/mpeg`.

`src/components/VoiceChip.tsx` — reusable micro-player (▶ idle → ⟳ loading → ❚❚ playing, with inline error reporting). Used in two places:
- Under each MOAT card for the company-specific dossier
- Inside the red-flag panel for the warning playback

`src/components/VoiceBriefing.tsx` — the main briefing player with waveform + transcript, toggling between the spy hook and full debrief.

### UI

- `EvidenceBoard.tsx` — three stacked sections:
  - **MOAT · LIKELY TO HIRE** (dashed red border, dedicated card grid, ▶ **MOAT BRIEFING** under each card — this is the edge)
  - **EVIDENCE BOARD** (corkboard with decorative red strings + corner push-pins)
  - **PROFILER DOSSIER · TOP TARGETS** (rank + score + action items + **RED FLAGS panel** with inline **⚠ VOICE WARNING** playback)
- `VoiceBriefing.tsx` — toggles between the 15-second spy hook and the full 3-paragraph noir debrief
- `VoiceChip.tsx` — compact play button for the per-company MOAT briefings and red-flag warnings
- `ProviderToggle.tsx` — pill toggle showing `NOVITA (google/gemma-4-31b-it)` / `OLLAMA (gemma4:e2b)`

---

## Local development

### Prereqs
- Node 20+
- (Optional) Ollama with a Gemma 4 tag pulled: `ollama pull gemma4:e2b`

### Env (`.env.local`)
```bash
NOVITA_API_KEY=...           # required for cloud provider
GITHUB_TOKEN=...             # optional; increases GitHub rate limit
ELEVENLABS_API_KEY=...       # optional; voice briefing (ELEVEN_LABS_API_KEY also accepted)
```

### Run

```bash
npm install
npm run dev           # standard — uses Novita
npm run dev:fresh     # kills anything on 3000/3001 first
npm run dev:ollama    # one-shot: kills ports, ensures Ollama is running, launches with GEMMA_PROVIDER=ollama
```

`scripts/dev-ollama.sh` handles the common dance of "port busy, ollama already running, model not pulled".

---

## Deployment

Hosted on **Vercel**. DNS via controlpanel.tech:
- `A @` → `76.76.21.21`
- `CNAME www` → `cname.vercel-dns.com`

Required Vercel env vars: `NOVITA_API_KEY`, `ELEVENLABS_API_KEY` (or `ELEVEN_LABS_API_KEY`), `GITHUB_TOKEN`. `GEMMA_PROVIDER` can stay unset — defaults to Novita. In production the Ollama pill is auto-disabled (400 ms reachability probe fails).

---

## What happens per request

```
user types mission
   │
   ▼
POST /api/investigate { query, provider? }
   │
   ├─► parseMission(raw)  ── Gemma structures the brief (industry/stage/role/keywords/mission_type)
   │
   ├─► Promise.allSettled
   │     ├─► FOXHOUND  HN funding (≤30d) + startups.gallery enrichment → FundingIntel[]
   │     ├─► WIRETAP   who-is-hiring (current month) + Show HN (≤45d) + RemoteOK (≤45d) → HiringSignal[]
   │     └─► GHOSTNET  GitHub search (pushed ≤30d) + GFI count + CONTRIBUTING → OSSIntel[]
   │
   ├─► PROFILER (Gemma)                          │  DOSSIER
   │     ├─► Cross-references the three reports  │   ├─► Pool: funding + YC (4 batches) + gallery + signals
   │     ├─► Writes intel_briefing_text          │   ├─► Reject giants, dedupe, gate
   │     ├─► Writes intel_briefing_voice         │   ├─► diversifyPick (max 2 YC of 4)
   │     ├─► Writes moat_briefings[]             │   └─► Per-company parallel:
   │     └─► Reddit red-flag enrichment          │         people.ts + reddit chatter + cold email
   │                                             │   → LikelyHiringDossier[]
   │
   ▼
returns InvestigationPayload → WarRoom → EvidenceBoard
                                            ├─► LIKELY HIRING cards (copy-paste email chips, CEO/CTO X+LI)
                                            ├─► EVIDENCE BOARD (corkboard pins)
                                            ├─► TOP TARGETS with ⚠ VOICE WARNING on red flags
                                            └─► VoiceBriefing: spy hook + full debrief

POST /api/briefing { text } → ElevenLabs TTS → audio/mpeg (streamed to the chip/player)
```

Typical turnaround: 18–30 s end-to-end with Novita for the investigation; each voice chip fetches TTS lazily on first ▶ (≈1–3 s).

---

## Design notes

- **Typography:** `Special Elite` (typewriter display) + `IBM Plex Mono` (data)
- **Palette:** deep war-room browns/blacks, cream parchment cards, amber accents, classified-red stamps
- **Textures:** radial gradients + SVG noise for film grain, scanline overlay, cork board pattern
- **Motion:** scanline sweeps on active agents, pulse rings on status dots, typewriter reveals on loading, rotating paper cards with gold push-pins

---

## Stack

Next.js 16 (Turbopack) · React 19 · Tailwind v4 · Framer Motion · Gemma 4 (Novita / Ollama) · ElevenLabs · Octokit · TypeScript

## License

MIT

*INTELMAXXING · OPERATION INNOVATION · EVERY LEAD · OFF-GRID · NOT ON LINKEDIN*
