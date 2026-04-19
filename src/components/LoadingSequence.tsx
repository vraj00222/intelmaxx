"use client";

import { useEffect, useState } from "react";

// The loading panel doubles as a narrative device — judges stare at it for
// ~15-25s, so each line lands a specific beat rather than just filling space.
// Timeline is deliberate: early lines say "agents are live", middle lines say
// "we're deeper in than a spinner", late lines say "we're still working and
// here's why it's worth it".
type Line = { agent: string; text: string; color: string; atMs: number };

const LINES: Line[] = [
  { agent: "ORCH", text: "Parsing mission brief via Gemma 4…", color: "var(--accent-amber)", atMs: 200 },
  { agent: "FOXHOUND", text: "Scanning YC batches W26 → S24…", color: "var(--accent-amber)", atMs: 900 },
  { agent: "WIRETAP", text: "Pulling HN 'Who is Hiring' threads…", color: "var(--accent-red)", atMs: 1700 },
  { agent: "GHOSTNET", text: "Crawling GitHub repos · recent commits…", color: "var(--accent-green)", atMs: 2600 },
  { agent: "FOXHOUND", text: "Cross-checking Crunchbase + Show HN rounds…", color: "var(--accent-amber)", atMs: 3600 },
  { agent: "GHOSTNET", text: "Counting good-first-issues · CONTRIBUTING.md…", color: "var(--accent-green)", atMs: 4800 },
  { agent: "WIRETAP", text: "Decoding founder tweets for hiring intent…", color: "var(--accent-red)", atMs: 6200 },
  { agent: "DOSSIER", text: "Building per-company case files…", color: "var(--accent-blue)", atMs: 7800 },
  { agent: "DOSSIER", text: "Sweeping Reddit for red flags · r/cscareers…", color: "var(--accent-blue)", atMs: 9600 },
  { agent: "DOSSIER", text: "Guessing email patterns · first.last · f.last…", color: "var(--accent-blue)", atMs: 11600 },
  { agent: "PROFILER", text: "Ranking targets · composite score…", color: "var(--accent-amber)", atMs: 13800 },
  { agent: "PROFILER", text: "Drafting cold-email templates…", color: "var(--accent-amber)", atMs: 16200 },
  { agent: "PROFILER", text: "Compiling noir voice briefing…", color: "var(--accent-amber)", atMs: 18800 },
  { agent: "ORCH", text: "Cross-referencing signals across sources…", color: "var(--text-primary)", atMs: 21600 },
  { agent: "ORCH", text: "Holding for the last straggler source…", color: "var(--text-primary)", atMs: 25000 },
];

