# IntelMaxxing — Career Intel, Noir Style

> Palantir Gotham, but for your career. Four AI agents deploy in parallel, scrape off-LinkedIn signals, and return a ranked hit-list with a voice briefing. Built solo at Citrus Hack XI — "Operation: Innovation".

**Live:** https://intelmaxxing.tech

---

## What it does

You describe a mission ("AI infra startup, seed/series A, remote, founding engineer"). Four field agents deploy simultaneously:

| Codename | Beat | Source |
| --- | --- | --- |
| **FOXHOUND** | Funding intel — who just raised, likely hiring in 0–6 months | Hacker News (Algolia) + startups.gallery |
| **WIRETAP** | Hiring signals — explicit posts + who's-hiring comments | HN "Ask HN: Who is hiring?", Show HN, RemoteOK |
| **GHOSTNET** | Open-source backdoors — active repos with good-first-issues | GitHub search + issues + CONTRIBUTING.md |
| **PROFILER** | Cross-references, scores, writes the briefing, flags red flags | Reddit (culture / red-flag intel) |

The output is a detective evidence board with case files, red-string connections, a dedicated **MOAT · LIKELY TO HIRE** section for fresh-money companies, and four layers of ElevenLabs voice:

- **10–15 sec spy hook** — punchy mission-level sell, one Gen-Z phrase, noir delivery
- **Full 3-paragraph debrief** — case-log style, agent-by-agent narration
- **Per-company MOAT briefing** — ▶ play button on each likely-to-hire card, 15–20 sec pitch tailored to *that* company (funding detail → role gap → concrete action)
- **⚠ VOICE WARNING** — on every top target where Reddit surfaced ghost-interview / layoffs / rescinded-offer posts

---

## The moat

Everyone else aggregates LinkedIn jobs. We surface signals LinkedIn cannot see:

- **HN Who-is-hiring** comments — direct founder/CTO posts
- **Show HN launches** — companies actively building (= likely hiring)
- **RemoteOK jobs** — remote-first board, sparsely covered elsewhere
- **Fresh funding rounds** — recency filter drops anything older than 30 days
- **startups.gallery** — early-stage index of YC + public startups
- **GitHub activity** — only repos pushed within the last 30 days are considered
- **Reddit red flags** — cross-checks target companies against r/cscareerquestions, r/recruitinghell, r/ycombinator etc. for ghost interviews, toxic culture, rescinded offers, layoffs

If a lead is on LinkedIn, we're late. Everything surfaced here is off-grid and fresh.

---

## Recency guarantees

| Stream | Cutoff |
| --- | --- |
| HN funding stories | ≤ 30 days (Algolia `numericFilters` + belt-and-braces client filter) |
| GitHub repos | `pushed:>` last 30 days + post-filter on `pushed_at` |
| Who-is-hiring comments | Latest monthly thread only |
| RemoteOK jobs | Board is live — pulled at query time |
| Reddit red flags | `t=year`; only posts with score > 1 |

Stale leads are dropped, not re-ranked.

---

## Architecture

```
┌──────────────────────── Next.js 16 (Turbopack, App Router) ────────────────────────┐
│                                                                                    │
│  src/components/WarRoom.tsx  ── provider toggle, case input, agent panel, board   │
│                                                                                    │
│  POST /api/investigate  ── orchestrator.parseMission                                │
│                           → [FOXHOUND, WIRETAP, GHOSTNET] in parallel               │
│                           → PROFILER (cross-reference + scoring + reddit intel)     │
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

- `hackernews.ts` — Algolia search with `sinceDays` recency + who-is-hiring thread walker
- `github.ts` — repo search, good-first-issue count, CONTRIBUTING detection; optional `GITHUB_TOKEN`
- `remoteok.ts` — public JSON API (`remoteok.com/api`), keyword filter
- `startupsgallery.ts` — sitemap.xml scrape → `/companies/<slug>` index, 10-min in-memory cache
- `reddit.ts` — public `/search.json` with UA; filters by career-adjacent subs + red-flag keyword list

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
   ├─► parseMission(raw)  ── Gemma structures the brief (industry/stage/role/keywords)
   │
   ├─► Promise.allSettled
   │     ├─► FOXHOUND  HN funding (≤30d) + startups.gallery enrichment → FundingIntel[]
   │     ├─► WIRETAP   who-is-hiring + Show HN + RemoteOK → HiringSignal[] (apply_url when present)
   │     └─► GHOSTNET  GitHub search (pushed ≤30d) + GFI count + CONTRIBUTING → OSSIntel[]
   │
   └─► PROFILER (Gemma)
         ├─► Cross-references the three reports
         ├─► Writes intel_briefing_text (3-paragraph noir debrief)
         ├─► Writes intel_briefing_voice (10–15 sec spy hook, Gen-Z tinged)
         ├─► Writes moat_briefings[] (15-20 sec per likely-to-hire company)
         └─► Reddit red-flag enrichment on every top target (parallel)
   │
   ▼
returns InvestigationPayload → WarRoom → EvidenceBoard
                                            ├─► MOAT cards render with ▶ MOAT BRIEFING
                                            ├─► TOP TARGETS render with ⚠ VOICE WARNING on red flags
                                            └─► VoiceBriefing renders the hook + full debrief

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
