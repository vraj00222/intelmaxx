# 🕵️ IntelMaxxing

> **Palantir Gotham, but for your career. You talk, AI agents investigate.**
>
> Live: **[intelmaxxing.tech](https://intelmaxxing.tech)**

An AI-powered career-intelligence war room. You describe what you want in plain English, and a swarm of specialized agents (powered by **Gemma 4 26B MoE**) fans out across the internet to surface opportunities that are **not posted on LinkedIn** — fresh funding events, HN "Who is hiring" posts, and open-source contribution backdoors.

Results are pinned to a detective-themed evidence board and delivered as both a written dossier and a spoken **ElevenLabs** noir-style briefing.

---

## 🤖 The Agents

| Codename   | Role                | Source                                          |
| ---------- | ------------------- | ----------------------------------------------- |
| `FOXHOUND` | Funding Scout       | Hacker News funding stories, YC announcements   |
| `WIRETAP`  | Hiring Signal Hunter | HN "Ask HN: Who is hiring?" threads, Show HN    |
| `GHOSTNET` | Open-Source Radar   | GitHub trending repos, good-first-issues, CONTRIBUTING.md |
| `PROFILER` | Target Analyst      | Cross-references the above; writes the briefing |

All agents run **Gemma 4 26B MoE** via Novita's OpenAI-compatible endpoint and execute in parallel via `Promise.allSettled`.

## 🔌 Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **Tailwind CSS v4** with a custom detective noir token system
- **Gemma 4 26B MoE** (`google/gemma-4-26b-a4b-it` via Novita)
- **ElevenLabs** (`eleven_multilingual_v2`) for voice briefings
- **Hacker News Algolia API** + **GitHub API** for real-world data
- **Vercel** for hosting

## 🚀 Running Locally

```bash
# 1. install deps
npm install

# 2. create .env.local with your keys
cat > .env.local <<'EOF'
NOVITA_API_KEY=your_novita_key
ELEVENLABS_API_KEY=your_elevenlabs_key
GITHUB_TOKEN=optional_but_recommended
EOF

# 3. dev
npm run dev
# open http://localhost:3000
```

## 🗺️ Layout

```
src/
├── app/
│   ├── api/
│   │   ├── investigate/route.ts   # Orchestrator — parses mission, dispatches agents
│   │   └── briefing/route.ts      # ElevenLabs TTS endpoint
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css                # Detective noir token system
├── components/
│   ├── WarRoom.tsx
│   ├── Header.tsx
│   ├── CaseInput.tsx              # "Open New Case" input
│   ├── AgentPanel.tsx             # 4-agent status rail
│   ├── EvidenceBoard.tsx          # Cork board with case files
│   ├── CaseFileCard.tsx           # Parchment card per intel item
│   ├── VoiceBriefing.tsx          # Audio player + waveform
│   └── LoadingSequence.tsx        # Typewriter deploy feed
└── lib/
    ├── gemma.ts                   # Gemma 4 wrapper (Novita OpenAI-compatible)
    ├── elevenlabs.ts              # TTS wrapper
    ├── agents/
    │   ├── orchestrator.ts        # Mission-brief parser
    │   ├── funding.ts             # FOXHOUND
    │   ├── signals.ts             # WIRETAP
    │   ├── opensource.ts          # GHOSTNET
    │   ├── matcher.ts             # PROFILER
    │   └── types.ts
    └── datasources/
        ├── hackernews.ts
        └── github.ts
```

## 🎨 Design Notes

- **Typography:** `Special Elite` (typewriter display) + `IBM Plex Mono` (data)
- **Palette:** deep war-room browns/blacks, cream parchment cards, amber accents, classified-red stamps
- **Textures:** radial gradients + SVG noise for film grain, scanline overlay, cork board pattern
- **Motion:** scanline sweeps on active agents, pulse rings on status dots, typewriter reveals on loading, rotating paper cards with gold push pins

Built solo at **Citrus Hack XI** under the "Operation: Innovation" theme.

## 📄 License

MIT