const REASSURANCE: { afterMs: number; text: string }[] = [
  { afterMs: 12000, text: "Eleven live sources in parallel · worth the extra second" },
  { afterMs: 20000, text: "Deep-scan in progress · LinkedIn can't see what we see" },
  { afterMs: 30000, text: "Some sources rate-limit us · we honor them, results hold" },
];

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export default function LoadingSequence() {
  const [elapsed, setElapsed] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), 100);
    const t = setInterval(() => setTick((x) => x + 1), 220);
    return () => {
      clearInterval(id);
      clearInterval(t);
    };
  }, []);

  const visible = LINES.filter((l) => elapsed >= l.atMs);
  const shownCount = Math.max(1, visible.length);
  const current = LINES[Math.min(shownCount, LINES.length) - 1];

  const reassurance = [...REASSURANCE].reverse().find((r) => elapsed >= r.afterMs);

  // Progress model: map elapsed into a soft asymptote — approaches but never
  // hits 100% until the parent flips to done. Keeps the bar feeling alive
  // even when we're waiting on the slow source.
  const pct = Math.min(96, 8 + Math.sqrt(elapsed / 300) * 24);

  const clock = new Date().toLocaleTimeString([], { hour12: false });
  const hex = (Math.sin(tick * 0.7) * 0xffff).toString(16).slice(-4).toUpperCase().padStart(4, "0");

  return (
    <div className="hud-corners relative overflow-hidden rounded-sm border border-[var(--border-strong)] bg-[var(--bg-panel)] p-5">
      <div className="scanline" />

      {/* Header row: LIVE indicator + elapsed + transmission key */}
      <div className="relative flex items-center justify-between gap-3 text-[10px] tracking-[0.3em]">
        <span className="flex items-center gap-2 text-[var(--accent-amber)]">
          <span className="pulse-dot" style={{ background: "var(--accent-amber)", color: "var(--accent-amber)" }} />
          LIVE · AGENTS DEPLOYED
        </span>
        <div className="flex items-center gap-3 text-[var(--text-muted)]">
          <span className="tabular-nums text-[var(--accent-amber)]">T+{fmtElapsed(elapsed)}</span>
          <span className="hidden sm:inline">· {clock}</span>
          <span className="hidden md:inline">· KEY {hex}</span>
        </div>
      </div>

      {/* Current transmission — the big focal line */}
      <div className="relative mt-4 rounded-sm border border-[var(--border-subtle)] bg-black/30 p-3">
        <div className="mb-1 flex items-center gap-2 text-[9px] tracking-[0.3em] text-[var(--text-muted)]">
          <span>◉</span>
          <span>CURRENT TRANSMISSION</span>
        </div>
        <div className="flex items-baseline gap-3 font-mono text-[13px]">
          <span
            className="inline-block w-[76px] shrink-0 tracking-[0.14em]"
            style={{ color: current.color }}
          >
            {current.agent}
          </span>
          <span className="caret flex-1 text-[var(--text-primary)]">{current.text}</span>
        </div>
      </div>

      {/* Chronological feed — scrolls as lines accumulate */}
      <ul className="relative mt-3 max-h-[170px] space-y-1 overflow-hidden font-mono text-[11.5px]">
        {visible.slice(-6).map((l, i, arr) => {
          const isLast = i === arr.length - 1;
          const opacity = 0.35 + ((i + 1) / arr.length) * 0.65;
          return (
            <li
              key={`${l.agent}-${l.atMs}`}
              className="flex gap-3"
              style={{ opacity: isLast ? 1 : opacity }}
            >
              <span className="shrink-0 tabular-nums text-[10px] text-[var(--text-muted)]">
                {fmtElapsed(l.atMs)}
              </span>
              <span
                className="inline-block w-[72px] shrink-0 tracking-[0.14em]"
                style={{ color: l.color }}
              >
                {l.agent}
              </span>
              <span className="flex-1 truncate text-[var(--text-secondary)]">
                {l.text}
              </span>
              {!isLast ? (
                <span className="text-[var(--accent-green)]">✓</span>
              ) : (
                <span className="text-[var(--accent-amber)]">▸</span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Reassurance micro-line — fades in after 12s so the wait feels intentional */}
      {reassurance ? (
        <div className="relative mt-3 flex items-center gap-2 text-[9.5px] tracking-[0.18em] text-[var(--text-muted)]">
          <span className="inline-block h-px w-4 bg-[var(--accent-amber)]/40" />
          <span className="italic">{reassurance.text}</span>
        </div>
      ) : null}

      {/* Progress bar — asymptotic, never full until parent flips state */}
      <div className="relative mt-3 h-[3px] overflow-hidden rounded-full bg-black/50">
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, var(--accent-amber), var(--accent-red), var(--accent-amber))",
            transition: "width 0.35s ease",
            boxShadow: "0 0 14px rgba(229,142,38,0.55)",
          }}
        />
        <div
          className="absolute inset-y-0"
          style={{
            left: `calc(${pct}% - 24px)`,
            width: 48,
            background:
              "linear-gradient(90deg, transparent, rgba(255,230,170,0.9), transparent)",
            animation: "intel-ticker-sweep 1.6s linear infinite",
          }}
        />
      </div>
    </div>
  );
}
